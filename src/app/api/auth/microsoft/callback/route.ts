import { NextResponse } from 'next/server';
import { AuthorizationCodeRequest } from '@azure/msal-node';
import { getMsalClient } from '@/lib/msal';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { siteBaseUrl, siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

interface MsUserInfo {
  id?: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

// GET /api/auth/microsoft/callback — handle the Microsoft OAuth callback (MSAL).
// State format is either "{from}:{nonce}" (login/signup) or "connect:{userId}:{nonce}".
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Microsoft login is not configured.' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = req.headers.get('cookie')?.match(/microsoft_oauth_state=([^;]+)/)?.[1];
  if (!state || !storedState || state !== storedState) {
    return redirectWithError('Invalid OAuth state. Please try again.', req);
  }

  // Distinguish a genuine user cancel from a real error so we can surface the latter.
  if (error || !code) {
    if (error === 'access_denied' || !error) {
      return redirectWithError('登录已取消', req, '1001');
    }
    const desc = url.searchParams.get('error_description') || error;
    return redirectWithError(`Microsoft 登录失败：${desc}`, req, '1001');
  }

  try {
    const redirectUri = siteUrl('/api/auth/microsoft/callback');

    // MSAL acquires the token + account (validates the authorization code correctly).
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
    };
    const result = await getMsalClient().acquireTokenByCode(tokenRequest);

    // Determine user id: prefer graph account id, fall back to localAccountId.
    const msId = result?.account?.localAccountId || result?.account?.homeAccountId || '';
    const email = (result?.account?.username || '').toLowerCase();
    const displayName = result?.account?.name || email || 'Microsoft user';

    // If localAccountId is empty, try Graph for the id/mail.
    let info: MsUserInfo = {};
    if (!msId) {
      try {
        const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${result?.accessToken}` },
        });
        info = (await infoRes.json()) as MsUserInfo;
      } catch {
        /* ignore */
      }
    }
    const finalMsId = msId || info.id || '';

    const username = email.split('@')[0] || `ms_${finalMsId.slice(0, 12).toLowerCase()}`;
    const finalEmail = email || (info.mail || info.userPrincipalName || '').toLowerCase();

    // CONNECT flow: state = "connect:<userId>:<nonce>". Link to a logged-in user.
    if (state.startsWith('connect:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('连接失败：用户不存在', req, '1001');
      const existing = finalMsId
        ? await prisma.user.findUnique({ where: { microsoftId: finalMsId } })
        : null;
      if (existing && existing.id !== targetUser.id) {
        return redirectWithError('该 Microsoft 账号已绑定到另一个用户', req, '1001');
      }
      await prisma.user.update({ where: { id: targetUser.id }, data: { microsoftId: finalMsId } });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?msLinked=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('microsoft_oauth_state');
      return res;
    }

    // Login/signup flow.
    let user = finalMsId
      ? await prisma.user.findUnique({ where: { microsoftId: finalMsId } })
      : null;
    if (!user) {
      user = await prisma.user.findUnique({ where: { username } });
      if (user && user.microsoftId === null) {
        user = await prisma.user.update({ where: { id: user.id }, data: { microsoftId: finalMsId } });
      }
    }
    if (!user) {
      user = await prisma.user.create({
        data: {
          username,
          displayName: displayName || username,
          passwordHash: 'microsoft-oauth-no-password',
          microsoftId: finalMsId,
        },
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
