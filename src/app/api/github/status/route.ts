import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/github/status — is the current user connected to GitHub?
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const conn = await prisma.gitHubConnection.findUnique({
    where: { userId: session.userId },
    select: { githubLogin: true, updatedAt: true },
  });

  return NextResponse.json({
    connected: Boolean(conn),
    githubLogin: conn?.githubLogin ?? null,
    updatedAt: conn?.updatedAt ?? null,
  });
}
