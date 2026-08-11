import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { siteBaseUrl, siteUrl } from '@/lib/site';
import { verifyOAuthState } from '@/lib/oauth-state';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// GET /api/google/callback — handle the "connect Google" OAuth callback (state=connect:<userId>).
// Stores the access token as a GoogleConnection on the user, then redirects back to /connections.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = req.headers.get('cookie')?.match(/google_oauth_state=([^;]+)/)?.[1];
  // Validate state by our HMAC signature OR the cookie (robust against third-party
  // cookie blocking).
  const signed = state ? verifyOAuthState(state) : { ok: false, userId: '' };
  const stateOk =
    Boolean(state) &&
    (signed.ok || (storedState !== undefined && state === storedState));
  if (!stateOk) {
    return redirectError('Invalid OAuth state.');
  }
  if (!state || !state.startsWith('connect:') || error || !code) {
    return redirectError('连接失败或已取消');
  }

  try {
    const redirectUri = siteUrl('/api/google/callback');
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
    const tokenJson = (await tokenRes.json()) as { access_token?: string; refresh_token?: string };
    if (!tokenJson.access_token) return redirectError('无法获取 Google token');

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info = (await infoRes.json()) as { email?: string; sub?: string };
    const email = (info.email || '').toLowerCase();

    const userId = state.split(':')[1];
    const targetUser = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!targetUser) return redirectError('用户不存在');

    // If this Google identity is already linked to another account, block the connect
    // to avoid stealing another user's Google login.
    if (info.sub) {
      const boundTo = await prisma.user.findUnique({ where: { googleId: info.sub } });
      if (boundTo && boundTo.id !== userId) {
        return redirectError('该 Google 账号已绑定到另一个用户');
      }
    }

    // Upsert by the account's googleSub (not userId) → supports multiple Google accounts.
    await prisma.googleConnection.upsert({
      where: { googleSub: info.sub || 'n/a' },
      update: {
        userId,
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token ?? null,
        googleEmail: email || 'unknown',
      },
      create: {
        userId,
        googleSub: info.sub || 'n/a',
        googleEmail: email || 'unknown',
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token ?? null,
      },
    });

    // Also bind googleId so the user can sign in with this Google account.
    await prisma.user.updateMany({ where: { id: userId, googleId: null }, data: { googleId: info.sub ?? null } });

    await writeAudit({ userId, username: targetUser.username, action: 'google.connect', detail: `Connected Google @${email}` });
    const res = NextResponse.redirect(`${siteBaseUrl()}/connections?connected=1`);
    res.cookies.delete('google_oauth_state');
    return res;
  } catch (e) {
    console.error('google connect callback error', e);
    return redirectError('连接失败');
  }
}

function redirectError(msg: string): Response {
  const frontend = siteBaseUrl();
  return NextResponse.redirect(`${frontend}/connections?error=${encodeURIComponent(msg)}`);
}
