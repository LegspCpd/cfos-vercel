import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSshConfig, connectWithRetry, close, exec } from '@/lib/ssh';
import {
  getSession,
  touchSession,
  recordCommand,
  setSessionCwd,
  applySessionEnv,
  buildSessionPrefix,
  parsePwdOutput,
  parseEnvOutput,
} from '@/lib/ssh-session';
import { sshLimiter } from '@/lib/rate-limit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string; sessionId: string } };

// POST /api/ssh-hosts/:id/session/:sessionId/exec — run a command inside a persistent
// session. The session's cwd + env are restored before the command runs, and the new cwd
// is probed afterwards so the next command continues where this one left off.
// Streams output over SSE, same as the one-shot exec endpoint.
export async function POST(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Cap SSH exec per user (each opens a connection to their host).
  if (sshLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const s = getSession(params.sessionId);
  if (!s || s.hostId !== host.id) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }

  let body: { command?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { command?: string };
  } catch {
    body = {};
  }
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  if (!command) return NextResponse.json({ error: 'No command provided' }, { status: 400 });
  if (command.length > 20000) return NextResponse.json({ error: 'Command too long' }, { status: 400 });

  const { config, error } = buildSshConfig(host);
  if (error || !config) {
    return NextResponse.json({ ok: false, error: error || 'No credential' }, { status: 400 });
  }

  // Restore cwd + env, then run the command, then probe the new cwd.
  const prefix = buildSessionPrefix(s);
  const fullCommand = prefix ? `${prefix} && ${command}` : command;
  // Probe cwd after the command: `pwd` in a subshell so it can't affect the session.
  const probeCommand = `${fullCommand}; pwd`;

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
        const conn = await connectWithRetry(config, {
          attempts: 5,
          timeoutMs: 10000,
          intervalMs: 1000,
        });
        try {
          // Run the command + pwd probe in one SSH session.
          const result = await exec(conn, probeCommand, (chunk) => {
            // The trailing `pwd` output is stripped below; everything else streams live.
            send({ type: 'data', text: chunk.toString('utf8') });
          });
          // The last non-empty line of combined output is the probe's pwd result.
          const lines = (result.stdout + result.stderr)
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          const probeLine = lines[lines.length - 1] ?? '';
          const newCwd = parsePwdOutput(probeLine);
          if (newCwd) setSessionCwd(s.id, newCwd);
          // Parse `export` lines from the output to capture env changes.
          applySessionEnv(s.id, parseEnvOutput(result.stdout));
          touchSession(s.id);
          recordCommand(s.id, command);
          send({ type: 'exit', code: result.code, cwd: newCwd });
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
      'X-Accel-Buffering': 'no',
    },
  });
}