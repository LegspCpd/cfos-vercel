import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;

// GET /api/auth/github — start GitHub OAuth flow.
// Redirects the browser to GitHub's authorization page with a CSRF state token.
// Optional ?from=login|signup records which page started the flow so an OAuth
// cancel/return can redirect the user back there with a clear error (code 1001).
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub login is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const baseUrl = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/github/callback`;

  // CSRF state
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  const res = NextResponse.redirect(url);
  // Store state in an httpOnly cookie for CSRF protection on the callback.
  res.cookies.set('github_oauth_state', state, {
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
