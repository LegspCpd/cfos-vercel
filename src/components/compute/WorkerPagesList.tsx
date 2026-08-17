'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2,
  Rocket,
  Plus,
  Loader2,
  Globe,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

// A unified row for the merged Workers + Pages list.
interface ProjectRow {
  id: string;
  kind: 'worker' | 'pages';
  name: string; // display name (projectName || workerName / pagesProject)
  subName: string; // workerName / pagesProject (the real id)
  status: string;
  url: string | null;
  live: boolean;
  source: string | null;
  createdAt: string;
}

// The merged "Worker 和 Pages" list: Workers and Pages projects appear in ONE list (no tabs),
// with a search box that filters by project name. Clicking a row opens the matching detail page.
export function WorkerPagesList() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workersConfigured, setWorkersConfigured] = useState(true);
  const [pagesAvailable, setPagesAvailable] = useState(false);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    // Load Workers + Pages in parallel; each failing independently degrades to its own
    // "not configured" state instead of breaking the whole list.
    const [w, p] = await Promise.allSettled([api.listWorkers(), api.listDeployments()]);
    const workerRows: ProjectRow[] = [];
    if (w.status === 'fulfilled') {
      setWorkersConfigured(w.value.configured);
      workerRows.push(
        ...w.value.workers.map((x) => ({
          id: x.id,
          kind: 'worker' as const,
          name: x.projectName || x.workerName,
          subName: x.workerName,
          status: x.status,
          url: x.url,
          live: x.live,
          source: null,
          createdAt: x.createdAt,
        })),
      );
    }
    const pageRows: ProjectRow[] = [];
    if (p.status === 'fulfilled') {
      setPagesAvailable(true);
      pageRows.push(
        ...p.value.deployments.map((d) => ({
          id: d.id,
          kind: 'pages' as const,
          name: d.projectName || d.pagesProject,
          subName: d.pagesProject,
          status: d.status,
          url: d.pagesUrl,
          live: d.status === 'deployed',
          source: d.source,
          createdAt: d.createdAt,
        })),
      );
    }
    // Newest first across both kinds.
    setRows([...workerRows, ...pageRows].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Client-side filter by project name (case-insensitive, matches name + subName).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.subName.toLowerCase().includes(q));
  }, [rows, query]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(''), 1500);
  }

  async function remove(row: ProjectRow) {
    if (deleting) return;
    setDeleting(true);
    try {
      if (row.kind === 'worker') await api.deleteWorker(row.id);
      else await api.deleteDeployment(row.id);
    } catch {
      setDeleting(false);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setDeleting(false);
    void load();
  }

  function open(row: ProjectRow) {
    if (row.kind === 'worker') router.push(`/compute/worker/${row.id}/detail`);
    else router.push(`/pages/${row.id}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 h-5 w-48 animate-pulse rounded bg-secondary" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      </div>
    );
  }

  const notConfigured = !workersConfigured && !pagesAvailable;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header: title + search + new project */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('nav.workersAndPages')}</h1>
        <div className="flex items-center gap-2">
          {/* Search box — filters by project name */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('wk.searchPlaceholder') || 'Search projects…'}
              className="w-56 rounded-md border bg-background py-1.5 pl-8 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => router.push('/compute/worker-and-pages/new')}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t('wk.newWorker') || 'New project'}
          </button>
        </div>
      </div>

      {notConfigured ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t('wk.notConfiguredMsg') || 'Worker is not configured. Set WORKER_API_TOKEN and WORKER_ACCOUNT_ID.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {query
            ? (t('wk.noSearchResults') || 'No projects match your search.')
            : (t('wk.empty') || 'No projects yet. Click "New project" to deploy your first script.')}
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
          {filtered.map((row, idx) => (
            <div
              key={`${row.kind}-${row.id}`}
              role="button"
              tabIndex={0}
              onClick={() => open(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') open(row);
              }}
              style={{ animationDelay: `${Math.min(idx * 35, 280)}ms` }}
              className={`reveal-row group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-secondary/50 sm:flex-row sm:items-center sm:gap-3 ${
                idx > 0 ? 'border-t' : ''
              }`}
            >
              {/* Name + kind badge */}
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-center gap-1.5">
                  {row.kind === 'worker' ? (
                    <Code2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Rocket className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className="truncate text-sm font-semibold hover:underline">{row.name}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {row.kind === 'worker' ? 'Worker' : 'Pages'}
                  </span>
                  {row.source && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {row.source}
                    </span>
                  )}
                  {row.kind === 'worker' && !row.live && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-600">deleted</span>
                  )}
                </div>
                {row.subName !== row.name && (
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{row.subName}</div>
                )}
              </div>

              {/* Status */}
              <div className="flex shrink-0 items-center gap-1 text-xs">
                {row.status === 'deployed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : row.status === 'failed' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                <span
                  className={
                    row.status === 'deployed'
                      ? 'text-green-600'
                      : row.status === 'failed'
                        ? 'text-red-600'
                        : 'text-muted-foreground'
                  }
                >
                  {row.status === 'deployed' ? t('pg.success') : row.status}
                </span>
              </div>

              {/* URL */}
              <div className="min-w-0 sm:flex-1">
                {row.url ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copy(row.url ?? '');
                    }}
                    className="flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.url}</span>
                    {copied === row.url ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5 shrink-0" />}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>

              {/* Created time */}
              <div className="shrink-0 text-xs text-muted-foreground sm:w-32">
                <span className="sm:hidden">· </span>
                {new Date(row.createdAt).toLocaleString()}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 sm:ml-auto sm:justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (row.url) window.open(row.url, '_blank');
                  }}
                  disabled={!row.url}
                  className="rounded border p-1 text-muted-foreground hover:bg-secondary disabled:opacity-40"
                  title={t('dd.open')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(row);
                  }}
                  disabled={deleting}
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
  );
}