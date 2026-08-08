import { NextResponse } from 'next/server';
import { getSiteSettings } from '@/lib/settings';

// GET /api/site — public site settings (no auth required).
// Used by login/signup/home pages to show the site name, tagline, banner, etc.
export async function GET() {
  const s = await getSiteSettings();
  return NextResponse.json({
    siteName: s.siteName,
    siteTagline: s.siteTagline,
    bannerText: s.bannerText,
    bannerEnabled: s.bannerEnabled,
    bannerColor: s.bannerColor,
    footerText: s.footerText,
  });
}
