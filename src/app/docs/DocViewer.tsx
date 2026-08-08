'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

function slugify(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fa5-]/g, '').replace(/\s+/g, '-').toLowerCase();
}

// Client wrapper that renders the markdown doc with proper styling + a back button.
export default function DocViewer({ content }: { content: string }) {
  const router = useRouter();

  const headings = useMemo(() => {
    const matches = content.matchAll(/^#{1,3} (.+)$/gm);
    return Array.from(matches, (m) => ({
      text: m[1].trim(),
      level: m[0].trim().startsWith('###') ? 3 : m[0].trim().startsWith('##') ? 2 : 1,
      id: slugify(m[1].trim()),
    }));
  }, [content]);

  // Map heading levels to rendered tags with ids.
  const components = useMemo(() => {
    const make = (level: 1 | 2 | 3) => {
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      return ({ children }: { children?: React.ReactNode }) => (
        <Tag id={slugify(String(children ?? ''))}>{children}</Tag>
      );
    };
    return {
      h1: make(1),
      h2: make(2),
      h3: make(3),
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
      {/* TOC */}
      <aside className="sticky top-8 hidden h-fit w-56 shrink-0 lg:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">目录</p>
        <nav className="space-y-1 text-sm">
          {headings.map((h, i) => (
            <a
              key={i}
              href={`#${h.id}`}
              className={`block truncate text-muted-foreground hover:text-primary ${h.level === 2 ? 'pl-3' : h.level === 3 ? 'pl-6' : ''}`}
            >
              {h.text}
            </a>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <article className="min-w-0 flex-1">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </button>
        <div className="prose prose-sm max-w-none prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
