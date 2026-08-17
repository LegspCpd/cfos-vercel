import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createTail, workerEnabled } from '@/lib/cf-worker';
import { workerConfigLimiter } from '@/lib/rate-limit';

// POST /api/worker/:id/tail — open a realtime log tail session for the user's Worker.
// Returns { id, url } where url is a wss:// endpoint the browser connects to directly.
// The tail token stays server-side; the URL is short-lived and scoped to this worker.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!workerEnabled()) return NextResponse.json({ error: 'Workers integration is disabled' }, { status: 400 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many tail sessions. Please wait a minute.' }, { status: 429 });
  }

  const tail = await createTail(rec.workerName);
  if (!tail) {
    return NextResponse.json(
      { error: 'Could not start a tail session. The API token needs the "Workers Tail: Read" permission.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ id: tail.id, url: tail.url });
}