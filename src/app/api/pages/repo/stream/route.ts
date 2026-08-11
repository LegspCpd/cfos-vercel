import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugifyProject } from '@/lib/cf-pages';
import { runDeploy } from '@/lib/deploy-run';
import { githubRepoFiles, gitlabRepoFiles } from '@/lib/git-fetch';
import { writeAudit } from '@/lib/audit';

// POST /api/pages/repo/stream — deploy a GitHub/GitLab repository and stream real-time
// logs over SSE. Body: { provider: "github"|"gitlab", repo, ref?, buildCommand?,
// installCommand?, outputDir?, envJson? }. The repo's file tree is downloaded and fed to
// the shared deploy pipeline; each log line is streamed as an SSE frame.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return new Response('Not authenticated', { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return new Response('Invalid session', { status: 401 });

  let body: {
    provider?: string;
    repo?: string;
    ref?: string;
    projectName?: string;
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
  const provider = body.provider === 'gitlab' ? 'gitlab' : 'github';
  if (!body.repo) return new Response('repo is required', { status: 400 });

  const config = {
    installCommand: body.installCommand || null,
    buildCommand: body.buildCommand || null,
    outputDir: body.outputDir || null,
    envJson: body.envJson || null,
  };

  // Each new project gets a fresh random three-segment name.
  const projectName = slugifyProject('repo', 'repo');

  const record = await prisma.deployment.create({
    data: {
      userId: session.userId,
      workspaceId: null, // Git deploys aren't tied to a workspace
      pagesProject: projectName,
      projectName: body.projectName?.trim() || null,
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
        const tag = `[${provider}]`;
        send({ type: 'data', text: `${tag} fetching ${body.repo}${body.ref ? `@${body.ref}` : ''}` });
        logTail = [...logTail, `${tag} fetching ${body.repo}`];

        const files =
          provider === 'gitlab'
            ? await gitlabRepoFiles(session.userId, body.repo!, body.ref)
            : await githubRepoFiles(session.userId, body.repo!, body.ref);

        if (files.length === 0) throw new Error('Repository has no files to deploy');
        send({ type: 'data', text: `${tag} downloaded ${files.length} file(s)` });
        logTail = [...logTail, `${tag} downloaded ${files.length} file(s)`];

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
          action: 'deploy.repo',
          detail: `Deployed ${provider}:${body.repo} → ${pagesUrl}`,
        });

        send({ type: 'done', ok: true, deploymentId, recordId: record.id, pagesUrl, shortUrl, project: projectName });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[pages/repo/stream] failed:', err);
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
