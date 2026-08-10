'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getToken } from '@/lib/client/auth';
import { api } from '@/lib/client/api';
import StatsCards from '@/components/StatsCards';
import SiteSettingsPanel from '@/components/SiteSettingsPanel';
import UserManagement from '@/components/UserManagement';
import ProvidersManager from '@/components/ProvidersManager';
import CfAccessStatus from '@/components/CfAccessStatus';
import AuditLogView from '@/components/AuditLogView';
import { useI18n } from '@/lib/client/i18n';

export default function AdminPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [notAdmin, setNotAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        if (!me.isAdmin) setNotAdmin(true);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));
  }, [router]);

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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t('ad.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">站点统计、设置、用户、AI 提供方与审计。</p>
      </div>

      {/* Stats: full-width row */}
      <StatsCards />

      {/* Two-column region: site settings + user management */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <SiteSettingsPanel />
        <div className="space-y-6">
          <UserManagement />
          <ProvidersManager />
        </div>
      </div>

      {/* Second two-column region: access status + audit log */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <CfAccessStatus />
        <AuditLogView />
      </div>
    </div>
  );
}
