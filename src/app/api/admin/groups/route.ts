import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { PermissionCode, serializePermissions, ALL_PERMISSIONS } from '@/lib/permissions';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!(await isUserAdmin(session.userId))) return null;
  return session;
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  permissions: z.array(z.string()).optional(),
  isAdminGroup: z.boolean().optional(),
});

// GET /api/admin/groups — list all groups (with member count).
export async function GET(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const groups = await prisma.userGroup.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      permissions: JSON.parse(g.permissions || '[]'),
      isAdminGroup: g.isAdminGroup,
      memberCount: g._count.users,
    })),
  });
}

// POST /api/admin/groups — create a group with a set of permissions.
export async function POST(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = createSchema.parse(await req.json());
  // Validate permission codes against the known set.
  const valid = (body.permissions || []).filter((p) => ALL_PERMISSIONS.some((x) => x.code === p)) as PermissionCode[];

  const existing = await prisma.userGroup.findUnique({ where: { name: body.name } });
  if (existing) return NextResponse.json({ error: '分组名称已存在' }, { status: 409 });

  const group = await prisma.userGroup.create({
    data: {
      name: body.name,
      permissions: serializePermissions(valid),
      isAdminGroup: Boolean(body.isAdminGroup) || valid.some((p) => p === 'admin.access'),
    },
  });

  await writeAudit({ userId: session.userId, username: session.username, action: 'group.create', targetId: group.id, detail: `Created group ${group.name}` });
  return NextResponse.json({ group }, { status: 201 });
}
