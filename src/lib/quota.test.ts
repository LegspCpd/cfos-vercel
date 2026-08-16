import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client so quota helpers can be tested without a database.
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      count: vi.fn(),
    },
  },
}));

import { effectiveAiLimit, aiUsageToday, getQuotaInfo, isAiQuotaExhausted } from '@/lib/quota';
import { prisma } from '@/lib/db';

const mockUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockCount = prisma.auditLog.count as ReturnType<typeof vi.fn>;

describe('quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENT_DAILY_LIMIT;
  });

  describe('effectiveAiLimit', () => {
    it('uses the user override when set', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: 25, group: { aiDailyLimit: 100 } });
      const r = await effectiveAiLimit('u1');
      expect(r).toEqual({ limit: 25, source: 'user' });
    });

    it('falls back to the group limit', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: null, group: { aiDailyLimit: 100 } });
      const r = await effectiveAiLimit('u1');
      expect(r).toEqual({ limit: 100, source: 'group' });
    });

    it('falls back to the env default', async () => {
      process.env.AGENT_DAILY_LIMIT = '50';
      mockUser.mockResolvedValue({ aiDailyLimit: null, group: { aiDailyLimit: null } });
      const r = await effectiveAiLimit('u1');
      expect(r).toEqual({ limit: 50, source: 'env' });
    });

    it('returns unlimited when nothing is set', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: null, group: { aiDailyLimit: null } });
      const r = await effectiveAiLimit('u1');
      expect(r).toEqual({ limit: null, source: 'none' });
    });

    it('returns none for a missing user', async () => {
      mockUser.mockResolvedValue(null);
      const r = await effectiveAiLimit('ghost');
      expect(r).toEqual({ limit: null, source: 'none' });
    });
  });

  describe('aiUsageToday', () => {
    it('counts agent.run + ai.call since midnight', async () => {
      mockCount.mockResolvedValue(7);
      const n = await aiUsageToday('u1');
      expect(n).toBe(7);
      const where = mockCount.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.action).toEqual({ in: ['agent.run', 'ai.call'] });
      expect(where.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('getQuotaInfo', () => {
    it('computes remaining', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: 10, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(3);
      const info = await getQuotaInfo('u1');
      expect(info).toEqual({ limit: 10, used: 3, remaining: 7, source: 'user' });
    });

    it('clamps remaining at 0', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: 5, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(9);
      const info = await getQuotaInfo('u1');
      expect(info.remaining).toBe(0);
    });

    it('returns null remaining when unlimited', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: null, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(9);
      const info = await getQuotaInfo('u1');
      expect(info.remaining).toBeNull();
      expect(info.limit).toBeNull();
    });
  });

  describe('isAiQuotaExhausted', () => {
    it('true when used >= limit', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: 5, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(5);
      expect(await isAiQuotaExhausted('u1')).toBe(true);
    });

    it('false when under the limit', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: 5, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(4);
      expect(await isAiQuotaExhausted('u1')).toBe(false);
    });

    it('false when unlimited', async () => {
      mockUser.mockResolvedValue({ aiDailyLimit: null, group: { aiDailyLimit: null } });
      mockCount.mockResolvedValue(999);
      expect(await isAiQuotaExhausted('u1')).toBe(false);
    });
  });
});