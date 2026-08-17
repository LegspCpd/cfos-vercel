import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listWorkerVersions, workerEnabled } from '@/lib/cf-worker';

// GET /api/worker/:id/versions — the deployment version history of the user's Worker
// (ownership-checked). Empty array when not configured or the script is gone.
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

  if (!workerEnabled()) return NextResponse.json({ versions: [] });
  const versions = await listWorkerVersions(rec.workerName);
  // Map the CF field names to the camelCase shape the UI expects.
  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      number: v.number,
      createdOn: v.created_on,
      source: v.source,
      authorEmail: v.author_email,
    })),
  });
}