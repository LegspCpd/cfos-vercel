import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { getSiteSettings, updateSiteSettings } from '@/lib/settings';
import { z } from 'zod';

// GET /api/admin/settings — read all site settings (admin only).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const settings = await getSiteSettings();
  return NextResponse.json({ settings });
}

// POST /api/admin/settings — update site settings (admin only).
const patchSchema = z.object({
  signupsEnabled: z.boolean().optional(),
  siteName: z.string().max(200).optional(),
  siteTagline: z.string().max(300).optional(),
  bannerText: z.string().max(500).optional(),
  bannerEnabled: z.boolean().optional(),
  bannerColor: z.enum(['blue', 'amber', 'red', 'green']).optional(),
  footerText: z.string().max(500).optional(),
  defaultModel: z.string().max(200).optional(),
  agentInstructions: z.string().max(5000).optional(),
  // Branding
  siteFavicon: z.string().max(500).optional(),
  siteLogo: z.string().max(500).optional(),
  // Human verification (CAPTCHA)
  turnstileSiteKey: z.string().max(500).optional(),
  turnstileSecretKey: z.string().max(500).optional(),
  recaptchaSiteKey: z.string().max(500).optional(),
  recaptchaSecretKey: z.string().max(500).optional(),
  // Pages dashboard panel visibility.
  pagesBillingShow: z.boolean().optional(),
  pagesAccountShow: z.boolean().optional(),
});

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = patchSchema.parse(await req.json());
  await updateSiteSettings(body);

  return NextResponse.json({ ok: true });
}
