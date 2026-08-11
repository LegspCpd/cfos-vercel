import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { saveGitHubConnection } from '@/lib/github';
import { writeAudit } from '@/lib/audit';
import { siteBaseUrl, siteUrl } from '@/lib/site';
import { verifyOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

interface GitHubUser {
  login: string;
  name?: string | null;
  id: number;
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

  // CSRF check: a plain random hex state must match the cookie (login), while a
  // signed state (delete/connect flows) is validated by its HMAC signature — so a
  // blocked third-party cookie doesn't break the delete/connect flows.
  const storedState = req.headers.get('cookie')?.match(/github_oauth_state=([^;]+)/)?.[1];
  const signed = state ? verifyOAuthState(state) : { ok: false };
  const stateOk =
    Boolean(state) &&
    (signed.ok || (storedState !== undefined && state === storedState));
  if (!state || !stateOk) {
    return redirectWithError('Invalid OAuth state. Please try again.', req, undefined, state);
  }

  if (error || !code) {
    // User cancelled on GitHub or returned without authorizing.
    return redirectWithError('登录已取消', req, '1001', state);
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
      return redirectWithError('Failed to obtain GitHub token.', req, undefined, state);
    }
    const accessToken = tokenJson.access_token;

    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

    // 2. Fetch GitHub user.
    const userRes = await fetch('https://api.github.com/user', { headers: authHeader });
    const ghUser = (await userRes.json()) as GitHubUser;

    const username = ghUser.login.toLowerCase();
    const displayName = ghUser.name || ghUser.login;

    // CONNECT flow: state = "connect:<userId>:<nonce>". Link this GitHub account to an
    // already-logged-in user instead of signing in. (Used by the Connections page.)
    if (state.startsWith('connect:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('连接失败：用户不存在', req, '1001', state);

      // If this GitHub account is already linked to a different user, block to avoid stealing.
      const existing = await prisma.user.findUnique({ where: { githubId: ghUser.id } });
      if (existing && existing.id !== targetUser.id) {
        return redirectWithError('该 GitHub 账号已绑定到另一个用户', req, '1001', state);
      }

      // Bind the GitHub identity and store the connection for agent access.
      await prisma.user.update({ where: { id: targetUser.id }, data: { githubId: ghUser.id } });
      await saveGitHubConnection(targetUser.id, accessToken);
      await writeAudit({
        userId: targetUser.id,
        username: targetUser.username,
        action: 'github.connect',
        detail: `Connected GitHub account @${username}`,
      });
      const res = NextResponse.redirect(`${siteBaseUrl()}/connections?connected=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('github_oauth_state');
      return res;
    }

    // DELETE flow (no-email accounts): re-authenticate via GitHub to confirm deletion.
    if (state.startsWith('delete:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('注销确认失败：用户不存在', req, '1001', state);
      // The authenticated GitHub identity must belong to the target account.
      if (targetUser.githubId !== ghUser.id) {
        return redirectWithError('注销确认失败：GitHub 身份不匹配', req, '1001', state);
      }
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { deleteOauthVerifiedAt: new Date() },
      });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?deleteOauth=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('github_oauth_state');
      return res;
    }

    // 4. Find or create local user.
    // SECURITY: link an existing account ONLY when its githubId is already bound. A
    // GitHub login (ghUser.login) does NOT prove email ownership, so we must NEVER link
    // by matching username — that let an attacker with a same-named GitHub account take
    // over a victim's local account. No existing githubId link => always create new.
    let user = await prisma.user.findUnique({ where: { githubId: ghUser.id } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username,
          displayName,
          passwordHash: 'github-oauth-no-password',
          githubId: ghUser.id,
          profileComplete: false,
        },
      });
      await maybeBootstrapAdmin(username);
      await promoteEnvAdmins();
    }

    // 5. Issue session token.
    const token = await createSessionToken({ userId: user.id, username: user.username });
    return redirectWithToken(token, req);
  } catch (e) {
    console.error('github oauth error', e);
    return redirectWithError('GitHub login failed.', req, '1001', state);
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
// For connect/delete flows the target is /connections or /profile respectively, so a
// failed connection never bounces the user to the login page (which looked like a
// "logged out" bug).
function redirectWithError(msg: string, req: Request, code?: string, state?: string | null): Response {
  const cookie = req.headers.get('cookie') || '';
  const from = cookie.match(/oauth_from=([^;]+)/)?.[1];
  let target = from === 'signup' ? '/signup' : '/login';
  if (state?.startsWith('connect:')) target = '/connections';
  else if (state?.startsWith('delete:')) target = '/profile';
  const errorCode = code || '1001';
  const res = NextResponse.redirect(
    `${siteBaseUrl()}${target}?error=${encodeURIComponent(`${errorCode}: ${msg}`)}`,
  );
  res.cookies.delete('oauth_from');
  res.cookies.delete('github_oauth_state');
  return res;
}
