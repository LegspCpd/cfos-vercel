// Thin wrapper around fflate for extracting ZIP uploads on the deploy page.
//
// Security notes:
//  - We reject zip-slip paths (../, absolute paths) so a malicious archive can't escape
//    the intended directory.
//  - We cap total uncompressed size and entry count to bound memory.
//  - Only regular files are returned (directories are skipped).

import { unzipSync } from 'fflate';

const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 MB uncompressed cap
const MAX_FILES = 500;

export interface UnzipEntry {
  path: string;
  content: Buffer;
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
    // Normalize backslashes and strip a leading './'.
    let p = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (p.endsWith('/')) continue; // directory entry

    // Zip-slip guard: reject absolute paths or any '..' that escapes the root.
    if (p.startsWith('/')) throw new Error(`Invalid ZIP path: ${rawPath}`);
    for (const seg of p.split('/')) {
      if (seg === '..') throw new Error(`Invalid ZIP path: ${rawPath}`);
    }

    totalSize += extracted[rawPath].byteLength;
    if (totalSize > MAX_TOTAL_SIZE) throw new Error('ZIP uncompressed size exceeds 100 MB limit');

    out.push({ path: p, content: Buffer.from(extracted[rawPath]) });
  }

  return out;
}
