'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Github } from 'lucide-react';
import { api } from '@/lib/client/api';
import { setToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(decodeURIComponent(oauthError));
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
    window.location.href = '/api/auth/github';
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.signinTitle')}</p>
        </div>

        {/* GitHub login */}
        <button
          onClick={githubLogin}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          <Github className="h-4 w-4" />
          {t('auth.github')}
        </button>

        <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          OR
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6 shadow">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.username')}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
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
      </div>
    </main>
  );
}
