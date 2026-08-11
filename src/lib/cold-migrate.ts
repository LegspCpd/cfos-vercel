// Cold-data migration: move old, low-priority rows (audit logs, verification codes)
// from the MAIN database into the secondary cold database.
//
// Runs only when multi-DB is enabled (see db-secondary.ts). It is SAFE:
//   - Batched, oldest-first, so each run moves a bounded amount.
//   - Idempotent: a row is only deleted from the source AFTER it's confirmed written
//     to the destination (insert-then-delete), so a crash never loses data.
//   - Never runs at build time — only from the cron job, so deploys never move data.
//
// The "capacity rebalance" the admin asked for is handled here: when the primary is
// near-full, this job keeps draining it into the secondary. Which tables are drained
// is controlled by MULTI_DB_COLD_TABLES.

import { prisma } from './db';
import { getMultiDbConfig, multiDbEnabled } from './db-secondary';

export interface ColdMigrateResult {
  enabled: boolean;
  auditMigrated: number;
  verificationMigrated: number;
  errors: string[];
}

const BATCH_SIZE = 500;

// Migrate up to `batchSize` oldest AuditLog rows from primary -> secondary.
async function migrateAudit(batchSize: number, errors: string[]): Promise<number> {
  const cfg = getMultiDbConfig();
  if (!cfg.coldTables.audit || !cfg.client) return 0;
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });
  let moved = 0;
  for (const row of rows) {
    try {
      await cfg.client.auditLog.create({
        data: {
          id: row.id,
          userId: row.userId,
          username: row.username,
          action: row.action,
          targetId: row.targetId,
          detail: row.detail,
          ip: row.ip,
          tokens: row.tokens,
          createdAt: row.createdAt,
        },
      });
      // Confirmed on the destination -> safe to remove from source.
      await prisma.auditLog.delete({ where: { id: row.id } });
      moved++;
    } catch (e) {
      // Duplicate key on destination (already migrated) -> just drop the source row.
      if ((e as { code?: string })?.code === 'P2002') {
        await prisma.auditLog.delete({ where: { id: row.id } }).catch(() => {});
        moved++;
      } else {
        errors.push(`audit:${row.id}: ${(e as Error).message}`);
      }
    }
  }
  return moved;
}

// Migrate up to `batchSize` EmailVerification rows from primary -> secondary.
// ALL rows are moved (not just used/expired): the table is tiny (one row per pending
// code) and this keeps read/write routing consistent the moment multi-DB flips on —
// an in-flight, unexpired code moves to the secondary where verifyCode() will look.
async function migrateVerification(batchSize: number, errors: string[]): Promise<number> {
  const cfg = getMultiDbConfig();
  if (!cfg.coldTables.verification || !cfg.client) return 0;
  const rows = await prisma.emailVerification.findMany({
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });
  let moved = 0;
  for (const row of rows) {
    try {
      await cfg.client.emailVerification.create({
        data: {
          id: row.id,
          email: row.email,
          code: row.code,
          expiresAt: row.expiresAt,
          used: row.used,
          createdAt: row.createdAt,
        },
      });
      await prisma.emailVerification.delete({ where: { id: row.id } });
      moved++;
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        await prisma.emailVerification.delete({ where: { id: row.id } }).catch(() => {});
        moved++;
      } else {
        errors.push(`verification:${row.id}: ${(e as Error).message}`);
      }
    }
  }
  return moved;
}

export async function migrateColdData(): Promise<ColdMigrateResult> {
  const enabled = multiDbEnabled();
  if (!enabled) {
    return { enabled: false, auditMigrated: 0, verificationMigrated: 0, errors: [] };
  }
  const errors: string[] = [];
  const [auditMigrated, verificationMigrated] = await Promise.all([
    migrateAudit(BATCH_SIZE, errors),
    migrateVerification(BATCH_SIZE, errors),
  ]);
  return { enabled: true, auditMigrated, verificationMigrated, errors };
}
