import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { chatLimiter } from '@/lib/rate-limit';

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

  // Cap chat messages per user to stop chat-spam / LLM cost abuse.
  if (chatLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const chat = await prisma.chat.findFirst({
    where: { id: params.chatId, workspaceId: params.id, userId: session.userId },
  });
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { role, content } = await req.json();
  // Restrict role to user/assistant so a client can't inject a `system` message that
  // could later act as a prompt-injection if chat is wired into the LLM.
  const safeRole = String(role ?? 'user') === 'assistant' ? 'assistant' : 'user';
  const safeContent = String(content ?? '').slice(0, 200_000);
  const msg = await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      role: safeRole,
      content: safeContent,
    },
  });
  await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ message: msg }, { status: 201 });
}
