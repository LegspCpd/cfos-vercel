import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { markNotificationsRead } from '@/lib/notifications';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/notifications — my notifications (newest first), plus the unread count.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: session.userId, read: false } }),
  ]);

  return NextResponse.json({ notifications, unread });
}

// POST /api/notifications — mark notifications as read.
// Body: { id?: string } — mark one, or all when omitted.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : undefined;
  await markNotificationsRead(session.userId, id);

  const unread = await prisma.notification.count({ where: { userId: session.userId, read: false } });
  return NextResponse.json({ ok: true, unread });
}