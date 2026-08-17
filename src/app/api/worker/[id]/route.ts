import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteWorker, getWorkerScript, workerEnabled } from '@/lib/cf-worker';
import { writeAudit } from '@/lib/audit';
import { workerConfigLimiter } from '@/lib/rate-limit';

// GET /api/worker/:id — the user's Worker deployment detail (ownership-checked), merged with
// the live Cloudflare script metadata (routes, handlers, timestamps) when configured.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Live CF metadata (best-effort; null when not configured or the script was deleted).
  let live = null;
  if (workerEnabled()) {
    live = await getWorkerScript(rec.workerName);
  }

  return NextResponse.json({
    worker: {
      id: rec.id,
      workerName: rec.workerName,
      projectName: rec.projectName,
      status: rec.status,
      error: rec.error,
      log: rec.log,
      code: rec.code,
      url: `https://${rec.workerName}.${process.env.WORKER_SUBDOMAIN || 'workers.dev'}`,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
    },
    live,
  });
}

// DELETE /api/worker/:id — remove the user's Worker deployment (ownership-checked). Also tries
// to delete the Cloudflare Workers script (best-effort).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Cap worker deletions per user.
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the DB record first and return immediately; the remote CF script deletion is slow
  // (up to 30s timeout), so run it in the background. The user shouldn't have to wait on it
  // to delete their next worker.
  await prisma.workerDeployment.delete({ where: { id: rec.id } });

  // Fire-and-forget the remote CF script deletion so the response returns in one round-trip.
  void deleteWorker(rec.workerName).catch(() => {});

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.delete',
    detail: `Deleted worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
