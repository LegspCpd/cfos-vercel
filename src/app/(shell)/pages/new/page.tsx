'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LayoutGrid,
  Github,
  Gitlab,
  FileArchive,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface SourceOption {
  id: 'workspace' | 'github' | 'gitlab' | 'upload';
  icon: typeof LayoutGrid;
  titleKey: string;
  descKey: string;
  enabled: boolean;
}

// The "deploy with what?" source chooser (/pages/new). It is shown the moment the user
// hits "New project"; picking a source then jumps to the matching deploy screen at
// /pages/deploy?source=<id>. Keeps the flow: choose source first → then configure/deploy.
export default function NewProjectPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [github, setGithub] = useState({ enabled: false });
  const [gitlab, setGitlab] = useState({ enabled: false });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .pagesSources()
      .then((s) => {
        setAvailable(s.available);
        setGithub({ enabled: s.github.enabled });
        setGitlab({ enabled: s.gitlab.enabled });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const options: SourceOption[] = [
    {
      id: 'workspace',
      icon: LayoutGrid,
      titleKey: 'pg.sourceWorkspace',
      descKey: 'pg.chooseWorkspaceDesc',
      enabled: true,
    },
    {
      id: 'github',
      icon: Github,
      titleKey: 'pg.github',
      descKey: 'pg.githubDesc',
      enabled: github.enabled,
    },
    {
      id: 'gitlab',
      icon: Gitlab,
      titleKey: 'pg.gitlab',
      descKey: 'pg.gitlabDesc',
      enabled: gitlab.enabled,
    },
    {
      id: 'upload',
      icon: FileArchive,
      titleKey: 'pg.sourceUpload',
      descKey: 'pg.uploadDesc',
      enabled: true,
    },
  ];

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{t('pg.notConfiguredMsg')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button onClick={() => router.push('/pages')} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('pg.backProjects')}
      </button>
      <h1 className="mb-2 text-2xl font-bold">{t('pg.chooseSource')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('pg.chooseSourceDesc')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              disabled={!opt.enabled}
              onClick={() => router.push(`/pages/deploy?source=${opt.id}`)}
              className="group flex items-start gap-4 rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-1 font-medium">
                  {t(opt.titleKey)}
                  {!opt.enabled && <span className="text-xs text-muted-foreground">({t('pg.notConfigured')})</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(opt.descKey)}</span>
              </span>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
