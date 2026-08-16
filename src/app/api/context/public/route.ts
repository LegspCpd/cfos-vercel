import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isUserAdmin } from '@/lib/admin';
import { cachedJson } from '@/lib/kv-cache';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/context/public — the shared public library.
// Anyone (logged in or not) can list approved public docs; the response is a curated
// subset (no full content) so the library page stays light. Full content is fetched
// per-doc via GET /api/context/:id (which allows approved public docs).
// The list is cached in KV (public data, changes only via admin review) so the library
// page loads instantly; the cache is invalidated on approve/reject.
export async function GET(req: Request) {
  const docs = await cachedJson('context', 'public-library', async () => {
    const rows = await prisma.contextDoc.findMany({
      where: { visibility: 'public', status: 'approved' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        tags: true,
        publishedAt: true,
        owner: { select: { username: true, displayName: true } },
      },
      take: 200,
    });
    return rows.map((d) => ({
      ...d,
      publishedAt: d.publishedAt?.toISOString() ?? null,
    }));
  }, { ttlSeconds: 60 });
  return NextResponse.json({ docs });
}

// GET /api/context/public/pending — admin review queue for public submissions.
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await isUserAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const docs = await prisma.contextDoc.findMany({
    where: { visibility: 'public', status: 'pending' },
    orderBy: { updatedAt: 'asc' },
    select: {
      id: true,
      title: true,
      tags: true,
      content: true,
      createdAt: true,
      owner: { select: { username: true, displayName: true } },
    },
  });
  return NextResponse.json({ docs });
}