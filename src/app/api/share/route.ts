import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { r2Put, isR2Configured, listSharedFiles } from '@/lib/r2';
import crypto from 'node:crypto';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/share — list my shared files.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const files = await listSharedFiles(session.userId);
  return NextResponse.json({ files });
}

// POST /api/share — upload a file to R2 and create a share link.
// Body: JSON { fileName, mimeType, content (base64), expiresInDays? }
// (Content is base64-encoded to keep the API simple and JSON-friendly.)
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.' },
      { status: 500 },
    );
  }

  let body: { fileName?: string; mimeType?: string; content?: string; expiresInDays?: number; workspaceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fileName = body.fileName?.trim();
  if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
  if (!body.content) return NextResponse.json({ error: 'content (base64) is required' }, { status: 400 });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.content, 'base64');
  } catch {
    return NextResponse.json({ error: 'Invalid base64 content' }, { status: 400 });
  }
  if (buffer.length > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
  }

  // Default expiry 7 days; clamp between 1 minute and 30 days.
  const days = Math.max(1 / 24 / 60, Math.min(body.expiresInDays ?? 7, 30));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const key = `share/${session.userId}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const mimeType = body.mimeType || 'application/octet-stream';

  try {
    await r2Put({ key, body: buffer, contentType: mimeType });
  } catch (e) {
    console.error('r2 upload failed', e);
    return NextResponse.json({ error: 'Failed to upload to R2. Check R2 configuration.' }, { status: 500 });
  }

  const file = await prisma.sharedFile.create({
    data: {
      ownerId: session.userId,
      workspaceId: body.workspaceId ?? null,
      r2Key: key,
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      expiresAt,
    },
  });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'file.share',
    targetId: file.id,
    detail: `Shared file "${fileName}" (${(buffer.length / 1024).toFixed(0)} KB) until ${expiresAt.toISOString()}`,
  });

  return NextResponse.json({ file: { id: file.id, fileName, sizeBytes: file.sizeBytes, expiresAt, mimeType } }, { status: 201 });
}
