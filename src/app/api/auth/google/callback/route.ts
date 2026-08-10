import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';

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
    return redirectWithError('Invalid OAuth state. Please try again.');
  }
  if (error || !code) {
    return redirectWithError('Google authorization failed.');
  }

  try {
    const baseUrl = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

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
      return redirectWithError('Failed to obtain Google token.');
    }

    // 2. Fetch Google user info (email, name, sub).
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info = (await infoRes.json()) as GoogleUserInfo;
    if (!info.sub) {
      return redirectWithError('Failed to fetch Google profile.');
    }

    // 3. Find or create local user.
    // Prefer linking by googleId; fall back to email so a previously password-created
    // account with the same email can still log in via Google (we attach the googleId).
    const email = (info.email || '').toLowerCase();
    const username = email.split('@')[0] || info.sub.slice(0, 16).toLowerCase();
    const displayName = info.name || email || 'Google user';

    let user = await prisma.user.findUnique({ where: { googleId: info.sub } });
    if (user) {
      // Already linked — just log in.
    } else if (email && (await prisma.user.findUnique({ where: { username } }))) {
      // A local account with this email's username exists; link googleId to it.
      user = await prisma.user.update({
        where: { username },
        data: { googleId: info.sub },
      });
    } else {
      // Brand-new account.
      user = await prisma.user.create({
        data: {
          username,
          displayName,
          passwordHash: 'google-oauth-no-password',
          googleId: info.sub,
        },
      });
      await maybeBootstrapAdmin(username);
      await promoteEnvAdmins();
    }

    // 4. Issue session token and redirect back with it.
    const token = await createSessionToken({ userId: user.id, username: user.username });
    return redirectWithToken(token);
  } catch (e) {
    console.error('google oauth error', e);
    return redirectWithError('Google login failed.');
  }
}

function redirectWithToken(token: string): Response {
  const frontendUrl = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  // Land on /verify so a human-verification challenge runs before the session activates
  // (blocks bulk-automated OAuth accounts). /verify auto-passes when no CAPTCHA is configured.
  return NextResponse.redirect(`${frontendUrl}/verify?token=${encodeURIComponent(token)}`);
}

function redirectWithError(msg: string): Response {
  const frontendUrl = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return NextResponse.redirect(`${frontendUrl}/login?error=${encodeURIComponent(msg)}`);
}
