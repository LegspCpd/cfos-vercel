import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWorkerAnalytics, workerEnabled } from '@/lib/cf-worker';

// GET /api/worker/:id/analytics?since=ISO&until=ISO — request/error/cpu metrics for the
// user's Worker over a time window (defaults to the last 24h).
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
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

  if (!workerEnabled()) return NextResponse.json({ requests: 0, errors: 0, cpuMs: 0, buckets: [] });

  const url = new URL(req.url);
  const since = url.searchParams.get('since') || undefined;
  const until = url.searchParams.get('until') || undefined;

  // Validate ISO timestamps to avoid passing garbage to the GraphQL query.
  if (since && Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 });
  }
  if (until && Number.isNaN(Date.parse(until))) {
    return NextResponse.json({ error: 'Invalid until timestamp' }, { status: 400 });
  }

  // Default to the last 24h when no window is given.
  const sinceIso = since ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  const untilIso = until ?? new Date().toISOString();

  const analytics = await getWorkerAnalytics(rec.workerName, sinceIso, untilIso);
  return NextResponse.json(analytics);
}