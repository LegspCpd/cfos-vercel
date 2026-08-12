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
  ExternalLink,
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
  source: string | null;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  customDomains: string[];
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
  // Add-domain: which project's input is open + the typed domain + submitting state.
  const [domainTarget, setDomainTarget] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainMsg, setDomainMsg] = useState<{ key: string; type: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    // Fire all three in parallel — the source check uses the light endpoint (no slow git
    // repo enumeration) so the project list renders as fast as possible.
    const [s, r, st] = await Promise.allSettled([
      api.pagesSourcesLight(),
      api.listDeployments(),
      api.pagesStats(),
    ]);
    if (s.status === 'fulfilled') {
      setAvailable(s.value.available);
      setGithubEnabled(s.value.github.enabled);
      setGitlabEnabled(s.value.gitlab.enabled);
    }
    if (r.status === 'fulfilled') setDeployments(r.value.deployments);
    if (st.status === 'fulfilled') setStats(st.value);
    setLoading(false);
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

  async function addDomain(d: DeploymentRow) {
    if (domainBusy) return;
    const domain = domainInput.trim().toLowerCase();
    // Loose domain validation mirroring the server-side check.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      setDomainMsg({ key: 'pg.domainInvalid', type: 'err' });
      return;
    }
    setDomainBusy(true);
    setDomainMsg(null);
    try {
      const r = await api.bindDeploymentDomain(d.id, domain);
      if (!r.ok) {
        setDomainMsg({ key: r.error || 'pg.domainAddFailed', type: 'err' });
        return;
      }
      setDomainMsg({ key: 'pg.domainAdded', type: 'ok' });
      setDomainInput('');
      // Re-fetch so the new domain appears in the list (from live CF state).
      await load();
    } catch {
      setDomainMsg({ key: 'pg.domainAddFailed', type: 'err' });
    } finally {
      setDomainBusy(false);
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
              </div>
              <div className="mt-4 h-8 w-full animate-pulse rounded-md bg-secondary" />
            </div>
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('pg.emptyProjects')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Header row */}
          <div className="hidden border-b bg-secondary/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto] sm:gap-3">
            <div>{t('dd.project')}</div>
            <div>{t('dd.status')}</div>
            <div>Deployment</div>
            <div>{t('dd.createdAt')}</div>
            <div className="text-right">Actions</div>
          </div>
          {deployments.map((d, idx) => (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/pages/${d.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(`/pages/${d.id}`);
              }}
              className={`group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-secondary/50 sm:flex-row sm:items-center sm:gap-3 ${
                idx > 0 ? 'border-t' : ''
              }`}
            >
              {/* Project name + source */}
              <div className="min-w-0 sm:col-span-1">
                <div className="flex items-center gap-1.5">
                  <Rocket className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-sm font-semibold">
                    {d.projectName || d.pagesProject}
                  </span>
                  {d.source && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {d.source}
                    </span>
                  )}
                </div>
                {d.workspaceTitle && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{d.workspaceTitle}</div>
                )}
              </div>

              {/* Status */}
              <div className="flex shrink-0 items-center gap-1 text-xs">
                {d.status === 'deployed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : d.status === 'failed' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                <span
                  className={
                    d.status === 'deployed'
                      ? 'text-green-600'
                      : d.status === 'failed'
                        ? 'text-red-600'
                        : 'text-muted-foreground'
                  }
                >
                  {d.status === 'deployed'
                    ? t('pg.success')
                    : d.status}
                </span>
              </div>

              {/* Deployment (pagesUrl + domains) */}
              <div className="min-w-0 space-y-0.5 text-xs sm:col-span-1">
                {d.pagesUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(d.pagesUrl ?? '');
                    }}
                    className="flex max-w-full items-center gap-1 text-primary hover:underline"
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{d.pagesUrl}</span>
                    <Copy className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
                {d.customDomains.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {d.customDomains.slice(0, 2).map((dom) => (
                      <button
                        key={dom}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyText(dom);
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <Globe className="h-2.5 w-2.5" />
                        <span className="max-w-[10rem] truncate">{dom}</span>
                      </button>
                    ))}
                    {d.customDomains.length > 2 && (
                      <span className="text-[11px] text-muted-foreground">+{d.customDomains.length - 2}</span>
                    )}
                  </div>
                )}
                {/* Add-domain inline */}
                <div onClick={(e) => e.stopPropagation()}>
                  {domainTarget === d.id ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        value={domainInput}
                        onChange={(e) => {
                          setDomainInput(e.target.value);
                          setDomainMsg(null);
                        }}
                        placeholder={t('pg.addDomainPlaceholder')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addDomain(d);
                          if (e.key === 'Escape') {
                            setDomainTarget(null);
                            setDomainMsg(null);
                          }
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border bg-background px-2 py-0.5 font-mono text-[11px]"
                      />
                      <button
                        onClick={() => addDomain(d)}
                        disabled={domainBusy}
                        className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {domainBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : t('pg.addDomain')}
                      </button>
                      <button
                        onClick={() => {
                          setDomainTarget(null);
                          setDomainInput('');
                          setDomainMsg(null);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-secondary"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setDomainTarget(d.id);
                        setDomainInput('');
                        setDomainMsg(null);
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    >
                      <Plus className="h-3 w-3" /> {t('pg.addDomain')}
                    </button>
                  )}
                  {domainTarget === d.id && domainMsg && (
                    <div className={`mt-0.5 text-[11px] ${domainMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                      {domainMsg.key.startsWith('pg.') ? t(domainMsg.key) : domainMsg.key}
                    </div>
                  )}
                </div>
              </div>

              {/* Created time */}
              <div className="shrink-0 text-xs text-muted-foreground sm:w-32">
                <span className="sm:hidden">· </span>
                {new Date(d.createdAt).toLocaleString()}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 sm:ml-auto sm:justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    d.pagesUrl && window.open(d.pagesUrl, '_blank');
                  }}
                  disabled={!d.pagesUrl}
                  className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-secondary disabled:opacity-40"
                  title={t('pg.open')}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(d);
                    setDeleteInput('');
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  title={t('pg.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
