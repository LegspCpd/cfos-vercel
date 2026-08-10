import { prisma } from './db';
import { ensureDefaultGroups, DEFAULT_GROUP, SUPER_ADMIN_GROUP } from './groups';

// ADMIN_USERNAME may be a single username or a comma-separated list, e.g.
//   ADMIN_USERNAME="admin,ops"
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
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, isAdmin: true },
  });
  if (!user) return false;
  if (user.isAdmin) return true;
  return adminUsernameSet().has(user.username.toLowerCase());
}

// Ensure the default groups exist, then put every admin (isAdmin=true or in ADMIN_USERNAME)
// into the super-admin group and everyone else without a group into the default group.
export async function syncUserGroups(): Promise<void> {
  const superGroupId = await ensureDefaultGroups();
  const defaultGroup = await prisma.userGroup.findUnique({ where: { name: DEFAULT_GROUP } });
  if (!defaultGroup) return;
  const defaultGroupId = defaultGroup.id;

  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  const envAdmins = await prisma.user.findMany({
    where: { username: { in: Array.from(adminUsernameSet()) } },
    select: { id: true },
  });
  const adminIds = new Set([...admins.map((u) => u.id), ...envAdmins.map((u) => u.id)]);

  // Move all admins into the super-admin group.
  if (adminIds.size > 0) {
    await prisma.user.updateMany({ where: { id: { in: Array.from(adminIds) } }, data: { groupId: superGroupId } });
  }

  // Everyone still without a group goes into the default group.
  await prisma.user.updateMany({ where: { groupId: null }, data: { groupId: defaultGroupId } });
}

// Persist isAdmin + super-admin group for any user whose username is in ADMIN_USERNAME.
export async function promoteEnvAdmins(): Promise<void> {
  const set = adminUsernameSet();
  if (set.size === 0) {
    await syncUserGroups();
    return;
  }
  await prisma.user.updateMany({
    where: { username: { in: Array.from(set) } },
    data: { isAdmin: true },
  });
  await syncUserGroups();
}

// Ensure there is always at least one admin. If NO admin exists at all, the first
// created user becomes the bootstrap admin + super-admin group (so a fresh install isn't locked out).
export async function maybeBootstrapAdmin(username: string): Promise<void> {
  const anyAdmin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (!anyAdmin) {
    await prisma.user.updateMany({ where: { username }, data: { isAdmin: true } });
  }
  await syncUserGroups();
}
