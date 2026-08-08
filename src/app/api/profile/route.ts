import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { z } from 'zod';

// PATCH /api/profile — update displayName and/or password.
const patchSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).max(128).optional(),
});

export async function PATCH(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = patchSchema.parse(await req.json());
  const data: { displayName?: string; passwordHash?: string } = {};

  if (body.displayName) {
    data.displayName = body.displayName;
  }

  if (body.newPassword) {
    // Changing password requires the current password.
    if (!body.currentPassword) {
      return NextResponse.json({ error: 'Current password is required to change password.' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const ok = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    data.passwordHash = await hashPassword(body.newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { displayName: true, username: true },
  });

  return NextResponse.json({ user: updated });
}
