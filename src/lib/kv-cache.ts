// Cloudflare KV-backed response cache, distributed across MULTIPLE KV namespaces by region
// so reads route to the nearest store (same idea as the multi-region Neon database spread).
//
// Configure up to 5 KV namespaces via env, one set per region. Region codes are clear:
//   KV_ASIA_*   - Asia (e.g. Tokyo/Singapore)
//   KV_NA_*     - North America
//   KV_SA_*     - South America
//   KV_EU_*     - Europe
// If a region has more than one KV store, append "-2" (e.g. KV_ASIA_2_NAMESPACE_ID).
// Each set has three vars (mirroring the single-store vars for familiarity):
//   KV_<REGION>_ACCOUNT_ID   - Cloudflare account id
//   KV_<REGION>_API_TOKEN    - API token with KV read/write on that namespace
//   KV_<REGION>_NAMESPACE_ID - the KV namespace id ("give it an ID and it just works")
//
// Shared tuning vars (single set, applied to all regions):
//   KV_PREFIX        - cache-key prefix (isolate multiple instances), default "cfos"
//   KV_DEFAULT_TTL   - default TTL seconds, default 60
//   KV_PAGES_PROJECTS_TTL / KV_GIT_REPOS_TTL / KV_PAGES_STATS_TTL - per-group overrides
//
// Read strategy: route to the KV store nearest to the request (using the country from
// Vercel's x-vercel-ip-country header); on a miss we fall back through the other regions so
// any store can serve the value. Write strategy: write to every configured region in parallel
// so a value is always present close to any future reader. If NO KV env is configured we fall
// back to a per-instance in-memory Map. All KV errors are swallowed — a cache miss/failure
// never breaks a request.

import { headers } from 'next/headers';

const API = 'https://api.cloudflare.com/client/v4';
const PREFIX = process.env.KV_PREFIX || 'cfos';
const DEFAULT_TTL = () => Math.max(1, Number(process.env.KV_DEFAULT_TTL) || 60);

type MaybePromise<T> = T | Promise<T>;

interface Store {
  region: string;
  accountId: string;
  token: string;
  namespaceId: string;
}

// Ordered region list. `primary` is the first configured store (fast-path target when the
// request region isn't mapped); `nearestFor(country)` picks the closest configured store.
const REGION_ORDER = ['ASIA', 'NA', 'SA', 'EU'] as const;
type Region = (typeof REGION_ORDER)[number];

// All configured stores, in a stable order (primary first).
//
// The SINGLE default store (KV_ACCOUNT_ID / KV_API_TOKEN / KV_NAMESPACE_ID) is always
// honored and listed first — so you can get going with just ONE KV namespace. The
// region-specific stores (KV_ASIA_*, KV_NA_*, ...) are OPTIONAL additions for multi-region
// fan-out; each region may hold 1..2 stores (append "-2" for the second).
function stores(): Store[] {
  const out: Store[] = [];
  // 1) Default single store (always usable, listed first).
  const dAccount = process.env.KV_ACCOUNT_ID;
  const dToken = process.env.KV_API_TOKEN;
  const dNs = process.env.KV_NAMESPACE_ID;
  if (dAccount && dToken && dNs) {
    out.push({ region: 'default', accountId: dAccount, token: dToken, namespaceId: dNs });
  }
  // 2) Optional region-specific stores.
  for (const region of REGION_ORDER) {
    for (const suffix of ['', '2']) {
      const suffixPart = suffix ? `_${suffix}` : '';
      const accountId = process.env[`KV_${region}${suffixPart}_ACCOUNT_ID`];
      const token = process.env[`KV_${region}${suffixPart}_API_TOKEN`];
      const namespaceId = process.env[`KV_${region}${suffixPart}_NAMESPACE_ID`];
      if (accountId && token && namespaceId) {
        out.push({ region: suffix ? `${region}-2` : region, accountId, token, namespaceId });
      }
    }
  }
  return out;
}

