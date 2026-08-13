import { NextResponse } from 'next/server';
import { getSiteSettings, getPublicCaptchaConfig } from '@/lib/settings';
import { cachedJson } from '@/lib/kv-cache';

// GET /api/site — public site settings (no auth required).
// Used by login/signup/home pages to show the site name, tagline, banner, icons, captcha config.
// Public + low-churn: DB read is cached in KV (fixed key, no user dim), AND the response is
// served with a short edge cache (s-maxage) so Cloudflare absorbs repeat hits — the source
// (Vercel/DB) isn't hit on every page load. A key part of the "feels like Cloudflare" speed.
export async function GET() {
  const body = await cachedJson('site', 'public', async () => {
    const [s, captcha] = await Promise.all([getSiteSettings(), getPublicCaptchaConfig()]);
    return {
      siteName: s.siteName,
      siteTagline: s.siteTagline,
      bannerText: s.bannerText,
      bannerEnabled: s.bannerEnabled,
      bannerColor: s.bannerColor,
      footerText: s.footerText,
      siteFavicon: s.siteFavicon,
      siteLogo: s.siteLogo,
      // Human-verification config: which provider(s) the admin enabled + their public site keys.
      // Secrets are never exposed here.
      turnstileEnabled: captcha.turnstileEnabled,
      turnstileSiteKey: captcha.turnstileSiteKey,
      recaptchaEnabled: captcha.recaptchaEnabled,
      recaptchaSiteKey: captcha.recaptchaSiteKey,
    };
  }, { ttlSeconds: Number(process.env.KV_SITE_TTL) || 120 });

  // Site branding is extremely low-churn (set by admin, changes rarely). Aggressive edge cache:
  // Cloudflare serves repeat hits for 5 min at the edge, and stale-while-revalidate keeps it
  // available during the 10-min revalidation window. This effectively removes the DB from the
  // hot path on login/home pages — a big part of "instant load".
  const res = NextResponse.json(body);
  res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res;
}
