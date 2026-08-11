import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { siteBaseUrl, siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  picture?: string;
}

// GET /api/auth/google/callback — handle Google OAuth callback.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = req.headers.get('cookie')?.match(/google_oauth_state=([^;]+)/)?.[1];
  if (!state || !storedState || state !== storedState) {
    return redirectWithError('Invalid OAuth state. Please try again.', req);
  }
  if (error || !code) {
    // User cancelled on Google or returned without authorizing.
    return redirectWithError('登录已取消', req, '1001');
  }

  try {
    const redirectUri = siteUrl('/api/auth/google/callback');

    // 1. Exchange code for access token.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
      return redirectWithError('Failed to obtain Google token.', req);
    }

    // 2. Fetch Google user info (email, name, sub).
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info = (await infoRes.json()) as GoogleUserInfo;
    if (!info.sub) {
      return redirectWithError('Failed to fetch Google profile.', req);
    }

    // 2.5 "Connect" flow: state = "connect:<userId>:<nonce>". Link the Google identity to
    // the currently-logged-in user instead of creating/logging into a new session.
    if (state.startsWith('connect:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('连接失败：用户不存在', req, '1001');

      // If this Google account is already linked to a different user, block to avoid stealing.
      const existing = await prisma.user.findUnique({ where: { googleId: info.sub } });
      if (existing && existing.id !== targetUser.id) {
        return redirectWithError('该 Google 账号已绑定到另一个用户', req, '1001');
      }

      await prisma.user.update({ where: { id: targetUser.id }, data: { googleId: info.sub } });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?googleLinked=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('google_oauth_state');
      return res;
    }

    // DELETE flow (no-email accounts): re-authenticate via Google to confirm deletion.
    if (state.startsWith('delete:')) {
      const targetUserId = state.split(':')[1];
      const targetUser = targetUserId
        ? await prisma.user.findUnique({ where: { id: targetUserId } })
        : null;
      if (!targetUser) return redirectWithError('注销确认失败：用户不存在', req, '1001');
      // The authenticated Google identity must belong to the target account.
      if (targetUser.googleId !== info.sub) {
        return redirectWithError('注销确认失败：Google 身份不匹配', req, '1001');
      }
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { deleteOauthVerifiedAt: new Date() },
      });
      const res = NextResponse.redirect(`${siteBaseUrl()}/profile?deleteOauth=1`);
      res.cookies.delete('oauth_from');
      res.cookies.delete('google_oauth_state');
      return res;
    }

    // 3. Find or create local user.
    // SECURITY: only link an existing local account if we can PROVE ownership:
    //   - the OAuth provider's googleId is already bound, OR
    //   - Google has VERIFIED this email (info.email_verified) AND it exactly matches
    //     the local account's bound email (case-insensitive).
    // We do NOT link by username/email-prefix — that let an attacker register a Google
    // account whose email prefix matched a victim's local username and take over the
    // account. See also the email change flow which keeps user.email verified.
    const email = (info.email || '').toLowerCase();
    const emailVerified = Boolean(info.email_verified);
    const username = email.split('@')[0] || info.sub.slice(0, 16).toLowerCase();
    const displayName = info.name || email || 'Google user';

    let user = await prisma.user.findUnique({ where: { googleId: info.sub } });
    if (user) {
      // Already linked — just log in.
    } else if (emailVerified && email) {
      // Only link to a local account whose bound email matches this verified email.
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        // A verified-email local account — safe to attach the googleId.
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: info.sub },
        });
      }
    }
    if (!user) {
      // Brand-new account.
      user = await prisma.user.create({
        data: {
          username,
          displayName,
          passwordHash: 'google-oauth-no-password',
          googleId: info.sub,
          email: emailVerified ? email : null,
          profileComplete: false,
        },
      });
      await maybeBootstrapAdmin(username);
      await promoteEnvAdmins();
    }

    // 4. Issue session token and redirect back with it.
    const token = await createSessionToken({ userId: user.id, username: user.username });
    return redirectWithToken(token, req);
  } catch (e) {
    console.error('google oauth error', e);
    return redirectWithError('Google login failed.', req, '1001');
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
