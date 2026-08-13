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
    select: { id: true, pagesProject: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the DB record FIRST and return immediately — the remote CF deletion and cache
  // invalidation are slow (they hit Cloudflare / every KV store), so they run in the
  // background. The user shouldn't have to wait on them to delete their next project.
  await prisma.deployment.delete({ where: { id: rec.id } });

  // Fire-and-forget the slow parts so the response returns in one round-trip.
  void (async () => {
    try {
      if (rec.pagesProject) {
        // Best-effort delete the remote Pages project; failure leaves the remote project
        // lingering but the DB deletion above is authoritative for this app.
        await deletePagesProject(rec.pagesProject);
      }
    } catch {
      // ignore
    }
    // Drop the cached CF project list so the deleted project disappears on the next load.
    await invalidateCache('pages', 'projects').catch(() => {});
  })();

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'pages.delete',
    detail: `Deleted Pages project "${rec.pagesProject}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// PATCH /api/deploy/:id — update the deployment's build config / env vars (ownership-checked).
// Env vars take effect on the NEXT redeploy (they're injected into files at deploy time), so
// the detail page offers "save & redeploy" to push the change live. Only valid JSON env is
// accepted; build command fields are length-bounded to keep the DB clean.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rec = await prisma.deployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { envJson?: string; buildCommand?: string; installCommand?: string; outputDir?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const data: {
    envJson?: string | null;
    buildCommand?: string | null;
    installCommand?: string | null;
    outputDir?: string | null;
  } = {};

  if (typeof body.envJson === 'string') {
    const env = body.envJson.trim();
    if (env) {
      try {
        const parsed = JSON.parse(env);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return NextResponse.json({ error: 'envJson must be a JSON object' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'envJson is not valid JSON' }, { status: 400 });
      }
    }
    data.envJson = env || null;
  }
  if (typeof body.buildCommand === 'string') data.buildCommand = body.buildCommand.slice(0, 500) || null;
  if (typeof body.installCommand === 'string') data.installCommand = body.installCommand.slice(0, 500) || null;
  if (typeof body.outputDir === 'string') data.outputDir = body.outputDir.slice(0, 500) || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  await prisma.deployment.update({ where: { id: rec.id }, data });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'deploy.update_config',
    detail: `Updated build config / env for deployment ${rec.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
