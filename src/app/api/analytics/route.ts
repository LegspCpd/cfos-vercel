import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { multiDbEnabled, coldShards } from '@/lib/db-secondary';

type AnyClient = typeof prisma;
type AnyShard = ReturnType<typeof coldShards>[number];

// Query the same shape across the primary and each secondary, then merge.
async function runEach<T>(
  primary: (c: AnyClient) => Promise<T[]>,
  shard: (s: AnyShard) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  out.push(...(await primary(prisma)));
  if (multiDbEnabled()) {
    for (const s of coldShards()) {
      out.push(...(await shard(s).catch(() => [])));
    }
  }
  return out;
}

// GET /api/analytics — per-user analytics for the current user.
// Merges audit reads across the primary + any secondary cold DBs.
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

  const [workspaceCount, fileCount] = await Promise.all([
    prisma.workspace.count({ where: { ownerId: user.id } }),
    prisma.workspaceFile.count({ where: { workspace: { ownerId: user.id } } }),
  ]);

  type LoginRow = { createdAt: Date; ip: string | null };
  type TokenRow = { tokens: number | null };

  const [loginRows, tokenRows] = await Promise.all([
    runEach<LoginRow>(
      (c) => c.auditLog.findMany({ where: { userId: user.id, action: 'auth.login', createdAt: { gte: todayStart } }, orderBy: { createdAt: 'desc' }, take: 20, select: { createdAt: true, ip: true } }) as Promise<LoginRow[]>,
      (s) => s.auditLog.findMany({ where: { userId: user.id, action: 'auth.login', createdAt: { gte: todayStart } }, orderBy: { createdAt: 'desc' }, take: 20, select: { createdAt: true, ip: true } }) as Promise<LoginRow[]>,
    ),
    runEach<TokenRow>(
      (c) => c.auditLog.findMany({ where: { userId: user.id, action: 'ai.call', createdAt: { gte: todayStart } }, select: { tokens: true } }) as Promise<TokenRow[]>,
      (s) => s.auditLog.findMany({ where: { userId: user.id, action: 'ai.call', createdAt: { gte: todayStart } }, select: { tokens: true } }) as Promise<TokenRow[]>,
    ),
  ]);

  const sortedLogins = loginRows.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const logins = sortedLogins.slice(0, 20).map((l) => ({ at: l.createdAt.toISOString(), ip: l.ip }));
  const todayAiCalls = tokenRows.length;
  const todayTokenTotal = tokenRows.reduce((sum, r) => sum + (r.tokens ?? 0), 0);

  let site: {
    todayLogins: number;
    todayTokens: number;
    todayAiCalls: number;
    todayUsersActive: number;
    topLoginIps: { ip: string; count: number }[];
  } | null = null;

  if (user.isAdmin || (await isUserAdmin(user.id))) {
    type SiteLogin = { userId: string | null; ip: string | null };
    type SiteToken = { tokens: number | null };
    const [siteLogins, siteTokens] = await Promise.all([
      runEach<SiteLogin>(
        (c) => c.auditLog.findMany({ where: { action: 'auth.login', createdAt: { gte: todayStart } }, select: { userId: true, ip: true } }) as Promise<SiteLogin[]>,
        (s) => s.auditLog.findMany({ where: { action: 'auth.login', createdAt: { gte: todayStart } }, select: { userId: true, ip: true } }) as Promise<SiteLogin[]>,
      ),
      runEach<SiteToken>(
        (c) => c.auditLog.findMany({ where: { action: 'ai.call', createdAt: { gte: todayStart } }, select: { tokens: true } }) as Promise<SiteToken[]>,
        (s) => s.auditLog.findMany({ where: { action: 'ai.call', createdAt: { gte: todayStart } }, select: { tokens: true } }) as Promise<SiteToken[]>,
      ),
    ]);

    const activeUserIds = new Set(siteLogins.map((l) => l.userId).filter(Boolean) as string[]);
    const ipCounts = new Map<string, number>();
    for (const l of siteLogins) {
      if (!l.ip) continue;
      ipCounts.set(l.ip, (ipCounts.get(l.ip) || 0) + 1);
    }
    site = {
      todayLogins: siteLogins.length,
      todayTokens: siteTokens.reduce((s, r) => s + (r.tokens ?? 0), 0),
      todayAiCalls: siteTokens.length,
      todayUsersActive: activeUserIds.size,
      topLoginIps: Array.from(ipCounts.entries())
        .map(([ip, count]) => ({ ip, count }))
        .toSorted((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  return NextResponse.json({
    joinedAt: user.createdAt.toISOString(),
    workspaces: workspaceCount,
    files: fileCount,
    today: {
      loginCount: loginRows.length,
      logins,
      aiCalls: todayAiCalls,
      tokens: todayTokenTotal,
    },
    site,
  });
}
