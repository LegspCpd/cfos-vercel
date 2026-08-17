import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { miscWriteLimiter } from '@/lib/rate-limit';

// POST /api/gitlab/disconnect — remove a GitLab connection for the current user.
// Body: { id?: string } — when id is given, remove just that connected account
// (ownership-checked); otherwise remove all of the user's GitLab connections.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.connections))) {
    return NextResponse.json({ error: 'You do not have permission to manage connections.' }, { status: 403 });
  }

  // Cap connection changes per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  let id: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    id = typeof body?.id === 'string' ? body.id : undefined;
  } catch {
    id = undefined;
  }

  if (id) {
    await prisma.gitlabConnection.deleteMany({ where: { id, userId: session.userId } });
  } else {
    await prisma.gitlabConnection.deleteMany({ where: { userId: session.userId } });
  }
  return NextResponse.json({ ok: true });
}
