import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOC_NAV, DOC_NAV_EN } from '@/content/docs/nav';

// Doc search index — built at build time from the markdown files. Each entry carries
// the doc's title, keywords (from the nav title + headings + first paragraph), and a
// short excerpt. The index is LANGUAGE-SCOPED: the zh index only contains zh docs and
// the en index only contains en docs, so a user searching in English never sees Chinese
// results (and vice versa).

export interface DocIndexEntry {
  slug: string;
  title: string;
  href: string;
  keywords: string[];
  excerpt: string;
}

const DOCS_DIR = path.join(process.cwd(), 'src', 'content', 'docs');
const DOCS_EN_DIR = path.join(process.cwd(), 'docs', 'en');

// Normalize a query for matching: lowercase, strip whitespace/punctuation.
export function normalizeDocQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·•,，。.、/\\\-_'"`~!@#$%^&*()+=<>?{}[\]|:;]/g, '');
}

// Extract a plain-text excerpt from markdown (first non-empty paragraph, capped).
function extractExcerpt(md: string, max = 120): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[#>*_`~|-]/g, ' ') // markdown syntax
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max) + (text.length > max ? '…' : '');
}

// Extract keywords from the markdown: headings + first paragraph words (zh: chars).
function extractKeywords(md: string, title: string): string[] {
  const headings = md
    .split('\n')
    .filter((l) => /^#{2,3}\s/.test(l))
    .map((l) => l.replace(/^#{2,3}\s*/, '').replace(/[#*_`]/g, '').trim())
    .filter(Boolean);
  const firstPara = extractExcerpt(md, 200);
  return Array.from(new Set([title, ...headings, firstPara])).filter(Boolean);
}

// Build the index for one language. `nav` is the doc list (title per slug), `dir` is the
// markdown directory. Entries are sorted by nav order.
function buildIndex(nav: { slug: string; title: string }[], dir: string): DocIndexEntry[] {
  const entries: DocIndexEntry[] = [];
  for (const item of nav) {
    if (item.slug === 'index') continue;
    try {
      const md = readFileSync(path.join(dir, `${item.slug}.md`), 'utf-8');
      entries.push({
        slug: item.slug,
        title: item.title,
        href: `/docs/${item.slug}`,
        keywords: extractKeywords(md, item.title),
        excerpt: extractExcerpt(md),
      });
    } catch {
      // Missing file — skip (keeps the index resilient to partial translations).
    }
  }
  return entries;
}

// The zh index (hrefs under /docs/...).
export const DOC_INDEX_ZH: DocIndexEntry[] = buildIndex(DOC_NAV, DOCS_DIR);

// The en index (hrefs under /en/docs/...).
export const DOC_INDEX_EN: DocIndexEntry[] = buildIndex(DOC_NAV_EN, DOCS_EN_DIR).map((e) => ({
  ...e,
  href: `/en/docs/${e.slug}`,
}));

// Score an entry against a normalized query. Title match > keyword match > excerpt match.
export function scoreDocEntry(entry: DocIndexEntry, q: string): number {
  if (!q) return 0;
  const title = normalizeDocQuery(entry.title);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  let best = 0;
  for (const kw of entry.keywords) {
    const k = normalizeDocQuery(kw);
    if (k === q) return 90;
    if (k.startsWith(q)) best = Math.max(best, 70);
    else if (k.includes(q)) best = Math.max(best, 50);
  }
  const excerpt = normalizeDocQuery(entry.excerpt);
  if (excerpt.includes(q)) best = Math.max(best, 30);
  return best;
}

// Search one language's index. Returns entries sorted by score, capped at `limit`.
export function searchDocIndex(index: DocIndexEntry[], q: string, limit = 6): { entry: DocIndexEntry; score: number }[] {
  const nq = normalizeDocQuery(q);
  if (!nq) return [];
  const scored = index
    .map((entry) => ({ entry, score: scoreDocEntry(entry, nq) }))
    .filter((s) => s.score > 0)
    .toSorted((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}