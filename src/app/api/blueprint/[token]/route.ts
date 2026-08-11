import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signPreviewUrl } from '@/lib/preview-url';

type Ctx = { params: { token: string } };

// GET /api/blueprint/:token — public, read-only access to a shared blueprint.
// The shareToken IS the access credential for a public share, so anyone with the link can
// view (and copy) it. We mint a signed preview URL alongside so the preview iframe can load
// /api/preview/:id without exposing a private workspace's id as an unauthenticated route.
export async function GET(_req: Request, { params }: Ctx) {
  const workspace = await prisma.workspace.findUnique({
    where: { shareToken: params.token },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      owner: { select: { displayName: true, username: true } },
      files: { select: { path: true, content: true, isEntry: true }, orderBy: { path: 'asc' } },
    },
  });
  if (!workspace) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }
  return NextResponse.json({ workspace, previewUrl: signPreviewUrl(workspace.id) });
}
