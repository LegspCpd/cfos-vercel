import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { getPublicCaptchaConfig } from '@/lib/settings';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { deletionDeadline, oauthConfirmFresh, applyDueDeletion } from '@/lib/account-deletion';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

// POST /api/profile/delete-account/oauth — request deletion for accounts WITHOUT a bound
// email. The user must first re-authenticate via one of their connected OAuth providers
// (which sets a short-lived `deleteOauthVerifiedAt` in the callback), then pass human
// verification here. On success the account enters the 4–7 day deletion cooldown.
const oauthDeleteSchema = z.object({
  captchaProvider: z.enum(['turnstile', 'recaptcha']).optional(),
  captchaToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    // If the deletion deadline already passed, remove the account first.
    if (await applyDueDeletion(session.userId)) {
      return NextResponse.json({ error: 'Account has been deleted' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.email) {
      return NextResponse.json({ error: '该账号已绑定邮箱，请使用邮箱验证码注销' }, { status: 400 });
    }

    // The user must have completed an OAuth re-authentication within the last 10 minutes.
    if (!oauthConfirmFresh(user.deleteOauthVerifiedAt)) {
      return NextResponse.json({ error: '请先通过第三方登录完成身份验证' }, { status: 400 });
    }

    const body = oauthDeleteSchema.parse(await req.json());

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

    const now = new Date();
    const deleteAt = deletionDeadline();
    await prisma.user.update({
      where: { id: user.id },
      data: { deleteRequestedAt: now, deleteAt, deleteOauthVerifiedAt: null },
    });

    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'account.delete_request',
      detail: `Account deletion scheduled via OAuth confirm for ${deleteAt.toISOString()}`,
    });

    return NextResponse.json({ ok: true, deleteAt: deleteAt.toISOString() });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('delete-account oauth error', e);
    return NextResponse.json({ error: '注销失败，请稍后再试' }, { status: 500 });
  }
}
