import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSessionToken } from '@/lib/auth';
import { areSignupsEnabled } from '@/lib/settings';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

const signupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_.-]+$/i, 'Only letters, numbers, dot, dash, underscore'),
  displayName: z.string().min(1).max(64).default(''),
  password: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  try {
    // Registration is gated by the admin-controlled "signups enabled" switch.
    // Exception: if there are ZERO users yet, allow the first (bootstrap) account.
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      const enabled = await areSignupsEnabled();
      if (!enabled) {
        return NextResponse.json(
          { error: 'Public signups are currently disabled. Ask an administrator to enable them.' },
          { status: 403 },
        );
      }
    }

    const body = signupSchema.parse(await req.json());
    const username = body.username.trim().toLowerCase();

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);
    const displayName = body.displayName || body.username;

    const user = await prisma.user.create({
      data: { username, displayName, passwordHash },
    });

    // The first user ever created becomes the bootstrap admin.
    await maybeBootstrapAdmin(user.username);
    // Any user whose username is listed in ADMIN_USERNAME also becomes an admin.
    await promoteEnvAdmins();

    const isAdmin = user.isAdmin || userCount === 0;
    const token = await createSessionToken({ userId: user.id, username: user.username });
    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'auth.signup',
      detail: `New user registered${isAdmin ? ' (admin)' : ''}`,
    });
    return NextResponse.json(
      { token, user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('signup error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
