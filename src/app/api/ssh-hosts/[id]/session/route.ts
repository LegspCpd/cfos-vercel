import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createSession, getSession, deleteSession } from '@/lib/ssh-session';
import { sshLimiter } from '@/lib/rate-limit';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

// POST /api/ssh-hosts/:id/session — open a persistent session for a host.
// Returns { session: { id, hostId, cwd, env, history, createdAt, lastActiveAt } }.
// The session lives in server memory; commands are run through
// POST /api/ssh-hosts/:id/session/:sessionId/exec which restores cwd + env first.
export async function POST(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Cap session creation per user.
  if (sshLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const s = createSession(host.id);
  return NextResponse.json({
    session: {
      id: s.id,
      hostId: s.hostId,
      cwd: s.cwd,
      env: s.env,
      history: s.history,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    },
  });
}

// GET /api/ssh-hosts/:id/session — list the current user's live sessions for this host.
export async function GET(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  // Sessions are in-memory; we can't enumerate by host without a registry, so return
  // an empty list here. The client tracks its own session ids.
  return NextResponse.json({ sessions: [] });
}

// DELETE /api/ssh-hosts/:id/session/:sessionId — close a session.
export async function DELETE(req: Request, props: { params: Promise<{ id: string; sessionId: string }> }) {
  const params = await props.params;
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const s = getSession(params.sessionId);
  if (!s || s.hostId !== host.id) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }
  deleteSession(params.sessionId);
  return NextResponse.json({ ok: true });
}