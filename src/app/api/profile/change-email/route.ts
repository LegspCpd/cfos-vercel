import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { verifyCode } from '@/lib/verification';
import { getPublicCaptchaConfig } from '@/lib/settings';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

// POST /api/profile/change-email — change the user's bound email.
// Requires verifying BOTH the old email (ownership) and the new email (validity), plus
// a human-verification challenge. Enforces that the new email isn't used by another user.
const changeSchema = z.object({
  oldEmail: z.string().email('请输入有效的原邮箱地址'),
  oldCode: z.string().min(4).max(8),
  newEmail: z.string().email('请输入有效的新邮箱地址'),
  newCode: z.string().min(4).max(8),
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
    if (!user.email) {
      return NextResponse.json({ error: '该账号尚未绑定邮箱' }, { status: 400 });
    }

    const body = changeSchema.parse(await req.json());
    const oldEmail = body.oldEmail.trim().toLowerCase();
    const newEmail = body.newEmail.trim().toLowerCase();

    // The old email must be the user's own bound email.
    if (user.email.toLowerCase() !== oldEmail) {
      return NextResponse.json({ error: '原邮箱与当前绑定邮箱不一致' }, { status: 400 });
    }
    if (newEmail === oldEmail) {
      return NextResponse.json({ error: '新邮箱不能与原邮箱相同' }, { status: 400 });
    }

    // Human verification — enforced whenever a provider is configured.
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

    // Verify the old-email ownership code.
    const oldOk = await verifyCode(oldEmail, body.oldCode);
    if (!oldOk) {
      return NextResponse.json({ error: '原邮箱验证码无效或已过期' }, { status: 400 });
    }
    // Verify the new-email code.
    const newOk = await verifyCode(newEmail, body.newCode);
    if (!newOk) {
      return NextResponse.json({ error: '新邮箱验证码无效或已过期' }, { status: 400 });
    }

    // The new email must not belong to another account (case-insensitive).
    const taken = await prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' }, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
    }

    try {
      await prisma.user.update({ where: { id: user.id }, data: { email: newEmail } });
    } catch (e) {
      // The taken-check above is best-effort; a concurrent change or a case-variant
      // of the email can still trip the unique index. Surface a clean 409.
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
      }
      throw e;
    }
    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'profile.email.change',
      detail: `Changed bound email from ${oldEmail} to ${newEmail}`,
    });

    return NextResponse.json({ ok: true, email: newEmail });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('change-email error', e);
    return NextResponse.json({ error: '更改邮箱失败，请稍后再试' }, { status: 500 });
  }
}
