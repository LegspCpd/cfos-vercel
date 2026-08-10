import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

// GET /api/auth/microsoft/connect?token=... — start "connect Microsoft to my account".
// Manual Authorization Code + PKCE (same serverless-safe approach as sign-in).
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Microsoft is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // purpose=delete → OAuth re-authentication used to confirm account deletion.
  const purpose = url.searchParams.get('purpose');
  const kind = purpose === 'delete' ? 'delete' : 'connect';
  const state = `${kind}:${session.userId}:${crypto.randomBytes(16).toString('hex')}`;
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

  const res = NextResponse.redirect(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`,
  );
  res.cookies.set('microsoft_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  res.cookies.set('microsoft_verifier', verifier, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
