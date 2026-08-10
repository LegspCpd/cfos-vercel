// Self-serve account deletion (注销账号).
//
// A user requests deletion from their profile: we email them a code, they verify it and
// pass a human-verification challenge, and the account enters a 4–7 day cooldown
// (deleteAt = deleteRequestedAt + 5 days). During the cooldown they can cancel. After
// the deadline passes, the account and all its data are permanently deleted — the email
// and username are freed so the same address/username can be registered again.

import { prisma } from './db';

// Cooldown length: 4–7 days (midpoint 5).
export const DELETE_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;

/** Returns the scheduled deletion deadline for a fresh deletion request. */
export function deletionDeadline(): Date {
  return new Date(Date.now() + DELETE_COOLDOWN_MS);
}

// How long an OAuth deletion-confirmation stays valid (10 minutes) before the user must
// re-authenticate. Mirrors the OAuth state cookie lifetime.
export const DELETE_OAUTH_CONFIRM_MS = 10 * 60 * 1000;

/** True if the OAuth deletion confirmation is still fresh (within 10 minutes). */
export function oauthConfirmFresh(at: Date | null): boolean {
  if (!at) return false;
  return Date.now() - at.getTime() <= DELETE_OAUTH_CONFIRM_MS;
}

/**
 * If this user is past their deletion deadline, permanently delete them. Call this on
 * every authenticated entry point (login, /api/me, shell layout) so the account is
 * actually removed even without a cron. Returns true if the user was deleted.
 */
export async function applyDueDeletion(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deleteAt: true },
  });
  if (!user?.deleteAt) return false;
  if (user.deleteAt.getTime() > Date.now()) return false;
  // Deadline passed — delete the account (related rows cascade).
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  return true;
}
