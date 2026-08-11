import { NextResponse } from 'next/server';
import { getSiteSettings, getPublicCaptchaConfig } from '@/lib/settings';

// GET /api/site — public site settings (no auth required).
// Used by login/signup/home pages to show the site name, tagline, banner, icons, captcha config.
// Public + low-churn: served with a short edge cache (s-maxage) so Cloudflare absorbs repeat
// hits and the source (Vercel/DB) isn't hit on every page load — a key part of the "feels like
// Cloudflare" fast-perceived-load strategy.
export async function GET() {
  const [s, captcha] = await Promise.all([getSiteSettings(), getPublicCaptchaConfig()]);
  const res = NextResponse.json({
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
  });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
