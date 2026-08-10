'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Unlink, CheckCircle2, Loader2 } from 'lucide-react';
import { GithubIcon, GoogleIcon, GitlabIcon } from '@/components/BrandIcons';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface ConnState {
  connected: boolean;
  label: string | null;
}

const EMPTY: ConnState = { connected: false, label: null };

export default function ConnectionsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [github, setGithub] = useState<ConnState>(EMPTY);
  const [google, setGoogle] = useState<ConnState>(EMPTY);
  const [gitlab, setGitlab] = useState<ConnState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const [gh, go, gl] = await Promise.all([
        api.githubStatus(),
        api.googleStatus(),
        api.gitlabStatus(),
      ]);
      setGithub({ connected: gh.connected, label: gh.githubLogin });
      setGoogle({ connected: go.connected, label: go.googleEmail });
      setGitlab({ connected: gl.connected, label: gl.gitlabUsername });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const params = new URL(window.location.href).searchParams;
    if (params.get('connected')) setMessage(t('conn.success'));
    if (params.get('error')) setMessage(`${t('conn.fail')}：${params.get('error')}`);
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/connections');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function connect(provider: string) {
    setBusyKey(provider);
    const token = encodeURIComponent(getToken() || '');
    window.location.href = `/api/${provider}/connect?token=${token}`;
  }

  async function disconnect(provider: 'github' | 'google' | 'gitlab') {
    setBusyKey(provider);
    try {
      if (provider === 'github') {
        await api.githubDisconnect();
        setGithub(EMPTY);
      } else if (provider === 'google') {
        await api.googleDisconnect();
        setGoogle(EMPTY);
      } else {
        await api.gitlabDisconnect();
        setGitlab(EMPTY);
      }
      setMessage(t('conn.disconnected'));
    } finally {
      setBusyKey(null);
    }
  }

  const providers = [
    {
      key: 'github',
      name: 'GitHub',
      desc: (connected: boolean) =>
        connected
          ? t('conn.githubConnected').replace('{name}', `@${github.label}`)
          : t('conn.githubDisconnected'),
      Icon: GithubIcon,
      state: github,
    },
    {
      key: 'google',
      name: 'Google',
      desc: (connected: boolean) =>
        connected
          ? t('conn.googleConnected').replace('{name}', `${google.label}`)
          : t('conn.googleDisconnected'),
      Icon: GoogleIcon,
      state: google,
    },
    {
      key: 'gitlab',
      name: 'GitLab',
      desc: (connected: boolean) =>
        connected
          ? t('conn.gitlabConnected').replace('{name}', `@${gitlab.label}`)
          : t('conn.gitlabDisconnected'),
      Icon: GitlabIcon,
      state: gitlab,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">{t('conn.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('conn.subtitle')}</p>

      {message && (
        <div className="mt-4 rounded-md bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {providers.map((p) => (
            <div key={p.key} className="rounded-lg border bg-card p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <p.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {p.state.connected && (
                      <span className="flex items-center gap-1 rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> {t('pr.connected')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{p.desc(p.state.connected)}</p>
                </div>
              </div>
              <div className="mt-4 border-t pt-4">
                {p.state.connected ? (
                  <button
                    onClick={() => disconnect(p.key as 'github' | 'google' | 'gitlab')}
                    disabled={busyKey === p.key}
                    className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Unlink className="h-4 w-4" /> {t('conn.disconnect')}
                  </button>
                ) : (
                  <button
                    onClick={() => connect(p.key)}
                    disabled={busyKey === p.key}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Link2 className="h-4 w-4" /> {t('conn.connect')} {p.name}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {t('conn.footer')}
      </p>
    </div>
  );
}
