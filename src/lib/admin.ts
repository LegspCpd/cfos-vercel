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
//  1. Their username is in ADMIN_USERNAME (comma-separated env list), OR
//  2. They are the first user ever created in the system (bootstrap admin), OR
//  3. isAdmin flag is set on the record.
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, isAdmin: true },
  });
  if (!user) return false;
  if (user.isAdmin) return true;

  if (adminUsernameSet().has(user.username.toLowerCase())) {
    return true;
  }

  // Bootstrap: the very first user is an admin.
  const first = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return first?.id === userId;
}

// Persist isAdmin for any user whose username is in ADMIN_USERNAME. Run on signup so
// admins declared via env don't need the bootstrap rule to hold forever.
export async function promoteEnvAdmins(): Promise<void> {
  const set = adminUsernameSet();
  if (set.size === 0) return;
  await prisma.user.updateMany({
    where: { username: { in: Array.from(set) } },
    data: { isAdmin: true },
  });
}

// Ensure the first user created gets the isAdmin flag persisted.
export async function maybeBootstrapAdmin(username: string): Promise<void> {
  const count = await prisma.user.count();
  if (count === 1) {
    await prisma.user.updateMany({
      where: { username },
      data: { isAdmin: true },
    });
  }
}
