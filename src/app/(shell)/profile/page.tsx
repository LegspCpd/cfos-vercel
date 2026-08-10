'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, Github, Chrome, Check, Link2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface MeInfo {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  avatarUrl: string;
  email: string;
  googleConnected: boolean;
  githubConnected: boolean;
  githubUsername: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((m) => {
        setMe(m);
        setDisplayName(m.displayName);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));

    // Show a success banner when returning from a Google link.
    const params = new URL(window.location.href).searchParams;
    if (params.get('googleLinked')) {
      setMessage(t('pr.googleLinked'));
      window.history.replaceState({}, '', '/profile');
    }
  }, [router, t]);

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

  async function handleAvatar(file: File) {
    setError('');
    setMessage('');
    if (!file.type.startsWith('image/')) {
      setError(t('pr.avatarTypeError') || '请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploadAvatar(file);
      setMe((m) => (m ? { ...m, avatarUrl: res.url } : m));
      setMessage(t('pr.avatarUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function connectGithub() {
    window.location.href = `/api/github/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  function connectGoogle() {
    window.location.href = `/api/auth/google/connect?token=${encodeURIComponent(getToken() || '')}`;
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

      {/* Avatar + profile */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-4">
          {me?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="avatar" className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/20" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {me?.displayName?.[0]?.toUpperCase() || me?.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold">{me?.displayName}</h2>
            <p className="text-sm text-muted-foreground">@{me?.username}</p>
            <p className="mt-1 text-xs">
              <span className="font-medium">{t('pr.role')}:</span>{' '}
              <span className={me?.isAdmin ? 'text-primary' : 'text-muted-foreground'}>
                {me?.isAdmin ? t('pr.roleAdmin') : t('pr.roleUser')}
              </span>
            </p>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium">{t('pr.avatar')}</label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t('pr.uploadingAvatar') : t('pr.uploadAvatar')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAvatar(f);
              e.target.value = '';
            }}
          />
        </label>

        <div className="mt-4">
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
        </div>
      </section>

      {/* Connections */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-base font-semibold">{t('pr.connections')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('pr.connectionsHint') || '连接后可一键用 GitHub / Google 登录返回此账号。'}
        </p>

        {/* GitHub */}
        <div className="mb-3 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Github className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">
                {me?.githubConnected
                  ? `${t('pr.githubConnected')}${me.githubUsername || ''}`
                  : t('pr.notConnected')}
              </p>
            </div>
          </div>
          {me?.githubConnected ? (
            <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" /> {t('pr.connected') || '已连接'}
            </span>
          ) : (
            <button
              onClick={connectGithub}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> {t('pr.connectGithub')}
            </button>
          )}
        </div>

        {/* Google */}
        <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Chrome className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {me?.googleConnected ? t('pr.googleConnected') : t('pr.notConnected')}
              </p>
            </div>
          </div>
          {me?.googleConnected ? (
            <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" /> {t('pr.connected') || '已连接'}
            </span>
          ) : (
            <button
              onClick={connectGoogle}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> {t('pr.connectGoogle')}
            </button>
          )}
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
