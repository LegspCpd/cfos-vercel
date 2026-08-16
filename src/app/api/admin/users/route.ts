import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!(await isUserAdmin(session.userId))) return null;
  return session;
}

// GET /api/admin/users — list all users with their group + permissions.
export async function GET(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      group: { select: { id: true, name: true, permissions: true } },
      _count: { select: { workspaces: true } },
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      isAdmin: u.isAdmin,
      groupId: u.groupId,
      groupName: u.group?.name ?? null,
      groupPermissions: u.group ? JSON.parse(u.group.permissions || '[]') : [],
      aiDailyLimit: u.aiDailyLimit,
      createdAt: u.createdAt,
      workspaces: u._count.workspaces,
    })),
  });
}

const createSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_.-]+$/i),
  displayName: z.string().min(1).max(64),
  password: z.string().min(6).max(128),
  email: z.string().email().optional(),
  groupId: z.string().optional(),
});

// POST /api/admin/users — create a new user with a password and optional group.
export async function POST(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = createSchema.parse(await req.json());
  const username = body.username.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { username } })) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }
  if (body.email && (await prisma.user.findFirst({ where: { email: { equals: body.email.toLowerCase(), mode: 'insensitive' } } }))) {
    return NextResponse.json({ error: '邮箱已被使用' }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      username,
      displayName: body.displayName,
      passwordHash,
      email: body.email?.toLowerCase(),
      groupId: body.groupId || null,
    },
  });

  await writeAudit({ userId: session.userId, username: session.username, action: 'admin.create_user', targetId: user.id, detail: `Created user ${username}` });
  return NextResponse.json({ user: { id: user.id, username } }, { status: 201 });
}
