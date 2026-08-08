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

// GET /api/providers — list AI providers (admin only).
// Deliberately does not return apiKey (secret) in the list.
export async function GET(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      isEnabled: p.isEnabled,
      // Mask the key: show only last 4 chars.
      apiKeyMasked: p.apiKey ? `••••${p.apiKey.slice(-4)}` : '',
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(64),
  baseUrl: z.string().min(1).max(500),
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(128),
  isEnabled: z.boolean().optional(),
});

// POST /api/providers — add a new AI provider.
export async function POST(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = createSchema.parse(await req.json());
  const provider = await prisma.aiProvider.create({
    data: {
      name: body.name,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
      isEnabled: body.isEnabled ?? true,
    },
  });
  return NextResponse.json({ provider: { id: provider.id } }, { status: 201 });
}
