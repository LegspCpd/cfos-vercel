import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';

// GET /api/admin/tickets — list all support tickets (admin only). Supports ?status=
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await isUserAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;

  const tickets = await prisma.ticket.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      ip: true,
      status: true,
      reply: true,
      handledBy: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { username: true, displayName: true, email: true } },
    },
  });
  return NextResponse.json({ tickets });
}
