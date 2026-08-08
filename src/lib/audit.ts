import { prisma } from './db';

export interface AuditEntry {
  userId?: string;
  username?: string;
  action: string;
  targetId?: string;
  detail?: string;
}

// Non-blocking write: never let audit logging break the main request.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        username: entry.username ?? null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        detail: entry.detail ?? null,
      },
    });
  } catch (e) {
    console.error('audit write failed', e);
  }
}

// Helper to build audit entries from a session (auth-token based).
export function sessionActor(session: { userId: string; username: string }) {
  return { userId: session.userId, username: session.username };
}
