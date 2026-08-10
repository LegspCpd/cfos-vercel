import { NextResponse } from 'next/server';
import { verifyCode } from '@/lib/verification';
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
