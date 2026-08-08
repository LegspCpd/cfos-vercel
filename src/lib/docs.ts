import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOC_SLUGS } from '@/content/docs/nav';

// Server-side helper: read a documentation markdown file.
const DOCS_DIR = path.join(process.cwd(), 'src', 'content', 'docs');

export function getDocContent(slug: string): string | null {
  // Guard against path traversal.
  if (!DOC_SLUGS.includes(slug)) return null;
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
