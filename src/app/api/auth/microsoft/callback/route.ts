import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { siteBaseUrl, siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

interface MsUserInfo {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

// GET /api/auth/microsoft/callback — handle Microsoft OAuth callback.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Microsoft login is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  const storedState = req.headers.get('cookie')?.match(/microsoft_oauth_state=([^;]+)/)?.[1];
  if (!state || !storedState || state !== storedState) {
    return redirectWithError('Invalid OAuth state. Please try again.', req);
  }
  if (error || !code) {
    // Only a genuine user cancel ("access_denied") is treated as a cancel; any other
    // error is surfaced verbatim so a misconfiguration (e.g. redirect_uri_mismatch,
    // invalid_scope) is easy to diagnose.
    if (error === 'access_denied' || !error) {
      return redirectWithError('登录已取消', req, '1001');
    }
    const detail = errorDesc || error;
    return redirectWithError(`Microsoft 登录失败：${detail}`, req, '1001');
  }

  try {
    const redirectUri = siteUrl('/api/auth/microsoft/callback');

    // 1. Exchange code for tokens.
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'https://graph.microsoft.com/User.Read openid email profile',
        }),
      },
    );
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) return redirectWithError('Failed to obtain Microsoft token.', req);

    // 2. Fetch user info from Microsoft Graph.
    const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info = (await infoRes.json()) as MsUserInfo;
    if (!info.id) return redirectWithError('Failed to fetch Microsoft profile.', req);

    const email = (info.mail || info.userPrincipalName || '').toLowerCase();
    const username = email.split('@')[0] || `ms_${info.id.slice(0, 12).toLowerCase()}`;
    const displayName = info.displayName || email || 'Microsoft user';

    // CONNECT flow: state = "connect:<userId>:<nonce>". Link this Microsoft account to a
    // logged-in user instead of signing in.
    if (state.startsWith('connect:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('连接失败：用户不存在', req, '1001');
      const existing = await prisma.user.findUnique({ where: { microsoftId: info.id } });
      if (existing && existing.id !== targetUser.id) {
        return redirectWithError('该 Microsoft 账号已绑定到另一个用户', req, '1001');
      }
      await prisma.user.update({ where: { id: targetUser.id }, data: { microsoftId: info.id } });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?msLinked=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('microsoft_oauth_state');
      return res;
    }

    // 3. Find or create local user (priority: microsoftId → username/email → create).
    let user = await prisma.user.findUnique({ where: { microsoftId: info.id } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { username } });
      if (user && user.microsoftId === null) {
        user = await prisma.user.update({ where: { id: user.id }, data: { microsoftId: info.id } });
      }
    }
    if (!user) {
      user = await prisma.user.create({
        data: { username, displayName, passwordHash: 'microsoft-oauth-no-password', microsoftId: info.id },
      });
      await maybeBootstrapAdmin(username);
      await promoteEnvAdmins();
    }

    const token = await createSessionToken({ userId: user.id, username: user.username });
    return redirectWithToken(token, req);
  } catch (e) {
    console.error('microsoft oauth error', e);
    return redirectWithError('Microsoft login failed.', req, '1001');
  }
}

function redirectWithToken(token: string, req: Request): Response {
  const res = NextResponse.redirect(siteUrl(`/verify?token=${encodeURIComponent(token)}`));
  res.cookies.delete('oauth_from');
  return res;
}

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
