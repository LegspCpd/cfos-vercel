// Batch 2 migration: Context public library + workspace collaborators + file shares
// + notifications + notification preferences.
//
// The Prisma schema is the source of truth — `npx prisma db push` applies everything.
// This script exists for deployments that prefer explicit SQL migrations, and as a
// documented record of what Batch 2 changed. It is idempotent: re-running it is safe.
//
// Run: node scripts/migrate-batch2.mjs
// Rollback: node scripts/migrate-batch2.mjs --rollback
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rollback = process.argv.includes('--rollback');

// Raw SQL is used because Prisma's generated client can't ALTER TABLE. The dialect is
// PostgreSQL (Neon). Each statement is guarded so re-runs are no-ops.
const MIGRATE = [
  // ContextDoc: visibility + status + publishedAt
  `ALTER TABLE "ContextDoc" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'private'`,
  `ALTER TABLE "ContextDoc" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft'`,
  `ALTER TABLE "ContextDoc" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "ContextDoc_visibility_status_idx" ON "ContextDoc"("visibility", "status")`,

  // WorkspaceCollaborator
  `CREATE TABLE IF NOT EXISTS "WorkspaceCollaborator" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'read',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceCollaborator_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceCollaborator_workspaceId_userId_key" ON "WorkspaceCollaborator"("workspaceId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "WorkspaceCollaborator_userId_idx" ON "WorkspaceCollaborator"("userId")`,
  `ALTER TABLE "WorkspaceCollaborator" ADD CONSTRAINT "WorkspaceCollaborator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "WorkspaceCollaborator" ADD CONSTRAINT "WorkspaceCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

  // FileShare
  `CREATE TABLE IF NOT EXISTS "FileShare" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'read',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FileShare_fileId_userId_key" ON "FileShare"("fileId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "FileShare_userId_idx" ON "FileShare"("userId")`,
  `ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "WorkspaceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

  // Notification
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read")`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt")`,
  `ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

  // NotificationPref
  `CREATE TABLE IF NOT EXISTS "NotificationPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailPrefs" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPref_userId_key" ON "NotificationPref"("userId")`,
  `ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

// Rollback drops the Batch 2 additions. ContextDoc columns are dropped too — this is
// destructive, so it only runs with an explicit --rollback flag.
const ROLLBACK = [
  `DROP TABLE IF EXISTS "NotificationPref"`,
  `DROP TABLE IF EXISTS "Notification"`,
  `DROP TABLE IF EXISTS "FileShare"`,
  `DROP TABLE IF EXISTS "WorkspaceCollaborator"`,
  `DROP INDEX IF EXISTS "ContextDoc_visibility_status_idx"`,
  `ALTER TABLE "ContextDoc" DROP COLUMN IF EXISTS "publishedAt"`,
  `ALTER TABLE "ContextDoc" DROP COLUMN IF EXISTS "status"`,
  `ALTER TABLE "ContextDoc" DROP COLUMN IF EXISTS "visibility"`,
];

try {
  const statements = rollback ? ROLLBACK : MIGRATE;
  console.log(rollback ? 'Rolling back Batch 2…' : 'Applying Batch 2 migration…');
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