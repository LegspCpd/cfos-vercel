'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        setDisplayName(me.displayName);
        setUsername(me.username);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function saveName() {
    setError('');
    setMessage('');
    setSavingName(true);
    try {
      const res = await api.updateProfile({ displayName });
      setDisplayName(res.user.displayName);
      setMessage(t('pr.displayUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    setError('');
    setMessage('');
    if (newPassword.length < 6) {
      setError(t('auth.pwTooShort'));
      return;
    }
    setSavingPw(true);
    try {
      await api.updateProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage(t('pr.pwUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('pr.title')}</h1>

      {message && <div className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{message}</div>}
      {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Profile */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-base font-semibold">{t('pr.profile')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('pr.usernameLabel')}: <span className="font-mono">{username}</span></p>
        <label className="mb-1 block text-sm font-medium">{t('pr.displayName')}</label>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={saveName}
            disabled={savingName}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingName ? t('saving') : t('save')}
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">{t('pr.changePw')}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('pr.currentPw')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('pr.newPw')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={savePassword}
            disabled={savingPw}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingPw ? t('pr.updating') : t('pr.updatePw')}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('pr.tip')}
        </p>
      </section>
    </div>
  );
}
