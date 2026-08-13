'use client';

import { useState } from 'react';
import { Code2, Rocket } from 'lucide-react';
import { useI18n } from '@/lib/client/i18n';
import { WorkersPanel } from '../worker/page';
import { PagesPanel } from '../../pages/page';

// The "Workers 和 Pages" product page: Workers and Pages are ONE entry, with two tabs here
// (mirroring Cloudflare's combined product). `?tab=worker|pages` selects the initial tab
// (read from window.location to avoid the useSearchParams Suspense boundary requirement).
function initialTabFromUrl(): 'worker' | 'pages' {
  if (typeof window === 'undefined') return 'worker';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'pages' ? 'pages' : 'worker';
}

export default function WorkerAndPagesPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'worker' | 'pages'>(initialTabFromUrl);

  // Switching a tab updates the URL (?tab=...) without a reload, so a refresh/bookmark keeps
  // the active tab.
  function switchTab(next: 'worker' | 'pages') {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Combined product header */}
      <div className="mb-4 px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-bold">{t('nav.workersAndPages')}</h1>
      </div>

      {/* Tabs */}
      <div className="border-b px-4 sm:px-6">
        <div className="flex gap-6">
          <button
            onClick={() => switchTab('worker')}
            className={`flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium transition ${
              tab === 'worker'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code2 className="h-4 w-4" />
            {t('nav.worker')}
          </button>
          <button
            onClick={() => switchTab('pages')}
            className={`flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium transition ${
              tab === 'pages'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Rocket className="h-4 w-4" />
            {t('nav.pages')}
          </button>
        </div>
      </div>

      {/* Panels — both stay mounted so switching tabs keeps their loaded state (no refetch on
          every switch). The inactive one is hidden via CSS, not unmounted. */}
      <div className="pt-4">
        <div className={tab === 'worker' ? '' : 'hidden'} aria-hidden={tab !== 'worker'}>
          <WorkersPanel />
        </div>
        <div className={tab === 'pages' ? '' : 'hidden'} aria-hidden={tab !== 'pages'}>
          <PagesPanel />
        </div>
      </div>
    </div>
  );
}
