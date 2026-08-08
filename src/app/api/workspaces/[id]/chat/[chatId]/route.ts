import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string; chatId: string } };

// POST /api/workspaces/:id/chat/:chatId — append a message (for a future streaming agent chat).
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const chat = await prisma.chat.findFirst({
    where: { id: params.chatId, workspaceId: params.id, userId: session.userId },
  });
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { role, content } = await req.json();
  const msg = await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      role: String(role ?? 'user'),
      content: String(content ?? ''),
    },
  });
  await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ message: msg }, { status: 201 });
}
