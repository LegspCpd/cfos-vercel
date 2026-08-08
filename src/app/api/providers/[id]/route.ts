import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const admin = await isUserAdmin(session.userId);
  if (!admin) return null;
  return session;
}

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  baseUrl: z.string().min(1).max(500).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  model: z.string().min(1).max(128).optional(),
  isEnabled: z.boolean().optional(),
});

// PATCH /api/providers/:id — update a provider (name/baseUrl/model/enabled; apiKey optional).
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = patchSchema.parse(await req.json());
  await prisma.aiProvider.updateMany({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/providers/:id
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.aiProvider.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
