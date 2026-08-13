import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteWorker } from '@/lib/cf-worker';
import { writeAudit } from '@/lib/audit';

// DELETE /api/worker/:id — remove the user's Worker deployment (ownership-checked). Also tries
// to delete the Cloudflare Workers script (best-effort).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort delete the CF script, then the DB row.
  await deleteWorker(rec.workerName);
  await prisma.workerDeployment.delete({ where: { id: rec.id } });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.delete',
    detail: `Deleted worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
