import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { auditModel } from '@/lib/audit';
import { isUserAdmin } from '@/lib/admin';

// GET /api/admin/audit?action=...&user=...&limit=50&offset=0
// Returns the audit log (admin only), with optional filtering.
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

  const model = auditModel();
  const [logs, total] = await Promise.all([
    model.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    model.count({ where }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
