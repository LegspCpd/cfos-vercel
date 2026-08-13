// Backup helpers: copy the most important Neon (Prisma) data into D1 as a secondary snapshot,
// and dump the D1 database(s) to R2 as periodic backups.
//
// Both are best-effort and only active when D1 is enabled. The cron endpoint
// /api/cron/d1-backup calls these under CRON_SECRET protection.

import { prisma } from './db';
import { r2Put, isR2Configured } from './r2';
import { isD1Enabled, d1WriteTable } from './d1';

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

  await d1WriteTable('neon_backup', 'snapshot', JSON.stringify(payload));
  return { ok: true, users: users.length, settings: settings.length, providers: providers.length };
}

// Dump every configured D1 database to R2 as a .sqlite backup (via Cloudflare's D1 dump API).
// Returns the number of databases backed up, or a skipped reason.
export async function dumpD1ToR2(): Promise<{ ok: boolean; backedUp: number; skipped?: string }> {
  if (!isD1Enabled()) return { ok: false, backedUp: 0, skipped: 'D1 disabled' };
  if (!isR2Configured()) return { ok: false, backedUp: 0, skipped: 'R2 not configured' };

  const dbs = d1Databases();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let backedUp = 0;

  for (const db of dbs) {
    try {
      const dump = await d1Dump(db.id);
      if (!dump) continue;
      await r2Put({
        key: `backups/d1/${db.name}_${ts}.sqlite`,
        body: Buffer.from(dump, 'base64'),
        contentType: 'application/vnd.sqlite3',
      });
      backedUp++;
    } catch (e) {
      console.error(`[d1-backup] dump ${db.name} failed`, e);
    }
  }
  return { ok: backedUp > 0, backedUp };
}

// Cloudflare D1 dump returns the whole database as a Base64 .sqlite file.
async function d1Dump(databaseId: string): Promise<string | null> {
  const token = process.env['D1-api-key'];
  const account = process.env['D1-access'];
  if (!token || !account) return null;
  const res = await fetch(
    `${'https://api.cloudflare.com/client/v4'}/accounts/${account}/d1/database/${databaseId}/dump`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) },
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
    const id = process.env[`D1-SQL-${i}`];
    if (id) out.push({ id, name: `d1-${i}` });
  }
  return out;
}
