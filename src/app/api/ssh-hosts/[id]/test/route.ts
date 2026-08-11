import { NextResponse } from 'next/server';
import { Client } from 'ssh2';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/credentials';

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

  // Resolve the secret: stored (decrypt) or provided in this request (not persisted).
  let password: string | undefined;
  let privateKey: string | undefined;
  let passphrase: string | undefined;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const providedPassword = typeof body.password === 'string' ? body.password : undefined;
  const providedKey = typeof body.privateKey === 'string' ? body.privateKey : undefined;
  const providedPass = typeof body.passphrase === 'string' ? body.passphrase : undefined;

  if (host.encryptedSecret && host.hasCredential) {
    const secret = decryptSecret(host.encryptedSecret);
    if (secret) {
      const sep = secret.indexOf('\n__PASSPHRASE__\n');
      if (sep !== -1) {
        privateKey = secret.slice(0, sep);
        passphrase = secret.slice(sep + '\n__PASSPHRASE__\n'.length);
      } else if (host.authMethod === 'password') {
        password = secret;
      } else {
        privateKey = secret;
      }
    }
  }
  if (!password && !privateKey) {
    password = providedPassword;
    privateKey = providedKey;
    passphrase = providedPass;
  }

  const config: import('ssh2').ConnectConfig = {
    host: host.host,
    port: host.port,
    username: host.username,
    readyTimeout: 15000,
  };
  if (privateKey) {
    config.privateKey = privateKey;
    if (passphrase) config.passphrase = passphrase;
  } else if (password) {
    config.password = password;
  } else {
    return NextResponse.json({ ok: false, error: 'No credential provided for this host' }, { status: 400 });
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      resolve(NextResponse.json({ ok: false, error: 'Connection timed out' }));
    }, 20000);

    conn.on('ready', () => {
      clearTimeout(timer);
      conn.end();
      // Best-effort: record country/region from a geo lookup of the IP later; for now just ok.
      resolve(NextResponse.json({ ok: true, message: 'Connected successfully' }));
    });
    conn.on('error', (err) => {
      clearTimeout(timer);
      const msg = (err as Error).message || 'Connection failed';
      resolve(NextResponse.json({ ok: false, error: msg }));
    });
    conn.connect(config);
  });
}
