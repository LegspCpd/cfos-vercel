import { cookies } from 'next/headers';
import AppShell from '@/components/AppShell';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolvePermissions } from '@/lib/permissions';

// All pages wrapped in the sidebar shell (except login/signup/workspace editor).
// Server-side: read the session cookie and resolve the user's group permissions so the
// sidebar (Admin / Users entries) renders immediately instead of waiting for a client
// /api/me round-trip.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  let initialPermissions: string[] = [];
  let initialGroup: string | null = null;

  try {
    const token = cookies().get('token')?.value;
    if (token) {
      const session = await verifySessionToken(token);
      if (session) {
        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          include: { group: { select: { permissions: true, name: true } } },
        });
        if (user) {
          initialPermissions = resolvePermissions(user);
          initialGroup = user.group?.name ?? null;
        }
      }
    }
  } catch {
    // Not logged in / invalid token — the client AppShell will redirect to login.
  }

  return (
    <AppShell initialPermissions={initialPermissions} initialGroup={initialGroup}>
      {children}
    </AppShell>
  );
}
