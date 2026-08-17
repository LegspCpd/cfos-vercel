import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWorkerCode, workerEnabled } from '@/lib/cf-worker';

// GET /api/worker/:id/code — the live deployed JS source of the user's Worker
// (ownership-checked). Falls back to the last-deployed code stored in the DB when the
// CF fetch fails (script deleted / not configured).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true, code: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let code: string | null = null;
  if (workerEnabled()) {
    code = await getWorkerCode(rec.workerName);
  }
  // Fall back to the DB snapshot when the live fetch fails.
  return NextResponse.json({ code: code ?? rec.code ?? '' });
}