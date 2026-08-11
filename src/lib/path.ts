// Validate a workspace file path: reject path traversal, empty, control chars, and
// overly long paths. Keeps DB keys well-formed and prevents ../ abuse.
export function isSafeFilePath(path: string): boolean {
  if (!path || path.length > 255) return false;
  if (path.includes('..') || path.includes('\\')) return false;
  // Reject control characters and the NUL byte.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(path)) return false;
  if (path.startsWith('/') || path.startsWith('.') || path.endsWith('/')) return false;
  return true;
}
