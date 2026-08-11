import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listPagesProjects } from '@/lib/cf-pages';
import { cachedJson } from '@/lib/kv-cache';

// GET /api/deploy/list — list the current user's deployments (newest first).
//
// Each deployment is merged with the LIVE Cloudflare Pages state (real subdomain and the
// currently bound custom domains) fetched via PAGES_KEY, so the list reflects what's
// actually deployed on the account even if the saved snapshot is stale. CF fetch is
// best-effort: if it fails (e.g. no PAGES_KEY), the DB snapshot is used as-is.
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

  // Live CF map: projectName -> { subdomain, domains }. Guarded so a CF/network failure or a
  // missing PAGES_KEY never takes down the whole list. The CF project list is account-scoped
  // (not per-user), so it's cached in KV for a few seconds — repeat loads are instant instead
  // of re-enumerating every Pages project on the account each time.
  let live = new Map<string, { subdomain: string | null; domains: string[] }>();
  try {
    const projects = await cachedJson(
      'pages',
      'projects',
      () => listPagesProjects(),
      { ttlSeconds: Number(process.env.KV_PAGES_PROJECTS_TTL) || 15 },
    );
    live = new Map(projects.map((p) => [p.name, { subdomain: p.subdomain, domains: p.domains }]));
  } catch {
    /* fall back to DB snapshot */
  }

  return NextResponse.json({
    deployments: rows.map((r) => {
      const liveProj = live.get(r.pagesProject);
      return {
        id: r.id,
        workspaceId: r.workspaceId,
        workspaceTitle: r.workspace?.title ?? '',
        pagesProject: r.pagesProject,
        projectName: r.projectName,
        status: r.status,
        // Prefer the live subdomain; fall back to the saved pagesUrl (already subdomain-based).
        pagesUrl: liveProj?.subdomain ? `https://${liveProj.subdomain}.pages.dev` : r.pagesUrl,
        // Live bound domains (custom domains added in CF or here), else the saved one.
        customDomains: liveProj?.domains ?? (r.customDomain ? [r.customDomain] : []),
        customDomain: r.customDomain,
        shortUrl: r.shortUrl,
        error: r.error,
        log: r.log,
        buildCommand: r.buildCommand,
        installCommand: r.installCommand,
        outputDir: r.outputDir,
        envJson: r.envJson,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}
