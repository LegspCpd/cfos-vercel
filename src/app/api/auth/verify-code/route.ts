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
    return NextResponse.json({ error: '发送验证码失败' }, { status: 500 });
  }
}
