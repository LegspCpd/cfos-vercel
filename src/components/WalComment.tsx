'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/client/i18n';

// Floating "chat" (public comments) widget in the bottom-right corner.
// Backed by Waline (https://waline.js.org) pointed at the deployment's comment server.
// Rendered only inside AppShell (i.e. after login), so only signed-in users see it.
//
// GATED BY ENV VAR: the feature is OFF by default (it's still in beta / unstable).
// Set NEXT_PUBLIC_COMMENTS_ENABLED=true in Vercel to turn it on.

// Waline comment server URL, configurable via env (inlined by Next at build time).
const SERVER_URL =
  process.env.NEXT_PUBLIC_COMMENTS_SERVER_URL || 'https://chat.example.com';
// Waline frontend assets are vendored into this deployment at build time
// (scripts/fetch-waline.mjs) and served from our own origin behind Cloudflare CDN,
// so visitors get them from the edge instead of unpkg. NEXT_PUBLIC_WALINE_CSS/JS can
// still override to point at a custom mirror if vendoring is unwanted.
const WALINE_CSS =
  process.env.NEXT_PUBLIC_WALINE_CSS || '/vendor/waline/waline.css';
const WALINE_JS =
  process.env.NEXT_PUBLIC_WALINE_JS || '/vendor/waline/waline.js';
// Off unless explicitly enabled via env var (inlined by Next at build time).
const COMMENTS_ENABLED = process.env.NEXT_PUBLIC_COMMENTS_ENABLED === 'true';

const MessagesSquareIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    <path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
  </svg>
);

function loadStyles(href: string) {
  return new Promise<void>((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

// High-priority prefetch for the Waline script so it downloads as early as possible
// (helps a lot when the CDN is slow / behind a proxy).
function preloadScript(src: string) {
  const existing = document.querySelector(`link[rel="preload"][href="${src}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'script';
  link.href = src;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

// Waline ships an ES module; expose its `init` on window via an inline module script.
function loadWalineInit() {
  return new Promise<boolean>((resolve) => {
    if ((window as any).__walineInit) return resolve(true);
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `
      import { init } from '${WALINE_JS}';
      window.__walineInit = init;
    `;
    s.addEventListener('load', () => resolve(true), { once: true });
    s.addEventListener('error', () => resolve(false), { once: true });
    document.head.appendChild(s);
  });
}

export default function WalComment() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const walineRef = useRef<{ destroy: () => void } | null>(null);

  // Preload Waline assets in the background as soon as the app loads, so opening the
  // comment panel later is instant (no waiting on the CDN, especially over slow links).
  // The module <script> is appended early and fetched ahead of the user opening the panel.
  async function ensureWaline() {
    if (loaded) return;
    await loadStyles(WALINE_CSS);
    const ok = await loadWalineInit();
    if (!ok) return;
    setLoaded(true);
  }

  // Warm-up: preload CSS+JS immediately on mount (feature enabled) so opening the panel
  // later is instant — the CDN fetch starts at page load, not on first click.
  useEffect(() => {
    if (!COMMENTS_ENABLED) return;
    preloadScript(WALINE_JS);
    ensureWaline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize Waline when the panel opens and assets are loaded.
  useEffect(() => {
    if (!open || !loaded || !containerRef.current) return;
    const init = (window as any).__walineInit;
    if (!init) return;
    walineRef.current = init({
      el: containerRef.current,
      serverURL: SERVER_URL,
      path: '/chat', // one shared public comment thread
      lang: 'zh-CN',
      dark: 'auto',
      login: 'enable',
      requiredMeta: ['nick'],
      placeholder: t('comments.placeholder'),
      reaction: true,
    });
    return () => {
      walineRef.current?.destroy();
      walineRef.current = null;
    };
  }, [open, loaded]);

  function toggle() {
    if (!open) {
      ensureWaline();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  // Feature is off by default — render nothing unless enabled via env var.
  // (Placed after all hooks so hook order stays consistent.)
  if (!COMMENTS_ENABLED) return null;

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-[400px] flex-col rounded-xl border bg-background shadow-2xl"
          style={{ height: 'min(70vh, 560px)' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MessagesSquareIcon /> {t('comments.title')}
            </span>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-secondary" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Waline body */}
          <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {!loaded && <p className="py-6 text-center text-sm text-muted-foreground">{t('comments.loading')}</p>}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={toggle}
        aria-label="Chat"
        className={`fixed bottom-5 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${
          open ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'
        }`}
      >
        <MessagesSquareIcon />
      </button>
    </>
  );
}
