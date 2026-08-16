import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/search?q=... — user-owned data search for the command palette.
// The static feature index (pages, docs, actions) is matched client-side (instant,
// localized); this endpoint only returns the user's own workspaces and context docs
// (title-only substring match, no content). Results are scored and sorted.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ results: [] });

  // User workspaces + context docs (title substring match, case-insensitive).
  const [workspaces, docs] = await Promise.all([
    prisma.workspace.findMany({
      where: { ownerId: session.userId, title: { contains: q, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true },
    }),
    prisma.contextDoc.findMany({
      where: { ownerId: session.userId, title: { contains: q, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true },
    }),
  ]);

  const workspaceHits = workspaces.map((w) => ({
    type: 'workspace' as const,
    href: `/workspace/${w.id}`,
    labelKey: null,
    label: w.title,
    score: 55,
  }));
  const docHits = docs.map((d) => ({
    type: 'context' as const,
    href: `/context`,
    labelKey: null,
    label: d.title,
    score: 55,
  }));

  return NextResponse.json({ results: [...workspaceHits, ...docHits] });
}

export type SearchResult = {
  type: string;
  href: string;
  labelKey: string | null;
  label: string | null;
  score: number;
};