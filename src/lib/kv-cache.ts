// Cloudflare KV-backed response cache. Slow cross-service calls (the Cloudflare Pages project
// list, GitHub/GitLab repo enumeration, the Pages usage panel) are cached in KV so repeat
// visits are instant — a key part of the "feels like Cloudflare" speed.
//
// Up to 5 KV namespaces can be configured. The first uses the base names; additional stores
// append a numeric suffix (`-2` … `-5`). You only need ONE store to get going — the extra ones
// are optional redundancy/scale:
//   KV_ACCOUNT_ID        / KV_API_TOKEN        / KV_NAMESPACE_ID         (store 1)
//   KV_ACCOUNT_ID_2      / KV_API_TOKEN_2      / KV_NAMESPACE_ID_2       (store 2)
//   …up to _5
//
// Shared tuning vars (one set, applies to all stores):
//   KV_PREFIX        - cache-key prefix (isolate multiple instances), default "cfos"
//   KV_DEFAULT_TTL   - default TTL seconds, default 60
//   KV_PAGES_PROJECTS_TTL / KV_GIT_REPOS_TTL / KV_PAGES_STATS_TTL - per-group overrides
//
// Read strategy: try the stores in order (store 1 first), falling through on a miss so any
// store can serve the value. Write strategy: write to EVERY configured store in parallel so
// every reader finds the value regardless of which store it hits. If NO KV env is configured
// we fall back to a bounded per-instance in-memory Map. All KV errors are swallowed — a cache
// miss/failure never breaks a request.
//
// D1 mirror (optional, OFF by default): when D1_ENABLED, every KV write is also mirrored to D1
// and a KV miss falls back to D1 (a redundant secondary store). D1 ops are best-effort.

import { d1Get, d1Set, d1Delete } from './d1';

const API = 'https://api.cloudflare.com/client/v4';
const PREFIX = process.env.KV_PREFIX || 'cfos';
const DEFAULT_TTL = () => Math.max(1, Number(process.env.KV_DEFAULT_TTL) || 60);
// Hard cap on a single KV fetch so a slow/hung store never blocks a request indefinitely
// (e.g. a deploy's post-deploy cache invalidation, which awaits these calls).
const FETCH_TIMEOUT_MS = 3000;

type MaybePromise<T> = T | Promise<T>;

interface Store {
  accountId: string;
  token: string;
  namespaceId: string;
}

const MAX_STORES = 5;
// Bounded in-memory fallback: prevents unbounded growth on a shared serverless instance when
// KV isn't configured. Insertion order = insertion age; we evict the oldest on overflow.
const MEM_MAX = 1000;

// All configured stores, in a stable order (store 1 first). The base store (no suffix) is
// always honored, so a single KV namespace is all that's needed; stores 2..5 are optional.
function stores(): Store[] {
  const out: Store[] = [];
  for (let i = 1; i <= MAX_STORES; i++) {
    const suffix = i === 1 ? '' : `_${i}`;
    const accountId = process.env[`KV_ACCOUNT_ID${suffix}`];
    const token = process.env[`KV_API_TOKEN${suffix}`];
    const namespaceId = process.env[`KV_NAMESPACE_ID${suffix}`];
    if (accountId && token && namespaceId) {
      out.push({ accountId, token, namespaceId });
    }
  }
  return out;
}

const kvConfigured = (): boolean => stores().length > 0;

// ---- Bounded in-memory fallback (only used when no KV is configured) ------------------
// A Map preserves insertion order, so evicting the first key gives a cheap FIFO bound.
// In-flight loaders keyed by cache key. Used for single-flight: when several requests miss
// the same key at once (cache stampede / thundering herd — e.g. everyone opening the Pages
// list right after deploy), they share one upstream call instead of each hammering it.
const pending = new Map<string, Promise<unknown>>();

const mem = new Map<string, string>(); // key -> "<expMs>\n<value>"