const mem = new Map<string, { v: string; exp: number }>();
const memEnabled = stores().length === 0;

// Map a country code to its region; returns null if unmapped.
function regionForCountry(country: string): string | null {
  if (!country) return null;
  const c = country.toUpperCase();
  // Asia
  if (
    ['CN', 'HK', 'TW', 'JP', 'KR', 'SG', 'IN', 'ID', 'MY', 'TH', 'VN', 'PH', 'PK', 'BD', 'LK', 'NP', 'KH', 'MM', 'LA'].includes(c)
  )
    return 'ASIA';
  // North America
  if (['US', 'CA', 'MX', 'PR'].includes(c)) return 'NA';
  // South America
  if (['BR', 'AR', 'CL', 'PE', 'CO', 'VE', 'UY', 'PY', 'EC', 'BO', 'GY'].includes(c)) return 'SA';
  // Europe
  if (
    ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'FI', 'DK', 'PL', 'PT', 'IE', 'AT', 'CH', 'BE', 'CZ', 'GR', 'HU', 'RO', 'UA', 'RU', 'TR'].includes(c)
  )
    return 'EU';
  return null;
}

// The request's country code (Vercel injects x-vercel-ip-country). Async in Next 15.
async function requestCountry(): Promise<string> {
  try {
    const h = await headers();
    return h.get('x-vercel-ip-country') || '';
  } catch {
    return '';
  }
}

// Order stores for a request: nearest region first, then the rest (stable). Falls back to the
// configured order when the country isn't mapped.
async function orderForRequest(): Promise<Store[]> {
  const all = stores();
  if (all.length <= 1) return all;
  const country = await requestCountry();
  const wanted = regionForCountry(country);
  if (!wanted) return all;
  const primary = all.find((s) => s.region === wanted);
  if (!primary) return all;
  return [primary, ...all.filter((s) => s.region !== wanted)];
}

async function kvGet(key: string): Promise<string | null> {
  if (memEnabled) {
    const hit = mem.get(key);
    if (hit && hit.exp > Date.now()) return hit.v;
    if (hit) mem.delete(key);
    return null;
  }
  // Try stores nearest-first; return the first hit.
  for (const s of await orderForRequest()) {
    try {
      const res = await fetch(
        `${API}/accounts/${s.accountId}/storage/kv/namespaces/${s.namespaceId}/values/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${s.token}` } },
      );
      if (res.status === 404) continue;
      if (!res.ok) continue;
      return await res.text();
    } catch {
      continue;
    }
  }
  return null;
}

async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const seconds = Math.max(1, ttlSeconds ?? DEFAULT_TTL());
  if (memEnabled) {
    mem.set(key, { v: value, exp: Date.now() + seconds * 1000 });
    return;
  }
  // Write to every configured region in parallel so any nearby reader can hit it.
  await Promise.all(
    stores().map((s) =>
      fetch(
        `${API}/accounts/${s.accountId}/storage/kv/namespaces/${s.namespaceId}/values/${encodeURIComponent(key)}?expiration_ttl=${seconds}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'text/plain' },
          body: value,
        },
      ).catch(() => undefined),
    ),
  );
}

function buildKey(group: string, id: string): string {
  return `${PREFIX}:${group}:${id}`;
}

export async function cachedJson<T>(
  group: string,
  id: string,
  loader: () => MaybePromise<T>,
  opts?: { ttlSeconds?: number },
): Promise<T> {
  const key = buildKey(group, id);
  const cached = await kvGet(key);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      /* corrupt — fall through to reload */
    }
  }
  const fresh = await loader();
  if (memEnabled || stores().length > 0) {
    await kvSet(key, JSON.stringify(fresh), opts?.ttlSeconds);
  }
  return fresh;
}

export function isKvConfigured(): boolean {
  return stores().length > 0;
}
