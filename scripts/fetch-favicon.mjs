#!/usr/bin/env node
/**
 * Build-time favicon fetcher & PNG converter.
 *
 * Reads the SITE_IMG_URL env var (set at build time on Vercel). If present, it
 * downloads that image, converts it to PNG (any source format, incl. JPG) and writes
 * PNG versions for every icon the site needs:
 *   - public/site-icon.png         (site favicon, 64x64)
 *   - public/apple-touch-icon.png  (iOS home-screen icon, 180x180)
 *   - public/icon-192.png          (PWA icon, 192x192)
 *   - public/icon-512.png          (PWA icon, 512x512)
 *   - public/app-icon.png          (PWA primary/large icon, 512x512)
 *
 * The site uses these as its favicon AND as its PWA manifest icons, so a JPG source
 * becomes proper PNG icons everywhere (browser, iOS, Android/PWA) without manual work.
 *
 * If SITE_IMG_URL is unset, the script does nothing (exit 0).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

async function main() {
  const url = process.env.SITE_IMG_URL || process.env.NEXT_PUBLIC_SITE_IMG_URL;
  if (!url) {
    console.log('[favicon] SITE_IMG_URL not set — skipping icon generation.');
    return;
  }

  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  } catch (e) {
    console.error(`[favicon] Failed to fetch icon from ${url}: ${e.message}`);
    return; // non-fatal — fall back to default icon
  }
  if (!res.ok) {
    console.error(`[favicon] HTTP ${res.status} fetching ${url} — skipping.`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());

  let src;
  try {
    src = sharp(buf);
    const meta = await src.metadata();
    console.log(
      `[favicon] Downloading icon from ${url} (${meta.width}x${meta.height}, ${meta.format}).`,
    );
  } catch (e) {
    console.error(`[favicon] Invalid image from ${url}: ${e.message} — skipping.`);
    return;
  }

  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  // All outputs are PNG (sharp converts JPG -> PNG automatically).
  // Favicon: 64x64.
  await src.clone().resize(64, 64, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'site-icon.png'));
  // iOS home-screen icon: 180x180.
  await src.clone().resize(180, 180, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  // PWA icons: 192 and 512 (Android/Chrome), plus a large app-icon (512).
  await src.clone().resize(192, 192, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  await src.clone().resize(512, 512, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
  await src.clone().resize(512, 512, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'app-icon.png'));

  console.log(
    '[favicon] Generated site-icon.png, apple-touch-icon.png, icon-192.png, icon-512.png, app-icon.png (all PNG).',
  );
}

main().catch((e) => {
  console.error(`[favicon] Unexpected error: ${e.message}`);
  process.exit(0); // never fail the build
});
