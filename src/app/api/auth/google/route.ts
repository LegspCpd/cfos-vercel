import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// GET /api/auth/google — start Google OAuth flow.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const baseUrl = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
    prompt: 'select_account',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const res = NextResponse.redirect(url);
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min
  });
  // Remember where the OAuth flow started, so a cancel/return goes back there.
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
