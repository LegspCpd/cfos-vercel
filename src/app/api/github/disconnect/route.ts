import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';

// POST /api/github/disconnect — remove a GitHub connection for the current user.
// Body: { id?: string } — when id is given, remove just that connected account
// (ownership-checked); otherwise remove all of the user's GitHub connections.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  let id: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    id = typeof body?.id === 'string' ? body.id : undefined;
  } catch {
    id = undefined;
  }

  if (id) {
    await prisma.gitHubConnection.deleteMany({ where: { id, userId: session.userId } });
  } else {
    await prisma.gitHubConnection.deleteMany({ where: { userId: session.userId } });
  }
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'github.disconnect',
    detail: 'Disconnected GitHub account',
  });
  return NextResponse.json({ ok: true });
}
