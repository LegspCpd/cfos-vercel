// Thin wrapper around fflate for extracting ZIP uploads on the deploy page.
//
// Security notes:
//  - We reject zip-slip paths (../, absolute paths, empty segments) so a malicious archive
//    can't smuggle path segments or escape the intended directory. The check runs on BOTH
//    the raw entry name (before normalization) and the normalized path, so tricks like a
//    leading "/" or a "././" prefix can't bypass it.
//  - We cap total uncompressed size, entry count, and per-path length to bound memory and
//    avoid deploying absurdly long / weird file names to Cloudflare.
//  - Only regular files are returned (directories are skipped).

import { unzipSync } from 'fflate';

const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 MB uncompressed cap
const MAX_FILES = 500;
const MAX_PATH_LEN = 512;
// Control chars, backslash already normalized. Also block '#' and '?' which are meaningful
// in URLs and could confuse the Pages routing / manifest.
const DISALLOWED = /[\u0000-\u001f\u007f#?]/;

export interface UnzipEntry {
  path: string;
  content: Buffer;
}

// Reject any path that could escape or abuse the flat deploy root.
function assertSafePath(raw: string, normalized: string): void {
  if (raw.length > MAX_PATH_LEN) throw new Error(`Invalid ZIP path (too long): ${raw}`);
  // Absolute paths (leading '/'), drive letters (Windows "C:..."), and any '..' segment
  // must never reach the deploy tree.
  if (/^[/\\]/.test(raw)) throw new Error(`Invalid ZIP path (absolute): ${raw}`);
  if (/^[a-zA-Z]:/.test(raw)) throw new Error(`Invalid ZIP path (drive letter): ${raw}`);
  const segs = normalized.split('/');
  for (const seg of segs) {
    if (seg === '..' || seg === '') throw new Error(`Invalid ZIP path: ${raw}`);
  }
  if (DISALLOWED.test(normalized)) throw new Error(`Invalid ZIP path: ${raw}`);
}

// Parse a .zip buffer into a flat list of { path, content }. Throws on malformed input.
export function unzip(buf: Buffer): UnzipEntry[] {
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(new Uint8Array(buf));
  } catch (e) {
    throw new Error(`Invalid ZIP: ${(e as Error).message}`, { cause: e });
  }

  const entries = Object.keys(extracted);
  if (entries.length > MAX_FILES) throw new Error(`ZIP has too many entries (max ${MAX_FILES})`);

  const out: UnzipEntry[] = [];
  let totalSize = 0;

  for (const rawPath of entries) {
    if (rawPath.endsWith('/') || rawPath.endsWith('\\')) continue; // directory entry

    // Normalize backslashes and strip any leading "./" (but NOT a bare leading slash).
    let p = rawPath.replace(/\\/g, '/');
    while (p.startsWith('./')) p = p.slice(2);

    // Zip-slip guard: validate the RAW name first (catches absolute/drive paths that a
    // leading "./" strip could otherwise hide), then the normalized path.
    assertSafePath(rawPath, p);

    totalSize += extracted[rawPath].byteLength;
    if (totalSize > MAX_TOTAL_SIZE) throw new Error('ZIP uncompressed size exceeds 100 MB limit');

    out.push({ path: p, content: Buffer.from(extracted[rawPath]) });
  }

  return out;
}
