import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createSessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { writeAudit } from '@/lib/audit';
import { applyDueDeletion } from '@/lib/account-deletion';
import { clientIp } from '@/lib/ip';
import { z } from 'zod';

const loginSchema = z.object({
  // Accept either "identifier" (new) or "username" (legacy). identifier may be a
  // username OR an email address.
  identifier: z.string().min(1).max(128).optional(),
  username: z.string().min(1).max(128).optional(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const identifier = (body.identifier ?? body.username ?? '').trim().toLowerCase();
    const ip = clientIp(req);

    // Resolve the user by email (case-insensitive) first, then by username.
    let user =
      (await prisma.user.findFirst({
        where: { email: { equals: identifier, mode: 'insensitive' } },
      })) ??
      (await prisma.user.findUnique({ where: { username: identifier } }));
    if (!user) {
      await writeAudit({ username: identifier, action: 'auth.login_failed', detail: 'User not found', ip });
      return NextResponse.json({ error: 'Invalid username/email or password' }, { status: 401 });
    }
    // If the deletion deadline passed, remove the account before authenticating — the
    // freed email/username then allow re-registration.
    if (await applyDueDeletion(user.id)) {
      return NextResponse.json({ error: '该账号已注销，可重新注册' }, { status: 401 });
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      await writeAudit({ userId: user.id, username: user.username, action: 'auth.login_failed', detail: 'Wrong password', ip });
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const isAdmin = user.isAdmin || (await isUserAdmin(user.id));
    const token = await createSessionToken({ userId: user.id, username: user.username });
    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'auth.login',
      detail: `User signed in${isAdmin ? ' (admin)' : ''}`,
      ip,
    });
    return NextResponse.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('login error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
