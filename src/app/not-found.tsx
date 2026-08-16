import Link from 'next/link';
import { Home, Compass, Search } from 'lucide-react';

// Custom 404 — a modern, on-brand "lost in the grid" page that reuses the app's
// aurora + blueprint backdrop (body already carries it) and the frosted-glass
// surface from the sidebar, so it feels like part of the product rather than a
// default Next.js error.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      {/* Glowing 404 */}
      <div className="relative mb-6">
        <div
          className="absolute inset-0 -z-10 scale-150 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.25), transparent 70%)' }}
          aria-hidden="true"
        />
        <p className="bg-gradient-to-br from-primary via-primary/70 to-foreground/80 bg-clip-text text-7xl font-black tracking-tight text-transparent sm:text-8xl">
          404
        </p>
      </div>

      <h1 className="text-xl font-semibold sm:text-2xl">页面走丢了</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        你访问的页面不存在、已被移动，或者从未存在过。试试回到首页，或者用搜索找找看。
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <Home className="h-4 w-4" /> 回到首页
        </Link>
        <Link
          href="/workspaces"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          <Compass className="h-4 w-4" /> 我的工作区
        </Link>
        <Link
          href="/docs"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          <Search className="h-4 w-4" /> 部署文档
        </Link>
      </div>

      {/* Decorative grid card */}
      <div className="mt-12 grid w-full max-w-md grid-cols-3 gap-3 opacity-60">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg border bg-card/60"
            style={{
              backgroundImage:
                'linear-gradient(to right, hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.4) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />
        ))}
      </div>
    </main>
  );
}