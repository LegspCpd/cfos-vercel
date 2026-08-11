import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';

// POST /api/github/disconnect — remove the GitHub connection for the current user.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  await prisma.gitHubConnection.deleteMany({ where: { userId: session.userId } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'github.disconnect',
    detail: 'Disconnected GitHub account',
  });
  return NextResponse.json({ ok: true });
}
