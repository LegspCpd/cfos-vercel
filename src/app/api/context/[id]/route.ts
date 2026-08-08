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

// GET /api/context/:id — get a document's full content.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const doc = await prisma.contextDoc.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ doc });
}

// PATCH /api/context/:id — update title/content/tags.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json();
  const data: { title?: string; content?: string; tags?: string } = {};
  if (typeof body.title === 'string') data.title = body.title;
  if (typeof body.content === 'string') data.content = body.content;
  if (typeof body.tags === 'string') data.tags = body.tags;

  const updated = await prisma.contextDoc.updateMany({
    where: { id: params.id, ownerId: session.userId },
    data,
  });
  if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/context/:id
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await prisma.contextDoc.deleteMany({ where: { id: params.id, ownerId: session.userId } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'context.delete',
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
}
