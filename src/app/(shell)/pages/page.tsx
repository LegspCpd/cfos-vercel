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
  X,
  Activity,
  Receipt,
  Check,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface DeploymentRow {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  pagesProject: string;
  projectName: string | null;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  error: string | null;
  createdAt: string;
}

interface PagesStats {
  account: { id: string; subdomain: string };
  usage: { used: number; quota: number };
  panels: { billingShow: boolean; accountShow: boolean };
  period: { label: string };
}

async function copyText(u: string) {
  try {
    await navigator.clipboard.writeText(u);
  } catch {
    /* ignore */
  }
}

// The Pages dashboard (/pages). Shows the deployed project list and a "New project" button.
// Clicking the button opens a modal with the two "how do you want to deploy?" cards (import a
// Git repository / drag and drop files). Picking one continues to the matching flow.
export default function PagesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [gitlabEnabled, setGitlabEnabled] = useState(false);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [stats, setStats] = useState<PagesStats | null>(null);
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  // Project deletion: target record + the typed name used to confirm.
  const [deleteTarget, setDeleteTarget] = useState<DeploymentRow | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

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
    }
    try {
      const st = await api.pagesStats();
      setStats(st);
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

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteInput !== (deleteTarget.projectName || deleteTarget.pagesProject) || deleting) return;
    setDeleting(true);
    try {
      await api.deleteDeployment(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteInput('');
      await load();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left column */}
        <div>
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold">
                <Rocket className="h-6 w-6 text-primary" /> {t('pg.title')}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('pg.subtitle')}</p>
            </div>
            {available && (
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t('pg.newProject')}
              </button>
            )}
          </div>

          {!available && (
            <div className="mb-6 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('pg.notConfiguredMsg')}
            </div>
          )}

      {/* Project list */}
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
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{d.projectName || d.pagesProject}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      setDeleteTarget(d);
                      setDeleteInput('');
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    title={t('pg.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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

        {/* Right column — usage / billing / account */}
        <div className="space-y-4">
          {/* Usage */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" /> {t('pg.usageTitle')}
              </h3>
              <button className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:opacity-90">
                {t('pg.upgrade')}
              </button>
            </div>
            {stats && (
              <>
                <p className="text-xs text-muted-foreground">{t('pg.usageTodayRequests')}</p>
                <div className="mt-1.5 flex items-baseline justify-between text-xs">
                  <span className="font-mono">
                    {stats.usage.used.toLocaleString()} / {stats.usage.quota.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, (stats.usage.used / stats.usage.quota) * 100).toFixed(1)}%` }}
                  />
                </div>
                <button className="mt-2 flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                  {t('pg.viewLimits')} <ArrowUpRight className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

          {/* Billing — hidden by default, enable via env or admin panel */}
          {stats?.panels.billingShow && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Receipt className="h-4 w-4 text-primary" /> {t('pg.billingTitle')}
                </h3>
                <button className="flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                  {t('pg.addPayment')} <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-3 py-2">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />
                  </svg>
                  <span className="text-xs font-medium">$0.00</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{t('pg.billingThisMonth')}</div>
              </div>
              <div className="mt-2 text-xs font-medium">{stats?.period.label}</div>
              <div className="mt-2 rounded-md border bg-background p-2">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Activity className="h-3 w-3" /> {t('pg.statRequests')}
                </div>
                <div className="mt-0.5 font-mono text-sm font-semibold">{stats ? Math.round(stats.usage.used / 30).toLocaleString() : '—'}</div>
              </div>
            </div>
          )}

          {/* Account Details — hidden by default, enable via env or admin panel */}
          {stats?.panels.accountShow && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">{t('pg.accountTitle')}</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Account ID</span>
                  <span className="flex items-center gap-1 truncate font-mono">
                    <span className="max-w-[10rem] truncate">{stats?.account.id || '—'}</span>
                    {stats?.account.id && (
                      <button onClick={() => stats && copy(stats.account.id, 'acct')} className="rounded p-0.5 text-muted-foreground hover:bg-secondary">
                        {copied === 'acct' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t('pg.subdomain')}</span>
                  <span className="flex items-center gap-1 font-mono">
                    <span className="truncate">{stats?.account.subdomain || '—'}</span>
                    {stats?.account.subdomain && (
                      <button onClick={() => stats && copy(stats.account.subdomain, 'sub')} className="rounded p-0.5 text-muted-foreground hover:bg-secondary">
                        {copied === 'sub' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New project modal — how do you want to deploy? */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNew(false)}>
          <div
            className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{t('pg.getStartedTitle')}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('pg.getStartedDesc')}</p>
              </div>
              <button onClick={() => setShowNew(false)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {/* Import a Git repository */}
              <button
                onClick={() => router.push('/pages/new')}
                className="group flex flex-col rounded-lg border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Github className="h-4 w-4 text-primary" />
                  {t('pg.importGitTitle')}
                </div>
                <p className="mt-2 flex-1 text-xs text-muted-foreground">{t('pg.importGitDesc')}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Github className="h-3.5 w-3.5" /> GitHub
                  <span className="mx-1">·</span>
                  <Gitlab className="h-3.5 w-3.5" /> GitLab
                  {(!githubEnabled && !gitlabEnabled) && <span className="ml-1">({t('pg.notConfigured')})</span>}
                </div>
                <span className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-primary group-hover:underline">
                  {t('pg.getStarted')} <ArrowRight className="h-4 w-4" />
                </span>
              </button>

              {/* Drag and drop files */}
              <button
                onClick={() => router.push('/pages/deploy?source=upload')}
                className="group flex flex-col rounded-lg border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UploadCloud className="h-4 w-4 text-primary" />
                  {t('pg.dragDropTitle')}
                </div>
                <p className="mt-2 flex-1 text-xs text-muted-foreground">{t('pg.dragDropDesc')}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Rocket className="h-3.5 w-3.5" /> .zip / 文件夹
                </div>
                <span className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-primary group-hover:underline">
                  {t('pg.getStarted')} <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete project confirmation — must type the project name */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div
            className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Trash2 className="h-5 w-5 text-red-600" /> {t('pg.deleteProjectTitle')}
            </h2>
            <p className="mt-1 text-sm text-foreground">
              {t('pg.deleteProjectWarning')}
              <code className="font-mono">{deleteTarget.projectName || deleteTarget.pagesProject}</code>
              {t('pg.deleteProjectWarningSuffix')}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{t('pg.deleteProjectConsequences')}</p>
            <div className="mt-2 rounded-md border bg-background p-3 text-xs text-muted-foreground">
              <ul className="list-inside list-disc space-y-1">
                <li>{t('pg.deleteConseqDeployments')}</li>
                <li>{t('pg.deleteConseqEnv')}</li>
                <li>{t('pg.deleteConseqAssets')}</li>
                <li>{t('pg.deleteConseqGit')}</li>
                <li>{t('pg.deleteConseqAccess')}</li>
                <li>{t('pg.deleteConseqAnalytics')}</li>
              </ul>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('pg.deleteHostnameNote')}
              <code className="font-mono">{deleteTarget.pagesProject}-acy.pages.dev</code>
              {t('pg.deleteHostnameNoteSuffix')}
            </p>

            <label className="mt-4 block text-sm font-medium">
              {t('pg.deleteTypeConfirm')} <code className="font-mono">{deleteTarget.projectName || deleteTarget.pagesProject}</code>
            </label>
            <input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={deleteTarget.projectName || deleteTarget.pagesProject}
              autoFocus
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border px-3 py-2 text-sm hover:bg-secondary"
              >
                {t('pg.cancel')}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== (deleteTarget.projectName || deleteTarget.pagesProject) || deleting}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('pg.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
