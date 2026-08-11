import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifySessionToken } from '@/lib/auth';
import { siteUrl } from '@/lib/site';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';

const CLIENT_ID = process.env.GITLAB_CLIENT_ID;
const BASE_URL = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

// GET /api/gitlab/connect?token=... — start "connect GitLab to my account" flow.
export async function GET(req: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'GitLab is not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  const state = `connect:${session.userId}:${crypto.randomBytes(8).toString('hex')}`;
  const redirectUri = siteUrl('/api/gitlab/callback');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read_api read_user',
    state,
  });

  const res = NextResponse.redirect(`${BASE_URL}/oauth/authorize?${params.toString()}`);
  res.cookies.set('gitlab_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
