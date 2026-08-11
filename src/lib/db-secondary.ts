// Secondary (cold-data) database support.
//
// The deployment can opt into a SECOND Neon database to store low-priority,
// relation-less cold data (audit logs, email verification codes) — keeping the main
// database from filling up. This is OFF by default and only activates when BOTH:
//   - DATABASE_URL_2        is set, AND
//   - MULTI_DB_ENABLED=true  (explicit opt-in)
//
// When disabled, `db` below is null and every caller transparently falls back to the
// main Prisma client (`@/lib/db`). No behavior changes for existing deployments.
//
// The generated client (src/generated/prisma-secondary) is produced by
//   prisma generate --schema=prisma/schema-secondary.prisma
// and only exists after a build that runs that command.

import { PrismaClient as SecondaryPrismaClient } from '@/generated/prisma-secondary';

export interface MultiDbConfig {
  /** true when the secondary DB is both configured AND opted-in. */
  enabled: boolean;
  /** The secondary client (null when disabled). */
  client: SecondaryPrismaClient | null;
  /** Which cold tables should be routed to the secondary DB. */
  coldTables: { audit: boolean; verification: boolean };
}

let cached: MultiDbConfig | null = null;

function parseColdTables(): { audit: boolean; verification: boolean } {
  // MULTI_DB_COLD_TABLES="audit,verification" (default both). Empty -> none.
  const raw = (process.env.MULTI_DB_COLD_TABLES || 'audit,verification').toLowerCase();
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    audit: items.includes('audit'),
    verification: items.includes('verification'),
  };
}

/** Resolve the multi-DB config once (cached for the process lifetime). */
export function getMultiDbConfig(): MultiDbConfig {
  if (cached) return cached;
  const hasUrl2 = Boolean(process.env.DATABASE_URL_2);
  const optedIn = process.env.MULTI_DB_ENABLED === 'true';
  const enabled = hasUrl2 && optedIn;
  let client: SecondaryPrismaClient | null = null;
  if (enabled) {
    try {
      client = new SecondaryPrismaClient();
    } catch (e) {
      console.error('[multi-db] failed to init secondary client', e);
      client = null;
    }
  }
  cached = {
    enabled: enabled && client !== null,
    client,
    coldTables: parseColdTables(),
  };
  return cached;
}

/** Is the secondary DB active? */
export function multiDbEnabled(): boolean {
  return getMultiDbConfig().enabled;
}

/** Convenience: the secondary client or null. */
export function dbSecondary(): SecondaryPrismaClient | null {
  return getMultiDbConfig().client;
}

// Reset the cached config (used in tests).
export function __resetMultiDbConfig(): void {
  cached = null;
}
