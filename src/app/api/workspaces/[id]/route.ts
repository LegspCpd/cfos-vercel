import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/workspaces/:id — full workspace with files.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    include: { files: { orderBy: { path: 'asc' } } },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ workspace });
}

// PATCH /api/workspaces/:id — rename.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { title } = await req.json();
  const workspace = await prisma.workspace.updateMany({
    where: { id: params.id, ownerId: session.userId },
    data: { title: String(title ?? '') },
  });
  if (workspace.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/workspaces/:id
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const target = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { title: true },
  });
  await prisma.workspace.deleteMany({ where: { id: params.id, ownerId: session.userId } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.delete',
    targetId: params.id,
    detail: `Deleted workspace "${target?.title ?? params.id}"`,
  });
  return NextResponse.json({ ok: true });
}
