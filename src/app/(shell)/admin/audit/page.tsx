'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, ScrollText } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import AuditLogView from '@/components/AuditLogView';
import { useI18n } from '@/lib/client/i18n';

// 操作日志: all audit/activity logs in one place (admin only).
export default function AdminAuditPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [notAdmin, setNotAdmin] = useState(false);

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
      .catch(() => setNotAdmin(true));
  }, [router]);

  if (notAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-muted-foreground">
        <XCircle className="mx-auto mb-4 h-10 w-10" />
        <p>{t('admin.noAuditAccess')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t('admin.audit')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.auditDesc')}</p>
        </div>
      </div>
      <AuditLogView />
    </div>
  );
}
