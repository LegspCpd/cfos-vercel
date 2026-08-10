import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/workspaces/:id/share — create (or reuse) a public share token for the workspace.
// Returns { token, url } where url points to the public read-only blueprint page.
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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

  const origin = req.headers.get('origin') || process.env.PUBLIC_SITE_URL || '';
  const url = `${origin}/blueprint/${token}`;
  return NextResponse.json({ token, url });
}
