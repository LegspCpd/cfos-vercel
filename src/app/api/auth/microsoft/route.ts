import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

// GET /api/auth/microsoft — start Microsoft (Entra ID) OAuth flow.
// Optional ?from=login|signup records which page started the flow for cancel handling.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'Microsoft login is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const redirectUri = siteUrl('/api/auth/microsoft/callback');
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  const res = NextResponse.redirect(url);
  res.cookies.set('microsoft_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const from = new URL(req.url).searchParams.get('from');
  if (from === 'login' || from === 'signup') {
    res.cookies.set('oauth_from', from, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  }
  return res;
}
