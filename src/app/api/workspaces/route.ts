import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { getFormat, seedFilesForFormat, DEFAULT_ENTRY_FILE } from '@/lib/formats';
import { cachedJson, invalidateCache } from '@/lib/kv-cache';
import { z } from 'zod';
import { workspaceCreateLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: 'You do not have permission to create workspaces.' }, { status: 403 });
}

// GET /api/workspaces — list current user's workspaces (owned + shared with them).
// Cached per-user for a few seconds: the shell and command palette call this on every
// mount, and workspace mutations (create/rename/delete) invalidate the cache, so repeat
// loads are instant instead of hitting Postgres twice per page.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await cachedJson(
    'workspaces',
    session.userId,
    async () => {
      const [owned, shared] = await Promise.all([
        prisma.workspace.findMany({
          where: { ownerId: session.userId },
          orderBy: { updatedAt: 'desc' },
          include: { _count: { select: { files: true } } },
        }),
        prisma.workspace.findMany({
          where: { collaborators: { some: { userId: session.userId } } },
          orderBy: { updatedAt: 'desc' },
          include: { _count: { select: { files: true } } },
        }),
      ]);
      // Owned workspaces first, then shared ones (deduped by id).
      const seen = new Set<string>();
      const workspaces = [...owned, ...shared].filter((w) => {
        if (seen.has(w.id)) return false;
        seen.add(w.id);
        return true;
      });
      return { workspaces };
    },
    { ttlSeconds: Number(process.env.KV_WORKSPACES_TTL) || 5 },
  );
  return NextResponse.json(body);
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  // Optional output format id (blueprintId, e.g. "format.document"). When set, the
  // workspace is seeded with the format's template files instead of the default entry.
  formatId: z.string().optional(),
});

// POST /api/workspaces — create a new workspace with a default entry file, or with
// the seed files of an output format when formatId is provided.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return forbidden();
  }

  // Cap workspace creation per user to stop DB churn.
  if (workspaceCreateLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const body = createSchema.parse(await req.json());

  // Resolve the seed files: from the format when formatId is given, else the default entry.
  let formatId: string | null = null;
  let seedFiles: { path: string; content: string; isEntry: boolean }[] = [
    { path: 'index.html', content: DEFAULT_ENTRY_FILE, isEntry: true },
  ];
  if (body.formatId) {
    const format = await getFormat(body.formatId);
    if (!format || !format.enabled) {
      return NextResponse.json({ error: 'Format not found or disabled' }, { status: 400 });
    }
    formatId = format.id;
    seedFiles = seedFilesForFormat(format);
  }

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: session.userId,
      title: body.title,
      formatId,
      files: {
        create: seedFiles.map((f) => ({
          path: f.path,
          content: f.content,
          isEntry: f.isEntry,
        })),
      },
    },
    include: { files: true },
  });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.create',
    targetId: workspace.id,
    detail: `Created workspace "${workspace.title}"${formatId ? ` from format ${formatId}` : ''}`,
  });
  // Drop the cached workspace list so the new workspace shows up immediately.
  await invalidateCache('workspaces', session.userId).catch(() => {});
  return NextResponse.json({ workspace }, { status: 201 });
}
