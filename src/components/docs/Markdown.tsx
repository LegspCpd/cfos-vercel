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
          h1: ({ children }) => (
            <h1 className="mb-4 border-b border-border/60 pb-3 text-3xl font-bold tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-10 flex items-center gap-2 text-xl font-semibold">
              <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 text-lg font-semibold">{children}</h3>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-hidden rounded-lg border">
              <table className="my-0 w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-secondary/60 px-3 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/60 px-3 py-2">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-r-lg border-l-4 border-primary bg-secondary/40 px-4 py-2 not-italic">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className={`${className || ''} block overflow-x-auto rounded-lg bg-muted px-4 py-3 text-[0.85em]`}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-secondary px-1.5 py-0.5 text-[0.85em] text-primary">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-hidden rounded-lg border bg-muted p-0 shadow-sm">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
