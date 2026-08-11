import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { isSafeFilePath } from '@/lib/path';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// PUT /api/workspaces/:id/files — save a batch of file contents.
// Body: { files: [{ path, content, isEntry? }] }
export async function PUT(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to edit workspaces.' }, { status: 403 });
  }

  // Ownership check
  const owned = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { files } = await req.json();
  if (!Array.isArray(files)) {
    return NextResponse.json({ error: 'files must be an array' }, { status: 400 });
  }
  // Hard caps so a malicious/oversized request can't blow up memory or DB history.
  const MAX_FILES = 200;
  const MAX_FILE_CONTENT = 2 * 1024 * 1024; // 2 MB per file
  const MAX_TOTAL_CONTENT = 20 * 1024 * 1024; // 20 MB per request
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
  }
  let total = 0;
  for (const f of files) {
    const content = String(f?.content ?? '');
    if (content.length > MAX_FILE_CONTENT) {
      return NextResponse.json({ error: 'File too large (max 2 MB per file)' }, { status: 400 });
    }
    total += content.length;
    if (total > MAX_TOTAL_CONTENT) {
      return NextResponse.json({ error: 'Total content too large (max 20 MB)' }, { status: 400 });
    }
    const path = String(f?.path ?? '').trim();
    if (!isSafeFilePath(path)) {
      return NextResponse.json({ error: `Invalid file path: ${path}` }, { status: 400 });
    }
  }

  // Snapshot the previous content of any file that is being changed, so it can be
  // restored later (per-file history / undo).
  const existing = await prisma.workspaceFile.findMany({
    where: { workspaceId: params.id },
    select: { id: true, path: true, content: true },
  });
  const existingByPath = new Map(existing.map((f) => [f.path, f]));
  const snapshotOps = files
    .map((f: { path?: string; content?: string }) => {
      const path = String(f.path ?? '').trim();
      if (!path) return null;
      const prior = existingByPath.get(path);
      const newContent = String(f.content ?? '');
      if (prior && prior.content !== newContent) {
        return prisma.workspaceFileVersion.create({
          data: { fileId: prior.id, content: prior.content },
        });
      }
      return null;
    })
    .filter(Boolean);
  await Promise.all(snapshotOps);

  const upserts = files.map((f: { path?: string; content?: string; isEntry?: boolean }) => {
    const path = String(f.path ?? '').trim();
    if (!path) return null;
    return prisma.workspaceFile.upsert({
      where: { workspaceId_path: { workspaceId: params.id, path } },
      update: { content: String(f.content ?? '') },
      create: {
        workspaceId: params.id,
        path,
        content: String(f.content ?? ''),
        isEntry: Boolean(f.isEntry) || path === 'index.html',
      },
    });
  });

  await Promise.all(upserts.filter(Boolean));

  // If an entry file was set, clear isEntry on others.
  const entry = files.find((f) => f.isEntry)?.path;
  if (entry) {
    await prisma.workspaceFile.updateMany({
      where: { workspaceId: params.id, path: { not: entry } },
      data: { isEntry: false },
    });
  }

  await prisma.workspace.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}

// DELETE /api/workspaces/:id/files?path=...
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to edit workspaces.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });
  const owned = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isSafeFilePath(path)) return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  await prisma.workspaceFile.deleteMany({ where: { workspaceId: params.id, path } });
  return NextResponse.json({ ok: true });
}
