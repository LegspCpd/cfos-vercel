import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getMsalClient } from '@/lib/msal';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// GET /api/auth/microsoft/connect?token=... — start "connect Microsoft to my account" flow
// using MSAL (so the Microsoft login screen shows correctly).
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Microsoft is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const state = `connect:${session.userId}:${crypto.randomBytes(8).toString('hex')}`;
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
  return res;
}
