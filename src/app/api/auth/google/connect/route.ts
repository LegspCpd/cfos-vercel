import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { signOAuthState } from '@/lib/oauth-state';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// GET /api/auth/google/connect?token=... — start the "connect Google to my account" flow.
// Requires an authenticated user. The userId is embedded in a SIGNED OAuth state (HMAC with
// AUTH_SECRET) so the callback can validate it WITHOUT a cookie — this survives third-party
// cookie blocking, matching the GitHub/GitLab flows. A later Google login returns to the same
// account.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'Google is not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // purpose=delete → OAuth re-authentication used to confirm account deletion.
  const purpose = url.searchParams.get('purpose');
  const kind = purpose === 'delete' ? 'delete' : 'connect';
  const state = signOAuthState(kind, session.userId);
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
  // Best-effort cookie for backward compat; the callback no longer depends on it.
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
