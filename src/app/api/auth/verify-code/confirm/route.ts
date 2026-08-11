import { NextResponse } from 'next/server';
import { verifyCode } from '@/lib/verification';
import { emailConfirmLimiter } from '@/lib/rate-limit';
import { z } from 'zod';

const confirmSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  code: z.string().min(4).max(8),
});

// POST /api/auth/verify-code/confirm — check a submitted code before creating the account.
// Body: { email, code }. Returns { valid: true } on success (code is consumed).
export async function POST(req: Request) {
  try {
    const body = confirmSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    // Brute-force guard: cap confirm attempts per email so an attacker can't enumerate
    // a 6-digit code (1,000,000 combos) in the 10-min window.
    if (emailConfirmLimiter.tryCall(email) <= 0) {
      return NextResponse.json({ error: '尝试次数过多，请稍后再试或重新获取验证码' }, { status: 429 });
    }

    const valid = await verifyCode(email, body.code);
    if (!valid) {
      return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 });
    }
    return NextResponse.json({ valid: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('confirm verify-code error', e);
    return NextResponse.json({ error: '验证失败' }, { status: 500 });
  }
}
