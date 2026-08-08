import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const username = body.username.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const isAdmin = user.isAdmin || (await isUserAdmin(user.id));
    const token = await createSessionToken({ userId: user.id, username: user.username });
    return NextResponse.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('login error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
