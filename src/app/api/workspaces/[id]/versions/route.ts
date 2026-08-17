import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/workspaces/:id/versions?path=... — list file versions for a given path.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  // SECURITY (IDOR): only the workspace owner may read file-version history. Without this
  // owner check, any logged-in user could enumerate other users' private workspace file
  // contents by guessing a workspace id.
  const owned = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const file = await prisma.workspaceFile.findUnique({
    where: { workspaceId_path: { workspaceId: params.id, path } },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ versions: [] });

  const versions = await prisma.workspaceFileVersion.findMany({
    where: { fileId: file.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ versions });
}

// POST /api/workspaces/:id/versions — restore a file to a previous version.
// Body: { path: string, versionId: string }
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Cap version restores per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const { path, versionId } = await req.json();
  if (!path || !versionId) {
    return NextResponse.json({ error: 'path and versionId required' }, { status: 400 });
  }

  const owned = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const version = await prisma.workspaceFileVersion.findUnique({
    where: { id: versionId },
    include: { file: true },
  });
  if (!version || version.file.workspaceId !== params.id) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Snapshot the current content before overwriting (keeps the full history chain).
  const current = await prisma.workspaceFile.findUnique({
    where: { workspaceId_path: { workspaceId: params.id, path } },
  });
  if (current) {
    await prisma.workspaceFileVersion.create({
      data: { fileId: current.id, content: current.content },
    });
  }

  await prisma.workspaceFile.update({
    where: { workspaceId_path: { workspaceId: params.id, path } },
    data: { content: version.content },
  });
  await prisma.workspace.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'file.restore',
    targetId: params.id,
    detail: `Restored "${path}" from an earlier version`,
  });

  return NextResponse.json({ ok: true });
}
