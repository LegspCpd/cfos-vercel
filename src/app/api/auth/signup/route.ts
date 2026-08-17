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
import { signupLimiter } from '@/lib/rate-limit';
import { clientIp } from '@/lib/ip';

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
    // Rate-limit signups per IP (the only identity available pre-auth). Stops
    // registration bombs / mass account creation from a single source.
    const ip = clientIp(req) ?? 'unknown';
    if (signupLimiter.tryCall(`signup:${ip}`) <= 0) {
      return NextResponse.json({ error: 'Too many signup attempts. Try again later.' }, { status: 429 });
    }

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
        if (!body.captchaToken) {
          return NextResponse.json({ error: '请完成人机验证' }, { status: 400 });
        }
        try {
          await verifyCaptcha(effective, body.captchaToken);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Human verification failed';
          return NextResponse.json(
            { error: msg.startsWith('Human verification failed') ? '人机验证未通过，请重试' : msg },
            { status: 400 },
          );
        }
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

    // Concurrency-safe: the existence checks above are a fast path, but a unique
    // constraint (P2002) is the real authority. Handle the race cleanly.
    let user;
    try {
      user = await prisma.user.create({
        data: { username, displayName, passwordHash, email: email ?? null },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
      throw e;
    }

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
    // Log full details server-side only; return a generic message so internal error
    // details (DB strings, stack traces) are never leaked to the client.
    console.error('signup error', e);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}

// Prisma throws a unique-constraint violation with code P2002 (e.g. two concurrent
// signups both passing the existence check). Turn it into a clean 409.
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'P2002'
  );
}
