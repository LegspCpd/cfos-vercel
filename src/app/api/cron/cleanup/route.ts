import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { r2Delete, isR2Configured } from '@/lib/r2';

// GET /api/cron/cleanup — delete all expired shared files from R2 + DB.
// Protected by a CRON_SECRET env var. Triggered by vercel.json cron config.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (header !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

  return NextResponse.json({
    ok: true,
    deletedFromR2,
    deletedRecords: deletedRecords.count,
  });
}
