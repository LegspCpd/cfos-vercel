import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { auditModel } from '@/lib/audit';

// GET /api/analytics — per-user analytics for the current user.
// Returns their own workspace counts, today's login activity (IPs), and today's AI
// token usage. If the user is an admin, includes a site-wide summary as well.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, createdAt: true, isAdmin: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const audit = auditModel();

  // Own stats.
  const [workspaceCount, fileCount, todayLoginCount, todayLoginLogs, todayTokenAgg] = await Promise.all([
    prisma.workspace.count({ where: { ownerId: user.id } }),
    prisma.workspaceFile.count({ where: { workspace: { ownerId: user.id } } }),
    audit.count({ where: { userId: user.id, action: 'auth.login', createdAt: { gte: todayStart } } }),
    audit.findMany({
      where: { userId: user.id, action: 'auth.login', createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true, ip: true },
    }),
    audit.aggregate({
      where: { userId: user.id, action: 'ai.call', createdAt: { gte: todayStart } },
      _count: { _all: true },
      _sum: { tokens: true },
    }),
  ]);

  const todayTokenTotal = todayTokenAgg._sum.tokens ?? 0;
  const todayAiCalls = todayTokenAgg._count._all;

  // Admin: site-wide today summary.
  let site: {
    todayLogins: number;
    todayTokens: number;
    todayAiCalls: number;
    todayUsersActive: number;
    topLoginIps: { ip: string; count: number }[];
  } | null = null;

  if (user.isAdmin || (await isUserAdmin(user.id))) {
    const [todayLogins, siteTokenAgg, activeUsers, loginIps] = await Promise.all([
      audit.count({ where: { action: 'auth.login', createdAt: { gte: todayStart } } }),
      audit.aggregate({
        where: { action: 'ai.call', createdAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { tokens: true },
      }),
      audit.findMany({
        where: { action: 'auth.login', createdAt: { gte: todayStart } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      audit.findMany({
        where: { action: 'auth.login', ip: { not: null }, createdAt: { gte: todayStart } },
        select: { ip: true },
      }),
    ]);
    const ipCounts = new Map<string, number>();
    for (const l of loginIps) {
      if (!l.ip) continue;
      ipCounts.set(l.ip, (ipCounts.get(l.ip) || 0) + 1);
    }
    const topLoginIps = Array.from(ipCounts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    site = {
      todayLogins,
      todayTokens: siteTokenAgg._sum.tokens ?? 0,
      todayAiCalls: siteTokenAgg._count._all,
      todayUsersActive: activeUsers.filter((u) => u.userId).length,
      topLoginIps,
    };
  }

  return NextResponse.json({
    joinedAt: user.createdAt.toISOString(),
    workspaces: workspaceCount,
    files: fileCount,
    today: {
      loginCount: todayLoginCount,
      logins: todayLoginLogs.map((l) => ({ at: l.createdAt.toISOString(), ip: l.ip })),
      aiCalls: todayAiCalls,
      tokens: todayTokenTotal,
    },
    site,
  });
}
