import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { workspaceAccess } from '@/lib/collaboration';
import { publishWorkspace, deletePublishedSite } from '@/lib/static-publish';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/workspaces/:id/publish — one-click static publish.
// Owner or write collaborator. Returns the public URL.
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Cap publishes per user (each writes to storage).
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const result = await publishWorkspace(params.id, session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/workspaces/:id/publish — the current published site (if any).
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await workspaceAccess(session.userId, params.id);
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const site = await prisma.publishedSite.findUnique({ where: { workspaceId: params.id } });
  if (!site) return NextResponse.json({ site: null });
  return NextResponse.json({
    site: {
      id: site.id,
      token: site.token,
      url: `/p/${site.token}`,
      title: site.title,
      fileCount: site.fileCount,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    },
  });
}

// DELETE /api/workspaces/:id/publish — unpublish (owner only).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Cap unpublishes per user (each writes to storage).
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const site = await prisma.publishedSite.findUnique({ where: { workspaceId: params.id } });
  if (!site) return NextResponse.json({ ok: true });
  await deletePublishedSite(site.token, session.userId);
  return NextResponse.json({ ok: true });
}