// Lightweight in-process rate limiter.
//
// Guards cheap-but-abusable endpoints (sending verification emails, brute-forcing a
// 6-digit code) against spam / rapid-fire attempts. It is an in-memory Map keyed by a
// string (email / IP / email+IP). Because serverless instances may be ephemeral, this
// is a best-effort first line of defense — not a hard security boundary — but it stops
// casual abuse and accidental loops (e.g. a stuck client retrying every few ms).

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private windowMs: number;
  private max: number;

  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }

  // Returns the number of remaining allowed calls, or 0 when over the limit.
  // Periodically prunes expired keys so the map doesn't grow unbounded.
  tryCall(key: string): number {
    const now = Date.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 5000) this.prune(now);
      return this.max - 1;
    }
    cur.count += 1;
    if (cur.count > this.max) return 0;
    return this.max - cur.count;
  }

  private prune(now: number): void {
    this.hits.forEach((v, k) => {
      if (v.resetAt <= now) this.hits.delete(k);
    });
  }
}

// Shared instances keyed by purpose. Module-level singletons persist across requests
// within a single serverless instance, which is exactly what we want here.
export const emailSendLimiter = new RateLimiter(60_000, 5); // 5 sends / email / minute
export const emailConfirmLimiter = new RateLimiter(15 * 60_000, 8); // 8 confirm tries / email / 15 min
export const loginLimiter = new RateLimiter(60_000, 15); // 15 login attempts / key / minute
// Deploy is a heavy operation (calls the Cloudflare API, decompresses archives). Cap it so a
// logged-in user can't spin deploys to exhaust the CF API quota / CPU. Keyed per-user.
export const deployLimiter = new RateLimiter(60_000, 10); // 10 deploys / user / minute
// Worker config writes (bindings / routes / secrets) each hit the Cloudflare API. Cap them
// per-user so a script can't hammer the CF API quota. Keyed per-user.
export const workerConfigLimiter = new RateLimiter(60_000, 30); // 30 config writes / user / minute
// Ticket submissions email every admin, so cap them to prevent email-bombing the inbox.
export const ticketLimiter = new RateLimiter(60 * 60_000, 5); // 5 tickets / user / hour
