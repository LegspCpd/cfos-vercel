#!/usr/bin/env node
/**
 * Build-time favicon fetcher & PNG converter.
 *
 * Reads the SITE_IMG_URL env var (set at build time on Vercel). If present, it
 * downloads that image, converts it to PNG (any source format, incl. JPG) and writes
 * it to:
 *   - public/site-icon.png         (site favicon, 64x64)
 *   - public/apple-touch-icon.png  (iOS home-screen icon, 180x180)
 *
 * The site then uses public/site-icon.png as its favicon, so a JPG source becomes a
 * proper PNG icon without any manual conversion.
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

  // Favicon: always PNG, 64x64 (sharp converts JPG -> PNG automatically).
  await src.clone().resize(64, 64, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'site-icon.png'));
  // iOS icon: 180x180 PNG.
  await src.clone().resize(180, 180, { fit: 'cover' }).png().toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  console.log('[favicon] Generated public/site-icon.png and public/apple-touch-icon.png (PNG).');
}

main().catch((e) => {
  console.error(`[favicon] Unexpected error: ${e.message}`);
  process.exit(0); // never fail the build
});
