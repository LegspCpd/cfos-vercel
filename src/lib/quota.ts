// AI usage quotas: per-user daily limits for agent runs + AI calls.
//
// The effective limit for a user is:
//   1. the user's own `aiDailyLimit` override, if set, else
//   2. the group's `aiDailyLimit`, if set, else
//   3. the `AGENT_DAILY_LIMIT` env fallback (default 100), else
//   4. unlimited.
//
// Usage is counted from the AuditLog (action "agent.run" / "ai.call"), so the quota
// panel and the enforcement read the same source of truth. A hard limit means the
// agent route refuses to run once the user is at/over the limit (HTTP 429).

import { prisma } from './db';

export interface QuotaInfo {
  limit: number | null; // null = unlimited
  used: number; // today's count
  remaining: number | null; // null when unlimited
  source: 'user' | 'group' | 'env' | 'none';
}

// The effective daily AI limit for a user, or null when unlimited.
export async function effectiveAiLimit(userId: string): Promise<{
  limit: number | null;
  source: QuotaInfo['source'];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiDailyLimit: true, group: { select: { aiDailyLimit: true } } },
  });
  if (!user) return { limit: null, source: 'none' };
  if (user.aiDailyLimit != null) return { limit: user.aiDailyLimit, source: 'user' };
  if (user.group?.aiDailyLimit != null) return { limit: user.group.aiDailyLimit, source: 'group' };
  const env = Number(process.env.AGENT_DAILY_LIMIT);
  if (Number.isFinite(env) && env > 0) return { limit: env, source: 'env' };
  return { limit: null, source: 'none' };
}

// Today's AI usage count for a user (agent runs + AI calls).
export async function aiUsageToday(userId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  return prisma.auditLog.count({
    where: {
      userId,
      action: { in: ['agent.run', 'ai.call'] },
      createdAt: { gte: dayStart },
    },
  });
}

// Full quota snapshot for the usage panel.
export async function getQuotaInfo(userId: string): Promise<QuotaInfo> {
  const { limit, source } = await effectiveAiLimit(userId);
  const used = await aiUsageToday(userId);
  return {
    limit,
    used,
    remaining: limit == null ? null : Math.max(0, limit - used),
    source,
  };
}

// True when the user is at/over their daily limit (hard stop).
export async function isAiQuotaExhausted(userId: string): Promise<boolean> {
  const { limit } = await effectiveAiLimit(userId);
  if (limit == null) return false;
  const used = await aiUsageToday(userId);
  return used >= limit;
}