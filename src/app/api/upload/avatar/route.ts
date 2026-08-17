import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { avatarUploadLimiter } from '@/lib/rate-limit';

// Image-hosting configuration. The token + base URL live in env vars so they're never
// exposed to the browser or stored in the admin panel.
//  - IMGHOST_BASE_URL: e.g. https://hub.example.com
//  - IMGHOST_TOKEN: the API token
//  - IMGHOST_FOLDER: target folder, default "photos/avatars"
const IMGHOST_BASE = (process.env.IMGHOST_BASE_URL || 'https://hub.example.com').replace(/\/+$/, '');
const IMGHOST_TOKEN = process.env.IMGHOST_TOKEN;
const IMGHOST_FOLDER = process.env.IMGHOST_FOLDER || 'photos/avatars';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// POST /api/upload/avatar — upload an avatar image to the configured image host
// and update the current user's avatarUrl. Returns the image URL.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Cap uploads per user so a script can't exhaust the image-hosting quota.
  if (avatarUploadLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
  }

  if (!IMGHOST_TOKEN) {
    return NextResponse.json(
      { error: 'Image hosting is not configured (missing IMGHOST_TOKEN).' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPEG, WEBP or GIF images are allowed' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image must be smaller than 5 MB' }, { status: 400 });
  }

  // Don't trust the browser-reported MIME alone — sniff the magic bytes so a
  // file renamed to .png but actually containing HTML/JS can't be uploaded.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLikeAllowedImage(head)) {
    return NextResponse.json({ error: 'File is not a valid image' }, { status: 400 });
  }

  // Build the upload request to the image host (POST /upload?uploadFolder=).
  const uploadUrl = new URL('/upload', IMGHOST_BASE);
  uploadUrl.searchParams.set('uploadFolder', IMGHOST_FOLDER);

  const body = new FormData();
  body.append('file', file, file.name);

  const upRes = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${IMGHOST_TOKEN}` },
    body,
  });
  if (!upRes.ok) {
    const text = await upRes.text().catch(() => '');
    console.error('image host upload error', upRes.status, text);
    return NextResponse.json({ error: 'Image upload failed, please try again' }, { status: 502 });
  }
  // The image host returns an array: [{ src, url, fileId }].
  const data = (await upRes.json()) as { url?: string; src?: string }[];
  const first = Array.isArray(data) ? data[0] : undefined;
  const imageUrl =
    first?.url ||
    (first?.src ? (first.src.startsWith('http') ? first.src : `${IMGHOST_BASE}${first.src}`) : '');
  if (!imageUrl) {
    return NextResponse.json({ error: 'Image host returned an unexpected response' }, { status: 502 });
  }
  // SECURITY: only accept http(s) URLs from the image host — never javascript: or
  // other schemes that could execute when rendered in an <img src> / CSS context.
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Image host returned an invalid URL' }, { status: 502 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'Image host returned an invalid URL' }, { status: 502 });
  }

  // Persist the avatar URL on the user.
  await prisma.user.update({ where: { id: session.userId }, data: { avatarUrl: imageUrl } });

  return NextResponse.json({ url: imageUrl });
}

// Sniff the leading bytes of an image file to confirm it really is one of the
// allowed raster formats (PNG/JPEG/GIF/WEBP), ignoring whatever MIME the browser
// claimed. Returns false for HTML/SVG/other disguised content.
function looksLikeAllowedImage(head: Uint8Array): boolean {
  const len = head.length;
  // PNG: 89 50 4E 47
  if (len >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (len >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  // GIF: "GIF8"
  if (len >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return true;
  // WEBP: "RIFF" .... "WEBP" (bytes 8..11)
  if (
    len >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return true;
  }
  return false;
}
