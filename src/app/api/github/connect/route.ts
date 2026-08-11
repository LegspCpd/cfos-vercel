import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { signOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;

// GET /api/github/connect?token=... — start the "connect to GitHub" OAuth flow.
// Unlike login, this flow stores the access token for agent use.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');

  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  // GitHub requires the callback URL be registered in the OAuth app console. To avoid
  // forcing a second callback registration, both connect and delete reuse the ALREADY
  // registered /api/auth/github/callback (which handles `connect:` and `delete:` state
  // prefixes). The state is HMAC-signed so the callback can validate it even if a
  // third-party cookie is blocked — that was the real cause of "Invalid OAuth state".
  const purpose = url.searchParams.get('purpose');
  const isDelete = purpose === 'delete';
  const kind = isDelete ? 'delete' : 'connect';
  const redirectUri = siteUrl('/api/auth/github/callback');

  const state = signOAuthState(kind, session.userId);
  // `repo` grants read access to the user's repositories (including private), which the
  // Pages deploy feature needs to pull a repo's files. WITHOUT it the token is login-only
  // and `git-fetch` gets 403/404 on repo contents. `read:user` keeps the profile lookup
  // working. We drop the redundant `user:email`.
  //
  // `prompt=consent` forces GitHub to show the consent screen on EVERY connect, so a user
  // reconnecting (e.g. after a previous login-only grant) is prompted to pick which repos
  // to authorize — instead of GitHub silently re-issuing a login-only token because the
  // OAuth app was already approved.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user repo',
    prompt: 'consent',
    state,
  });

  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  res.cookies.set('github_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
