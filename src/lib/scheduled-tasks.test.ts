import { describe, it, expect } from 'vitest';
import { parseCron, cronMatches, describeCron, nextMatchAfter } from '@/lib/scheduled-tasks';

describe('scheduled-tasks', () => {
  describe('parseCron', () => {
    it('parses a simple daily schedule', () => {
      const s = parseCron('0 9 * * *');
      expect(s).not.toBeNull();
      expect(s!.minute).toEqual([0]);
      expect(s!.hour).toEqual([9]);
      expect(s!.dayOfMonth).toHaveLength(31);
      expect(s!.month).toHaveLength(12);
      expect(s!.dayOfWeek).toHaveLength(7);
    });

    it('parses every-minute', () => {
      const s = parseCron('* * * * *');
      expect(s!.minute).toHaveLength(60);
      expect(s!.hour).toHaveLength(24);
    });

    it('parses step values', () => {
      const s = parseCron('*/15 * * * *');
      expect(s!.minute).toEqual([0, 15, 30, 45]);
    });

    it('parses ranges', () => {
      const s = parseCron('0 9-17 * * 1-5');
      expect(s!.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
      expect(s!.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    });

    it('parses lists', () => {
      const s = parseCron('0 9,18 * * *');
      expect(s!.hour).toEqual([9, 18]);
    });

    it('rejects wrong field count', () => {
      expect(parseCron('0 9 * *')).toBeNull();
      expect(parseCron('0 9 * * * *')).toBeNull();
    });

    it('rejects garbage', () => {
      expect(parseCron('not a cron')).toBeNull();
      expect(parseCron('')).toBeNull();
    });
  });

  describe('cronMatches', () => {
    it('matches the exact minute', () => {
      const s = parseCron('30 14 * * *')!;
      expect(cronMatches(s, new Date(2026, 7, 16, 14, 30))).toBe(true);
      expect(cronMatches(s, new Date(2026, 7, 16, 14, 31))).toBe(false);
      expect(cronMatches(s, new Date(2026, 7, 16, 15, 30))).toBe(false);
    });

    it('matches every-minute', () => {
      const s = parseCron('* * * * *')!;
      expect(cronMatches(s, new Date(2026, 7, 16, 3, 7))).toBe(true);
    });

    it('respects day-of-week', () => {
      // 2026-08-16 is a Sunday (day 0).
      const s = parseCron('0 9 * * 0')!;
      expect(cronMatches(s, new Date(2026, 7, 16, 9, 0))).toBe(true);
      const s2 = parseCron('0 9 * * 1')!;
      expect(cronMatches(s2, new Date(2026, 7, 16, 9, 0))).toBe(false);
    });

    it('respects month', () => {
      const s = parseCron('0 9 * 12 *')!;
      expect(cronMatches(s, new Date(2026, 11, 1, 9, 0))).toBe(true);
      expect(cronMatches(s, new Date(2026, 7, 1, 9, 0))).toBe(false);
    });
  });

  describe('describeCron', () => {
    it('returns a readable summary', () => {
      expect(describeCron('0 9 * * *')).toBe('0 9 * * *');
      expect(describeCron('*/15 * * * *')).toBe('*/15 * * * *');
    });

    it('returns the raw expression when invalid', () => {
      expect(describeCron('garbage')).toBe('garbage');
    });
  });

  describe('nextMatchAfter', () => {
    it('returns the next matching moment strictly after the given time', () => {
      const s = parseCron('30 14 * * *')!;
      const from = new Date(2026, 7, 16, 9, 0);
      const next = nextMatchAfter(s, from)!;
      expect(next.getFullYear()).toBe(2026);
      expect(next.getMonth()).toBe(7);
      expect(next.getDate()).toBe(16);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
    });

    it('rolls to the next day when today already passed', () => {
      const s = parseCron('30 9 * * *')!;
      const from = new Date(2026, 7, 16, 14, 0);
      const next = nextMatchAfter(s, from)!;
      expect(next.getDate()).toBe(17);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(30);
    });

    it('handles hourly schedules (daily sweep still catches them)', () => {
      const s = parseCron('0 * * * *')!;
      const from = new Date(2026, 7, 16, 3, 10);
      const next = nextMatchAfter(s, from)!;
      expect(next.getHours()).toBe(4);
      expect(next.getMinutes()).toBe(0);
    });

    it('returns null for a schedule that will not match within 24h', () => {
      // Leap-day-only schedule (Feb 29) scanned from a non-leap year mid-year.
      const s = parseCron('0 0 29 2 *')!;
      const from = new Date(2026, 7, 16, 0, 0); // 2026 is not a leap year
      expect(nextMatchAfter(s, from)).toBeNull();
    });
  });
});