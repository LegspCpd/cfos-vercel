import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { r2GetPresignedUrl, deleteSharedFile } from '@/lib/r2';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/share/:id — return the presigned R2 download URL.
// The actual download hits R2 directly (no Vercel proxy), so traffic bypasses Vercel quota.
export async function GET(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const file = await prisma.sharedFile.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Expired? Return 410 but leave the record for cron to clean up — a mere "read"
  // should not permanently delete the share (and concurrent reads could double-delete).
  if (file.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
  }

  let url: string;
  try {
    // Make the presigned URL valid for the remaining lifetime of the share
    // (clamped to AWS's 7-day max for presigned URLs). This way a link copied
    // once stays usable until the share itself expires, instead of dying after
    // a fixed 15 minutes.
    const remainingSecs = Math.max(1, Math.floor((file.expiresAt.getTime() - Date.now()) / 1000));
    const ttlSecs = Math.min(remainingSecs, 7 * 24 * 60 * 60);
    url = await r2GetPresignedUrl(file.r2Key, ttlSecs);
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
export async function DELETE(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.fileshare))) {
    return NextResponse.json({ error: 'You do not have permission to manage shared files.' }, { status: 403 });
  }

  // Cap share deletions per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

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
