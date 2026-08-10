import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { issueVerificationCode } from '@/lib/verification';
import { resendConfigured } from '@/lib/email';
import { z } from 'zod';

const sendSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});

// POST /api/auth/verify-code — send a verification code to an email address.
// Body: { email }. Returns { ok, devCode? } (devCode only when Resend isn't configured).
export async function POST(req: Request) {
  try {
    const body = sendSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    // If this email already belongs to a user, block re-registration.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
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
