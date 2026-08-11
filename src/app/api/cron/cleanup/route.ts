import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { r2Delete, isR2Configured } from '@/lib/r2';
import { getColdStatus } from '@/lib/cold-migrate';

// GET /api/cron/cleanup — delete all expired shared files from R2 + DB.
// Protected by a CRON_SECRET env var. Triggered by vercel.json cron config.
// SECURITY: CRON_SECRET is REQUIRED. If it's missing the endpoint refuses to run rather
// than opening the cleanup (which deletes expired files/accounts) to the public internet.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (header !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const expired = await prisma.sharedFile.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, r2Key: true },
  });

  let deletedFromR2 = 0;
  if (isR2Configured()) {
    for (const f of expired) {
      try {
        await r2Delete(f.r2Key);
        deletedFromR2++;
      } catch {
        // ignore individual failures
      }
    }
  }
  const deletedRecords = await prisma.sharedFile.deleteMany({
    where: { id: { in: expired.map((f) => f.id) } },
  });

  // Also purge accounts whose deletion cooldown has passed but who never logged in
  // again after the deadline (applyDueDeletion only runs on active entry points).
  // Related rows are removed by the schema's onDelete: Cascade.
  let deletedAccounts = 0;
  const due = await prisma.user.findMany({
    where: { deleteAt: { not: null, lt: now } },
    select: { id: true },
  });
  if (due.length > 0) {
    const del = await prisma.user.deleteMany({ where: { id: { in: due.map((u) => u.id) } } });
    deletedAccounts = del.count;
  }

  // Multi-DB status (report-only; this feature never moves or deletes primary data —
  // see cold-migrate.ts for the conservative rationale).
  const cold = await getColdStatus();

  return NextResponse.json({
    ok: true,
    deletedFromR2,
    deletedRecords: deletedRecords.count,
    deletedAccounts,
    multiDb: cold.enabled ? { shards: cold.shards, coldTables: cold.coldTables } : 'disabled',
  });
}
