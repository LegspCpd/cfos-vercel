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
//  - Decompression uses fflate's streaming `Unzip` decoder; when the cumulative size budget
//    is exceeded we throw inside the data handler, which propagates out of `push()` and aborts
//    the decode early. This stops a "zip bomb" (a tiny highly-compressed archive that expands
//    to gigabytes) from being fully materialized in memory before the limit check.

import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 MB uncompressed cap (all files)
const MAX_ENTRY_SIZE = 50 * 1024 * 1024; // 50 MB cap per single file
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

// A custom error we throw inside the streaming data handler to abort mid-decode. fflate's
// synchronous Unzip.push() propagates handler exceptions, so this halts further decompression
// instead of buffering the whole bomb.
class ZipLimitError extends Error {}

// Parse a .zip buffer into a flat list of { path, content }. Throws on malformed input or when
// the archive would exceed the memory budget. Streamed so a zip bomb is aborted early.
export function unzip(buf: Buffer): UnzipEntry[] {
  const out: UnzipEntry[] = [];
  let totalSize = 0;
  let fileCount = 0;
  let aborted = false;

  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  unzipper.register(UnzipPassThrough);
  unzipper.onfile = (file) => {
    if (aborted) return;
    const rawPath = file.name;
    if (rawPath.endsWith('/') || rawPath.endsWith('\\')) return; // directory entry

    // Normalize backslashes and strip any leading "./" (but NOT a bare leading slash).
    let p = rawPath.replace(/\\/g, '/');
    while (p.startsWith('./')) p = p.slice(2);

    // Zip-slip guard: validate the RAW name first (catches absolute/drive paths that a
    // leading "./" strip could otherwise hide), then the normalized path.
    assertSafePath(rawPath, p);

    fileCount += 1;
    if (fileCount > MAX_FILES) {
      aborted = true;
      throw new ZipLimitError(`ZIP has too many entries (max ${MAX_FILES})`);
    }

    const chunks: Uint8Array[] = [];
    let entrySize = 0;
    file.ondata = (err, chunk, final) => {
      // fflate's streaming decoders catch decompression errors (including errors thrown by
      // this handler) and hand them back here instead of rethrowing — surface them so a
      // corrupt entry or a size-limit abort fails the whole archive. This check MUST come
      // before the `aborted` early-return, otherwise the re-delivered error is swallowed.
      if (err) throw err instanceof Error ? err : new Error(String(err));
      if (aborted) return;
      entrySize += chunk.length;
      if (entrySize > MAX_ENTRY_SIZE) {
        aborted = true;
        throw new ZipLimitError(`ZIP file is too large (max ${MAX_ENTRY_SIZE / (1024 * 1024)} MB per file)`);
      }
      totalSize += chunk.length;
      if (totalSize > MAX_TOTAL_SIZE) {
        aborted = true;
        throw new ZipLimitError('ZIP uncompressed size exceeds 100 MB limit');
      }
      chunks.push(chunk);
      if (final) {
        out.push({ path: p, content: Buffer.concat(chunks) });
      }
    };
    // fflate's streaming Unzip only starts decompressing a file when `start()` is
    // called — `onfile` merely registers it. Without this, `ondata` never fires and
    // the archive silently yields zero entries.
    file.start();
  };

  try {
    unzipper.push(new Uint8Array(buf), true);
  } catch (e) {
    if (e instanceof ZipLimitError) throw e;
    throw new Error(`Invalid ZIP: ${(e as Error).message}`, { cause: e });
  }
  return out;
}
