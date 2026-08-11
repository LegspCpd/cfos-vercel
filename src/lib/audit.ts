import { prisma } from './db';
import { getMultiDbConfig, multiDbEnabled } from './db-secondary';

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

// Resolve which client currently owns the audit table:
// the secondary DB when multi-db is enabled AND coldTables.audit is on,
// otherwise the main database.
function auditClient() {
  if (multiDbEnabled()) {
    const cfg = getMultiDbConfig();
    if (cfg.coldTables.audit && cfg.client) return cfg.client;
  }
  return prisma;
}

// Non-blocking write: never let audit logging break the main request.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await auditClient().auditLog.create({
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
    console.error('audit write failed', e);
  }
}

// Expose the active audit model so read paths (e.g. /api/admin/audit) query the
// same database the writes go to.
export function auditModel() {
  return auditClient().auditLog;
}

// Which client owns the audit table, as a string tag for diagnostics.
export function auditOwner(): 'primary' | 'secondary' {
  return multiDbEnabled() && getMultiDbConfig().coldTables.audit ? 'secondary' : 'primary';
}

// Helper to build audit entries from a session (auth-token based).
export function sessionActor(session: { userId: string; username: string }) {
  return { userId: session.userId, username: session.username };
}
