import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bindCustomDomain } from '@/lib/cf-pages';
import { writeAudit } from '@/lib/audit';
import { invalidateCache } from '@/lib/kv-cache';
import { workerConfigLimiter } from '@/lib/rate-limit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/deploy/:id/domain — bind a custom domain to the deployment's Pages project.
// Body: { domain: "app.example.com" }.
export async function POST(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Cap domain binds per user (each hits the Cloudflare API).
  if (workerConfigLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const rec = await prisma.deployment.findFirst({ where: { id: params.id, userId: session.userId } });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { domain?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { domain?: string };
  } catch {
    body = {};
  }
  const domain = (body.domain || '').trim().toLowerCase();
  // Loose domain validation: letters, digits, dots, hyphens.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
  }

  try {
    await bindCustomDomain(rec.pagesProject, domain);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Bind failed' }, { status: 502 });
  }

  await prisma.deployment.update({ where: { id: rec.id }, data: { customDomain: domain } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'deploy.bind_domain',
    detail: `Bound ${domain} → ${rec.pagesProject}`,
  });
  // Drop the cached CF project list so the newly bound domain appears in the project list
  // immediately (the list reads `customDomains` from the cached CF state).
  await invalidateCache('pages', 'projects');

  return NextResponse.json({ ok: true, customDomain: domain });
}
