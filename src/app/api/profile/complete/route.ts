import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { verifyCode } from '@/lib/verification';
import { getPublicCaptchaConfig } from '@/lib/settings';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

// POST /api/profile/complete — required onboarding step for accounts created via a
// third-party (OAuth) login. The user must pick a username, set a password, and pass a
// human-verification challenge before the session is allowed to continue into the app.
// Binding an email is optional but recommended (it later enables the "change email" flow).
const completeSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_.-]+$/i, '用户名只能包含字母、数字、点、下划线或短横线'),
  newPassword: z.string().min(6).max(128),
  email: z.string().email('请输入有效的邮箱地址').optional(),
  verificationCode: z.string().min(4).max(8).optional(),
  captchaProvider: z.enum(['turnstile', 'recaptcha']).optional(),
  captchaToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.profileComplete) {
      return NextResponse.json({ error: 'Profile is already complete.' }, { status: 400 });
    }

    const body = completeSchema.parse(await req.json());

    // Human verification — enforced whenever the admin configured a provider.
    const captcha = await getPublicCaptchaConfig();
    if (captcha.turnstileEnabled || captcha.recaptchaEnabled) {
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
        } catch {
          return NextResponse.json({ error: '人机验证未通过，请重试' }, { status: 400 });
        }
      }
    }

    // Optional email binding — verify the code if an email is supplied.
    let email: string | null = user.email;
    if (body.email) {
      email = body.email.trim().toLowerCase();
      const taken = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } },
        select: { id: true },
      });
      if (taken) return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
      if (!body.verificationCode) {
        return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 });
      }
      const ok = await verifyCode(email, body.verificationCode);
      if (!ok) return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 });
    }

    const username = body.username.trim().toLowerCase();
    if (username !== user.username) {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (exists) return NextResponse.json({ error: '该用户名已被使用' }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.newPassword);
    let updated;
    try {
      updated = await prisma.user.update({
        where: { id: user.id },
        data: { username, passwordHash, email, profileComplete: true },
        select: { id: true, username: true, displayName: true, email: true },
      });
    } catch (e) {
      // Concurrent completion / email race hit a unique constraint.
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: '该用户名或邮箱已被使用' }, { status: 409 });
      }
      throw e;
    }

    await writeAudit({
      userId: user.id,
      username: updated.username,
      action: 'auth.profile.complete',
      detail: `Completed onboarding${email ? ` (email ${email})` : ''}`,
    });

    return NextResponse.json({ user: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('profile complete error', e);
    const hint = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: `Server error: ${hint}` }, { status: 500 });
  }
}
