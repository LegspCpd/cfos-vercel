'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import ProvidersManager from '@/components/ProvidersManager';
import AuditLogView from '@/components/AuditLogView';
import CfAccessStatus from '@/components/CfAccessStatus';
import { useI18n } from '@/lib/client/i18n';

interface Overview {
  settings: { signupsEnabled: boolean };
  users: {
    id: string;
    username: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    _count: { workspaces: number };
  }[];
}

export default function AdminPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notAdmin, setNotAdmin] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .adminOverview()
      .then(setData)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) setNotAdmin(true);
        else setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function toggleSignups() {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const next = !data.settings.signupsEnabled;
      await api.adminSetSignups(next);
      setData({ ...data, settings: { signupsEnabled: next } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('ad.title')}</h1>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : notAdmin ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
          {t('err.notAdmin')}
        </div>
      ) : data ? (
        <div className="space-y-8">
          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          {/* Settings */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-4 text-base font-semibold">{t('ad.settings')}</h2>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div>
                <p className="font-medium">{t('ad.registration')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('ad.regDesc')}
                </p>
              </div>
              <button
                onClick={toggleSignups}
                disabled={saving}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  data.settings.signupsEnabled ? 'bg-primary' : 'bg-secondary'
                }`}
                aria-label="Toggle registration"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    data.settings.signupsEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('pr.updated')} {data.settings.signupsEnabled ? t('ad.regOn') : t('ad.regOff')}
            </p>
          </section>

          {/* Users */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-4 text-base font-semibold">
              {t('ad.users')} <span className="text-muted-foreground">({data.users.length})</span>
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t('auth.username')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ad.role')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ws.title')}</th>
                  <th className="py-2 font-medium">{t('ad.joined')}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-mono">{u.username}</span>
                      <span className="ml-2 text-muted-foreground">{u.displayName}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {u.isAdmin ? (
                        <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{t('ad.admin')}</span>
                      ) : (
                        <span className="text-muted-foreground">{t('ad.user')}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{u._count.workspaces}</td>
                    <td className="py-2 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* AI Providers */}
          <ProvidersManager />

          {/* Cloudflare Access status */}
          <CfAccessStatus />

          {/* Audit log */}
          <AuditLogView />
        </div>
      ) : null}
    </div>
  );
}
