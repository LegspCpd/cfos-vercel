import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { serializePermissions, ALL_PERMISSIONS, PermissionCode } from '@/lib/permissions';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!(await isUserAdmin(session.userId))) return null;
  return session;
}

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  permissions: z.array(z.string()).optional(),
  // Group-wide AI daily quota (null = no limit).
  aiDailyLimit: z.number().int().min(0).max(100000).nullable().optional(),
});

// PATCH /api/admin/groups/:id — update group name and/or permissions.
export async function PATCH(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const group = await prisma.userGroup.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (group.name === '__super_admin__' || group.name === '__default__') {
    return NextResponse.json({ error: '内置分组不能修改权限' }, { status: 400 });
  }

  const body = patchSchema.parse(await req.json());
  const data: { name?: string; permissions?: string; aiDailyLimit?: number | null } = {};
  if (body.name) data.name = body.name;
  if (body.permissions) {
    const valid = body.permissions.filter((p) => ALL_PERMISSIONS.some((x) => x.code === p)) as PermissionCode[];
    data.permissions = serializePermissions(valid);
  }
  if (body.aiDailyLimit !== undefined) data.aiDailyLimit = body.aiDailyLimit;

  const updated = await prisma.userGroup.update({ where: { id: params.id }, data });
  await writeAudit({ userId: session.userId, username: session.username, action: 'group.update', targetId: params.id, detail: `Updated group ${updated.name}` });
  return NextResponse.json({ group: updated });
}

// DELETE /api/admin/groups/:id — delete a group (its users become group-less; they'll
// fall back to default group on next sync).
export async function DELETE(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const group = await prisma.userGroup.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (group.name === '__super_admin__' || group.name === '__default__') {
    return NextResponse.json({ error: '内置分组不能删除' }, { status: 400 });
  }

  await prisma.user.updateMany({ where: { groupId: params.id }, data: { groupId: null } });
  await prisma.userGroup.delete({ where: { id: params.id } });
  await writeAudit({ userId: session.userId, username: session.username, action: 'group.delete', targetId: params.id, detail: `Deleted group ${group.name}` });
  return NextResponse.json({ ok: true });
}
