import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSshConfig, connectWithRetry, close, exec } from '@/lib/ssh';
import { sshLimiter } from '@/lib/rate-limit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/ssh-hosts/:id/exec — run a command on the host and stream its output back as
// a Server-Sent-Events (SSE) stream.
//
// WHY SSE (not WebSocket): this app deploys to Vercel serverless, where each invocation is
// a short-lived process and full-duplex WebSocket upgrades are not supported. SSE is a
// one-way streaming response over a normal HTTP request, so it works on serverless. Each
// "terminal" run is therefore a single command executed in one short SSH session — not an
// interactive shell (vim/top/htop cannot run here). Command-style workflows (scripts, file
// ops, installs, logs) work well.
//
// Security: the command is executed only on a host the user owns, using credentials the
// user already controls. It is intentionally NOT sandboxed beyond normal SSH — the user is
// acting on their own server.
export async function POST(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Cap SSH exec per user (each opens a connection to their host).
  if (sshLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  let body: { command?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { command?: string };
  } catch {
    body = {};
  }
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  if (!command) return NextResponse.json({ error: 'No command provided' }, { status: 400 });
  // Guard against absurdly long commands.
  if (command.length > 20000) return NextResponse.json({ error: 'Command too long' }, { status: 400 });

  const { config, error } = buildSshConfig(host);
  if (error || !config) {
    return NextResponse.json({ ok: false, error: error || 'No credential' }, { status: 400 });
  }

  // Streaming SSE response.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller may already be closed */
        }
      };
      try {
        // Establish the connection with retries so transient failures don't drop the
        // session mid-flight: up to 5 attempts, 10s each. On exhaustion we send a timeout
        // error (shown as a red line under the command line in the UI).
        const conn = await connectWithRetry(config, {
          attempts: 5,
          timeoutMs: 10000,
          intervalMs: 1000,
        });
        try {
          const result = await exec(conn, command, (chunk) => {
            send({ type: 'data', text: chunk.toString('utf8') });
          });
          send({ type: 'exit', code: result.code });
        } finally {
          close(conn);
        }
      } catch (e) {
        send({ type: 'error', text: (e as Error).message || 'Command failed' });
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering so output streams live
    },
  });
}
