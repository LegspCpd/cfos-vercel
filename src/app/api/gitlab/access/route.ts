import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

// POST /api/gitlab/access — toggle the Gatekeeper write capability for the user's
// most-recently-connected GitLab account. Default 'readonly'.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  let body: { access?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { access?: string };
  } catch {
    body = {};
  }
  const access = body.access;
  if (access !== 'readonly' && access !== 'readwrite') {
    return NextResponse.json({ error: 'access must be readonly or readwrite' }, { status: 400 });
  }

  const conn = await prisma.gitlabConnection.findFirst({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!conn) return NextResponse.json({ error: 'GitLab is not connected' }, { status: 400 });

  const newAccess = await prisma.gitlabConnection
    .update({ where: { id: conn.id }, data: { writeAccess: access } })
    .then((c) => c.writeAccess);

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'gitlab.access_change',
    detail: `Gatekeeper write access set to ${newAccess}`,
  });

  return NextResponse.json({ writeAccess: newAccess });
}
