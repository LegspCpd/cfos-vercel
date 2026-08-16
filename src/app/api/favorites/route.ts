import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { cachedJson, invalidateCache } from '@/lib/kv-cache';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/favorites — list the current user's favorited workspace ids.
// Cached per-user for a few seconds; POST (favorite/unfavorite) invalidates it.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await cachedJson(
    'favorites',
    session.userId,
    async () => {
      const favorites = await prisma.favorite.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: { workspaceId: true, createdAt: true },
      });
      return { favorites };
    },
    { ttlSeconds: Number(process.env.KV_FAVORITES_TTL) || 5 },
  );
  return NextResponse.json(body);
}

// POST /api/favorites — favorite (or unfavorite) a workspace. Body: { workspaceId, favorite: boolean }
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to manage workspaces.' }, { status: 403 });
  }
  const { workspaceId, favorite } = await req.json();
  if (!workspaceId || typeof favorite !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const owned = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (favorite) {
    await prisma.favorite.upsert({
      where: { userId_workspaceId: { userId: session.userId, workspaceId } },
      create: { userId: session.userId, workspaceId },
      update: {},
    });
  } else {
    await prisma.favorite.deleteMany({
      where: { userId: session.userId, workspaceId },
    });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: favorite ? 'favorite.add' : 'favorite.remove',
    targetId: workspaceId,
  });
  // Drop the cached favorites list so the star state updates immediately.
  await invalidateCache('favorites', session.userId).catch(() => {});

  return NextResponse.json({ ok: true });
}
