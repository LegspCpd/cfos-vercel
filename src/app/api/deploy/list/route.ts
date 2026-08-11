import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/deploy/list — list the current user's deployments (newest first).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rows = await prisma.deployment.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { workspace: { select: { id: true, title: true } } },
  });

  return NextResponse.json({
    deployments: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      workspaceTitle: r.workspace?.title ?? '',
      pagesProject: r.pagesProject,
      projectName: r.projectName,
      status: r.status,
      pagesUrl: r.pagesUrl,
      shortUrl: r.shortUrl,
      customDomain: r.customDomain,
      error: r.error,
      log: r.log,
      buildCommand: r.buildCommand,
      installCommand: r.installCommand,
      outputDir: r.outputDir,
      envJson: r.envJson,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
