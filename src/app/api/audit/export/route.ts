import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { multiDbEnabled, coldShards } from '@/lib/db-secondary';
import type { AuditRow } from '@/lib/audit';

// GET /api/audit/export?format=csv|json&scope=all|mine&action=...&user=...
// Exports the audit log as CSV or JSON.
//   - scope=all  (admin only): every row across primary + cold DBs.
//   - scope=mine (any user):   only the caller's own rows.
// CSV is UTF-8 with a BOM so Excel opens Chinese text correctly.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const scope = url.searchParams.get('scope') === 'mine' ? 'mine' : 'all';
  const action = url.searchParams.get('action') || undefined;
  const user = url.searchParams.get('user') || undefined;

  if (scope === 'all') {
    const admin = await isUserAdmin(session.userId);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (scope === 'mine') where.userId = session.userId;
  if (action) where.action = action;
  if (user && scope === 'all') where.username = { contains: user, mode: 'insensitive' };

  const base = {
    where,
    orderBy: { createdAt: 'desc' as const },
    take: 10000, // export cap — enough for a full dump in practice
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

  const merged: AuditRow[] = [];
  merged.push(...((await prisma.auditLog.findMany(base)) as AuditRow[]));
  if (scope === 'all' && multiDbEnabled()) {
    for (const shard of coldShards()) {
      const rows = await shard.auditLog.findMany(base).catch(() => [] as unknown[]);
      merged.push(...(rows as AuditRow[]));
    }
  }
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const filename = `audit-${scope}-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'json') {
    return new NextResponse(JSON.stringify(merged, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    });
  }

  // CSV with BOM for Excel compatibility.
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['time', 'username', 'action', 'targetId', 'detail', 'ip', 'tokens'];
  const lines = merged.map((r) =>
    [r.createdAt.toISOString(), r.username, r.action, r.targetId, r.detail, r.ip, r.tokens]
      .map(esc)
      .join(','),
  );
  const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  });
}