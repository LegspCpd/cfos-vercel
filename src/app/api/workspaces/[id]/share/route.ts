import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { siteUrl } from '@/lib/site';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

// POST /api/workspaces/:id/share — create (or reuse) a public share token for the workspace.
// Returns { token, url } where url points to the public read-only blueprint page.
export async function POST(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.fileshare))) {
    return NextResponse.json({ error: 'You do not have permission to share blueprints.' }, { status: 403 });
  }

  // Cap share-token creation per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true, shareToken: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token = workspace.shareToken;
  if (!token) {
    token = randomUUID();
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { shareToken: token },
    });
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'workspace.share',
      targetId: workspace.id,
      detail: 'Enabled public blueprint sharing',
    });
  }

  // Build the absolute URL from the trusted PUBLIC_SITE_URL, NEVER from the request's
  // Origin header (an attacker can set Origin to a phishing domain).
  const url = siteUrl(`/blueprint/${token}`);
  return NextResponse.json({ token, url });
}
