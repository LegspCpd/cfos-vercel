import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDeploymentStatus } from '@/lib/cf-pages';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/deploy/:id/status — immediately re-check a deployment's status on the
// Cloudflare side and return the latest detail. Requires ownership of the deployment.
export async function GET(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rec = await prisma.deployment.findFirst({
    where: { id: params.id, userId: session.userId },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let cfStatus: { stage: string; status: string; url: string } | null = null;
  let error: string | null = null;
  if (rec.cfDeploymentId) {
    try {
      cfStatus = await getDeploymentStatus(rec.pagesProject, rec.cfDeploymentId);
    } catch (e) {
      error = (e as Error).message || 'Status check failed';
    }
  }

  // Reflect the CF status into the record.
  if (cfStatus) {
    const status = cfStatus.status === 'success' || cfStatus.status === 'active' ? 'deployed' : cfStatus.status;
    if (status !== rec.status) {
      await prisma.deployment
        .update({ where: { id: rec.id }, data: { status, error: status === 'failed' ? cfStatus.status : null } })
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, status: rec.status, error, cfStatus });
}
