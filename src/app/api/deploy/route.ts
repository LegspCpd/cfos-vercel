import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureProject, deployFiles, slugifyProject } from '@/lib/cf-pages';
import { createShortLink } from '@/lib/short-link';
import { writeAudit } from '@/lib/audit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// POST /api/deploy — deploy a workspace to Cloudflare Pages and (optionally) mint a
// short link. Body: { workspaceId }.
export async function POST(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { workspaceId?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { workspaceId?: string };
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

  const projectName = slugifyProject(ws.title, `ws-${ws.id.slice(0, 8)}`);

  // Record a pending deployment so we can update it below.
  const record = await prisma.deployment.create({
    data: { userId: session.userId, workspaceId: ws.id, pagesProject: projectName, status: 'deploying' },
  });

  try {
    const { name } = await ensureProject(projectName);
    // Static deploy: all workspace files become the Pages output. Skip dotfiles except
    // _redirects / _headers (Pages special files) to avoid uploading junk.
    const files = ws.files
      .filter((f) => !f.path.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'))
      .map((f) => ({ path: f.path, content: Buffer.from(f.content || '') }));

    const { deploymentId } = await deployFiles(name, files);
    const pagesUrl = `https://${name}.pages.dev`;

    // Mint a short link (best-effort — only if S_LINK is configured).
    let shortUrl: string | null = null;
    if (process.env.S_LINK) {
      try {
        shortUrl = await createShortLink(pagesUrl);
      } catch {
        shortUrl = null;
      }
    }

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

    return NextResponse.json({ ok: true, deploymentId, pagesUrl, shortUrl, deployment: { id: record.id, project: name } });
  } catch (e) {
    const msg = (e as Error).message || 'Deploy failed';
    await prisma.deployment
      .update({ where: { id: record.id }, data: { status: 'failed', error: msg } })
      .catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
