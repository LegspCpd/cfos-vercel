import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { AuditRow } from '@/lib/audit';

// GET /api/activity?limit=50&offset=0&action=...
// Returns the CURRENT user's own audit log (their own actions across the app). Unlike
// /api/admin/audit (which is admin-only and returns everyone's logs), this is the user-visible
// activity feed shown on the /activity page. Optional action filter narrows to a specific kind
// (e.g. "workspace.create", "pages.deploy").
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const where: Record<string, unknown> = { userId: session.userId };
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        userId: true,
        username: true,
        action: true,
        targetId: true,
        detail: true,
        ip: true,
        tokens: true,
        createdAt: true,
      },
    }) as Promise<AuditRow[]>,
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
