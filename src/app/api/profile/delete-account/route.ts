import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { verifyCode } from '@/lib/verification';
import { getPublicCaptchaConfig } from '@/lib/settings';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { deletionDeadline, applyDueDeletion } from '@/lib/account-deletion';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';
import { profileLimiter } from '@/lib/rate-limit';

// POST /api/profile/delete-account — request account deletion. Verifies the code sent to
// the bound email + a human-verification challenge, then puts the account on a 4–7 day
// cooldown (deleteAt). The user can cancel during the cooldown; after it passes the
// account is removed.
const deleteSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  code: z.string().min(4).max(8),
  captchaProvider: z.enum(['turnstile', 'recaptcha']).optional(),
  captchaToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    // Cap account-deletion attempts per user.
    if (profileLimiter.tryCall(session.userId) <= 0) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }
    // If the deletion deadline already passed, remove the account first (it's already gone).
    if (await applyDueDeletion(session.userId)) {
      return NextResponse.json({ error: 'Account has been deleted' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.email) {
      return NextResponse.json({ error: '该账号尚未绑定邮箱，无法注销' }, { status: 400 });
    }

    const body = deleteSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();
    if (user.email.toLowerCase() !== email) {
      return NextResponse.json({ error: '该邮箱与当前绑定邮箱不一致' }, { status: 400 });
    }

    // Human verification.
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

    // Verify the ownership code sent to the bound email.
    const ok = await verifyCode(email, body.code);
    if (!ok) {
      return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 });
    }

    const now = new Date();
    const deleteAt = deletionDeadline();
    await prisma.user.update({
      where: { id: user.id },
      data: { deleteRequestedAt: now, deleteAt },
    });

    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'account.delete_request',
      detail: `Account deletion scheduled for ${deleteAt.toISOString()}`,
    });

    return NextResponse.json({ ok: true, deleteAt: deleteAt.toISOString() });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('delete-account error', e);
    return NextResponse.json({ error: '注销失败，请稍后再试' }, { status: 500 });
  }
}
