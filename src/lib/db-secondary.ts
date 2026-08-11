// Multi-database cold-store support.
//
// The deployment can opt into up to FOUR extra Neon databases
// (DATABASE_URL_2 .. DATABASE_URL_5) to store low-priority, relation-less cold data
// (audit logs, email verification codes), so the MAIN database keeps only important
// data and stays lean. The main database is NEVER modified by this feature: cold data
// that is NEW goes to a secondary, existing main-DB rows are never moved or deleted.
//
// This is OFF by default and only activates when ALL of:
//   - MULTI_DB_ENABLED=true  (explicit opt-in), AND
//   - at least one DATABASE_URL_2..5 is set
//
// When disabled, every caller falls back to the main Prisma client with zero changes
// to existing deployments.
//
// SAFETY (conservative on purpose):
//   - No automatic data migration and NO deletion from the primary. Ever.
//   - Cold writes go to a secondary; reads are merged across primary + all secondaries
//     so no data ever "disappears".
//   - If a secondary is unreachable, writes/reads transparently fall back to primary.
//   - No automatic hash-sharding across many secondaries (that would complicate reads
//     and risk data loss); cold data goes to the FIRST configured secondary by default,
//     and MULTI_DB_COLD_TABLES lets you pin tables to a specific secondary index.

import { PrismaClient as SecondaryPrismaClient } from '@/generated/prisma-secondary';
import { prisma } from './db';

export interface ColdStore {
  /** true when multi-db is enabled (opted in AND >=1 secondary URL). */
  enabled: boolean;
  /** All configured secondary clients (1..4). Empty when disabled. */
  shards: SecondaryPrismaClient[];
  /** Which cold tables are routed to a secondary (and to which shard index). */
  coldTables: { audit: { on: boolean; shard: number } | null; verification: { on: boolean; shard: number } | null };
}

let cached: ColdStore | null = null;

export const SECONDARY_ENVS = ['DATABASE_URL_2', 'DATABASE_URL_3', 'DATABASE_URL_4', 'DATABASE_URL_5'];
export const MAX_SECONDARY = 4; // + 1 primary = 5 total

// Map table name -> default secondary index (0-based). Overridable via
// MULTI_DB_COLD_TABLES like "audit@0,verification@0" (table@shardIndex).
type TableRoute = { on: boolean; shard: number } | null;

function parseColdTables(shardCount: number): ColdStore['coldTables'] {
  const raw = (process.env.MULTI_DB_COLD_TABLES || 'audit,verification').toLowerCase();
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const route = (name: string): TableRoute => {
    const spec = items.find((i) => i.startsWith(`${name}@`) || i === name);
    if (!spec) return null;
    const idx = spec.includes('@') ? Number(spec.split('@')[1]) : 0;
    const shard = Number.isInteger(idx) && idx >= 0 && idx < shardCount ? idx : 0;
    return { on: true, shard };
  };
  return { audit: route('audit'), verification: route('verification') };
}

export function getColdStore(): ColdStore {
  if (cached) return cached;

  const optedIn = process.env.MULTI_DB_ENABLED === 'true';
  const urls = SECONDARY_ENVS.map((e) => process.env[e]).filter(Boolean) as string[];
  const shards: SecondaryPrismaClient[] = [];
  if (optedIn && urls.length > 0) {
    for (const url of urls) {
      try {
        shards.push(
          new SecondaryPrismaClient({
            datasources: { db: { url } },
          }),
        );
      } catch (e) {
        console.error('[multi-db] failed to init a secondary client', e);
      }
    }
  }

  const enabled = optedIn && shards.length > 0;
  cached = { enabled, shards, coldTables: enabled ? parseColdTables(shards.length) : { audit: null, verification: null } };
  return cached;
}

/** Is multi-db active at all? */
export function multiDbEnabled(): boolean {
  return getColdStore().enabled;
}

/** All active secondary clients (empty when disabled). */
export function coldShards(): SecondaryPrismaClient[] {
  return getColdStore().shards;
}

/** The secondary client for a given cold table's route (null => stays on primary). */
export function shardForTable(table: 'audit' | 'verification'): SecondaryPrismaClient | null {
  const store = getColdStore();
  if (!store.enabled) return null;
  const route = store.coldTables[table];
  if (!route?.on) return null;
  return store.shards[route.shard] ?? null;
}

/** Is the given cold table routed to a secondary? */
export function coldTableRouted(table: 'audit' | 'verification'): boolean {
  return shardForTable(table) !== null;
}

/** Diagnostics summary used by status endpoints. */
export function multiDbStatus() {
  const store = getColdStore();
  return {
    enabled: store.enabled,
    shards: store.shards.length,
    max: MAX_SECONDARY,
    coldTables: {
      audit: store.coldTables.audit ? { on: true, shard: store.coldTables.audit.shard } : { on: false },
      verification: store.coldTables.verification ? { on: true, shard: store.coldTables.verification.shard } : { on: false },
    },
  };
}

// The primary Prisma client (re-exported for convenience/consistency).
export { prisma };

// Reset the cached config (used in tests).
export function __resetColdStore(): void {
  cached = null;
}
