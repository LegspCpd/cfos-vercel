import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

// GET /api/auth/microsoft/connect?token=... — start "connect Microsoft to my account" flow.
// Requires an authenticated user. The userId is embedded in the state so the callback
// links the Microsoft identity back to this account.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'Microsoft is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const state = `connect:${session.userId}:${crypto.randomBytes(8).toString('hex')}`;
  const redirectUri = siteUrl('/api/auth/microsoft/callback');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`,
  );
  res.cookies.set('microsoft_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
