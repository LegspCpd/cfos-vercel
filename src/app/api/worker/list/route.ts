import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listWorkers, workerEnabled } from '@/lib/cf-worker';

// GET /api/worker/list — the current user's Worker deployments (newest first), merged with the
// live Workers scripts on the account (so renamed/deleted scripts are reflected).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rows = await prisma.workerDeployment.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Live script set from CF (account-level) — merge to reflect real state.
  let liveNames = new Set<string>();
  try {
    const workers = await listWorkers();
    liveNames = new Set(workers.map((w) => w.name));
  } catch {
    /* fall back to DB snapshot */
  }

  return NextResponse.json({
    workers: rows.map((r) => ({
      id: r.id,
      workerName: r.workerName,
      projectName: r.projectName,
      status: r.status,
      error: r.error,
      log: r.log,
      url: `https://${r.workerName}.${process.env.WORKER_SUBDOMAIN || 'workers.dev'}`,
      live: liveNames.has(r.workerName),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
