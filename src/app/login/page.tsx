'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { GithubIcon, GoogleIcon, MicrosoftIcon } from '@/components/BrandIcons';
import { api } from '@/lib/client/api';
import { setToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { LOGO_URL } from '@/lib/brand';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Only show sign-in providers whose OAuth env vars are configured (no dead buttons).
  const [available, setAvailable] = useState({ github: true, google: true, microsoft: true });

  useEffect(() => {
    api.connectionsAvailable().then(setAvailable).catch(() => {});
  }, []);

  // Handle OAuth callback: ?token= or ?error= on this page.
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const token = params.get('token');
    const oauthError = params.get('error');
    if (token) {
      setToken(token);
      // Clean the URL.
      window.history.replaceState({}, '', '/');
      router.push('/');
      return;
    }
    if (oauthError) {
      // Show the real error. Only a genuine cancel (access_denied / the literal cancel
      // message) maps to "登录已取消"; anything else is surfaced verbatim so real
      // failures (e.g. Microsoft token errors) are visible instead of being swallowed.
      const raw = decodeURIComponent(oauthError);
      const stripped = raw.replace(/^1001:\s*/, '').replace(/^1001$/, t('auth.cancelError'));
      const cancelled =
        stripped === t('auth.cancelError') ||
        stripped === 'access_denied' ||
        /登录已取消|access_denied/i.test(raw);
      setError(cancelled ? t('auth.retryCancel') : stripped);
      window.history.replaceState({}, '', '/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function githubLogin() {
    window.location.href = '/api/auth/github?from=login';
  }

  function googleLogin() {
    window.location.href = '/api/auth/google?from=login';
  }

  function microsoftLogin() {
    window.location.href = '/api/auth/microsoft?from=login';
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="logo" className="mx-auto mb-3 h-16 w-16 rounded-xl object-cover" />
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.signinTitle')}</p>
        </div>

        {/* OAuth login — only providers configured in the environment are shown */}
        {available.github && (
          <button
            onClick={githubLogin}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <GithubIcon className="h-4 w-4" />
            {t('auth.github')}
          </button>
        )}
        {available.google && (
          <button
            onClick={googleLogin}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <GoogleIcon className="h-4 w-4" />
            {t('auth.google')}
          </button>
        )}
        {available.microsoft && (
          <button
            onClick={microsoftLogin}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <MicrosoftIcon className="h-4 w-4" />
            {t('auth.microsoft')}
          </button>
        )}
        {(available.github || available.google || available.microsoft) && (
          <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6 shadow">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.usernameOrEmail')}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder={t('auth.usernameOrEmailPlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('auth.signingIn') : t('auth.signinBtn')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link href="/signup" className="text-primary hover:underline">
            {t('auth.createOne')}
          </Link>
        </p>
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-sm">
          <BookOpen className="h-3.5 w-3.5 text-primary/70" />
          <Link href="/docs" className="text-primary/70 hover:underline">
            {t('auth.docs')}
          </Link>
        </p>
      </div>
    </main>
  );
}
