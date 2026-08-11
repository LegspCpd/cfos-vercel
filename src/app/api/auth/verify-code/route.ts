import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { issueVerificationCode } from '@/lib/verification';
import { resendConfigured } from '@/lib/email';
import { emailSendLimiter } from '@/lib/rate-limit';
import { z } from 'zod';

const sendSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});

// POST /api/auth/verify-code — send a verification code to an email address.
// Body: { email }. Returns { ok } .
export async function POST(req: Request) {
  try {
    const body = sendSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    // Rate-limit sends per email so an attacker can't spam a mailbox.
    if (emailSendLimiter.tryCall(email) <= 0) {
      // Return the same "ok" shape so we don't leak rate-limit internals to attackers.
      return NextResponse.json({ ok: true });
    }

    // Anti-enumeration: if the email is already registered, return the SAME success
    // response as a fresh send WITHOUT actually sending anything. This prevents both
    // account probing (registered vs not) and email-bombing of existing addresses.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true });
    }

    if (!resendConfigured()) {
      return NextResponse.json({ error: '邮件服务未配置（缺少 RESEND_API_KEY）' }, { status: 500 });
    }

    const { sent } = await issueVerificationCode(email);
    if (!sent) {
      return NextResponse.json({ error: '邮件发送失败，请稍后再试' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('send verify-code error', e);
    // Surface a friendly but specific message so the operator can see whether it's a
    // missing/expired key, an unverified sender domain, etc. Never expose the key itself.
    const msg = e instanceof Error ? e.message : '未知错误';
    const friendly = msg.includes('Resend error')
      ? `邮件服务发送失败：${msg.slice(0, 300)}`
      : '发送验证码失败';
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
