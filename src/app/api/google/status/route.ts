import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/google/status — is the current user connected to Google?
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const conn = await prisma.googleConnection.findUnique({
    where: { userId: session.userId },
    select: { googleEmail: true, updatedAt: true },
  });
  return NextResponse.json({
    connected: Boolean(conn),
    googleEmail: conn?.googleEmail ?? null,
    updatedAt: conn?.updatedAt ?? null,
  });
}
