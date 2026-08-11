import { prisma } from './db';
import { multiDbEnabled, coldShards, shardForTable } from './db-secondary';

export interface AuditEntry {
  userId?: string;
  username?: string;
  action: string;
  targetId?: string;
  detail?: string;
  // Client IP captured at write time (e.g. login IP). Null when unknown.
  ip?: string | null;
  // Token usage on AI calls (total prompt + completion tokens).
  tokens?: number | null;
}

// Non-blocking write: never let audit logging break the main request.
// Cold audit rows go to the secondary (when configured); on any secondary failure we
// silently fall back to the primary so logging never blocks or loses the entry.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const target = shardForTable('audit') ?? prisma;
  try {
    await target.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        username: entry.username ?? null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
        tokens: entry.tokens ?? null,
      },
    });
  } catch (e) {
    // If the secondary failed, do NOT lose the log — retry on the primary.
    if (target !== prisma) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: entry.userId ?? null,
            username: entry.username ?? null,
            action: entry.action,
            targetId: entry.targetId ?? null,
            detail: entry.detail ?? null,
            ip: entry.ip ?? null,
            tokens: entry.tokens ?? null,
          },
        });
        return;
      } catch (e2) {
        console.error('audit write failed (secondary + primary)', e2);
        return;
      }
    }
    console.error('audit write failed', e);
  }
}

// ---- Merged reads -----------------------------------------------------------
// Because existing rows live in the primary while NEW cold rows go to a secondary,
// reads must consult BOTH. The primary and secondary clients are distinct Prisma
// types, so each source is queried independently and the plain results are merged.

export interface AuditQuery {
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export interface AuditRow {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  tokens: number | null;
  createdAt: Date;
}

function auditWhere(q: AuditQuery) {
  return {
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: q.from } : {}),
            ...(q.to ? { lte: q.to } : {}),
          },
        }
      : {}),
  };
}

const auditSelect = {
  id: true,
  userId: true,
  username: true,
  action: true,
  targetId: true,
  detail: true,
  ip: true,
  tokens: true,
  createdAt: true,
} as const;

// Fetch the N most recent audit rows across the primary + all configured secondaries,
// merged and sorted by createdAt desc. Cursor = the oldest created date already shown.
export async function queryAudit(q: AuditQuery, take: number, cursorDate?: Date): Promise<AuditRow[]> {
  const where = auditWhere(q);
  const cursorFilter = cursorDate
    ? { createdAt: { ...where.createdAt, lt: cursorDate } }
    : {};
  const base = {
    where: { ...where, ...cursorFilter },
    orderBy: { createdAt: 'desc' as const },
    take,
    select: auditSelect,
  };

  const merged: AuditRow[] = [];
  const primaryRows = await prisma.auditLog.findMany(base);
  merged.push(...(primaryRows as AuditRow[]));
  if (multiDbEnabled()) {
    for (const shard of coldShards()) {
      const rows = await shard.auditLog.findMany(base).catch(() => [] as unknown[]);
      merged.push(...(rows as AuditRow[]));
    }
  }
  return merged.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
}

// Total count across primary + all secondaries.
export async function countAudit(q: AuditQuery): Promise<number> {
  const where = auditWhere(q);
  const counts: number[] = [];
  counts.push(await prisma.auditLog.count({ where }));
  if (multiDbEnabled()) {
    for (const shard of coldShards()) {
      counts.push(await shard.auditLog.count({ where }).catch(() => 0));
    }
  }
  return counts.reduce((a, b) => a + b, 0);
}