function memGet(key: string): string | null {
  if (!mem.has(key)) return null;
  const raw = mem.get(key)!;
  const sep = raw.indexOf('\n');
  if (sep === -1) {
    mem.delete(key);
    return null;
  }
  const exp = Number(raw.slice(0, sep));
  if (Number.isNaN(exp) || exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return raw.slice(sep + 1);
}

function memSet(key: string, value: string, ttlMs: number): void {
  // Delete first so a re-written key moves to the newest position (true LRU: hot keys are
  // refreshed to the back instead of staying at the front where they'd be evicted first).
  mem.delete(key);
  while (mem.size >= MEM_MAX) {
    const oldest = mem.keys().next();
    if (oldest.done) break;
    mem.delete(oldest.value);
  }
  mem.set(key, `${Date.now() + ttlMs}\n${value}`);
}

function memDelete(key: string): void {
  mem.delete(key);
}

// ---- Core cache helpers ----------------------------------------------------------------

// Safe cache key: ids are user-supplied in some call sites; strip anything that could alter
// the key structure (colons, control chars, spaces) to avoid collisions / injection.
function buildKey(group: string, id: string): string {
  const safe = String(id)
    .replace(/[\u0000-\u0020\u007f:]+/g, '_')
    .slice(0, 128);
  return `${PREFIX}:${group}:${safe}`;
}

async function kvGet(key: string): Promise<string | null> {
  if (!kvConfigured()) return memGet(key);
  // Try each configured store in order; return the first hit.
  for (const s of stores()) {
    try {
      const res = await fetch(
        `${API}/accounts/${s.accountId}/storage/kv/namespaces/${s.namespaceId}/values/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (res.status === 404) continue;
      if (!res.ok) continue;
      return await res.text();
    } catch {
      continue;
    }
  }
  // KV miss → try the D1 mirror (secondary backup).
  return await d1Get(key);
}

async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const seconds = Math.max(1, ttlSeconds ?? DEFAULT_TTL());
  if (!kvConfigured()) {
    memSet(key, value, seconds * 1000);
  } else {
    // Write to EVERY configured store in parallel so any reader finds the value.
    await Promise.all(
      stores().map((s) =>
        fetch(
          `${API}/accounts/${s.accountId}/storage/kv/namespaces/${s.namespaceId}/values/${encodeURIComponent(key)}?expiration_ttl=${seconds}`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'text/plain' },
            body: value,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          },
        ).catch(() => undefined),
      ),
    );
  }
  // Mirror to D1 (secondary backup). Best-effort and non-blocking — the write already landed
  // in KV/memory; a slow D1 must not hold up the response.
  void d1Set(key, value, seconds);
}

// Delete a cached value from every store (used to invalidate stale data after a deploy).
async function kvDelete(key: string): Promise<void> {
  if (!kvConfigured()) {
    memDelete(key);
    return;
  }
  await Promise.all(
    stores().map((s) =>
      fetch(
        `${API}/accounts/${s.accountId}/storage/kv/namespaces/${s.namespaceId}/values/${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      ).catch(() => undefined),
    ),
  );
  // Delete the D1 mirror too.
  await d1Delete(key);
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
      // Corrupt/unparseable value — drop it so we don't re-read and re-reload it every time.
      await kvDelete(key);
    }
  }

  // Single-flight: if another request on this instance is already loading the same key,
  // wait on it instead of hitting the upstream again. Ensures the lock is released even when
  // the loader throws.
  const existing = pending.get(key);
  if (existing) return (await existing) as T;

  const run = (async () => {
    const fresh = await loader();
    await kvSet(key, JSON.stringify(fresh), opts?.ttlSeconds);
    return fresh;
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}

// Invalidate a cached group+id. Export so callers can drop stale data immediately after a
// mutation (e.g. after a Pages deploy, clear the 'pages:projects' cache so the list is fresh).
export async function invalidateCache(group: string, id: string): Promise<void> {
  await kvDelete(buildKey(group, id));
}

// Force-reload a cache group's value and write it back to every store (KV + D1 mirror),
// bypassing the TTL. Used by the /api/cron/cache-warm job to keep slow, account-scoped
// upstream data (e.g. the Cloudflare project/script lists) pre-warmed in the cache so a user's
// page load almost always hits the cache instead of the upstream. Errors are swallowed — a
// failed warm just leaves the previous cached value in place.
export async function warmCache<T>(
  group: string,
  id: string,
  loader: () => MaybePromise<T>,
  opts?: { ttlSeconds?: number },
): Promise<void> {
  try {
    const value = await loader();
    await kvSet(buildKey(group, id), JSON.stringify(value), opts?.ttlSeconds);
  } catch {
    // keep the existing cached value on failure
  }
}

// Raw KV/memory get+set for storing small bookkeeping values (e.g. the cache-warm job's last
// run timestamp). Unlike cachedJson these don't JSON-parse or single-flight; they just read and
// write the raw string with an optional TTL. Used by the cron/cache-warm endpoint.
export async function cacheGetRaw(key: string): Promise<string | null> {
  return kvGet(buildKey('meta', key));
}

export async function cacheSetRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
  await kvSet(buildKey('meta', key), value, ttlSeconds);
}

export function isKvConfigured(): boolean {
  return kvConfigured();
}
