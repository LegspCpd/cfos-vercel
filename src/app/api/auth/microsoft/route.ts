import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getMsalClient } from '@/lib/msal';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// GET /api/auth/microsoft — start Microsoft (Entra ID) OAuth flow using MSAL.
// MSAL builds the correct authorize URL (including PKCE + state) so the Microsoft
// login screen (with password entry) is shown properly.
// Optional ?from=login|signup records which page started the flow for cancel handling.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Microsoft login is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const from = new URL(req.url).searchParams.get('from') === 'signup' ? 'signup' : 'login';
  const state = `${from}:${crypto.randomBytes(8).toString('hex')}`;
  const redirectUri = siteUrl('/api/auth/microsoft/callback');

  const authUrl = await getMsalClient().getAuthCodeUrl({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri,
    state,
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set('microsoft_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  res.cookies.set('oauth_from', from, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
