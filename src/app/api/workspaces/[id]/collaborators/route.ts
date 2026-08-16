import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { isCollabRole, listWorkspaceCollaborators } from '@/lib/collaboration';
import { notify } from '@/lib/notifications';
import { siteUrl } from '@/lib/site';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/workspaces/:id/collaborators — list who the workspace is shared with (owner only).
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const collaborators = await listWorkspaceCollaborators(params.id);
  return NextResponse.json({ collaborators });
}

// POST /api/workspaces/:id/collaborators — add a collaborator by username.
// Body: { username: string, role: "read" | "write" }
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.fileshare))) {
    return NextResponse.json({ error: 'You do not have permission to share workspaces.' }, { status: 403 });
  }
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true, title: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const role = isCollabRole(body?.role) ? body.role : 'read';
  if (!username) return NextResponse.json({ error: 'Username is required' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.id === session.userId) {
    return NextResponse.json({ error: 'You cannot add yourself as a collaborator' }, { status: 400 });
  }

  const existing = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: target.id } },
  });
  if (existing) {
    await prisma.workspaceCollaborator.update({
      where: { id: existing.id },
      data: { role },
    });
  } else {
    await prisma.workspaceCollaborator.create({
      data: { workspaceId: params.id, userId: target.id, role },
    });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.collab_add',
    targetId: params.id,
    detail: `Added ${username} as ${role} collaborator on "${workspace.title}"`,
  });

  await notify({
    userId: target.id,
    type: 'collab.added',
    title: '你被添加为协作者',
    body: `${session.username} 将你添加为工作区《${workspace.title}》的${role === 'write' ? '可编辑' : '只读'}协作者。`,
    href: `/workspace/${params.id}`,
  });

  const collaborators = await listWorkspaceCollaborators(params.id);
  return NextResponse.json({ collaborators });
}

// PATCH /api/workspaces/:id/collaborators — change a collaborator's role.
// Body: { userId: string, role: "read" | "write" }
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const role = isCollabRole(body?.role) ? body.role : 'read';
  const updated = await prisma.workspaceCollaborator.updateMany({
    where: { workspaceId: params.id, userId: body?.userId },
    data: { role },
  });
  if (updated.count === 0) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });

  const collaborators = await listWorkspaceCollaborators(params.id);
  return NextResponse.json({ collaborators });
}

// DELETE /api/workspaces/:id/collaborators — remove a collaborator.
// Body: { userId: string }
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true, title: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const removed = await prisma.workspaceCollaborator.deleteMany({
    where: { workspaceId: params.id, userId: body?.userId },
  });
  if (removed.count === 0) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.collab_remove',
    targetId: params.id,
    detail: `Removed collaborator from "${workspace.title}"`,
  });

  if (typeof body?.userId === 'string') {
    await notify({
      userId: body.userId,
      type: 'collab.removed',
      title: '你已被移出协作者',
      body: `你已不再是工作区《${workspace.title}》的协作者。`,
      href: '/workspaces',
    });
  }

  const collaborators = await listWorkspaceCollaborators(params.id);
  return NextResponse.json({ collaborators });
}