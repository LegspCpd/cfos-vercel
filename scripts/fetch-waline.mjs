#!/usr/bin/env node
/**
 * Build-time Waline frontend asset vendor.
 *
 * Downloads the Waline client CSS + JS into public/vendor/waline/ so the comment
 * widget is served from THIS deployment's own origin (which sits behind Cloudflare
 * CDN). Result:
 *   - public/vendor/waline/waline.css
 *   - public/vendor/waline/waline.js
 *
 * Because these are immutable, hashed files, they get long-lived cache headers and
 * are cached at Cloudflare's edge — no more waiting on unpkg on every visitor.
 *
 * Source URLs are taken from NEXT_PUBLIC_WALINE_CSS / NEXT_PUBLIC_WALINE_JS when set
 * (so a self-hosted mirror can be used), otherwise the official unpkg v3 defaults.
 * If the download fails, the build still succeeds and WalComment falls back to the
 * remote CDN — so this is never fatal.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'vendor', 'waline');

const DEFAULTS = {
  css: 'https://unpkg.com/@waline/client@v3/dist/waline.css',
  js: 'https://unpkg.com/@waline/client@v3/dist/waline.js',
};

async function download(url, outFile) {
  if (!url) return false;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch (e) {
    console.error(`[waline] Failed to fetch ${url}: ${e.message}`);
    return false;
  }
  if (!res.ok) {
    console.error(`[waline] HTTP ${res.status} fetching ${url} — skipping.`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    console.error(`[waline] Empty response from ${url} — skipping.`);
    return false;
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, buf);
  console.log(`[waline] Vendored ${path.basename(outFile)} (${(buf.length / 1024).toFixed(1)} KB).`);
  return true;
}

async function main() {
  const cssUrl = process.env.NEXT_PUBLIC_WALINE_CSS || DEFAULTS.css;
  const jsUrl = process.env.NEXT_PUBLIC_WALINE_JS || DEFAULTS.js;

  // Only vendor when the feature is enabled, to avoid needless downloads.
  if (process.env.NEXT_PUBLIC_COMMENTS_ENABLED !== 'true') {
    console.log('[waline] Comments disabled — skipping asset vendor.');
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const cssOk = await download(cssUrl, path.join(OUT_DIR, 'waline.css'));
  const jsOk = await download(jsUrl, path.join(OUT_DIR, 'waline.js'));

  // Write a small manifest so the runtime knows vendoring succeeded and which
  // URLs to prefer. Read back by WalComment via a tiny import.
  await fs.writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      { css: cssOk, js: jsOk, version: 3 },
      null,
      2,
    ),
  );
  console.log(`[waline] vendor manifest written (css=${cssOk}, js=${jsOk}).`);
}

main().catch((e) => {
  console.error(`[waline] Unexpected error: ${e.message}`);
  process.exit(0); // never fail the build
});
