import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { z } from 'zod';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/context — list my context documents (private + my public submissions).
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const docs = await prisma.contextDoc.findMany({
    where: { ownerId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      tags: true,
      visibility: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ docs });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.string().max(200).optional().default(''),
  // "private" (default) or "public" (submit to the shared library for review).
  visibility: z.enum(['private', 'public']).optional().default('private'),
});

// POST /api/context — create a context document.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.context))) {
    return NextResponse.json({ error: 'You do not have permission to manage context documents.' }, { status: 403 });
  }
  const body = createSchema.parse(await req.json());

  // Public submissions enter the review queue (status "pending") until an admin
  // approves them; private docs are immediately usable by the owner.
  const status = body.visibility === 'public' ? 'pending' : 'draft';

  const doc = await prisma.contextDoc.create({
    data: {
      ownerId: session.userId,
      title: body.title,
      content: body.content,
      tags: body.tags,
      visibility: body.visibility,
      status,
    },
  });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'context.create',
    targetId: doc.id,
    detail: `Added context document "${doc.title}" (${body.visibility})`,
  });

  return NextResponse.json({ doc }, { status: 201 });
}
