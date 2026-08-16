// Cache helpers for the public context library. The library list is KV-cached (public
// data, changes only via admin review); these helpers keep the cache in sync. Kept in
// a separate module (not the route file) so route handlers stay Next.js-typed.

import { invalidateCache } from '@/lib/kv-cache';

// Invalidate the public-library cache after an admin approve/reject so the library
// reflects the change immediately.
export async function invalidatePublicLibrary(): Promise<void> {
  await invalidateCache('context', 'public-library');
}