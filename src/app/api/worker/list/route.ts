import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listWorkers, workerEnabled } from '@/lib/cf-worker';
import { cachedJson } from '@/lib/kv-cache';

// GET /api/worker/list — the current user's Worker deployments (newest first), merged with the
// live Workers scripts on the account (so renamed/deleted scripts are reflected).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Feature gate: without WORKER_API_TOKEN/WORKER_ACCOUNT_ID the deploy endpoint refuses
  // anyway, so surface the "not configured" state here too — the UI shows a clear message
  // instead of a misleading empty list.
  const configured = workerEnabled();

  const rows = await prisma.workerDeployment.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Live script set from CF (account-level, not per-user) — merge to reflect real state. It's
  // cached in KV (mirrored to D1) for a short window because it paginates the account's Workers
  // scripts; repeat loads are instant instead of re-enumerating every script each time.
  let liveNames = new Set<string>();
  if (configured) {
    try {
      const workers = await cachedJson('workers', 'scripts', () => listWorkers(), {
        ttlSeconds: Number(process.env.KV_WORKERS_TTL) || 15,
      });
      liveNames = new Set(workers.map((w) => w.name));
    } catch {
      /* fall back to DB snapshot */
    }
  }

  return NextResponse.json({
    configured,
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
