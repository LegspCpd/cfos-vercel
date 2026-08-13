import { NextResponse } from 'next/server';
import { backupNeonToD1, dumpD1ToD1 } from '@/lib/d1-backup';
import { isD1Enabled } from '@/lib/d1';

// GET /api/cron/d1-backup — two scheduled jobs:
//   1. Copy the most important Neon (Prisma) data into D1 as a secondary snapshot.
//   2. Dump the D1 database(s) into D1 as periodic backups (retention-limited).
//
// SECURITY: CRON_SECRET is REQUIRED. If it's missing (or D1 is disabled) the endpoint reports a
// skip rather than running, so the backup is never triggered by an unauthenticated caller.
// Triggered by vercel.json cron config.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (header !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isD1Enabled()) {
    return NextResponse.json({ ok: true, skipped: 'D1 disabled (set D1_ENABLED=true)' });
  }

  // 1. Neon → D1 snapshot.
  const neon = await backupNeonToD1();
  // 2. D1 → D1 dump (retention-limited).
  const dump = await dumpD1ToD1();

  return NextResponse.json({
    ok: true,
    neonBackup: neon,
    d1Dump: dump,
  });
}
