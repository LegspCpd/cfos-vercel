import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { isCollabRole, listFileShares } from '@/lib/collaboration';
import { notify } from '@/lib/notifications';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/files/:id/shares — list who a file is shared with (owner or write-collab only).
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const file = await prisma.workspaceFile.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { ownerId: true } } },
  });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (file.workspace.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const shares = await listFileShares(params.id);
  return NextResponse.json({ shares });
}

// POST /api/files/:id/shares — share a file with a user.
// Body: { username: string, role: "read" | "write" }
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.fileshare))) {
    return NextResponse.json({ error: 'You do not have permission to share files.' }, { status: 403 });
  }
  const file = await prisma.workspaceFile.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { ownerId: true, title: true } } },
  });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (file.workspace.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const role = isCollabRole(body?.role) ? body.role : 'read';
  if (!username) return NextResponse.json({ error: 'Username is required' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.id === session.userId) {
    return NextResponse.json({ error: 'You cannot share a file with yourself' }, { status: 400 });
  }

  const existing = await prisma.fileShare.findUnique({
    where: { fileId_userId: { fileId: params.id, userId: target.id } },
  });
  if (existing) {
    await prisma.fileShare.update({ where: { id: existing.id }, data: { role } });
  } else {
    await prisma.fileShare.create({
      data: { fileId: params.id, userId: target.id, role },
    });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'file.share_add',
    targetId: params.id,
    detail: `Shared file "${file.path}" with ${username} (${role})`,
  });

  await notify({
    userId: target.id,
    type: 'share.added',
    title: '你获得了一个文件',
    body: `${session.username} 与你分享了文件《${file.path}》（${role === 'write' ? '可编辑' : '只读'}）。`,
    href: `/workspace/${file.workspaceId}`,
  });

  const shares = await listFileShares(params.id);
  return NextResponse.json({ shares });
}

// DELETE /api/files/:id/shares — unshare a file.
// Body: { userId: string }
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const file = await prisma.workspaceFile.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { ownerId: true } } },
  });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (file.workspace.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  await prisma.fileShare.deleteMany({ where: { fileId: params.id, userId: body?.userId } });

  const shares = await listFileShares(params.id);
  return NextResponse.json({ shares });
}