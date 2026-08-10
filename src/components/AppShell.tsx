'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  LayoutGrid,
  FileCode2,
  Share2,
  Compass,
  Search,
  LogOut,
  ShieldCheck,
  Moon,
  Sun,
  Monitor,
  Boxes,
  Plug,
  BookOpen,
  BookMarked,
  Menu,
  X,
} from 'lucide-react';
import { useTheme, type Theme } from '@/lib/client/theme';
import { clearToken, getToken } from '@/lib/client/auth';
import { api } from '@/lib/client/api';
import CommandPalette from './CommandPalette';
import { useI18n, type Lang } from '@/lib/client/i18n';
import { LOGO_URL } from '@/lib/brand';
import { clsx } from 'clsx';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof Home;
  match?: string;
}

const NAV: NavItem[] = [
  { href: '/', labelKey: 'nav.home', icon: Home, match: '/workspaces' },
  { href: '/workspaces', labelKey: 'nav.workspaces', icon: LayoutGrid },
  { href: '/shares', labelKey: 'nav.shares', icon: Share2 },
  { href: '/connections', labelKey: 'nav.connections', icon: Plug },
  { href: '/context', labelKey: 'nav.context', icon: BookOpen },
  { href: '/docs', labelKey: 'nav.docs', icon: BookMarked },
  { href: '/outputs', labelKey: 'nav.outputs', icon: FileCode2 },
  { href: '/blueprints', labelKey: 'nav.blueprints', icon: Boxes },
  { href: '/explore', labelKey: 'nav.explore', icon: Compass },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [banner, setBanner] = useState<{ text: string; color: string } | null>(null);
  const [footerText, setFooterText] = useState('');
  const [siteLogo, setSiteLogo] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        setIsAdmin(me.isAdmin);
        setUserName(me.displayName || me.username);
      })
      .catch(() => router.replace('/login'));
    api
      .getPublicSite()
      .then((site) => {
        setSiteName(site.siteName);
        setSiteLogo(site.siteLogo || '');
        setFooterText(site.footerText || '');
        if (site.bannerEnabled && site.bannerText) {
          setBanner({ text: site.bannerText, color: site.bannerColor });
        }
      })
      .catch(() => {});
  }, [router]);

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function isActive(item: NavItem): boolean {
    if (item.href === '/') return pathname === '/' || pathname === '/workspaces';
    if (item.match) return pathname === item.href || pathname === item.match;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card md:flex">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={siteLogo || LOGO_URL} alt="logo" className="h-7 w-7 rounded-md object-cover" />
          <span className="text-base font-semibold">{siteName || t('app.name')}</span>
        </Link>

        {/* Search button */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/40"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{t('nav.search')}</span>
            <kbd className="rounded bg-secondary px-1.5 text-[10px]">⌘K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
                  active
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <item.icon className={clsx('h-4 w-4', active && 'text-primary')} />
                {t(item.labelKey)}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={clsx(
                'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
                pathname.startsWith('/admin')
                  ? 'bg-secondary font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              {t('nav.admin')}
            </Link>
          )}
        </nav>

        {/* Bottom utility strip */}
        <div className="border-t px-3 py-2">
          <div className="mb-2 flex items-center gap-1 rounded-md border p-1">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              title="中文 / English"
              className="flex flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {lang === 'zh' ? '中 / EN' : 'EN / 中'}
            </button>
          </div>
          <div className="mb-2 flex items-center gap-1 rounded-md border p-1">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                title={opt.label}
                className={clsx(
                  'flex flex-1 items-center justify-center rounded px-2 py-1',
                  theme === opt.value ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
              >
                <opt.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 truncate text-left">{userName}</span>
            </button>
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-full rounded-md border bg-card p-1 shadow-lg">
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-secondary"
                >
                  {t('nav.settings')}
                </Link>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> {t('nav.signout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen flex-1 md:ml-60">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 px-3 py-2 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded p-1 hover:bg-secondary"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={siteLogo || LOGO_URL} alt="logo" className="h-6 w-6 rounded-md object-cover" />
              <span className="text-sm font-semibold">{siteName || t('app.name')}</span>
            </Link>
          </div>
        </div>
        {banner && (
          <div
            className={`px-4 py-2 text-center text-sm font-medium ${
              banner.color === 'amber'
                ? 'bg-amber-500/15 text-amber-600'
                : banner.color === 'red'
                  ? 'bg-red-500/15 text-red-600'
                  : banner.color === 'green'
                    ? 'bg-green-500/15 text-green-600'
                    : 'bg-blue-500/15 text-blue-600'
            }`}
          >
            {banner.text}
          </div>
        )}
        {children}
        {footerText && (
          <footer className="border-t bg-card px-6 py-3 text-center text-xs text-muted-foreground">
            {footerText}
          </footer>
        )}
      </main>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={siteLogo || LOGO_URL} alt="logo" className="h-6 w-6 rounded-md object-cover" />
                <span className="font-semibold">{siteName || t('app.name')}</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="rounded p-1 hover:bg-secondary" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2">
              {NAV.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx(
                      'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm',
                      active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className="mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t('nav.admin')}
                </Link>
              )}
            </nav>
            <div className="border-t p-3">
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> {t('nav.signout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
