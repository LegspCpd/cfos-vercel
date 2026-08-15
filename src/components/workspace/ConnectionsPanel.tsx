'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plug, Github, Gitlab, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface Props {
  workspaceId: string;
}

// The "Connections" tab — shows which external providers (GitHub / GitLab) the user has connected
// to their account. In the original CF OS this is where gadget-level resource bindings live; here
// we surface the account-level connections that the agent can use (read repos, create issues…).
// This is a read-only summary of the connections available to the workspace's owner.
export default function ConnectionsPanel({ workspaceId: _workspaceId }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<{ github: boolean; google: boolean; microsoft: boolean; gitlab: boolean } | null>(null);
  const [github, setGithub] = useState<{ connected: boolean; githubLogin: string | null; writeAccess: string } | null>(null);
  const [gitlab, setGitlab] = useState<{ connected: boolean; gitlabUsername: string | null; writeAccess: string } | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.connectionsAvailable(),
      api.githubStatus(),
      api.gitlabStatus(),
    ]).then(([a, g, l]) => {
      if (a.status === 'fulfilled') setAvailable(a.value);
      if (g.status === 'fulfilled') setGithub(g.value);
      if (l.status === 'fulfilled') setGitlab(l.value);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cards = [
    {
      key: 'github',
      label: 'GitHub',
      icon: Github,
      enabled: available?.github ?? false,
      connected: github?.connected ?? false,
      identity: github?.githubLogin,
      access: github?.writeAccess,
    },
    {
      key: 'gitlab',
      label: 'GitLab',
      icon: Gitlab,
      enabled: available?.gitlab ?? false,
      connected: gitlab?.connected ?? false,
      identity: gitlab?.gitlabUsername,
      access: gitlab?.writeAccess,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plug className="h-5 w-5 text-primary" /> {t('ws.connectionsTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('ws.connectionsDesc')}</p>
      </div>

      <div className="space-y-3">
        {cards.map((c) => (
          <div key={c.key} className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  {c.connected
                    ? c.identity
                      ? `@${c.identity} · ${c.access === 'readwrite' ? t('ws.readWrite') : t('ws.readOnly')}`
                      : t('ws.connected')
                    : c.enabled
                      ? t('ws.notConnected')
                      : t('ws.notConfigured')}
                </p>
              </div>
            </div>
            {c.connected ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">{t('ws.connectionsNote')}</p>
    </div>
  );
}
