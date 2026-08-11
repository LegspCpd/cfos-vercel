'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rocket,
  Plus,
  Loader2,
  Globe,
  Copy,
  CheckCircle2,
  XCircle,
  Github,
  Gitlab,
  UploadCloud,
  ArrowRight,
  FolderTree,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface DeploymentRow {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  pagesProject: string;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  error: string | null;
  createdAt: string;
}

async function copyText(u: string) {
  try {
    await navigator.clipboard.writeText(u);
  } catch {
    /* ignore */
  }
}

// The Pages dashboard (/pages), styled after Cloudflare Pages' "Get started" screen: a
// prominent hero with two big cards ("Import a Git repository" / "Drag and drop files"),
// each with a "Get started" button, followed by the list of deployed projects.
export default function PagesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [gitlabEnabled, setGitlabEnabled] = useState(false);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await api.pagesSources();
      setAvailable(s.available);
      setGithubEnabled(s.github.enabled);
      setGitlabEnabled(s.gitlab.enabled);
    } catch {
      /* ignore */
    }
    try {
      const r = await api.listDeployments();
      setDeployments(r.deployments);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Hero: how do you want to start? */}
      {available && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{t('pg.getStartedTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('pg.getStartedDesc')}</p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* Import a Git repository */}
            <div className="flex flex-col rounded-lg border bg-card p-6 transition hover:border-primary/50 hover:shadow-md">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FolderTree className="h-4 w-4 text-primary" />
                {t('pg.importGitTitle')}
              </div>
              <p className="mt-2 flex-1 text-xs text-muted-foreground">{t('pg.importGitDesc')}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                <Github className="h-3.5 w-3.5" /> GitHub
                <span className="mx-1">·</span>
                <Gitlab className="h-3.5 w-3.5" /> GitLab
                {(!githubEnabled && !gitlabEnabled) && <span className="ml-1">({t('pg.notConfigured')})</span>}
              </div>
              <button
                onClick={() => router.push('/pages/new')}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t('pg.getStarted')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Drag and drop files */}
            <div className="flex flex-col rounded-lg border bg-card p-6 transition hover:border-primary/50 hover:shadow-md">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UploadCloud className="h-4 w-4 text-primary" />
                {t('pg.dragDropTitle')}
              </div>
              <p className="mt-2 flex-1 text-xs text-muted-foreground">{t('pg.dragDropDesc')}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                <Rocket className="h-3.5 w-3.5" /> .zip / 文件夹
              </div>
              <button
                onClick={() => router.push('/pages/deploy?source=upload')}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t('pg.getStarted')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!available && (
        <div className="mb-8 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('pg.notConfiguredMsg')}
        </div>
      )}

      {/* Project list header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Rocket className="h-5 w-5 text-primary" /> {t('pg.title')}
        </h2>
        {available && (
          <button
            onClick={() => router.push('/pages/new')}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t('pg.newProject')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : deployments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('pg.emptyProjects')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deployments.map((d) => (
            <div key={d.id} className="flex flex-col rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{d.pagesProject}</span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    d.status === 'deployed'
                      ? 'text-green-600'
                      : d.status === 'failed'
                        ? 'text-red-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {d.status === 'deployed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : d.status === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {d.status}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {d.workspaceTitle && <div>{d.workspaceTitle}</div>}
                <div>{new Date(d.createdAt).toLocaleString()}</div>
                {d.pagesUrl && (
                  <button onClick={() => copyText(d.pagesUrl ?? '')} className="flex items-center gap-1 text-primary hover:underline">
                    <Copy className="h-3 w-3" />
                    <span className="max-w-[14rem] truncate">{d.pagesUrl}</span>
                  </button>
                )}
                {d.error && <div className="text-red-500">{d.error}</div>}
              </div>

              <div className="mt-auto flex items-center gap-2 pt-3">
                <button
                  onClick={() => router.push(`/pages/${d.id}`)}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
                >
                  {t('pg.check')}
                </button>
                <button
                  onClick={() => d.pagesUrl && window.open(d.pagesUrl, '_blank')}
                  disabled={!d.pagesUrl}
                  className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-40"
                >
                  <Globe className="h-3 w-3" /> {t('pg.open')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
