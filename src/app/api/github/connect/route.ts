import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import crypto from 'node:crypto';
import { siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;

// GET /api/github/connect?token=... — start the "connect to GitHub" OAuth flow.
// Unlike login, this flow stores the access token for agent use.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');

  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const redirectUri = siteUrl('/api/github/callback');

  const state = `connect:${session.userId}:${crypto.randomBytes(12).toString('hex')}`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user user:email repo',
    state,
  });

  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  res.cookies.set('github_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
