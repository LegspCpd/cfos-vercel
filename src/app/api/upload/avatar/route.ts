import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Image-hosting configuration. The token + base URL live in env vars so they're never
// exposed to the browser or stored in the admin panel.
//  - IMGHOST_BASE_URL: e.g. https://hub.legspcpd.top
//  - IMGHOST_TOKEN: the API token
//  - IMGHOST_FOLDER: target folder, default "photos/avatars"
const IMGHOST_BASE = (process.env.IMGHOST_BASE_URL || 'https://hub.legspcpd.top').replace(/\/+$/, '');
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

  // Build the upload request to the image host (Linya ImgHub: POST /upload?uploadFolder=).
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
  // Linya ImgHub returns an array: [{ src, url, fileId }].
  const data = (await upRes.json()) as { url?: string; src?: string }[];
  const first = Array.isArray(data) ? data[0] : undefined;
  const imageUrl =
    first?.url ||
    (first?.src ? (first.src.startsWith('http') ? first.src : `${IMGHOST_BASE}${first.src}`) : '');
  if (!imageUrl) {
    return NextResponse.json({ error: 'Image host returned an unexpected response' }, { status: 502 });
  }

  // Persist the avatar URL on the user.
  await prisma.user.update({ where: { id: session.userId }, data: { avatarUrl: imageUrl } });

  return NextResponse.json({ url: imageUrl });
}
