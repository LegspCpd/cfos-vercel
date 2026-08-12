import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deletePagesProject, listPagesProjects } from '@/lib/cf-pages';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, cachedJson } from '@/lib/kv-cache';

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

  // Live custom domains from CF (cached, same as list route so the detail page shows the
  // up-to-date set even if the saved DB snapshot is stale).
  let customDomains: string[] = rec.customDomain ? [rec.customDomain] : [];
  try {
    const projects = await cachedJson(
      'pages',
      'projects',
      () => listPagesProjects(),
      { ttlSeconds: Number(process.env.KV_PAGES_PROJECTS_TTL) || 15 },
    );
    const live = projects.find((p) => p.name === rec.pagesProject);
    if (live?.domains) customDomains = live.domains;
  } catch {
    /* keep DB fallback */
  }

  return NextResponse.json({
    deployment: {
      id: rec.id,
      workspaceId: rec.workspaceId,
      workspaceTitle: rec.workspace?.title ?? null,
      pagesProject: rec.pagesProject,
      projectName: rec.projectName,
      source: rec.source,
      repo: rec.repo,
      repoRef: rec.repoRef,
      cfDeploymentId: rec.cfDeploymentId,
      status: rec.status,
      pagesUrl: rec.pagesUrl,
      shortUrl: rec.shortUrl,
      customDomain: rec.customDomain,
      customDomains,
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

// DELETE /api/deploy/:id — delete a deployment owned by the current user. Removes the local
// record and best-effort deletes the Cloudflare Pages project (failure here is non-fatal).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rec = await prisma.deployment.findFirst({
    where: { id: params.id, userId: session.userId },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort delete the remote Pages project; the DB record is removed regardless.
  try {
    if (rec.pagesProject) {
      await deletePagesProject(rec.pagesProject);
    }
  } catch {
    // ignore — remote project may linger; DB deletion is authoritative
  }

  await prisma.deployment.delete({ where: { id: rec.id } });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'pages.delete',
    detail: `Deleted Pages project "${rec.pagesProject}"`,
  }).catch(() => {});
  // Drop the cached CF project list so the deleted project disappears immediately.
  await invalidateCache('pages', 'projects');

  return NextResponse.json({ ok: true });
}
