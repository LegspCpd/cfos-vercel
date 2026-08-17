import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { unzip } from './unzip';

// Build a small in-memory zip with fflate's zipSync (the same library family as the
// streaming Unzip used in production, so the fixtures are realistic).
function makeZip(files: Record<string, string>): Buffer {
  const data: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    data[path] = strToU8(content);
  }
  return Buffer.from(zipSync(data));
}

describe('unzip', () => {
  it('extracts regular files from a zip', () => {
    const buf = makeZip({ 'index.html': '<h1>hi</h1>', 'app.js': 'console.log(1)' });
    const entries = unzip(buf);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path).toSorted()).toEqual(['app.js', 'index.html']);
    expect(entries.find((e) => e.path === 'index.html')?.content.toString()).toBe('<h1>hi</h1>');
  });

  it('skips directory entries', () => {
    const buf = makeZip({ 'dir/': '', 'dir/file.txt': 'x' });
    const entries = unzip(buf);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('dir/file.txt');
  });

  it('normalizes backslashes and strips leading ./', () => {
    const buf = makeZip({ './a\\b.txt': 'x' });
    const entries = unzip(buf);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('a/b.txt');
  });

  it('rejects zip-slip paths (..)', () => {
    const buf = makeZip({ '../evil.txt': 'x' });
    expect(() => unzip(buf)).toThrow(/Invalid ZIP path/);
  });

  it('rejects absolute paths', () => {
    const buf = makeZip({ '/etc/passwd': 'x' });
    expect(() => unzip(buf)).toThrow(/Invalid ZIP path/);
  });

  it('rejects drive-letter paths', () => {
    const buf = makeZip({ 'C:\\windows\\system32\\x': 'x' });
    expect(() => unzip(buf)).toThrow(/Invalid ZIP path/);
  });

  it('rejects control characters in paths', () => {
    const buf = makeZip({ 'bad\u0000name.txt': 'x' });
    expect(() => unzip(buf)).toThrow(/Invalid ZIP path/);
  });

  it('rejects too many files', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 501; i++) files[`f${i}.txt`] = 'x';
    const buf = makeZip(files);
    expect(() => unzip(buf)).toThrow(/too many entries/);
  });

  it('rejects oversized single files', () => {
    // 51 MB of zeros compresses to almost nothing, so the zip itself is tiny.
    const big = Buffer.alloc(51 * 1024 * 1024, 0).toString('latin1');
    const buf = makeZip({ 'big.bin': big });
    expect(() => unzip(buf)).toThrow(/too large/);
  });

  it('rejects zip bombs (total size cap)', () => {
    // Two 60 MB files → the first already trips the 50 MB per-file cap; use two 30 MB
    // files instead so the 100 MB TOTAL cap is what fires.
    const mid = Buffer.alloc(30 * 1024 * 1024, 0).toString('latin1');
    const buf = makeZip({ 'a.bin': mid, 'b.bin': mid, 'c.bin': mid, 'd.bin': mid });
    expect(() => unzip(buf)).toThrow(/100 MB/);
  });
});