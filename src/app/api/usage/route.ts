import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getQuotaInfo } from '@/lib/quota';

// GET /api/usage
// Returns the current user's AI usage snapshot for the usage panel:
// { limit, used, remaining, source, resetAt }.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const info = await getQuotaInfo(session.userId);
  const resetAt = new Date();
  resetAt.setHours(24, 0, 0, 0); // next midnight (local server time)
  return NextResponse.json({ ...info, resetAt: resetAt.toISOString() });
}