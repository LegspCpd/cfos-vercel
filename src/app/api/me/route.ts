import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { resolvePermissions } from '@/lib/permissions';
import { applyDueDeletion } from '@/lib/account-deletion';

// GET /api/me — returns current user from Bearer token.
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
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      githubConnections: { select: { githubLogin: true }, orderBy: { updatedAt: 'desc' } },
      gitlabConnections: { select: { gitlabUsername: true }, orderBy: { updatedAt: 'desc' } },
      group: { select: { permissions: true, name: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const isAdmin = await isUserAdmin(user.id);
  const permissions = resolvePermissions(user);
  const githubLogins = user.githubConnections.map((c) => c.githubLogin);
  const gitlabLogins = user.gitlabConnections.map((c) => c.gitlabUsername);
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? '',
    isAdmin,
    permissions,
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
  });
}
