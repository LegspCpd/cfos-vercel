'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Home, ChevronRight, Languages } from 'lucide-react';
import { DOC_NAV, DOC_NAV_EN } from '@/content/docs/nav';
import { LOGO_URL } from '@/lib/brand';

// Home link target (docs "back to home"). NEXT_PUBLIC_HOME_URL is inlined by Next at build
// time so it works in this client component; keep it in sync with the server HOME_URL.
const HOME_URL = process.env.NEXT_PUBLIC_HOME_URL || 'https://os.example.com';

interface DocLayoutProps {
  children: React.ReactNode;
  lang?: 'zh' | 'en';
}

export default function DocLayout({ children, lang = 'zh' }: DocLayoutProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isEn = lang === 'en';
  const nav = isEn ? DOC_NAV_EN : DOC_NAV;
  const base = isEn ? '/en/docs' : '/docs';
  const docsTitle = isEn ? 'Docs' : '文档';
  const homeLabel = isEn ? 'Home' : '首页';

  // Determine current doc slug from pathname (/en/docs/xxx or /docs/xxx).
  const parts = pathname.split('/').filter(Boolean);
  const currentSlug = isEn ? (parts[2] || 'index') : (parts[1] || 'index');

  function isActive(slug: string): boolean {
    return currentSlug === slug;
  }

  const sidebar = (
    <nav className="space-y-1">
      {nav.map((item) => (
        <Link
          key={item.slug}
          href={item.slug === 'index' ? base : `${base}/${item.slug}`}
          onClick={() => setMenuOpen(false)}
          className={`nav-item-hover flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            isActive(item.slug)
              ? 'nav-item-active'
              : 'text-muted-foreground'
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.title}
        </Link>
      ))}
    </nav>
  );

  // Language switcher button. Takes the user to the SAME page in the other language
  // (e.g. /docs/cf-access <-> /en/docs/cf-access), not just the docs home. If the current
  // slug has no translation, we still fall back to that language's docs home.
  const otherBase = isEn ? '/docs' : '/en/docs';
  const otherHref = currentSlug === 'index' ? otherBase : `${otherBase}/${currentSlug}`;
  const langSwitch = (
    <Link href={otherHref} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">
      <Languages className="h-3.5 w-3.5" /> {isEn ? '中文' : 'English'}
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sidebar-surface sticky top-0 hidden h-screen w-64 shrink-0 p-4 md:block">
        <div className="mb-6 flex items-center justify-between px-1">
          <a href={HOME_URL} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="logo" className="h-7 w-7 rounded-md object-cover" />
            <span className="sidebar-brand font-semibold">{docsTitle}</span>
          </a>
          {langSwitch}
        </div>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="animate-backdrop-in absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="sidebar-surface animate-drawer-in absolute inset-y-0 left-0 w-72 p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="sidebar-brand font-semibold">{docsTitle}</span>
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
        <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded p-1 hover:bg-secondary">
            <Menu className="h-5 w-5" />
          </button>
          <a href={HOME_URL} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="logo" className="h-6 w-6 rounded-md object-cover" />
            <span className="text-sm font-semibold">{docsTitle}</span>
          </a>
          <div className="ml-auto">{langSwitch}</div>
        </div>

        {/* Breadcrumb */}
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-6 pt-6 text-sm text-muted-foreground">
          <a href={HOME_URL} className="flex items-center gap-1 hover:text-foreground">
            <Home className="h-3.5 w-3.5" /> {homeLabel}
          </a>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={base} className="hover:text-foreground">{docsTitle}</Link>
        </div>

        <div className="mx-auto max-w-3xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
