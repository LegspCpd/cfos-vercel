import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { isSafeFilePath } from '@/lib/path';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// POST /api/workspaces/import — create a workspace from an exported blueprint archive.
// Body: { title: string, files: [{ path, content, isEntry? }] }
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to create workspaces.' }, { status: 403 });
  }

  const { title, files } = await req.json();
  if (!title || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'title and files[] required' }, { status: 400 });
  }

  // Sanitize: limit count, per-file size, and total size to avoid abuse; reject unsafe
  // paths (traversal ../, backslashes, control chars).
  if (files.length > 200) {
    return NextResponse.json({ error: 'Too many files' }, { status: 400 });
  }
  const MAX_FILE_CONTENT = 2 * 1024 * 1024;
  let total = 0;
  for (const f of files) {
    const content = String(f?.content ?? '');
    if (content.length > MAX_FILE_CONTENT) {
      return NextResponse.json({ error: 'A file is too large (max 2 MB)' }, { status: 400 });
    }
    total += content.length;
    if (total > 2_000_000) {
      return NextResponse.json({ error: 'Archive too large' }, { status: 400 });
    }
    const path = String(f?.path ?? '').trim();
    if (!isSafeFilePath(path)) {
      return NextResponse.json({ error: `Invalid file path: ${path}` }, { status: 400 });
    }
  }

  const entry = files.find((f) => f.isEntry)?.path || 'index.html';

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: session.userId,
      title: String(title).slice(0, 200),
      files: {
        create: files.map((f, i) => ({
          path: String(f.path).trim(),
          content: String(f.content ?? ''),
          isEntry: i === 0 ? String(f.path).trim() === entry : false,
        })),
      },
    },
    include: { files: true },
  });

  // Ensure only one entry file.
  await prisma.workspaceFile.updateMany({
    where: { workspaceId: workspace.id, path: { not: entry } },
    data: { isEntry: false },
  });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.import',
    targetId: workspace.id,
    detail: `Imported workspace "${workspace.title}" (${files.length} files)`,
  });

  return NextResponse.json({ workspace }, { status: 201 });
}
