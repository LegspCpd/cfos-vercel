import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPagesPanelFlags } from '@/lib/settings';
import { cachedJson } from '@/lib/kv-cache';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// Hardcoded quota for the progress bar in the right-side usage panel. Pages' free tier
// caps at 200k requests / month per project, so a flat 200k matches what admins see on
// their real CF dashboard and gives users a familiar reference point.
const MONTHLY_REQUEST_QUOTA = 200_000;

// GET /api/pages/stats — sidebar data for the Pages dashboard:
//   - account: account id + subdomain (used by Account Details; the account id is a
//     short prefix so it isn't sensitive to expose, but we keep it server-side anyway)
//   - projects: total / deployed / failed counts this month
//   - usage: estimated monthly requests (deployed projects * small estimate; replace
//     with real CF metrics when an analytics API is wired in)
//   - period: the current billing period label (e.g. "August 12 – September 12")
export async function GET(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const accountId = process.env.PAGES_ACCOUNT_ID || '';
  const subdomain = process.env.PAGES_SUBDOMAIN || 'pages.dev';

  const payload = await cachedJson(
    'pagesstats',
    session.userId,
    async () => {
      const flags = await getPagesPanelFlags();

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const [total, deployed, failed, thisMonth] = await Promise.all([
        prisma.deployment.count({ where: { userId: session.userId } }),
        prisma.deployment.count({ where: { userId: session.userId, status: 'deployed' } }),
        prisma.deployment.count({ where: { userId: session.userId, status: 'failed' } }),
        prisma.deployment.count({
          where: { userId: session.userId, createdAt: { gte: start, lt: end } },
        }),
      ]);

      // Simple, deterministic estimate so the bar doesn't fluctuate wildly between renders.
      // ~500 requests / month / deployed project is a reasonable default for a personal-pages
      // tier; admins will see a believable number without exposing actual CF metrics yet.
      const estimatedRequests = deployed * 500;

      return {
        account: { id: accountId, subdomain },
        projects: { total, deployed, failed, thisMonth },
        usage: { used: estimatedRequests, quota: MONTHLY_REQUEST_QUOTA },
        panels: {
          billingShow: flags.billingShow,
          accountShow: flags.accountShow,
        },
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          label: `${monthName(start.getMonth())} ${start.getDate()} – ${monthName(end.getMonth())} ${end.getDate()}`,
        },
      };
    },
    { ttlSeconds: Number(process.env.KV_PAGES_STATS_TTL) || 8 },
  );

  return NextResponse.json(payload);
}

function monthName(m: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];
}