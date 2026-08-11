import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { multiDbEnabled, coldShards } from '@/lib/db-secondary';
import type { AuditRow } from '@/lib/audit';

// GET /api/admin/audit?action=...&user=...&limit=50&offset=0
// Returns the audit log (admin only), with optional filtering.
// Merges rows from the primary + all configured secondary cold DBs so nothing is
// hidden regardless of where a row was written.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || undefined;
  const user = url.searchParams.get('user') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (user) where.username = { contains: user, mode: 'insensitive' };
  const base = {
    where,
    orderBy: { createdAt: 'desc' as const },
    take: limit + offset,
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
    } as const,
  };

  // Query each source independently (distinct Prisma clients) and merge.
  const merged: AuditRow[] = [];
  merged.push(...((await prisma.auditLog.findMany(base)) as AuditRow[]));
  let total = await prisma.auditLog.count({ where });
  if (multiDbEnabled()) {
    for (const shard of coldShards()) {
      const rows = await shard.auditLog.findMany(base).catch(() => [] as unknown[]);
      merged.push(...(rows as AuditRow[]));
      total += await shard.auditLog.count({ where }).catch(() => 0);
    }
  }
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const logs = merged.slice(offset, offset + limit);

  return NextResponse.json({ logs, total, limit, offset });
}
