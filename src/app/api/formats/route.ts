import { NextResponse } from 'next/server';
import { seedBundledFormats } from '@/lib/format-seed';
import { listFormats } from '@/lib/formats';
import { cachedJson } from '@/lib/kv-cache';

// GET /api/formats — the deployment's standard output formats, in menu order.
// What fills a "New Document / New Slides / ..." menu. Empty when the deployment
// promotes none. Lazily seeds the bundled formats on first call so a fresh
// deployment gets its standard set without any deploy-time hook.
// The list is KV-cached (public data, changes only via admin format management) so
// the New-format menus load instantly; admin mutations invalidate the cache.
export async function GET() {
  try {
    await seedBundledFormats();
  } catch {
    // Seeding failure shouldn't 500 the list — serve whatever exists.
  }
  const formats = await cachedJson('formats', 'list', async () => {
    const rows = await listFormats();
    return rows.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      output: f.output,
      agentHint: f.agentHint,
      variants: f.variants.map((v) => ({ name: v.name, description: v.description })),
    }));
  }, { ttlSeconds: 60 });
  return NextResponse.json({ formats });
}