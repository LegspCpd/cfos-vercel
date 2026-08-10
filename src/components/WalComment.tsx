'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Floating "chat" (public comments) widget in the bottom-right corner.
// Backed by Waline (https://waline.js.org) pointed at the deployment's comment server.
// Rendered only inside AppShell (i.e. after login), so only signed-in users see it.

const SERVER_URL = 'https://chat.api.legspcpd.top';
const WALINE_CSS = 'https://unpkg.com/@waline/client@v3/dist/waline.css';
const WALINE_JS = 'https://unpkg.com/@waline/client@v3/dist/waline.js';

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
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
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
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export default function WalComment() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const walineRef = useRef<{ destroy: () => void } | null>(null);

  // Load Waline assets once (on first open).
  async function ensureWaline() {
    if (loaded) return;
    await loadStyles(WALINE_CSS);
    const ok = await loadWalineInit();
    if (!ok) return;
    setLoaded(true);
  }

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
      placeholder: '欢迎在公开聊天区发言…',
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
              <MessagesSquareIcon /> 公开聊天
            </span>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-secondary" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Waline body */}
          <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {!loaded && <p className="py-6 text-center text-sm text-muted-foreground">加载评论区…</p>}
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
