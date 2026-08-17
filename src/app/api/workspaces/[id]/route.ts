import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { signPreviewUrl } from '@/lib/preview-url';
import { getFormat, seedFilesForFormat, resolveWorkspaceOutput } from '@/lib/formats';
import { workspaceAccess } from '@/lib/collaboration';
import { invalidateCache } from '@/lib/kv-cache';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

async function canEditWorkspace(userId: string): Promise<boolean> {
  return userHasPermission(userId, PERMISSIONS.workspace);
}

type Ctx = { params: { id: string } };

// GET /api/workspaces/:id — full workspace with files.
// The owner, or any collaborator (read or write), can fetch the workspace.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { files: { orderBy: { path: 'asc' } } },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await workspaceAccess(session.userId, params.id);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The caller is the owner or a collaborator (verified above), so mint a signed
  // preview URL for the iframe.
  const output = await resolveWorkspaceOutput(workspace.formatId);
  return NextResponse.json({ workspace, previewUrl: signPreviewUrl(params.id), output, access });
}

// PATCH /api/workspaces/:id — rename, or switch the output format.
// Body: { title?: string } | { formatId?: string | null }
// Switching formats seeds the format's template files into the workspace (existing
// files are kept; the format's files are added/updated), and records the switch in
// the audit log so the format history is preserved.
// The owner, or a write collaborator, may rename; only the owner may switch formats.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await canEditWorkspace(session.userId))) {
    return NextResponse.json({ error: 'You do not have permission to edit workspaces.' }, { status: 403 });
  }
  const body = await req.json();

  const access = await workspaceAccess(session.userId, params.id);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { files: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rename path — owner or write collaborator.
  if (typeof body?.title === 'string') {
    if (access === 'read') {
      return NextResponse.json({ error: 'You do not have permission to edit this workspace.' }, { status: 403 });
    }
    await prisma.workspace.update({
      where: { id: params.id },
      data: { title: body.title },
    });
    // Drop the cached workspace list so the rename shows up immediately.
    await invalidateCache('workspaces', session.userId).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Format switch path — owner only (a collaborator shouldn't reshape the workspace).
  if ('formatId' in body) {
    if (access !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can switch the output format.' }, { status: 403 });
    }
    const formatId: string | null = body.formatId ?? null;
    if (formatId !== null) {
      const format = await getFormat(formatId);
      if (!format || !format.enabled) {
        return NextResponse.json({ error: 'Format not found or disabled' }, { status: 400 });
      }
      // Seed the format's template files: add missing paths, update existing ones,
      // keep everything else. A file that still matches the *previous* format's
      // template (i.e. the user hasn't edited it) adopts the new format's template
      // content; a file the user has edited is preserved as-is.
      const prevFormat = workspace.formatId ? await getFormat(workspace.formatId) : null;
      const prevSeed = new Map(
        (prevFormat ? seedFilesForFormat(prevFormat) : []).map((f) => [f.path, f.content]),
      );
      const seedFiles = seedFilesForFormat(format);
      const existingPaths = new Set(workspace.files.map((f) => f.path));
      const toCreate = seedFiles.filter((f) => !existingPaths.has(f.path));
      const toUpdate = seedFiles.filter((f) => existingPaths.has(f.path));
      await prisma.$transaction([
        ...toCreate.map((f) =>
          prisma.workspaceFile.create({
            data: { workspaceId: params.id, path: f.path, content: f.content, isEntry: f.isEntry },
          }),
        ),
        ...toUpdate.map((f) => {
          const existing = workspace.files.find((wf) => wf.path === f.path);
          const untouched = !!existing && prevSeed.get(f.path) === existing.content;
          return prisma.workspaceFile.updateMany({
            where: { workspaceId: params.id, path: f.path },
            data: untouched ? { content: f.content, isEntry: f.isEntry } : { isEntry: f.isEntry },
          });
        }),
        prisma.workspace.update({ where: { id: params.id }, data: { formatId } }),
      ]);
      await writeAudit({
        userId: session.userId,
        username: session.username,
        action: 'workspace.format_switch',
        targetId: params.id,
        detail: `Switched workspace "${workspace.title}" to format ${formatId}`,
      });
      return NextResponse.json({ ok: true, formatId });
    }
    // Clearing the format.
    await prisma.workspace.update({ where: { id: params.id }, data: { formatId: null } });
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'workspace.format_switch',
      targetId: params.id,
      detail: `Cleared format on workspace "${workspace.title}"`,
    });
    return NextResponse.json({ ok: true, formatId: null });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

// DELETE /api/workspaces/:id — owner only.
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await canEditWorkspace(session.userId))) {
    return NextResponse.json({ error: 'You do not have permission to delete workspaces.' }, { status: 403 });
  }
  // Cap workspace deletions per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
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
  // Drop the cached workspace list so the deleted workspace disappears immediately.
  await invalidateCache('workspaces', session.userId).catch(() => {});
  return NextResponse.json({ ok: true });
}
