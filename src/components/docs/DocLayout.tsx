'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Home, ChevronRight } from 'lucide-react';
import { DOC_NAV } from '@/content/docs/nav';
import { LOGO_URL } from '@/lib/brand';

export default function DocLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Determine current doc slug from pathname (/docs/xxx).
  const currentSlug = pathname.split('/')[2] || 'index';

  function isActive(slug: string): boolean {
    return currentSlug === slug;
  }

  const sidebar = (
    <nav className="space-y-1">
      {DOC_NAV.map((item) => (
        <Link
          key={item.slug}
          href={item.slug === 'index' ? '/docs' : `/docs/${item.slug}`}
          onClick={() => setMenuOpen(false)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
            isActive(item.slug)
              ? 'bg-secondary font-medium text-foreground'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.title}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-card p-4 md:block">
        <Link href="/docs" className="mb-6 flex items-center gap-2 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="logo" className="h-7 w-7 rounded-md object-cover" />
          <span className="font-semibold">文档</span>
        </Link>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-card p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold">文档</span>
              <button onClick={() => setMenuOpen(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/80 px-4 py-2 backdrop-blur md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded p-1 hover:bg-secondary">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="logo" className="h-6 w-6 rounded-md object-cover" />
            <span className="text-sm font-semibold">文档</span>
          </Link>
        </div>

        {/* Breadcrumb */}
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-6 pt-6 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground">
            <Home className="h-3.5 w-3.5" /> 首页
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/docs" className="hover:text-foreground">文档</Link>
        </div>

        <div className="mx-auto max-w-3xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
