import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/workspaces — list current user's workspaces.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: session.userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { files: true } } },
  });
  return NextResponse.json({ workspaces });
}

const createSchema = z.object({ title: z.string().min(1).max(200) });

// POST /api/workspaces — create a new workspace with a default entry file.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = createSchema.parse(await req.json());
  const workspace = await prisma.workspace.create({
    data: {
      ownerId: session.userId,
      title: body.title,
      files: {
        create: {
          path: 'index.html',
          content:
            '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>My App</title>\n</head>\n<body>\n  <h1>Hello from Cloudflare OS (Vercel edition)</h1>\n  <p>Edit this workspace and ask the agent to build something.</p>\n</body>\n</html>\n',
          isEntry: true,
        },
      },
    },
    include: { files: true },
  });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'workspace.create',
    targetId: workspace.id,
    detail: `Created workspace "${workspace.title}"`,
  });
  return NextResponse.json({ workspace }, { status: 201 });
}
