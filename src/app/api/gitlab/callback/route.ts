import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { siteBaseUrl, siteUrl } from '@/lib/site';
import { verifyOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GITLAB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET;
const BASE_URL = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

// GET /api/gitlab/callback — handle the "connect GitLab" OAuth callback.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'GitLab is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = req.headers.get('cookie')?.match(/gitlab_oauth_state=([^;]+)/)?.[1];
  // Validate state by our HMAC signature OR the cookie (robust against third-party
  // cookie blocking).
  const signed = state ? verifyOAuthState(state) : { ok: false, userId: '' };
  const stateOk =
    Boolean(state) &&
    (signed.ok || (storedState !== undefined && state === storedState));
  if (!stateOk) return redirectError('Invalid OAuth state.');
  if (!state || !state.startsWith('connect:') || error || !code) return redirectError('连接失败或已取消');

  try {
    const redirectUri = siteUrl('/api/gitlab/callback');
    const tokenRes = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) return redirectError('无法获取 GitLab token');

    const infoRes = await fetch(`${BASE_URL}/api/v4/user`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info = (await infoRes.json()) as { username?: string };
    const username = (info.username || 'unknown').toLowerCase();

    const userId = state.split(':')[1];
    const targetUser = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!targetUser) return redirectError('用户不存在');

    await prisma.gitlabConnection.upsert({
      where: { userId },
      update: { accessToken: tokenJson.access_token, gitlabUsername: username },
      create: { userId, gitlabUsername: username, accessToken: tokenJson.access_token },
    });

    await writeAudit({ userId, username: targetUser.username, action: 'gitlab.connect', detail: `Connected GitLab @${username}` });
    const res = NextResponse.redirect(`${siteBaseUrl()}/connections?connected=1`);
    res.cookies.delete('gitlab_oauth_state');
    return res;
  } catch (e) {
    console.error('gitlab connect callback error', e);
    return redirectError('连接失败');
  }
}

function redirectError(msg: string): Response {
  const frontend = siteBaseUrl();
  return NextResponse.redirect(`${frontend}/connections?error=${encodeURIComponent(msg)}`);
}
