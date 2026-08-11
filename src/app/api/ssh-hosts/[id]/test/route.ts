import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSshConfig, connect, close } from '@/lib/ssh';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/ssh-hosts/:id/test — open a short SSH session to verify the host is
// reachable and the credentials work. Never exposes the credential; returns only ok/error.
export async function POST(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const { config, error } = buildSshConfig(host, {
    password: typeof body.password === 'string' ? body.password : undefined,
    privateKey: typeof body.privateKey === 'string' ? body.privateKey : undefined,
    passphrase: typeof body.passphrase === 'string' ? body.passphrase : undefined,
  });
  if (error || !config) {
    return NextResponse.json({ ok: false, error: error || 'Invalid configuration' }, { status: 400 });
  }

  try {
    const conn = await connect(config, 20000);
    close(conn);
    return NextResponse.json({ ok: true, message: 'Connected successfully' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Connection failed' });
  }
}
