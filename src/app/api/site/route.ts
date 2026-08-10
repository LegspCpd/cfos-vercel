import { NextResponse } from 'next/server';
import { getSiteSettings, getPublicCaptchaConfig } from '@/lib/settings';

// GET /api/site — public site settings (no auth required).
// Used by login/signup/home pages to show the site name, tagline, banner, icons, captcha config.
export async function GET() {
  const [s, captcha] = await Promise.all([getSiteSettings(), getPublicCaptchaConfig()]);
  return NextResponse.json({
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
}
