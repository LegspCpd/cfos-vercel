import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const admin = await isUserAdmin(session.userId);
  if (!admin) return null;
  return session;
}

type Ctx = { params: { id: string } };

// PATCH /api/admin/users/:id — { isAdmin: boolean } to promote/demote an admin.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const isAdmin = Boolean(body.isAdmin);

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { username: true, isAdmin: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Prevent demoting yourself (avoid locking yourself out).
  if (params.id === session.userId && !isAdmin) {
    return NextResponse.json({ error: 'You cannot demote yourself.' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: params.id }, data: { isAdmin } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'admin.promote_user',
    targetId: params.id,
    detail: `${isAdmin ? 'Promoted' : 'Demoted'} ${target.username} ${isAdmin ? 'to' : 'from'} admin`,
  });
  return NextResponse.json({ ok: true, username: target.username, isAdmin });
}

// DELETE /api/admin/users/:id — delete a user (and their data).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Can't delete yourself.
  if (params.id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete yourself.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { username: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } }); // cascades workspaces/files/etc.
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'admin.delete_user',
    targetId: params.id,
    detail: `Deleted user ${target.username}`,
  });
  return NextResponse.json({ ok: true, username: target.username });
}
