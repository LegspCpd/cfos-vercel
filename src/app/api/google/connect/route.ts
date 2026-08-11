import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { signOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// GET /api/google/connect?token=... — start "connect Google to my account" flow.
// Requires an authenticated user. The userId is embedded in state so the callback links
// the Google connection (token) back to this account.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'Google is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  // Sign the state so the callback can validate it WITHOUT a cookie (third-party
  // cookie blocking otherwise breaks the flow).
  const state = signOAuthState('connect', session.userId);
  const redirectUri = siteUrl('/api/google/callback');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
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
