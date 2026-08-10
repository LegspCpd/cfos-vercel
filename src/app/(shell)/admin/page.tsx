'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getToken } from '@/lib/client/auth';
import { api } from '@/lib/client/api';
import StatsCards from '@/components/StatsCards';
import SiteSettingsPanel from '@/components/SiteSettingsPanel';
import ProvidersManager from '@/components/ProvidersManager';
import CfAccessStatus from '@/components/CfAccessStatus';
import AuditLogView from '@/components/AuditLogView';
import SignupToggle from '@/components/SignupToggle';
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
        // Admin panel access is now gated by the "admin.access" permission (user groups).
        if (!me.permissions?.includes('admin.access')) setNotAdmin(true);
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
        <p className="mt-1 text-sm text-muted-foreground">站点统计、设置、AI 提供方、审计与访问控制。</p>
        <p className="mt-1 text-sm text-muted-foreground">
          用户管理已移到独立页面：<a href="/admin/users" className="text-primary underline">进入用户管理 →</a>
        </p>
      </div>

      {/* Stats + registration toggle: prominent, full-width row */}
      <StatsCards />
      <SignupToggle />

      {/* Row 1: site settings (left) + audit log & CF Access (right column) */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <SiteSettingsPanel />
        <div className="space-y-6">
          <AuditLogView />
          <CfAccessStatus />
        </div>
      </div>

      {/* Row 2: AI providers — full-width at the very bottom */}
      <ProvidersManager />
    </div>
  );
}
