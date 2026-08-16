'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Settings, ShieldCheck, LayoutTemplate, KeyRound, ScrollText, Users, Ticket } from 'lucide-react';
import { getToken } from '@/lib/client/auth';
import { api } from '@/lib/client/api';
import StatsCards from '@/components/StatsCards';
import SiteSettingsPanel from '@/components/SiteSettingsPanel';
import ProvidersManager from '@/components/ProvidersManager';
import CfAccessStatus from '@/components/CfAccessStatus';
import SignupToggle from '@/components/SignupToggle';
import FormatsPanel from '@/components/FormatsPanel';
import ContextReviewPanel from '@/components/ContextReviewPanel';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

type AdminTab = 'general' | 'gatekeepers' | 'formats' | 'access';

// /admin — the deployment admin console, organised into four tabs just like the original CF OS:
//   General     — site settings, signup toggle, stats
//   Gatekeepers — AI providers, CF Access, connector management links
//   Formats     — output format blueprints overview
//   Access      — user management, audit log, tickets
// Tab state is synced to the URL hash (#general, #gatekeepers…) so a refresh keeps the tab.
export default function AdminPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [notAdmin, setNotAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<AdminTab>('general');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        if (!me.permissions?.includes('admin.access')) setNotAdmin(true);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));

    // Restore the active tab from the URL hash.
    const hash = window.location.hash.replace('#', '') as AdminTab;
    if (['general', 'gatekeepers', 'formats', 'access'].includes(hash)) setTab(hash);
  }, [router]);

  // Keep the URL hash in sync so refreshes preserve the tab.
  function switchTab(next: AdminTab) {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${next}`);
    }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (notAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
          {t('err.notAdmin')}
        </div>
      </div>
    );
  }

  const tabs: { value: AdminTab; label: string; icon: typeof Settings }[] = [
    { value: 'general', label: t('ad.tabGeneral'), icon: Settings },
    { value: 'gatekeepers', label: t('ad.tabGatekeepers'), icon: ShieldCheck },
    { value: 'formats', label: t('ad.tabFormats'), icon: LayoutTemplate },
    { value: 'access', label: t('ad.tabAccess'), icon: KeyRound },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('ad.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('ad.subtitle')}</p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b">
        {tabs.map((tb) => (
          <button
            key={tb.value}
            onClick={() => switchTab(tb.value)}
            className={clsx(
              'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition',
              tab === tb.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tb.icon className="h-4 w-4" />
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in space-y-6">
        {tab === 'general' && (
          <>
            <StatsCards />
            <SignupToggle />
            <SiteSettingsPanel />
          </>
        )}

        {tab === 'gatekeepers' && (
          <>
            <ProvidersManager />
            <CfAccessStatus />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Link
                href="/connections"
                className="flex items-center justify-between rounded-lg border bg-card p-5 transition hover:border-primary/40"
              >
                <div>
                  <p className="text-sm font-semibold">{t('ad.manageConnectors')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('ad.manageConnectorsDesc')}</p>
                </div>
                <span className="text-muted-foreground">→</span>
              </Link>
              <Link
                href="/providers"
                className="flex items-center justify-between rounded-lg border bg-card p-5 transition hover:border-primary/40"
              >
                <div>
                  <p className="text-sm font-semibold">{t('ad.manageProviders')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('ad.manageProvidersDesc')}</p>
                </div>
                <span className="text-muted-foreground">→</span>
              </Link>
            </div>
          </>
        )}

        {tab === 'formats' && (
          <>
            <FormatsPanel />
            <ContextReviewPanel />
          </>
        )}

        {tab === 'access' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/admin/users"
              className="flex items-center justify-between rounded-lg border bg-card p-5 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t('ad.users')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('ad.usersDesc')}</p>
                </div>
              </div>
              <span className="text-muted-foreground">→</span>
            </Link>
            <Link
              href="/admin/audit"
              className="flex items-center justify-between rounded-lg border bg-card p-5 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ScrollText className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t('ad.audit')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('ad.auditDesc')}</p>
                </div>
              </div>
              <span className="text-muted-foreground">→</span>
            </Link>
            <Link
              href="/admin/tickets"
              className="flex items-center justify-between rounded-lg border bg-card p-5 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Ticket className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t('ad.tickets')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('ad.ticketsDesc')}</p>
                </div>
              </div>
              <span className="text-muted-foreground">→</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
