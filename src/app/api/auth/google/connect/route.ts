import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// GET /api/auth/google/connect?token=... — start the "connect Google to my account" flow.
// Requires an authenticated user. The userId is embedded in the OAuth state so the
// callback can link the Google identity back to this account (so a later Google login
// returns to the same account).
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'Google is not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const state = `connect:${session.userId}:${crypto.randomBytes(8).toString('hex')}`;
  const redirectUri = siteUrl('/api/auth/google/callback');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
