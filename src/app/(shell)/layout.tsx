import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolvePermissions } from '@/lib/permissions';

const TOKEN_KEY = 'cfos_token';

// All pages wrapped in the sidebar shell (except login/signup/workspace editor).
// Server-side auth gate: read the session cookie and, if there's no valid session,
// redirect straight to /login — so unauthenticated users NEVER see the home page
// first (no flash of the app before bouncing to login). Also resolves the user's
// group permissions so the sidebar (Admin / Users entries) renders immediately.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  let initialPermissions: string[] = [];
  let initialGroup: string | null = null;

  const token = (await cookies()).get(TOKEN_KEY)?.value;
  if (!token) {
    redirect('/login'); // not logged in → straight to login, never render home
  }

  const session = await verifySessionToken(token); // never throws (returns null)
  if (!session) {
    redirect('/login'); // invalid/expired token
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { group: { select: { permissions: true, name: true } } },
    });
    if (!user) {
      redirect('/login'); // user deleted
    }
    // OAuth-created accounts must complete their profile before using the app.
    // /profile/complete is outside this shell, so redirecting there is safe (no loop).
    if (!user.profileComplete) {
      redirect('/profile/complete');
    }
    initialPermissions = resolvePermissions(user);
    initialGroup = user.group?.name ?? null;
  } catch {
    // DB error — let the client-side AppShell handle it (fall back to empty shell).
  }

  return (
    <AppShell initialPermissions={initialPermissions} initialGroup={initialGroup}>
      {children}
    </AppShell>
  );
}
