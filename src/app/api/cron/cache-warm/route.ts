import { NextResponse } from 'next/server';
import { warmCache, cacheGetRaw, cacheSetRaw } from '@/lib/kv-cache';
import { listPagesProjects } from '@/lib/cf-pages';
import { listWorkers } from '@/lib/cf-worker';
import { safeEqual } from '@/lib/safe-equal';

// GET /api/cron/cache-warm — pre-warm the account-scoped KV caches (mirrored to D1) so page
// loads hit the cache instead of Cloudflare's slow list APIs.
//
// Controlled by CACHE_WARM_INTERVAL_MINUTES (default 60 = hourly): the endpoint records the last
// run time in KV and skips if the interval hasn't elapsed, so you can set the vercel cron to a
// higher frequency and the job still only re-warms at the interval you want.
//
// SECURITY: CRON_SECRET is REQUIRED, exactly like the other cron endpoints. Without it the
// endpoint refuses to run rather than letting an unauthenticated caller hammer Cloudflare.
// Triggered by vercel.json cron config.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!safeEqual(header ?? '', secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Interval in minutes (default 60 = hourly). Fractional values are allowed (e.g. 0.5 = 30s).
  const intervalMin = Math.max(0, Number(process.env.CACHE_WARM_INTERVAL_MINUTES) || 60);
  const intervalMs = intervalMin * 60_000;

  // Respect the interval: skip if we warmed less than `interval` ago. If KV isn't configured
  // (no place to store the timestamp), fall back to warming every invocation.
  let last = 0;
  try {
    const raw = await cacheGetRaw('cache-warm-last');
    if (raw) last = Number(raw) || 0;
  } catch {
    /* ignore — fall back to warming */
  }
  if (intervalMs > 0 && last > 0 && Date.now() - last < intervalMs) {
    return NextResponse.json({
      ok: true,
      skipped: 'within interval',
      intervalMinutes: intervalMin,
      nextRunInMs: intervalMs - (Date.now() - last),
    });
  }

  // Warm the account-scoped caches in parallel. TTLs match the read paths so a warmed value
  // lives in the store as long as a freshly-fetched one.
  const results = await Promise.allSettled([
    warmCache('pages', 'projects', () => listPagesProjects(), {
      ttlSeconds: Number(process.env.KV_PAGES_PROJECTS_TTL) || 15,
    }),
    warmCache('workers', 'scripts', () => listWorkers(), {
      ttlSeconds: Number(process.env.KV_WORKERS_TTL) || 15,
    }),
  ]);

  // Record the run time so the next invocation respects the interval.
  try {
    await cacheSetRaw('cache-warm-last', String(Date.now()));
  } catch {
    /* ignore — warming already done, timestamp is best-effort */
  }

  return NextResponse.json({
    ok: true,
    warmed: results.map((r) => (r.status === 'fulfilled' ? 'ok' : 'failed')),
    nextRunInMs: intervalMs,
  });
}
