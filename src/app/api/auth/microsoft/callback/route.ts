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

    // MSAL acquires the token (validates the authorization code correctly).
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
    };
    const result = await getMsalClient().acquireTokenByCode(tokenRequest);
    if (!result?.accessToken) {
      throw new Error('No access token from Microsoft');
    }

    // Always fetch the user profile from Microsoft Graph — this gives the stable
    // object id (used as microsoftId), email and display name, independent of whether
    // MSAL returned an account object. Avoids an empty microsoftId (which would break
    // the @unique column for subsequent users).
    const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });
    if (!infoRes.ok) {
      throw new Error(`Graph /me failed: ${infoRes.status}`);
    }
    const info = (await infoRes.json()) as MsUserInfo;
    const finalMsId = (info.id || '').trim();
    if (!finalMsId) {
      throw new Error('Microsoft user id is empty');
    }

    const finalEmail = (info.mail || info.userPrincipalName || result?.account?.username || '').toLowerCase();
    const username = finalEmail.split('@')[0] || `ms_${finalMsId.slice(0, 12).toLowerCase()}`;
    const displayName = info.displayName || result?.account?.name || finalEmail || 'Microsoft user';

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
    const hint = e instanceof Error ? e.message : 'unknown error';
    // Surface the real reason (de-identified) so ops can diagnose — e.g. AADSTS codes,
    // Graph errors, unique-constraint issues — instead of a vague failure.
    return redirectWithError(`Microsoft 登录失败：${hint}`, req, '1001');
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
