import { prisma } from './db';

// A user is an admin if:
//  1. Their username matches ADMIN_USERNAME (from env), OR
//  2. They are the first user ever created in the system (bootstrap admin), OR
//  3. isAdmin flag is set on the record.
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, isAdmin: true } });
  if (!user) return false;
  if (user.isAdmin) return true;

  const envAdmin = process.env.ADMIN_USERNAME;
  if (envAdmin && user.username.toLowerCase() === envAdmin.trim().toLowerCase()) {
    return true;
  }

  // Bootstrap: the very first user is an admin.
  const first = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return first?.id === userId;
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
