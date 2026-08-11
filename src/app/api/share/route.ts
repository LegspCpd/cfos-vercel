import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { r2Put, isR2Configured, listSharedFiles } from '@/lib/r2';
import { requireCfAccess } from '@/lib/require-access';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
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
  if (!(await requireCfAccess(req))) {
    return NextResponse.json({ error: 'Cloudflare Access verification required' }, { status: 401 });
  }
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.fileshare))) {
    return NextResponse.json({ error: 'You do not have permission to share files.' }, { status: 403 });
  }

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

  // Reject obviously-oversized payloads BEFORE decoding, to avoid loading a huge
  // string into memory (base64 is ~4/3 the decoded size; allow a little slack).
  const MAX_BYTES = 50 * 1024 * 1024;
  if (body.content.length > Math.ceil((MAX_BYTES / 3) * 4) + 4096) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
  }

  let buffer: Buffer;
  // Buffer.from(base64) never throws on invalid input — it silently decodes what it
  // can. Do a strict round-trip so malformed payloads are actually rejected.
  const strictBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(body.content) && body.content.length % 4 === 0;
  if (!strictBase64) {
    return NextResponse.json({ error: 'Invalid base64 content' }, { status: 400 });
  }
  buffer = Buffer.from(body.content, 'base64');
  if (buffer.toString('base64').replace(/=+$/, '') !== body.content.replace(/=+$/, '')) {
    return NextResponse.json({ error: 'Invalid base64 content' }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
  }

  // Default expiry 7 days; clamp between 1 minute and 30 days.
  const days = Math.max(1 / 24 / 60, Math.min(body.expiresInDays ?? 7, 30));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const key = `share/${session.userId}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  // Never serve active content inline from R2 (would enable stored XSS on open).
  // Restrict to safe types; anything unknown degrades to application/octet-stream
  // so browsers download rather than render.
  const mimeType = sanitizeMimeType(body.mimeType);

  try {
    await r2Put({ key, body: buffer, contentType: mimeType });
  } catch (e) {
    console.error('r2 upload failed', e);
    return NextResponse.json({ error: 'Failed to upload to R2. Check R2 configuration.' }, { status: 500 });
  }

  // SECURITY: if a source workspace is claimed, it must belong to this user — otherwise a
  // user could attach their share to (and pollute) someone else's workspace record.
  if (body.workspaceId) {
    const owned = await prisma.workspace.findFirst({
      where: { id: body.workspaceId, ownerId: session.userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
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

// Allowlist of MIME types safe to serve inline. Anything not in this list (or not a
// plain image/pdf/archive/video/audio/text type) is downgraded to octet-stream so the
// browser downloads instead of rendering (which could execute HTML/SVG/JS).
const SAFE_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'font/'];
const SAFE_EXACT = new Set([
  'application/pdf',
  'application/json',
  'application/javascript',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-7z-compressed',
  'application/vnd.rar',
  'application/octet-stream',
  'text/css',
  'application/xml',
  'application/wasm',
]);
function sanitizeMimeType(mime: string | undefined): string {
  const raw = (mime || 'application/octet-stream').toLowerCase().trim().split(';')[0];
  if (SAFE_EXACT.has(raw)) return raw;
  if (SAFE_MIME_PREFIXES.some((p) => raw.startsWith(p))) return raw;
  // text/html, image/svg+xml, text/javascript, application/xhtml+xml, etc.
  // are NOT in the allowlist -> force download.
  return 'application/octet-stream';
}
