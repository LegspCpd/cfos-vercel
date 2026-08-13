// Post-deploy KV warm-up.
//
// WHY this exists (and what it can't do):
//  - Most KV-cached data is per-user (me/analytics/ssh-hosts/pages stats) or account-scoped
//    from Cloudflare (pages projects / git repos). None of it can be computed at `next build`
//    time — it needs a live request with a user token / a CF call. Pre-seeding those keys
//    during build is impossible.
//  - The one public, low-churn key is `/api/site` (site branding). It's already edge-cached
//    (s-maxage) and KV-cached; this script just primes that KV key right after deploy so the
//    very first visitor doesn't have to wait for a DB read (which is also covered by the edge
//    cache, but this closes the gap on a cold edge + cold KV).
//
// Usage (run AFTER the site is reachable, e.g. a post-deploy CI step — NOT in `next build`):
//   node scripts/warm-kv.mjs
//
// Env:
//   DEPLOY_URL  - the public base URL to hit, e.g. https://os.legspcpd.top
//                 (falls back to PUBLIC_BASE_URL, then skipped with a warning)

const BASE =
  process.env.DEPLOY_URL ||
  process.env.PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  '';

async function warm() {
  if (!BASE) {
    console.warn('[warm-kv] no DEPLOY_URL/PUBLIC_BASE_URL set — skipping warm-up.');
    return;
  }
  const url = `${BASE.replace(/\/$/, '')}/api/site`;
  try {
    const start = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const ms = Date.now() - start;
    if (res.ok) {
      const body = await res.json();
      console.log(
        `[warm-kv] primed /api/site in ${ms}ms (siteName=${body?.siteName ?? '?'}). Repeat loads will hit KV/edge.`,
      );
    } else {
      console.warn(`[warm-kv] /api/site returned ${res.status} — check that the site is deployed/reachable.`);
    }
  } catch (e) {
    console.warn(`[warm-kv] failed to reach ${url}: ${(e as Error).message}`);
  }
}

warm();
