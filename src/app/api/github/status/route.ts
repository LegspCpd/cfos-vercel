import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/github/status — list the GitHub accounts the current user has connected.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const conns = await prisma.gitHubConnection.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, githubLogin: true, writeAccess: true, updatedAt: true },
  });

  return NextResponse.json({
    connected: conns.length > 0,
    // Backward-compatible single-account fields (first/most-recent) + full list.
    githubLogin: conns[0]?.githubLogin ?? null,
    updatedAt: conns[0]?.updatedAt?.toISOString() ?? null,
    writeAccess: conns[0]?.writeAccess ?? 'readonly', // Gatekeeper capability
    accounts: conns.map((c) => ({ id: c.id, login: c.githubLogin, writeAccess: c.writeAccess, updatedAt: c.updatedAt })),
  });
}
