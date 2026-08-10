import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

// POST /api/profile/delete-account/cancel — cancel a pending account-deletion request.
// Only valid during the cooldown (before the deadline passes).
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.deleteAt || user.deleteAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: '没有待注销的请求，或注销已生效' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { deleteRequestedAt: null, deleteAt: null },
  });

  await writeAudit({
    userId: user.id,
    username: user.username,
    action: 'account.delete_cancel',
    detail: 'Cancelled pending account deletion',
  });

  return NextResponse.json({ ok: true });
}
