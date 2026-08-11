import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugifyProject } from '@/lib/cf-pages';
import { runDeploy } from '@/lib/deploy-run';
import { writeAudit } from '@/lib/audit';

// POST /api/deploy/stream — deploy a workspace and stream real-time build logs to the
// client over SSE. Body: { workspaceId, buildCommand?, installCommand?, outputDir?,
// envJson? }. Each log line is sent as an SSE `data:` frame { type: "data", text } and a
// final { type: "done" } frame closes the stream.
//
// This is the endpoint the standalone deploy page (/workspace/deploy) uses so users can
// watch the deploy as it happens.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) {
    return new Response('Not authenticated', { status: 401 });
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return new Response('Invalid session', { status: 401 });
  }

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
  if (!body.workspaceId) {
    return new Response('workspaceId is required', { status: 400 });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: body.workspaceId, ownerId: session.userId },
    include: { files: { select: { path: true, content: true } } },
  });
  if (!ws) {
    return new Response('Workspace not found', { status: 404 });
  }
  if (ws.files.length === 0) {
    return new Response('Workspace has no files to deploy', { status: 400 });
  }

  // Reuse the workspace's existing Pages project, or mint a fresh random name on first
  // deploy (three-segment random format — collision-free).
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

  // Record a pending deployment.
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

  // Set up the SSE stream first, then run the deploy, flushing log lines as they come.
  const encoder = new TextEncoder();
  let logTail: string[] = [];
  const flushLog = () =>
    prisma.deployment
      .update({ where: { id: record.id }, data: { log: logTail.join('\n') } })
      .catch(() => {});

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        // Static deploy: workspace files become the Pages output. Skip dotfiles except
        // _redirects / _headers (Pages special files).
        const files = ws.files
          .filter((f) =>
            !f.path.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'),
          )
          .map((f) => ({ path: f.path, content: Buffer.from(f.content || '') }));

        const log = (line: string) => {
          logTail = [...logTail, line].slice(-500);
          send({ type: 'data', text: line });
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

        send({ type: 'done', ok: true, deploymentId, pagesUrl, shortUrl, project: projectName });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[deploy/stream] failed:', err);
        const msg = err.message || 'Deploy failed (unknown error)';
        send({ type: 'data', text: `[error] ${msg}` });
        await prisma.deployment
          .update({ where: { id: record.id }, data: { status: 'failed', error: msg } })
          .catch(() => {});
        await flushLog().catch(() => {});
        send({ type: 'done', ok: false, error: msg });
      } finally {
        await flushLog().catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
