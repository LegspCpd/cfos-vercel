'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Code2,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Plus,
  Trash2,
  Loader2,
  Rocket,
  History,
  Plug,
  Activity,
  Terminal,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

type DetailTab = 'versions' | 'bindings' | 'observability' | 'logs';

interface WorkerDetail {
  id: string;
  workerName: string;
  projectName: string | null;
  status: string;
  error: string | null;
  log: string | null;
  code: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface VersionRow {
  id: string;
  number: string;
  createdOn: string;
  source: string;
  authorEmail: string | null;
}

interface BindingRow {
  name: string;
  type: string;
  namespaceId?: string;
  databaseId?: string;
  queueName?: string;
}

interface RouteRow {
  id: string;
  pattern: string;
  script: string;
}

interface SecretRow {
  name: string;
  type: string;
}

// The Worker detail page: overview (URL / status / custom domains) on top, tabs below.
// The top-right "编辑代码" button enters the fullscreen IDE (/compute/worker/[id]).
export default function WorkerDetailPanel({ workerId }: { workerId: string }) {
  const router = useRouter();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>('versions');
  const [copied, setCopied] = useState(false);

  // Versions.
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Bindings (beta).
  const [bindingsEnabled, setBindingsEnabled] = useState(false);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [showAddBinding, setShowAddBinding] = useState(false);
  const [newBinding, setNewBinding] = useState({ name: '', type: 'kv_namespace', namespace_id: '', database_id: '', queue_name: '' });
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [newSecret, setNewSecret] = useState({ name: '', value: '' });
  const [bindingMsg, setBindingMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Routes / custom domains.
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domainMsg, setDomainMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Observability.
  const [analytics, setAnalytics] = useState<{ requests: number; errors: number; cpuMs: number; buckets: { t: string; requests: number; errors: number }[] } | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Deploy logs.
  const [deployLog, setDeployLog] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.getWorker(workerId);
      setWorker(r.worker);
      setDeployLog((r.worker.log || '').split('\n').filter(Boolean));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const loadBindings = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([api.getWorkerBindings(workerId), api.getWorkerSecrets(workerId)]);
      setBindingsEnabled(b.enabled);
      setBindings(b.bindings);
      setSecrets(s.secrets);
    } catch {
      setBindingsEnabled(false);
      setBindings([]);
      setSecrets([]);
    }
  }, [workerId]);

  const loadRoutes = useCallback(async () => {
    try {
      const r = await api.getWorkerRoutes(workerId);
      setRoutes(r.routes);
    } catch {
      setRoutes([]);
    }
  }, [workerId]);

  useEffect(() => {
    if (worker) void loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const now = Date.now();
      const since = new Date(now - (analyticsRange === '24h' ? 24 : analyticsRange === '7d' ? 7 * 24 : 30 * 24) * 3600_000).toISOString();
      const until = new Date(now).toISOString();
      const r = await api.getWorkerAnalytics(workerId, since, until);
      setAnalytics(r);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [workerId, analyticsRange]);

  // Load tab data lazily when the tab is opened.
  useEffect(() => {
    if (!worker || loading) return;
    if (tab === 'versions') {
      setVersionsLoading(true);
      api.getWorkerVersions(workerId).then((r) => setVersions(r.versions)).catch(() => setVersions([])).finally(() => setVersionsLoading(false));
    } else if (tab === 'bindings') {
      void loadBindings();
    } else if (tab === 'observability') {
      void loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, worker, loading, loadAnalytics]);

  function copyUrl() {
    if (!worker) return;
    navigator.clipboard?.writeText(worker.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function addDomain() {
    const pattern = newDomain.trim().toLowerCase();
    if (!pattern) return;
    try {
      await api.addWorkerRoute(workerId, pattern);
      setDomainMsg({ text: t('wk.ide.domainAdded') || 'Domain added', type: 'ok' });
      setNewDomain('');
      setShowAddDomain(false);
      void loadRoutes();
    } catch (e) {
      setDomainMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  async function removeDomain(routeId: string) {
    try {
      await api.deleteWorkerRoute(workerId, routeId);
      setDomainMsg({ text: t('wk.ide.domainRemoved') || 'Domain removed', type: 'ok' });
      void loadRoutes();
    } catch (e) {
      setDomainMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  async function addBinding() {
    try {
      await api.addWorkerBinding(workerId, {
        name: newBinding.name.trim(),
        type: newBinding.type,
        namespace_id: newBinding.namespace_id.trim() || undefined,
        database_id: newBinding.database_id.trim() || undefined,
        queue_name: newBinding.queue_name.trim() || undefined,
      });
      setBindingMsg({ text: 'Binding added', type: 'ok' });
      setShowAddBinding(false);
      setNewBinding({ name: '', type: 'kv_namespace', namespace_id: '', database_id: '', queue_name: '' });
      void loadBindings();
    } catch (e) {
      setBindingMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  async function removeBinding(name: string) {
    try {
      await api.deleteWorkerBinding(workerId, name);
      void loadBindings();
    } catch (e) {
      setBindingMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  async function addSecret() {
    try {
      await api.addWorkerSecret(workerId, newSecret.name.trim(), newSecret.value);
      setBindingMsg({ text: 'Secret set', type: 'ok' });
      setShowAddSecret(false);
      setNewSecret({ name: '', value: '' });
      void loadBindings();
    } catch (e) {
      setBindingMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  async function removeSecret(name: string) {
    try {
      await api.deleteWorkerSecret(workerId, name);
      void loadBindings();
    } catch (e) {
      setBindingMsg({ text: (e as Error).message, type: 'err' });
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound || !worker) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{t('wk.ide.notFound') || 'Worker not found or deleted'}</p>
        <button
          onClick={() => router.push('/compute/worker-and-pages')}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('wk.ide.back') || 'Back'}
        </button>
      </div>
    );
  }

  const tabs: { key: DetailTab; label: string; icon: typeof History }[] = [
    { key: 'versions', label: t('wk.ide.versions') || 'Versions', icon: History },
    { key: 'bindings', label: `${t('wk.ide.bindings') || 'Bindings'} (${t('wk.ide.beta') || 'beta'})`, icon: Plug },
    { key: 'observability', label: t('wk.ide.observability') || 'Observability', icon: Activity },
    { key: 'logs', label: t('wk.ide.deployLogs') || 'Deploy logs', icon: Terminal },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Top bar: back + title + actions */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push('/compute/worker-and-pages')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('wk.ide.back') || 'Back'}
        </button>
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{worker.projectName || worker.workerName}</h1>
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{worker.workerName}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => window.open(worker.url, '_blank')}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('wk.ide.visit') || 'Visit'}
        </button>
        <button
          onClick={() => router.push(`/compute/worker/${workerId}`)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Code2 className="h-3.5 w-3.5" />
          {t('wk.ide.previewCode') || 'Edit code'}
        </button>
      </div>

      {/* Overview card */}
      <div className="mb-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.url') || 'URL'}</div>
            <button onClick={copyUrl} className="mt-0.5 flex max-w-full items-center gap-1.5 text-sm text-primary hover:underline">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{worker.url}</span>
              {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 shrink-0" />}
            </button>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.status') || 'Status'}</div>
            <div className={clsx('mt-0.5 flex items-center gap-1.5 text-sm', worker.status === 'deployed' ? 'text-green-600' : 'text-red-500')}>
              <span className={clsx('h-2 w-2 rounded-full', worker.status === 'deployed' ? 'bg-green-500' : 'bg-red-500')} />
              {worker.status}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.updatedAt') || 'Updated'}</div>
            <div className="mt-0.5 text-sm">{new Date(worker.updatedAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.createdAt') || 'Created'}</div>
            <div className="mt-0.5 text-sm">{new Date(worker.createdAt).toLocaleString()}</div>
          </div>
        </div>

        {/* Custom domains */}
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{t('wk.ide.domains') || 'Custom domains'}</div>
            <button
              onClick={() => setShowAddDomain((v) => !v)}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"
            >
              <Plus className="h-3 w-3" />
              {t('wk.ide.addDomain') || 'Add domain'}
            </button>
          </div>
          {showAddDomain && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder={t('wk.ide.domainPlaceholder') || 'e.g. example.com'}
                className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={addDomain}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Rocket className="h-3.5 w-3.5" />
                {t('wk.ide.addDomain') || 'Add'}
              </button>
              <span className="text-[11px] text-muted-foreground">{t('wk.ide.domainHint') || 'Add the CNAME record at your DNS provider.'}</span>
            </div>
          )}
          {domainMsg && <div className={clsx('mb-2 text-xs', domainMsg.type === 'ok' ? 'text-green-600' : 'text-red-500')}>{domainMsg.text}</div>}
          {routes.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('wk.ide.noDomains') || 'No custom domains yet.'}</div>
          ) : (
            <div className="space-y-1">
              {routes.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{r.pattern}</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => removeDomain(r.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    title={t('pg.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={clsx(
              'flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm',
              tab === tb.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary/50',
            )}
          >
            <tb.icon className="h-3.5 w-3.5" />
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-lg border bg-card">
        {tab === 'versions' && (
          <div className="p-4">
            {versionsLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : versions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('wk.ide.noVersions') || 'No versions yet.'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">{t('wk.ide.versionId') || 'Version ID'}</th>
                      <th className="px-3 py-2">{t('wk.ide.deployedAt') || 'Deployed at'}</th>
                      <th className="px-3 py-2">{t('wk.ide.traffic') || 'Traffic'}</th>
                      <th className="px-3 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{v.id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{new Date(v.createdOn).toLocaleString()}</td>
                        <td className="px-3 py-2">{v.number}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{v.source || v.authorEmail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'bindings' && (
          <div className="p-4">
            {!bindingsEnabled ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('wk.ide.bindingDisabled') || 'Bindings management is disabled (beta).'}</div>
            ) : (
              <div className="space-y-4">
                {bindingMsg && <div className={clsx('text-xs', bindingMsg.type === 'ok' ? 'text-green-600' : 'text-red-500')}>{bindingMsg.text}</div>}
                {/* Bindings */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{t('wk.ide.bindings') || 'Bindings'}</div>
                    <button
                      onClick={() => setShowAddBinding((v) => !v)}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      <Plus className="h-3 w-3" />
                      {t('wk.ide.addBinding') || 'Add binding'}
                    </button>
                  </div>
                  {showAddBinding && (
                    <div className="mb-2 space-y-2 rounded-md border p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={newBinding.name}
                          onChange={(e) => setNewBinding({ ...newBinding, name: e.target.value })}
                          placeholder={t('wk.ide.bindingName') || 'Binding name'}
                          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <select
                          value={newBinding.type}
                          onChange={(e) => setNewBinding({ ...newBinding, type: e.target.value })}
                          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="kv_namespace">KV Namespace</option>
                          <option value="d1_database">D1 Database</option>
                          <option value="queue">Queue</option>
                        </select>
                      </div>
                      {newBinding.type === 'kv_namespace' && (
                        <input
                          value={newBinding.namespace_id}
                          onChange={(e) => setNewBinding({ ...newBinding, namespace_id: e.target.value })}
                          placeholder="Namespace ID"
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                      {newBinding.type === 'd1_database' && (
                        <input
                          value={newBinding.database_id}
                          onChange={(e) => setNewBinding({ ...newBinding, database_id: e.target.value })}
                          placeholder="Database ID"
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                      {newBinding.type === 'queue' && (
                        <input
                          value={newBinding.queue_name}
                          onChange={(e) => setNewBinding({ ...newBinding, queue_name: e.target.value })}
                          placeholder="Queue name"
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                      <button
                        onClick={addBinding}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        {t('wk.ide.addBinding') || 'Add binding'}
                      </button>
                    </div>
                  )}
                  {bindings.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t('wk.ide.noBindings') || 'No bindings yet.'}</div>
                  ) : (
                    <div className="space-y-1">
                      {bindings.map((b) => (
                        <div key={b.name} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono">{b.name}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{b.type}</span>
                          <div className="flex-1" />
                          <button
                            onClick={() => removeBinding(b.name)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('pg.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Secrets */}
                <div className="border-t pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{t('wk.ide.secretName') || 'Secrets'}</div>
                    <button
                      onClick={() => setShowAddSecret((v) => !v)}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      <Plus className="h-3 w-3" />
                      {t('wk.ide.addSecret') || 'Add secret'}
                    </button>
                  </div>
                  {showAddSecret && (
                    <div className="mb-2 space-y-2 rounded-md border p-3">
                      <input
                        value={newSecret.name}
                        onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value })}
                        placeholder={t('wk.ide.secretName') || 'Secret name'}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        value={newSecret.value}
                        onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                        placeholder={t('wk.ide.secretValue') || 'Secret value'}
                        type="password"
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="text-[11px] text-muted-foreground">{t('wk.ide.secretValueHint') || 'Sent to Cloudflare only — never stored or shown.'}</div>
                      <button
                        onClick={addSecret}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        {t('wk.ide.addSecret') || 'Add secret'}
                      </button>
                    </div>
                  )}
                  {secrets.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t('wk.ide.noSecrets') || 'No secrets yet.'}</div>
                  ) : (
                    <div className="space-y-1">
                      {secrets.map((s) => (
                        <div key={s.name} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono">{s.name}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{s.type}</span>
                          <div className="flex-1" />
                          <button
                            onClick={() => removeSecret(s.name)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('pg.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'observability' && (
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <select
                value={analyticsRange}
                onChange={(e) => setAnalyticsRange(e.target.value as '24h' | '7d' | '30d')}
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="24h">{t('wk.ide.last24h') || 'Last 24 hours'}</option>
                <option value="7d">{t('wk.ide.last7d') || 'Last 7 days'}</option>
                <option value="30d">{t('wk.ide.last30d') || 'Last 30 days'}</option>
              </select>
              <button
                onClick={() => loadAnalytics()}
                className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-secondary"
              >
                <RefreshCw className="h-3 w-3" />
                {t('wk.ide.reconnect') || 'Refresh'}
              </button>
            </div>
            {analyticsLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : !analytics || analytics.requests === 0 && analytics.errors === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('wk.ide.noAnalytics') || 'No metrics yet.'}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.requests') || 'Requests'}</div>
                  <div className="mt-1 text-2xl font-bold">{analytics.requests.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.errors') || 'Errors'}</div>
                  <div className="mt-1 text-2xl font-bold text-red-500">{analytics.errors.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('wk.ide.cpuTime') || 'CPU time'}</div>
                  <div className="mt-1 text-2xl font-bold">{(analytics.cpuMs / 1000).toFixed(2)}s</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="p-4">
            {deployLog.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('wk.ide.logsEmpty') || 'No logs yet.'}</div>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
                {deployLog.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}