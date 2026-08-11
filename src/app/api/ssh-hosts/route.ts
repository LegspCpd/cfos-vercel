import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/credentials';
import { z } from 'zod';
import { cachedJson, invalidateCache } from '@/lib/kv-cache';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(100),
  // Credential fields (optional): password OR privateKey (+ optional passphrase).
  password: z.string().max(4096).optional(),
  privateKey: z.string().max(65536).optional(),
  passphrase: z.string().max(1024).optional(),
  authMethod: z.enum(['password', 'key', 'keypassphrase']).default('password'),
  saveCreds: z.boolean().default(true),
});

// GET /api/ssh-hosts — list the current user's SSH hosts (never exposes secrets).
// Cached per-user in KV: host lists change rarely, and POST below invalidates the cache on
// change so it stays fresh.
export async function GET(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const hosts = await cachedJson(
    'sshhosts',
    session.userId,
    () =>
      prisma.sshHost.findMany({
        where: { ownerId: session.userId },
        orderBy: { updatedAt: 'desc' },
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
          createdAt: true,
          updatedAt: true,
        },
      }),
    { ttlSeconds: Number(process.env.KV_SSH_HOSTS_TTL) || 10 },
  );
  return NextResponse.json({ hosts });
}

// POST /api/ssh-hosts — create a new SSH host. Secrets are encrypted (or omitted when
// saveCreds is false, meaning the credential is only used transiently by the test/connect).
export async function POST(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }
  const d = parsed.data;

  // Build the secret to encrypt (password or private key + passphrase). When saveCreds
  // is false we still store a sentinel-less row but DO NOT persist the credential.
  let encryptedSecret: string | null = null;
  if (d.saveCreds) {
    if (d.authMethod === 'password' && d.password) {
      encryptedSecret = encryptSecret(d.password);
    } else if ((d.authMethod === 'key' || d.authMethod === 'keypassphrase') && d.privateKey) {
      const secret = d.passphrase ? `${d.privateKey}\n__PASSPHRASE__\n${d.passphrase}` : d.privateKey;
      encryptedSecret = encryptSecret(secret);
    }
  }

  await invalidateCache('sshhosts', session.userId);

  const host = await prisma.sshHost.create({
    data: {
      ownerId: session.userId,
      name: d.name.trim(),
      host: d.host.trim(),
      port: d.port,
      username: d.username.trim(),
      authMethod: d.authMethod,
      saveCreds: d.saveCreds,
      encryptedSecret,
      hasCredential: Boolean(encryptedSecret || d.password || d.privateKey),
    },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      username: true,
      authMethod: true,
      saveCreds: true,
      hasCredential: true,
    },
  });

  return NextResponse.json({ host }, { status: 201 });
}
