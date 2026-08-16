import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { signOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GITLAB_CLIENT_ID;
const BASE_URL = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

// GET /api/gitlab/connect?token=... — start "connect GitLab to my account" flow.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'GitLab is not configured' }, { status: 500 });
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
  const redirectUri = siteUrl('/api/gitlab/callback');
  // `read_api` grants read-only API access — including listing projects and reading repo
  // files, which the Pages deploy feature needs. WITHOUT it the token is login-only and
  // `git-fetch` can't pull a repo. GitLab shows the requested scopes on the consent screen
  // so the user explicitly approves repo read access when they re-auth.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read_api read_user',
    state,
  });

  const res = NextResponse.redirect(`${BASE_URL}/oauth/authorize?${params.toString()}`);
  res.cookies.set('gitlab_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  // When the caller authenticated via the Authorization header (fetch from the SPA),
  // return the authorize URL as JSON instead of a 302 — the browser then navigates to
  // it. This keeps the session JWT out of the URL query string (and out of logs).
  if (req.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ url: `${BASE_URL}/oauth/authorize?${params.toString()}` });
  }
  return res;
}
