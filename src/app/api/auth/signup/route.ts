import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSessionToken } from '@/lib/auth';
import { areSignupsEnabled, getPublicCaptchaConfig } from '@/lib/settings';
import { maybeBootstrapAdmin, promoteEnvAdmins } from '@/lib/admin';
import { writeAudit } from '@/lib/audit';
import { verifyCode } from '@/lib/verification';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { z } from 'zod';

const signupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_.-]+$/i, 'Only letters, numbers, dot, dash, underscore').optional(),
  displayName: z.string().min(1).max(64).default(''),
  password: z.string().min(6).max(128),
  // Email-code signup (optional). When present, verificationCode is required.
  email: z.string().email('请输入有效的邮箱地址').optional(),
  verificationCode: z.string().min(4).max(8).optional(),
  // Human verification (optional, enforced when the admin has configured a provider).
  captchaProvider: z.enum(['turnstile', 'recaptcha']).optional(),
  captchaToken: z.string().min(1).optional(),
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

    // Human verification: if the admin configured Turnstile and/or reCAPTCHA, enforce it.
    const captcha = await getPublicCaptchaConfig();
    if (captcha.turnstileEnabled || captcha.recaptchaEnabled) {
      // If only one provider is enabled, force that one; if both, accept the reported one
      // (the client randomizes between them and tells us which it used).
      const effective: CaptchaProvider | null =
        captcha.turnstileEnabled && captcha.recaptchaEnabled
          ? body.captchaProvider === 'turnstile'
            ? 'turnstile'
            : 'recaptcha'
          : captcha.turnstileEnabled
            ? 'turnstile'
            : captcha.recaptchaEnabled
              ? 'recaptcha'
              : null;
      if (effective) {
        await verifyCaptcha(effective, body.captchaToken);
      }
    }

    // Email-code signup: if email is provided, the code must verify against it.
    let email: string | undefined;
    if (body.email) {
      email = body.email.trim().toLowerCase();
      // Case-insensitive so a previously mixed-case email still blocks re-registration.
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
      }
      if (!body.verificationCode) {
        return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 });
      }
      const ok = await verifyCode(email, body.verificationCode);
      if (!ok) {
        return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 });
      }
    }

    // Derive a username: provided one, or from the email prefix, or a random slug.
    let username = (body.username || '').trim().toLowerCase();
    if (!username) {
      if (email) {
        username = email.split('@')[0].replace(/[^a-z0-9_.-]/g, '').slice(0, 32) || 'user';
      } else {
        username = 'user';
      }
      // Ensure uniqueness by appending a short suffix if needed.
      let candidate = username;
      let i = 1;
      while (await prisma.user.findUnique({ where: { username: candidate } })) {
        candidate = `${username.slice(0, 24)}_${i++}`;
      }
      username = candidate;
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);
    const displayName = body.displayName || username;

    const user = await prisma.user.create({
      data: { username, displayName, passwordHash, email: email ?? null },
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
      detail: `New user registered${email ? ` (email ${email})` : ''}${isAdmin ? ' (admin)' : ''}`,
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
