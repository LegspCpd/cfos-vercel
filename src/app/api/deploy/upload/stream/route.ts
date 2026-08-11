import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugifyProject } from '@/lib/cf-pages';
import { runDeploy, sanitizeProjectName } from '@/lib/deploy-run';
import { unzip } from '@/lib/unzip';
import { writeAudit } from '@/lib/audit';
import { invalidateCache } from '@/lib/kv-cache';

// POST /api/deploy/upload/stream — deploy an uploaded ZIP of static files and stream
// real-time build logs over SSE. Body is multipart/form-data with fields:
//   file            : the .zip archive (required)
//   installCommand? : install command text (optional)
//   buildCommand?   : build command text (optional)
//   outputDir?      : output dir text (optional)
//   envJson?        : JSON map of extra env vars (optional)
//
// This is what the deploy page uses when the user chooses "upload a ZIP" instead of a
// workspace. The archive is extracted, filtered for unsafe paths, then fed to the shared
// deploy pipeline, and each log line is streamed to the client as an SSE frame.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return new Response('Not authenticated', { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return new Response('Invalid session', { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('Invalid upload', { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response('No ZIP file provided', { status: 400 });
  }
  const MAX_ZIP = 50 * 1024 * 1024; // 50 MB upload cap
  if (file.size > MAX_ZIP) {
    return new Response('ZIP must be smaller than 50 MB', { status: 400 });
  }
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.zip')) {
    return new Response('Only .zip archives are supported', { status: 400 });
  }

  const config = {
    installCommand: String(form.get('installCommand') || '') || null,
    buildCommand: String(form.get('buildCommand') || '') || null,
    outputDir: String(form.get('outputDir') || '') || null,
    envJson: String(form.get('envJson') || '') || null,
  };
  const userProjectName = sanitizeProjectName(String(form.get('projectName') || ''));

  // Strip control chars/newlines from the client-provided file name before it's interpolated
  // into SSE frames — a crafted name with "\n\n" could otherwise inject fake stream frames.
  const safeName = String(file.name || 'zip').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);

  const buf = Buffer.from(await file.arrayBuffer());

  // Mint a fresh random project name (a bare upload has no workspace to reuse).
  const projectName = slugifyProject('upload', 'upload');

  const record = await prisma.deployment.create({
    data: {
      userId: session.userId,
      workspaceId: null, // bare uploads are not tied to a workspace
      source: 'upload',
      pagesProject: projectName,
      projectName: userProjectName,
      status: 'deploying',
      buildCommand: config.buildCommand,
      installCommand: config.installCommand,
      outputDir: config.outputDir,
      envJson: config.envJson,
    },
  });

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
        logTail = [...logTail, `[zip] reading ${safeName}`];
        send({ type: 'data', text: `[zip] reading ${safeName}` });

        let files;
        try {
          files = unzip(buf);
        } catch (e) {
          throw new Error(`Failed to unzip: ${(e as Error).message}`, { cause: e });
        }
        // Skip dotfiles except Pages special files, mirroring the workspace deploy path.
        files = files.filter(
          (f) =>
            !f.path.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'),
        );
        if (files.length === 0) throw new Error('ZIP contains no files to deploy');
        send({ type: 'data', text: `[zip] extracted ${files.length} file(s)` });
        logTail = [...logTail, `[zip] extracted ${files.length} file(s)`];

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
          action: 'deploy.upload',
          detail: `Deployed uploaded ZIP → ${pagesUrl}`,
        });
        // Drop the cached CF project list so the new deploy shows up immediately.
        await invalidateCache('pages', 'projects');

        send({ type: 'done', ok: true, deploymentId, recordId: record.id, pagesUrl, shortUrl, project: projectName });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[deploy/upload/stream] failed:', err);
        const msg = err.message || 'Deploy failed (unknown error)';
        send({ type: 'data', text: `[error] ${msg}` });
        await prisma.deployment
          .update({ where: { id: record.id }, data: { status: 'failed', error: msg } })
          .catch(() => {});
        await flushLog().catch(() => {});
        send({ type: 'done', ok: false, recordId: record.id, error: msg });
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
