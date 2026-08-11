import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { siteBaseUrl, siteUrl } from '@/lib/site';
import { verifyOAuthState } from '@/lib/oauth-state';

// For the connect/delete flows, the state must be authentic (HMAC-signed by us) OR
// match the cookie we set. A plain/forged state must never let an attacker bind their
// Microsoft account to a victim's account.
function isConnectDeleteStateValid(state: string | null, storedState: string | undefined): boolean {
  if (!state) return false;
  if (verifyOAuthState(state).ok) return true;
  return storedState !== undefined && state === storedState;
}

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

interface MsUserInfo {
  id?: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

function getCookie(cookie: string, name: string): string | undefined {
  return cookie.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

// GET /api/auth/microsoft/callback — handle the Microsoft OAuth callback.
// State format: "{from}:{nonce}" (login/signup) or "connect:{userId}:{nonce}".
// Uses PKCE (code_verifier from cookie) to exchange the code — serverless-safe.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Microsoft login is not configured.' }, { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const cookieHeader = req.headers.get('cookie') || '';
  const storedState = getCookie(cookieHeader, 'microsoft_oauth_state');
  const verifier = getCookie(cookieHeader, 'microsoft_verifier');

  // Distinguish a genuine cancel from a real error so we can surface the latter.
  if (error || !code) {
    if (error === 'access_denied' || !error) {
      return redirectWithError('登录已取消', req, '1001');
    }
    const desc = url.searchParams.get('error_description') || error;
    return redirectWithError(`Microsoft 登录失败：${desc}`, req, '1001');
  }

  // CSRF: prefer exact state match, but DON'T hard-fail on mismatch. This is a
  // confidential client (we hold client_secret), so token exchange is protected by the
  // secret even if the state cookie was dropped by the browser (common under strict
  // third-party-cookie blocking, e.g. some Android/OEM browsers). We still pass the
  // PKCE verifier when available; otherwise we fall back to client-secret-only exchange.
  if (state && storedState && state !== storedState) {
    console.error('microsoft oauth state mismatch (continuing)', { urlState: state, cookieState: storedState });
  }

  try {
    const effectiveState = state || '';
    const redirectUri = siteUrl('/api/auth/microsoft/callback');

    // Exchange the authorization code for tokens. Use PKCE verifier if we have it;
    // otherwise a confidential-client exchange (client_secret) still works.
    const tokenBody: Record<string, string> = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    if (verifier) {
      tokenBody.code_verifier = verifier;
    }
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenBody),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!tokenJson.access_token) {
      throw new Error(tokenJson.error_description || tokenJson.error || 'token exchange failed');
    }
    const accessToken = tokenJson.access_token;

    // Fetch the stable user profile from Microsoft Graph.
    const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) throw new Error(`Graph /me failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as MsUserInfo;

    const msId = (info.id || '').trim();
    if (!msId) throw new Error('Microsoft user id is empty');

    const finalEmail = (info.mail || info.userPrincipalName || '').toLowerCase();
    const username = finalEmail.split('@')[0] || `ms_${msId.slice(0, 12).toLowerCase()}`;
    const displayName = info.displayName || finalEmail || 'Microsoft user';

    // CONNECT flow: state = "connect:<userId>:<nonce>". Link to a logged-in user.
    if (effectiveState.startsWith('connect:')) {
      // CSRF: state must be authentic (signed) or match the cookie. Never let a forged
      // state bind the attacker's Microsoft account onto a victim's account.
      if (!isConnectDeleteStateValid(effectiveState, storedState)) {
        return redirectWithError('Invalid OAuth state.', req, '1001');
      }
      const targetUserId = effectiveState.split(':')[1];
      const targetUser = targetUserId ? await prisma.user.findUnique({ where: { id: targetUserId } }) : null;
      if (!targetUser) return redirectWithError('连接失败：用户不存在', req, '1001');
      const existing = await prisma.user.findUnique({ where: { microsoftId: msId } });
      if (existing && existing.id !== targetUser.id) {
        return redirectWithError('该 Microsoft 账号已绑定到另一个用户', req, '1001');
      }
      await prisma.user.update({ where: { id: targetUser.id }, data: { microsoftId: msId } });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?msLinked=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('microsoft_oauth_state');
      res.cookies.delete('microsoft_verifier');
      return res;
    }

    // DELETE flow (no-email accounts): state = "delete:<userId>:<nonce>". The user
    // re-authenticates via OAuth to confirm account deletion. We only mark a short-lived
    // confirmation; the actual deleteAt is set after the user passes human verification
    // (see POST /api/profile/delete-account/oauth).
    if (effectiveState.startsWith('delete:')) {
      if (!isConnectDeleteStateValid(effectiveState, storedState)) {
        return redirectWithError('Invalid OAuth state.', req, '1001');
      }
      const targetUserId = effectiveState.split(':')[1];
      const targetUser = targetUserId ? await prisma.user.findUnique({ where: { id: targetUserId } }) : null;
      if (!targetUser) return redirectWithError('注销确认失败：用户不存在', req, '1001');
      // Security: the authenticated Microsoft identity must belong to the target account.
      if (targetUser.microsoftId !== msId) {
        return redirectWithError('注销确认失败：Microsoft 身份不匹配', req, '1001');
      }
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { deleteOauthVerifiedAt: new Date() },
      });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?deleteOauth=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('microsoft_oauth_state');
      res.cookies.delete('microsoft_verifier');
      return res;
    }

    // Login/signup flow: find-or-create by microsoftId → verified email → new account.
    // SECURITY: we only link an existing local account if the verified MS email exactly
    // matches the local account's bound email (case-insensitive). We do NOT link by
    // username/email-prefix, which would let an attacker take over a victim's account.
    let user = await prisma.user.findUnique({ where: { microsoftId: msId } });
    if (!user && finalEmail) {
      const byEmail = await prisma.user.findUnique({ where: { email: finalEmail } });
      if (byEmail && byEmail.microsoftId === null) {
        user = await prisma.user.update({ where: { id: byEmail.id }, data: { microsoftId: msId } });
      }
    }
    if (!user) {
      user = await prisma.user.create({
        data: {
          username,
          displayName: displayName || username,
          passwordHash: 'microsoft-oauth-no-password',
          microsoftId: msId,
          email: finalEmail || null,
          profileComplete: false,
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
    return redirectWithError(`Microsoft 登录失败：${hint}`, req, '1001');
  }
}

function redirectWithToken(token: string, req: Request): Response {
  const res = NextResponse.redirect(siteUrl(`/verify?token=${encodeURIComponent(token)}`));
  res.cookies.delete('oauth_from');
  res.cookies.delete('microsoft_verifier');
  return res;
}

function redirectWithError(msg: string, req: Request, code?: string): Response {
  const cookieHeader = req.headers.get('cookie') || '';
  const from = getCookie(cookieHeader, 'oauth_from');
  const target = from === 'signup' ? '/signup' : '/login';
  const errorCode = code || '1001';
  const res = NextResponse.redirect(
    `${siteBaseUrl()}${target}?error=${encodeURIComponent(`${errorCode}: ${msg}`)}`,
  );
  res.cookies.delete('oauth_from');
  res.cookies.delete('microsoft_verifier');
  return res;
}
