import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/credentials';
import { z } from 'zod';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(100).optional(),
  authMethod: z.enum(['password', 'key', 'keypassphrase']).optional(),
  password: z.string().max(4096).optional(),
  privateKey: z.string().max(65536).optional(),
  passphrase: z.string().max(1024).optional(),
  saveCreds: z.boolean().optional(),
});

// PATCH /api/ssh-hosts/:id — update a host (ownership-checked).
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const existing = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!existing) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.host !== undefined) data.host = d.host.trim();
  if (d.port !== undefined) data.port = d.port;
  if (d.username !== undefined) data.username = d.username.trim();

  const save = d.saveCreds ?? existing.saveCreds;

  // Credential handling: re-encrypt only when a new secret is supplied. If the user sets
  // saveCreds to false, we drop the stored credential (no plaintext retained).
  if (d.password) {
    data.authMethod = 'password';
    if (save) {
      data.encryptedSecret = encryptSecret(d.password);
      data.hasCredential = true;
    } else {
      data.encryptedSecret = null;
      data.hasCredential = false;
    }
  } else if (d.privateKey) {
    data.authMethod = d.authMethod ?? 'key';
    if (save) {
      const secret = d.passphrase ? `${d.privateKey}\n__PASSPHRASE__\n${d.passphrase}` : d.privateKey;
      data.encryptedSecret = encryptSecret(secret);
      data.hasCredential = true;
    } else {
      data.encryptedSecret = null;
      data.hasCredential = false;
    }
  } else if (d.saveCreds === false && existing.saveCreds) {
    // Explicitly opting out of saving — remove any stored credential.
    data.encryptedSecret = null;
    data.hasCredential = false;
  }
  if (d.authMethod !== undefined && d.authMethod !== 'password' && d.authMethod !== 'key') {
    data.authMethod = d.authMethod;
  }

  const host = await prisma.sshHost.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      username: true,
      authMethod: true,
      saveCreds: true,
      hasCredential: true,
      country: true,
      region: true,
    },
  });
  return NextResponse.json({ host });
}

// DELETE /api/ssh-hosts/:id — remove a host (ownership-checked).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const existing = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!existing) return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  await prisma.sshHost.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
