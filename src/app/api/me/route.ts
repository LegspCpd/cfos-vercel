import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { resolvePermissions } from '@/lib/permissions';
import { applyDueDeletion } from '@/lib/account-deletion';
import { cachedJson } from '@/lib/kv-cache';

// GET /api/me — returns current user from Bearer token.
//
// Cached in KV per-user for a few seconds: this is called on every shell mount (and often),
// and the returned user/profile/connection data changes rarely. Session validity and the
// deletion-deadline check still run every request (uncached) for correctness.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  // If the account's deletion deadline has passed, remove it and treat the session
  // as ended (the user must re-register if they want to come back).
  if (await applyDueDeletion(session.userId)) {
    return NextResponse.json({ error: 'Account has been deleted' }, { status: 401 });
  }

  const body = await cachedJson(
    'me',
    session.userId,
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: {
          githubConnections: { select: { githubLogin: true }, orderBy: { updatedAt: 'desc' } },
          gitlabConnections: { select: { gitlabUsername: true }, orderBy: { updatedAt: 'desc' } },
          group: { select: { permissions: true, name: true } },
        },
      });
      if (!user) return null;
      const githubLogins = user.githubConnections.map((c) => c.githubLogin);
      const gitlabLogins = user.gitlabConnections.map((c) => c.gitlabUsername);
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? '',
        groupId: user.groupId,
        groupName: user.group?.name ?? null,
        email: user.email ?? '',
        googleConnected: Boolean(user.googleId),
        githubConnected: githubLogins.length > 0,
        githubUsername: githubLogins[0] ?? null,
        githubAccounts: githubLogins,
        gitlabConnected: gitlabLogins.length > 0,
        gitlabUsername: gitlabLogins[0] ?? null,
        microsoftConnected: Boolean(user.microsoftId),
        profileComplete: user.profileComplete,
        deleteRequestedAt: user.deleteRequestedAt?.toISOString() ?? null,
        deleteAt: user.deleteAt?.toISOString() ?? null,
      };
    },
    { ttlSeconds: Number(process.env.KV_ME_TTL) || 5 },
  );

  if (!body) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  // SECURITY: isAdmin / permissions are authorization state and must NEVER be served
  // from the KV cache — a stale cache could keep granting (or denying) rights after a
  // role change. Recompute them fresh on every request.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { group: { select: { permissions: true, name: true } } },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const isAdmin = await isUserAdmin(user.id);
  const permissions = resolvePermissions(user);
  return NextResponse.json({ ...body, isAdmin, permissions });
}
