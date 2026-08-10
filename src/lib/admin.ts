import { prisma } from './db';

// ADMIN_USERNAME may be a single username or a comma-separated list, e.g.
//   ADMIN_USERNAME="LegspCpd,admin"
function adminUsernameSet(): Set<string> {
  const raw = process.env.ADMIN_USERNAME ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// A user is an admin if:
//  1. Their isAdmin flag is set on the record, OR
//  2. Their username is in ADMIN_USERNAME (comma-separated env list).
// NOTE: the historical "first user is always admin" bootstrap rule was removed because it
// kept granting admin to the very first account even if it was a normal user.
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, isAdmin: true },
  });
  if (!user) return false;
  if (user.isAdmin) return true;
  return adminUsernameSet().has(user.username.toLowerCase());
}

// Persist isAdmin for any user whose username is in ADMIN_USERNAME.
export async function promoteEnvAdmins(): Promise<void> {
  const set = adminUsernameSet();
  if (set.size === 0) return;
  await prisma.user.updateMany({
    where: { username: { in: Array.from(set) } },
    data: { isAdmin: true },
  });
}

// Ensure there is always at least one admin. If NO admin exists at all, the first
// created user becomes the bootstrap admin (so a fresh install isn't locked out).
export async function maybeBootstrapAdmin(username: string): Promise<void> {
  const anyAdmin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (!anyAdmin) {
    await prisma.user.updateMany({ where: { username }, data: { isAdmin: true } });
  }
}
