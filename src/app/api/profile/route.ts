import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { verifyCode } from '@/lib/verification';
import { z } from 'zod';
import { profileLimiter } from '@/lib/rate-limit';

// PATCH /api/profile — update displayName, password, and/or bind an email.
const patchSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).max(128).optional(),
  // Bind an email to this account (must pass a valid verification code).
  email: z.string().email('请输入有效的邮箱地址').optional(),
  verificationCode: z.string().min(4).max(8).optional(),
});

export async function PATCH(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Cap profile mutations per user (password changes, email binds).
  if (profileLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const body = patchSchema.parse(await req.json());
  const data: { displayName?: string; passwordHash?: string; email?: string } = {};

  if (body.displayName) {
    data.displayName = body.displayName;
  }

  if (body.newPassword) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // A user may set a password WITHOUT the current one ONLY if they have no real
    // password yet (i.e. they signed up via OAuth and are completing their profile /
    // binding an email). If they already have a real password, the current one is
    // always required — even alongside an email+code, so a compromised session can't
    // silently change the password just because it can bind an email.
    const hasRealPassword = !user.passwordHash.endsWith('-oauth-no-password');
    if (hasRealPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: 'Current password is required to change password.' }, { status: 400 });
      }
      const ok = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
    data.passwordHash = await hashPassword(body.newPassword);
  }

  // Bind an email: verify the code, ensure it isn't taken by another account, then set it.
  if (body.email) {
    if (!body.verificationCode) {
      return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();

    const taken = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        id: { not: session.userId },
      },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
    }

    const ok = await verifyCode(email, body.verificationCode);
    if (!ok) {
      return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 });
    }
    data.email = email;
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { displayName: true, username: true, email: true },
  });

  return NextResponse.json({ user: updated });
}
