import { NextResponse } from 'next/server';
import { DOC_INDEX_ZH, DOC_INDEX_EN, searchDocIndex } from '@/lib/doc-search';

// GET /api/docs/search?q=...&lang=zh|en — doc search for the docs pages.
// The index is built server-side from the markdown files (node:fs is server-only).
// LANGUAGE-SCOPED: lang=zh only searches zh docs, lang=en only searches en docs.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
  if (!q) return NextResponse.json({ results: [] });

  const index = lang === 'en' ? DOC_INDEX_EN : DOC_INDEX_ZH;
  const results = searchDocIndex(index, q, 6).map(({ entry, score }) => ({
    slug: entry.slug,
    title: entry.title,
    href: entry.href,
    excerpt: entry.excerpt,
    score,
  }));

  return NextResponse.json({ results });
}