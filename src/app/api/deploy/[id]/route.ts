import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/deploy/:id — fetch a single deployment owned by the current user, with the
// workspace title. Used by the deployment detail page (/workspace/deploy/[id]).
export async function GET(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rec = await prisma.deployment.findFirst({
    where: { id: params.id, userId: session.userId },
    include: { workspace: { select: { id: true, title: true } } },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    deployment: {
      id: rec.id,
      workspaceId: rec.workspaceId,
      workspaceTitle: rec.workspace?.title ?? null,
      pagesProject: rec.pagesProject,
      cfDeploymentId: rec.cfDeploymentId,
      status: rec.status,
      pagesUrl: rec.pagesUrl,
      shortUrl: rec.shortUrl,
      customDomain: rec.customDomain,
      error: rec.error,
      log: rec.log,
      buildCommand: rec.buildCommand,
      installCommand: rec.installCommand,
      outputDir: rec.outputDir,
      envJson: rec.envJson,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
    },
  });
}
