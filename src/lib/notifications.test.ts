import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client so the pure helpers can be tested without a database.
vi.mock('@/lib/db', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationPref: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  resendConfigured: vi.fn(() => true),
}));

import {
  NOTIFICATION_TYPES,
  isNotificationType,
  parseEmailPrefs,
  serializeEmailPrefs,
  notify,
  markNotificationsRead,
} from '@/lib/notifications';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';

describe('notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isNotificationType', () => {
    it('accepts known types', () => {
      for (const type of NOTIFICATION_TYPES) {
        expect(isNotificationType(type)).toBe(true);
      }
    });

    it('rejects unknown values', () => {
      expect(isNotificationType('bogus')).toBe(false);
      expect(isNotificationType(42)).toBe(false);
      expect(isNotificationType(null)).toBe(false);
      expect(isNotificationType(undefined)).toBe(false);
    });
  });

  describe('parseEmailPrefs', () => {
    it('returns {} for null/undefined/empty', () => {
      expect(parseEmailPrefs(null)).toEqual({});
      expect(parseEmailPrefs(undefined)).toEqual({});
      expect(parseEmailPrefs('')).toEqual({});
    });

    it('parses valid JSON and keeps only known types', () => {
      const raw = JSON.stringify({ 'collab.added': true, bogus: true });
      expect(parseEmailPrefs(raw)).toEqual({ 'collab.added': true });
    });

    it('tolerates invalid JSON', () => {
      expect(parseEmailPrefs('not json')).toEqual({});
    });

    it('tolerates non-object JSON', () => {
      expect(parseEmailPrefs('"hello"')).toEqual({});
      expect(parseEmailPrefs('[1,2]')).toEqual({});
    });
  });

  describe('serializeEmailPrefs', () => {
    it('round-trips through parseEmailPrefs', () => {
      const prefs = { 'collab.added': true, 'context.approved': false };
      expect(parseEmailPrefs(serializeEmailPrefs(prefs))).toEqual(prefs);
    });

    it('drops unknown keys', () => {
      const out = serializeEmailPrefs({ bogus: true, 'share.added': true });
      expect(JSON.parse(out)).toEqual({ 'share.added': true });
    });
  });

  describe('notify', () => {
    it('creates an in-app notification', async () => {
      await notify({ userId: 'u1', type: 'collab.added', title: 'Hi', body: 'Body', href: '/x' });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'u1', type: 'collab.added', title: 'Hi', body: 'Body', href: '/x' },
      });
    });

    it('sends email when the user opted in and has an email', async () => {
      (prisma.notificationPref.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailPrefs: JSON.stringify({ 'collab.added': true }),
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        email: 'a@b.com',
        displayName: 'A',
      });
      await notify({ userId: 'u1', type: 'collab.added', title: 'Hi', body: 'Body' });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', subject: expect.stringContaining('Hi') }),
      );
    });

    it('does not email when the user did not opt in', async () => {
      (prisma.notificationPref.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailPrefs: JSON.stringify({}),
      });
      await notify({ userId: 'u1', type: 'collab.added', title: 'Hi' });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('does not email when the user has no email', async () => {
      (prisma.notificationPref.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailPrefs: JSON.stringify({ 'collab.added': true }),
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ email: null });
      await notify({ userId: 'u1', type: 'collab.added', title: 'Hi' });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('never throws when email fails', async () => {
      (prisma.notificationPref.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailPrefs: JSON.stringify({ 'collab.added': true }),
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        email: 'a@b.com',
        displayName: 'A',
      });
      (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('smtp down'));
      await expect(
        notify({ userId: 'u1', type: 'collab.added', title: 'Hi' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('markNotificationsRead', () => {
    it('marks all when no id given', async () => {
      await markNotificationsRead('u1');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', read: false },
        data: { read: true },
      });
    });

    it('marks one when id given', async () => {
      await markNotificationsRead('u1', 'n1');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
        data: { read: true },
      });
    });
  });
});