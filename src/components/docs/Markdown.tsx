'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Resolve a markdown link to a docs URL.
// - http(s)://, mailto:, /…  → left as-is (absolute / external)
// - "foo" or "foo.md"        → becomes /docs/foo
// This keeps in-doc navigation from accidentally hitting the wrong route (e.g. /env instead of /docs/env).
function resolveDocsHref(href: string): string {
  if (!href) return href;
  const clean = href.trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(clean) || clean.startsWith('/')) {
    return clean;
  }
  // Strip .md extension if present.
  const slug = clean.replace(/\.md$/, '');
  return `/docs/${slug}`;
}

// Renders markdown with the docs styling (prose).
export default function Markdown({ content }: { content: string }) {
  // Responsive typography: keep prose-sm on phones (compact), scale up on larger screens
  // so the docs are comfortable to read without being oversized.
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base lg:prose-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={resolveDocsHref(href || '')} className="text-primary underline-offset-2 hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
