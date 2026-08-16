import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { clientIp, ipFamily } from '@/lib/ip';
import { RateLimiter } from '@/lib/rate-limit';

// Cap session-view writes: one per user per 10s is plenty for a page that fires once
// per mount. Prevents an authenticated client from flooding the audit table.
const visitLimiter = new RateLimiter(10_000, 1);

// POST /api/analytics/visit — record a "session view" (every time the user opens the
// analytics page / visits while logged in) so admins can trace a user's IP per visit for
// forensics. Non-blocking on the client: the page fires this and does not wait.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (visitLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const ip = clientIp(req);

  await writeAudit({
    userId: user.id,
    username: user.username,
    action: 'auth.online',
    ip,
    detail: `session view · ${ipFamily(ip) === 'v6' ? 'IPv6' : 'IPv4'}`,
  });

  return NextResponse.json({ ok: true, ip });
}
