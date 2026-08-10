import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { syncUserGroups } from '@/lib/admin';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!(await isUserAdmin(session.userId))) return null;
  return session;
}

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  isAdmin: z.boolean().optional(),
  newPassword: z.string().min(6).max(128).optional(),
  email: z.string().email().optional().nullable(),
  groupId: z.string().optional().nullable(),
});

// PATCH /api/admin/users/:id — update isAdmin, password, email, and/or group.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = patchSchema.parse(await req.json());
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { username: true, isAdmin: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const data: { isAdmin?: boolean; passwordHash?: string; email?: string | null; groupId?: string | null } = {};

  if (body.isAdmin !== undefined) {
    // Prevent demoting yourself (avoid locking yourself out).
    if (params.id === session.userId && !body.isAdmin) {
      return NextResponse.json({ error: 'You cannot demote yourself.' }, { status: 400 });
    }
    data.isAdmin = body.isAdmin;
  }
  if (body.newPassword) {
    data.passwordHash = await hashPassword(body.newPassword);
  }
  if (body.email !== undefined) {
    const email = body.email ? body.email.toLowerCase() : null;
    if (email) {
      const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: params.id } } });
      if (taken) return NextResponse.json({ error: '该邮箱已被其他用户使用' }, { status: 409 });
    }
    data.email = email;
  }
  if (body.groupId !== undefined) {
    data.groupId = body.groupId;
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  // Re-sync groups so admin/group membership stays consistent.
  await syncUserGroups();
  await writeAudit({ userId: session.userId, username: session.username, action: 'admin.update_user', targetId: params.id, detail: `Updated user ${target.username}` });

  const fresh = await prisma.user.findUnique({ where: { id: params.id }, include: { group: { select: { name: true } } } });
  return NextResponse.json({ ok: true, username: target.username, isAdmin: fresh?.isAdmin, groupId: fresh?.groupId, groupName: fresh?.group?.name });
}

// DELETE /api/admin/users/:id — delete a user (and their data).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (params.id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete yourself.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { username: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } }); // cascades workspaces/files/etc.
  await writeAudit({ userId: session.userId, username: session.username, action: 'admin.delete_user', targetId: params.id, detail: `Deleted user ${target.username}` });
  return NextResponse.json({ ok: true, username: target.username });
}
