import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { areSignupsEnabled } from '@/lib/settings';

// GET /api/admin/overview — returns settings + user list (admin only).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [signupsEnabled, users] = await Promise.all([
    areSignupsEnabled(),
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        _count: { select: { workspaces: true } },
      },
    }),
  ]);

  return NextResponse.json({
    settings: { signupsEnabled },
    users,
  });
}
