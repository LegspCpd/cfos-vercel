import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/liveblocks/auth — issue a Liveblocks ID-token for the current user.
//
// Liveblocks uses ID tokens (JWT signed with the Liveblocks secret key) to authenticate
// clients. The token carries the user id + info so other collaborators see a name/avatar.
// Rooms are scoped per workspace: `cfos-ws-<workspaceId>`. Only users who can access the
// workspace (owner, write or read collaborator) may join its room.
//
// Env: LIVEBLOCKS_SECRET_KEY (required to enable realtime collaboration; when missing the
// endpoint returns 503 and the UI degrades to offline editing).
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: 'Liveblocks is not configured' }, { status: 503 });
  }

  let body: { room?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { room?: string };
  } catch {
    body = {};
  }
  const room = typeof body.room === 'string' ? body.room : '';
  // Room format: cfos-ws-<workspaceId>. Reject anything else.
  const m = /^cfos-ws-([A-Za-z0-9_-]+)$/.exec(room);
  if (!m) return NextResponse.json({ error: 'Invalid room' }, { status: 400 });
  const workspaceId = m[1];

  // Verify the user can access this workspace.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  const isOwner = workspace.ownerId === session.userId;
  let canAccess = isOwner;
  if (!canAccess) {
    const collab = await prisma.workspaceCollaborator.findFirst({
      where: { workspaceId, userId: session.userId },
      select: { id: true },
    });
    canAccess = !!collab;
  }
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch the user's display info for presence.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true, displayName: true, avatarUrl: true },
  });

  // Build the ID token payload. Liveblocks expects { userId, userInfo, groupIds }.
  // SECURITY: include iat + exp (15 minutes) so a leaked token cannot be replayed
  // forever to join rooms as this user.
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    userId: session.userId,
    userInfo: {
      name: user?.displayName || user?.username || session.userId,
      username: user?.username || '',
      avatar: user?.avatarUrl || '',
    },
    groupIds: [],
    iat: nowSec,
    exp: nowSec + 15 * 60,
  };

  // Sign with HS256 using the Liveblocks secret key.
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const bodyB64 = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  const data = `${header}.${bodyB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigB64 = Buffer.from(sig).toString('base64url');
  const idToken = `${data}.${sigB64}`;

  return NextResponse.json({ token: idToken });
}