'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, FileText } from 'lucide-react';

// Doc search box shown at the top of every doc page (Bing-style: a small inline box).
// Results come from /api/docs/search, which is LANGUAGE-SCOPED: lang=zh only searches zh
// docs and lang=en only searches en docs, so a user reading English docs only ever sees
// English results (and vice versa). Debounced + cached per query.
interface DocSearchProps {
  lang?: 'zh' | 'en';
}

interface DocHit {
  slug: string;
  title: string;
  href: string;
  excerpt: string;
  score: number;
}

export default function DocSearch({ lang = 'zh' }: DocSearchProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<DocHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, DocHit[]>>(new Map());

  const placeholder = lang === 'en' ? 'Search docs…' : '搜索文档…';

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    // Cache hit → instant.
    const cached = cacheRef.current.get(q);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}&lang=${lang}`);
        const data = (await res.json()) as { results: DocHit[] };
        cacheRef.current.set(q, data.results);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, lang]);

  return (
    <div className="relative mb-6">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-background/60 px-3 transition-colors ${
          focused ? 'border-primary/60 ring-2 ring-primary/20' : 'border-border'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {focused && query.trim() && (
        <div className="animate-fade-in absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-card shadow-xl">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">
              {lang === 'en' ? 'Searching…' : '搜索中…'}
            </p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {lang === 'en' ? 'No matching docs' : '没有找到匹配的文档'}
            </p>
          ) : (
            results.map((hit) => (
              <DocResult key={hit.slug} hit={hit} query={query} lang={lang} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DocResult({ hit, query, lang }: { hit: DocHit; query: string; lang: 'zh' | 'en' }) {
  return (
    <Link
      href={hit.href}
      className="flex items-start gap-2 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-secondary"
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          <Highlight text={hit.title} query={query} />
        </p>
        <p className="truncate text-xs text-muted-foreground">{hit.excerpt}</p>
      </div>
      <span className="ml-auto shrink-0 self-center rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {lang === 'en' ? 'Doc' : '文档'}
      </span>
    </Link>
  );
}

// Highlight the matched query within the title (case-insensitive).
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-primary">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}