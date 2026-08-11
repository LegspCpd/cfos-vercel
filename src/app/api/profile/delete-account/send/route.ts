import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { issueVerificationCode } from '@/lib/verification';
import { resendConfigured } from '@/lib/email';
import { emailSendLimiter } from '@/lib/rate-limit';
import { z } from 'zod';

const sendSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});

// POST /api/profile/delete-account/send — send a verification code to the user's bound
// email, confirming ownership before they can request account deletion. The email must
// match the account's own bound address.
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = sendSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    if (emailSendLimiter.tryCall(email) <= 0) {
      return NextResponse.json({ error: '发送过于频繁，请稍后再试' }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.email) {
      return NextResponse.json({ error: '该账号尚未绑定邮箱，无法注销' }, { status: 400 });
    }
    if (user.email.toLowerCase() !== email) {
      return NextResponse.json({ error: '该邮箱与当前绑定邮箱不一致' }, { status: 400 });
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
    console.error('delete-account send error', e);
    const msg = e instanceof Error ? e.message : '未知错误';
    const friendly = msg.includes('Resend error') ? `邮件服务发送失败：${msg.slice(0, 300)}` : '发送验证码失败';
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
