import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { markNotificationsRead } from '@/lib/notifications';
import { cachedJson, invalidateCache } from '@/lib/kv-cache';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/notifications — my notifications (newest first), plus the unread count.
// Cached per-user for a few seconds: the bell polls this on every shell mount and the
// list changes only when a new notification lands or one is marked read (both paths
// invalidate the cache), so repeat loads are instant instead of hitting Postgres.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await cachedJson(
    'notifications',
    session.userId,
    async () => {
      const [notifications, unread] = await Promise.all([
        prisma.notification.findMany({
          where: { userId: session.userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.notification.count({ where: { userId: session.userId, read: false } }),
      ]);
      return { notifications, unread };
    },
    { ttlSeconds: Number(process.env.KV_NOTIFICATIONS_TTL) || 5 },
  );

  return NextResponse.json(body);
}

// POST /api/notifications — mark notifications as read.
// Body: { id?: string } — mark one, or all when omitted.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : undefined;
  await markNotificationsRead(session.userId, id);
  // Drop the cached list so the next GET reflects the read state immediately.
  await invalidateCache('notifications', session.userId);

  const unread = await prisma.notification.count({ where: { userId: session.userId, read: false } });
  return NextResponse.json({ ok: true, unread });
}