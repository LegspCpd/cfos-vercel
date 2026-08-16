import { timingSafeEqual } from 'node:crypto';

// Constant-time string comparison for secrets (CRON_SECRET etc.). Plain `!==` leaks
// timing information about how many leading characters matched; timingSafeEqual does
// not. Length is compared first (safe — length is not secret).
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}