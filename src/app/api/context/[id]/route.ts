import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/context/:id — get a document's full content.
// The owner can read any of their docs; anyone (logged in) can read an approved
// public doc from the shared library.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const doc = await prisma.contextDoc.findFirst({
    where: {
      id: params.id,
      OR: [{ ownerId: session.userId }, { visibility: 'public', status: 'approved' }],
    },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ doc });
}

// PATCH /api/context/:id — update title/content/tags, or change visibility.
// Changing a private doc to public submits it for review (status → pending).
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.context))) {
    return NextResponse.json({ error: 'You do not have permission to manage context documents.' }, { status: 403 });
  }
  const body = await req.json();
  const data: {
    title?: string;
    content?: string;
    tags?: string;
    visibility?: string;
    status?: string;
    publishedAt?: Date | null;
  } = {};
  if (typeof body.title === 'string') data.title = body.title;
  if (typeof body.content === 'string') data.content = body.content;
  if (typeof body.tags === 'string') data.tags = body.tags;
  if (body.visibility === 'private' || body.visibility === 'public') {
    data.visibility = body.visibility;
    // Going public re-enters the review queue; going private leaves review entirely.
    data.status = body.visibility === 'public' ? 'pending' : 'draft';
    data.publishedAt = null;
  }

  const updated = await prisma.contextDoc.updateMany({
    where: { id: params.id, ownerId: session.userId },
    data,
  });
  if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const doc = await prisma.contextDoc.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true, title: true, content: true, tags: true, visibility: true, status: true },
  });
  return NextResponse.json({ doc });
}

// DELETE /api/context/:id
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.context))) {
    return NextResponse.json({ error: 'You do not have permission to manage context documents.' }, { status: 403 });
  }
  await prisma.contextDoc.deleteMany({ where: { id: params.id, ownerId: session.userId } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'context.delete',
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
}
