import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site';
import { submitIndexNow, indexNowConfigured } from '@/lib/indexnow';
import { DOC_SLUGS } from '@/content/docs/nav';
import { safeEqual } from '@/lib/safe-equal';

// GET /api/cron/indexnow — periodically notify Bing (IndexNow) about the site's public
// URLs. Triggered by vercel.json cron config (e.g. daily). Protected by CRON_SECRET.
// SECURITY: CRON_SECRET is REQUIRED, exactly like the other cron endpoints. Without it the
// endpoint refuses to run rather than leaking the URL list to unauthenticated callers.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!safeEqual(header ?? '', secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!indexNowConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'INDEXNOW_KEY not set' });
  }

  // Public, indexable URLs only (same set as sitemap.xml).
  const urls = [
    siteUrl('/'),
    siteUrl('/login'),
    siteUrl('/signup'),
    siteUrl('/docs'),
    siteUrl('/blueprints'),
    siteUrl('/explore'),
    siteUrl('/outputs'),
    ...DOC_SLUGS.filter((s) => s !== 'index').map((slug) => siteUrl(`/docs/${slug}`)),
  ];

  await submitIndexNow(urls);
  return NextResponse.json({ ok: true, submitted: urls.length });
}