import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSessionToken } from '@/lib/auth';
import { z } from 'zod';

const signupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_.-]+$/i, 'Only letters, numbers, dot, dash, underscore'),
  displayName: z.string().min(1).max(64).default(''),
  password: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  try {
    const body = signupSchema.parse(await req.json());
    const username = body.username.trim().toLowerCase();

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);
    const displayName = body.displayName || body.username;

    const user = await prisma.user.create({
      data: { username, displayName, passwordHash },
    });

    const token = await createSessionToken({ userId: user.id, username: user.username });
    return NextResponse.json(
      { token, user: { id: user.id, username: user.username, displayName: user.displayName } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('signup error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
