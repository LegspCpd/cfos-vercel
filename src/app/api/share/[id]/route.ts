import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { r2GetPresignedUrl, deleteSharedFile } from '@/lib/r2';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// GET /api/share/:id — return the presigned R2 download URL.
// The actual download hits R2 directly (no Vercel proxy), so traffic bypasses Vercel quota.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const file = await prisma.sharedFile.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Expired?
  if (file.expiresAt < new Date()) {
    await deleteSharedFile(file.id, session.userId);
    return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
  }

  let url: string;
  try {
    url = await r2GetPresignedUrl(file.r2Key, 900); // 15 min window
  } catch (e) {
    console.error('presign failed', e);
    return NextResponse.json({ error: 'Failed to create download link.' }, { status: 500 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'file.share_access',
    targetId: file.id,
    detail: `Generated download link for "${file.fileName}"`,
  });

  return NextResponse.json({
    url,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    expiresAt: file.expiresAt,
  });
}

// DELETE /api/share/:id — remove the share (record + R2 object).
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const ok = await deleteSharedFile(params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'file.share_delete',
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
}
