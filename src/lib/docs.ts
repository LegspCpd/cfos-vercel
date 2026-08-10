import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOC_SLUGS, DOC_SLUGS_EN } from '@/content/docs/nav';

// Server-side helper: read a documentation markdown file.
const DOCS_DIR = path.join(process.cwd(), 'src', 'content', 'docs');
// English docs live at the repo root under docs/en/ (easy for translators to edit).
const DOCS_EN_DIR = path.join(process.cwd(), 'docs', 'en');

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

/** Read an English doc from docs/en/. */
export function getEnDocContent(slug: string): string | null {
  if (!DOC_SLUGS_EN.includes(slug)) return null;
  const filePath = path.join(DOCS_EN_DIR, `${slug}.md`);
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
