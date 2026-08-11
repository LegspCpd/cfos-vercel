import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/gitlab/status — list the GitLab accounts the current user has connected.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const conns = await prisma.gitlabConnection.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, gitlabUsername: true, updatedAt: true },
  });

  return NextResponse.json({
    connected: conns.length > 0,
    accounts: conns.map((c) => ({ id: c.id, username: c.gitlabUsername, updatedAt: c.updatedAt })),
  });
}
