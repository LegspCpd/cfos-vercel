import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugifyProject } from '@/lib/cf-pages';
import { runDeploy } from '@/lib/deploy-run';
import { writeAudit } from '@/lib/audit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// POST /api/deploy — deploy a workspace to Cloudflare Pages and (optionally) mint a
// short link. Body: { workspaceId, buildCommand?, installCommand?, outputDir?, envJson? }.
// Returns once the (synchronous) deploy finishes. Prefer /api/deploy/stream on the
// standalone deploy page for real-time logs; this non-streaming route is kept for
// backward compatibility and simple programmatic use.
export async function POST(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    workspaceId?: string;
    buildCommand?: string;
    installCommand?: string;
    outputDir?: string;
    envJson?: string;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }
  if (!body.workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: body.workspaceId, ownerId: session.userId },
    include: { files: { select: { path: true, content: true } } },
  });
  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  if (ws.files.length === 0) return NextResponse.json({ error: 'Workspace has no files to deploy' }, { status: 400 });

  // Reuse the workspace's existing Pages project (so redeploys don't pile up new projects),
  // or mint a fresh random name on first deploy — random names are collision-free.
  const prev = await prisma.deployment.findFirst({
    where: { workspaceId: ws.id, status: 'deployed' },
    orderBy: { createdAt: 'desc' },
    select: { pagesProject: true },
  });
  const projectName = prev?.pagesProject || slugifyProject(ws.title, `ws-${ws.id.slice(0, 8)}`);

  const config = {
    buildCommand: body.buildCommand || null,
    installCommand: body.installCommand || null,
    outputDir: body.outputDir || null,
    envJson: body.envJson || null,
  };

  // Record a pending deployment so we can update it below.
  const record = await prisma.deployment.create({
    data: {
      userId: session.userId,
      workspaceId: ws.id,
      pagesProject: projectName,
      status: 'deploying',
      buildCommand: config.buildCommand,
      installCommand: config.installCommand,
      outputDir: config.outputDir,
      envJson: config.envJson,
    },
  });

  try {
    // Static deploy: all workspace files become the Pages output. Skip dotfiles except
    // _redirects / _headers (Pages special files) to avoid uploading junk.
    const files = ws.files
      .filter((f) => !f.path.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'))
      .map((f) => ({ path: f.path, content: Buffer.from(f.content || '') }));

    const log = (line: string) => {
      // Non-streaming path: just keep the tail in memory; /api/deploy/stream persists it.
      void line;
    };
    const { deploymentId, pagesUrl, shortUrl } = await runDeploy(
      { projectName, files, config, makeShortLink: Boolean(process.env.S_LINK) },
      log,
    );

    await prisma.deployment.update({
      where: { id: record.id },
      data: { status: 'deployed', cfDeploymentId: deploymentId, pagesUrl, shortUrl },
    });

    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'deploy.pages',
      detail: `Deployed "${ws.title}" → ${pagesUrl}`,
    });

    return NextResponse.json({ ok: true, deploymentId, pagesUrl, shortUrl, deployment: { id: record.id, project: projectName } });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[deploy] failed:', err);
    const msg = err.message || 'Deploy failed (unknown error)';
    await prisma.deployment
      .update({ where: { id: record.id }, data: { status: 'failed', error: msg } })
      .catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
