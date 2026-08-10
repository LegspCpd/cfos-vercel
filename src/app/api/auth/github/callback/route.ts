import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { siteBaseUrl, siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

interface GitHubUser {
  login: string;
  name?: string | null;
  id: number;
}
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

// GET /api/auth/github/callback — handle GitHub OAuth callback.
// Exchange code for token, fetch user, find-or-create local user, issue session JWT,
// then redirect the browser back to the frontend with the token in a fragment.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GitHub login is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // CSRF check
  const storedState = req.headers.get('cookie')?.match(/github_oauth_state=([^;]+)/)?.[1];
  if (!state || !storedState || state !== storedState) {
    return redirectWithError('Invalid OAuth state. Please try again.', req);
  }

  if (error || !code) {
    // User cancelled on GitHub or returned without authorizing.
    return redirectWithError('登录已取消', req, '1001');
  }

  try {
    const redirectUri = siteUrl('/api/auth/github/callback');

    // 1. Exchange code for access token.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
      return redirectWithError('Failed to obtain GitHub token.', req);
    }
    const accessToken = tokenJson.access_token;

    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

    // 2. Fetch GitHub user.
    const userRes = await fetch('https://api.github.com/user', { headers: authHeader });
    const ghUser = (await userRes.json()) as GitHubUser;

    // 3. Fetch verified primary email (for username uniqueness & display).
    const emailRes = await fetch('https://api.github.com/user/emails', { headers: authHeader });
    const emails = (await emailRes.json()) as GitHubEmail[];
    const primaryEmail =
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      '';

    const username = ghUser.login.toLowerCase();
    const displayName = ghUser.name || ghUser.login;

    // 4. Find or create local user.
    let user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username, displayName, passwordHash: 'github-oauth-no-password' },
      });
      await maybeBootstrapAdmin(username);
      await promoteEnvAdmins();
    } else if (!user.passwordHash.startsWith('github-oauth')) {
      // Existing user already has a password; leave it, just log them in.
    }

    // 5. Issue session token.
    const token = await createSessionToken({ userId: user.id, username: user.username });
    return redirectWithToken(token, req);
  } catch (e) {
    console.error('github oauth error', e);
    return redirectWithError('GitHub login failed.', req, '1001');
  }
}

function redirectWithToken(token: string, req: Request): Response {
  // Clear the "from" cookie since the flow completed successfully.
  const res = NextResponse.redirect(siteUrl(`/verify?token=${encodeURIComponent(token)}`));
  res.cookies.delete('oauth_from');
  return res;
}

// On an OAuth cancel/failure, send the user back to the page where they started
// (default /login) with a clear error. Code 1001 = "OAuth sign-in cancelled/failed".
function redirectWithError(msg: string, req: Request, code?: string): Response {
  const cookie = req.headers.get('cookie') || '';
  const from = cookie.match(/oauth_from=([^;]+)/)?.[1];
  const target = from === 'signup' ? '/signup' : '/login';
  const errorCode = code || '1001';
  const res = NextResponse.redirect(
    `${siteBaseUrl()}${target}?error=${encodeURIComponent(`${errorCode}: ${msg}`)}`,
  );
  res.cookies.delete('oauth_from');
  return res;
}
