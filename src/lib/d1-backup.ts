// Backup helpers: copy the most important Neon (Prisma) data into D1 as a secondary snapshot,
// and dump the D1 database(s) into D1 itself as periodic backups. Both keep only the most
// recent N snapshots (retention policy) so D1 doesn't grow without bound.
//
// Backups are stored IN D1 (NOT R2 — R2 is reserved for file sharing). Both are best-effort
// and only active when D1 is enabled. The cron endpoint /api/cron/d1-backup calls these under
// CRON_SECRET protection.

import { prisma } from './db';
import { isD1Enabled, d1WriteTable, d1Prune } from './d1';

const API = 'https://api.cloudflare.com/client/v4';
const FETCH_TIMEOUT_MS = 60_000;

// Retention: keep the newest N snapshots per backup type.
const BACKUP_RETENTION = Number(process.env.D1_BACKUP_RETENTION) || 30;

// The "most important" Neon tables we snapshot into D1: the user accounts (without which the
// platform is unrecoverable) plus the site settings and AI providers. Sensitive fields (hashes,
// encrypted tokens) are excluded — this is a recovery reference, not a full clone.
export async function backupNeonToD1(): Promise<{
  ok: boolean;
  users: number;
  settings: number;
  providers: number;
  skipped?: string;
}> {
  if (!isD1Enabled()) {
    return { ok: false, users: 0, settings: 0, providers: 0, skipped: 'D1 disabled' };
  }
  const [users, settings, providers] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, displayName: true, email: true, isAdmin: true, profileComplete: true, createdAt: true },
    }),
    prisma.appSetting.findMany(),
    prisma.aiProvider.findMany({ select: { id: true, name: true, baseUrl: true, model: true, isEnabled: true } }),
  ]);

  const payload = {
    users,
    settings,
    providers,
    at: new Date().toISOString(),
  };

  // rowKey is a sortable timestamp so lexicographic DESC = newest first (used by retention).
  const key = `snapshot_${Date.now()}`;
  await d1WriteTable('neon_backup', key, JSON.stringify(payload));
  await d1Prune('neon_backup', BACKUP_RETENTION);
  return { ok: true, users: users.length, settings: settings.length, providers: providers.length };
}

// Dump every configured D1 database and store the .sqlite backup INTO D1 itself (a d1_dumps
// table), keeping only the newest BACKUP_RETENTION dumps. Returns the number backed up.
export async function dumpD1ToD1(): Promise<{ ok: boolean; backedUp: number; skipped?: string }> {
  if (!isD1Enabled()) return { ok: false, backedUp: 0, skipped: 'D1 disabled' };

  const dbs = d1Databases();
  let backedUp = 0;

  for (const db of dbs) {
    try {
      const dump = await d1Dump(db.id);
      if (!dump) continue;
      const key = `dump_${Date.now()}_${db.name}`;
      await d1WriteTable('d1_dumps', key, dump);
      backedUp++;
    } catch (e) {
      console.error(`[d1-backup] dump ${db.name} failed`, e);
    }
  }
  if (backedUp > 0) {
    await d1Prune('d1_dumps', BACKUP_RETENTION);
  }
  return { ok: backedUp > 0, backedUp };
}

// Cloudflare D1 dump returns the whole database as a Base64 .sqlite file.
async function d1Dump(databaseId: string): Promise<string | null> {
  const token = process.env.D1_API_KEY;
  const account = process.env.D1_ACCESS;
  if (!token || !account) return null;
  const res = await fetch(
    `${API}/accounts/${account}/d1/database/${databaseId}/dump`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: string };
  return typeof data?.result === 'string' ? data.result : null;
}

interface D1Database {
  id: string;
  name: string;
}

function d1Databases(): D1Database[] {
  const out: D1Database[] = [];
  for (let i = 1; i <= 5; i++) {
    const id = process.env[`D1_SQL_${i}`];
    if (id) out.push({ id, name: `d1-${i}` });
  }
  return out;
}
