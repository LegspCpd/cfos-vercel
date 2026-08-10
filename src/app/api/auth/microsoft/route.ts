import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

// Base64url-encode a buffer (RFC 7636 PKCE).
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

// GET /api/auth/microsoft — start Microsoft (Entra ID) OAuth flow.
// Manual Authorization Code + PKCE (RFC 7636) — serverless-safe because state and
// code_verifier are persisted in httpOnly cookies (MSAL's in-memory state does NOT
// survive separate serverless requests).
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Microsoft login is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const from = new URL(req.url).searchParams.get('from') === 'signup' ? 'signup' : 'login';
  const state = `${from}:${crypto.randomBytes(16).toString('hex')}`;
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(sha256(verifier));
  const redirectUri = siteUrl('/api/auth/microsoft/callback');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid email profile User.Read',
    code_challenge: challenge,
    code_challenge_method: 'S256',
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
  res.cookies.set('microsoft_verifier', verifier, {
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
