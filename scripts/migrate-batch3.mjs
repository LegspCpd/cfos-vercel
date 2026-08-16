// Batch 3 migration: AI usage quotas, scheduled tasks, one-click static publish.
//
// The Prisma schema is the source of truth — `npx prisma db push` applies everything.
// This script exists for deployments that prefer explicit SQL migrations, and as a
// documented record of what Batch 3 changed. It is idempotent: re-running it is safe.
//
// Run: node scripts/migrate-batch3.mjs
// Rollback: node scripts/migrate-batch3.mjs --rollback
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rollback = process.argv.includes('--rollback');

// Raw SQL is used because Prisma's generated client can't ALTER TABLE. The dialect is
// PostgreSQL (Neon). Each statement is guarded so re-runs are no-ops.
const MIGRATE = [
  // UserGroup: group-wide AI daily quota (null = no limit)
  `ALTER TABLE "UserGroup" ADD COLUMN IF NOT EXISTS "aiDailyLimit" INTEGER`,
  // User: per-user AI daily quota override (null = inherit group)
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiDailyLimit" INTEGER`,
  // ScheduledTask: admin-defined cron tasks (agent run or webhook callback)
  `CREATE TABLE IF NOT EXISTS "ScheduledTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'agent',
    "prompt" TEXT,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ScheduledTask_workspaceId_idx" ON "ScheduledTask"("workspaceId")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledTask_enabled_idx" ON "ScheduledTask"("enabled")`,
  // PublishedSite: one-click static publish (public /p/:token link)
  `CREATE TABLE IF NOT EXISTS "PublishedSite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishedSite_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PublishedSite_workspaceId_key" ON "PublishedSite"("workspaceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PublishedSite_token_key" ON "PublishedSite"("token")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PublishedSite_r2Key_key" ON "PublishedSite"("r2Key")`,
];

// Rollback drops the Batch 3 additions — destructive, only with --rollback.
const ROLLBACK = [
  `ALTER TABLE "User" DROP COLUMN IF EXISTS "aiDailyLimit"`,
  `ALTER TABLE "UserGroup" DROP COLUMN IF EXISTS "aiDailyLimit"`,
  `DROP TABLE IF EXISTS "ScheduledTask"`,
  `DROP TABLE IF EXISTS "PublishedSite"`,
];

try {
  const statements = rollback ? ROLLBACK : MIGRATE;
  console.log(rollback ? 'Rolling back Batch 3…' : 'Applying Batch 3 migration…');
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ok: ${sql.slice(0, 90)}${sql.length > 90 ? '…' : ''}`);
  }
  console.log(rollback ? 'Rollback complete.' : 'Migration complete.');
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}