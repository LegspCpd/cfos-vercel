import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { chatLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/workspaces/:id/chat — list chats for this workspace.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const chats = await prisma.chat.findMany({
    where: { workspaceId: params.id, userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json({ chats });
}

// POST /api/workspaces/:id/chat — create a new chat thread for the workspace.
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to use workspaces.' }, { status: 403 });
  }
  // Cap chat creation per user to stop chat-spam / LLM cost abuse.
  if (chatLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const owned = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const chat = await prisma.chat.create({
    data: { userId: session.userId, workspaceId: params.id, title: 'New chat' },
  });
  return NextResponse.json({ chat }, { status: 201 });
}
