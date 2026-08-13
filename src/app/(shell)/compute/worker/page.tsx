'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Globe,
  X,
  Rocket,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface WorkerRow {
  id: string;
  workerName: string;
  projectName: string | null;
  status: string;
  error: string | null;
  log: string | null;
  url: string;
  live: boolean;
  createdAt: string;
}

export function WorkersPanel() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [copied, setCopied] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Deploy modal state.
  const [showDeploy, setShowDeploy] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [code, setCode] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [deployMsg, setDeployMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listWorkers();
      setWorkers(r.workers);
      setConfigured(true);
    } catch (e) {
      // 400 "not configured" → feature off.
      const err = (e as { message?: string }).message || '';
      setConfigured(!err.includes('not configured'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(''), 1500);
  }

  async function runDeploy() {
    if (deploying) return;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setDeployMsg({ text: t('wk.codeRequired') || 'Worker code is required', type: 'err' });
      return;
    }
    setDeploying(true);
    setLog((l) => [...l, '$ deploy worker…']);
    setDeployMsg(null);
    try {
      const r = await api.deployWorker({
        workerName: workerName.trim() || undefined,
        projectName: projectName.trim() || undefined,
        code: trimmedCode,
      });
      if (r.error) {
        setLog((l) => [...l, `[worker] failed: ${r.error}`]);
        setDeployMsg({ text: r.error, type: 'err' });
      } else {
        setLog((l) => [...l, `[worker] deployed ${r.workerName}`]);
        setDeployMsg({ text: t('wk.deployed') || 'Deployed', type: 'ok' });
        setWorkerName('');
        setProjectName('');
        setCode('');
        setTimeout(() => setShowDeploy(false), 800);
        await load();
      }
    } catch (e) {
      setLog((l) => [...l, `[worker] failed: ${(e as Error).message}`]);
      setDeployMsg({ text: (e as Error).message, type: 'err' });
    } finally {
      setDeploying(false);
    }
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteWorker(id);
      await load();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6 h-5 w-48 animate-pulse rounded bg-secondary" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <Code2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">
          {t('wk.notConfiguredMsg') || 'Worker is not configured. Set WORKER_API_TOKEN and WORKER_ACCOUNT_ID.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{t('wk.title') || 'Workers'}</h1>
        </div>
        <button
          onClick={() => {
            setShowDeploy(true);
            setLog([]);
            setDeployMsg(null);
          }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t('wk.newWorker') || 'New worker'}
        </button>
      </div>

      {/* List */}
      {workers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t('wk.empty') || 'No workers yet. Click "New worker" to deploy your first script.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden border-b bg-secondary/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] sm:gap-3">
            <div>{t('dd.project')}</div>
            <div>Deployment</div>
            <div>{t('dd.status')}</div>
            <div className="text-right">Actions</div>
          </div>
          {workers.map((w, idx) => (
            <div key={w.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${idx > 0 ? 'border-t' : ''}`}>
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-center gap-1.5">
                  <Code2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-sm font-semibold">{w.projectName || w.workerName}</span>
                  {!w.live && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-600">deleted</span>}
                </div>
                {w.workerName !== w.projectName && (
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{w.workerName}</div>
                )}
              </div>
              <div className="min-w-0 sm:flex-1">
                <button
                  onClick={() => copy(w.url)}
                  className="flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{w.url}</span>
                  {copied === w.url ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5 shrink-0" />}
                </button>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                {w.status === 'deployed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                )}
                <span className={w.status === 'deployed' ? 'text-green-600' : 'text-red-600'}>{w.status}</span>
              </div>
              <div className="flex items-center gap-1 sm:ml-auto">
                <button
                  onClick={() => window.open(w.url, '_blank')}
                  className="rounded border p-1 text-muted-foreground hover:bg-secondary"
                  title={t('dd.open')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(w.id)}
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

      {/* Deploy modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deploying && setShowDeploy(false)}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('wk.newWorker') || 'New worker'}</h3>
              <button onClick={() => setShowDeploy(false)} disabled={deploying} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  {t('wk.workerName') || 'Worker name (optional)'}
                  <input
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder={t('wk.workerNamePlaceholder') || 'auto-generated'}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t('wk.projectName') || 'Display name (optional)'}
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('wk.projectNamePlaceholder') || 'shows in the list'}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                {t('wk.code') || 'Worker code (JS)'}
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder={'export default {\n  async fetch(request) {\n    return new Response("Hello from Cloudflare OS!");\n  },\n};'}
                  className="mt-1 w-full rounded-md border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              {log.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
                  {log.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))}
                </div>
              )}
              {deployMsg && (
                <div className={`text-xs ${deployMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{deployMsg.text}</div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowDeploy(false)} disabled={deploying} className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
                {t('dd.cancel')}
              </button>
              <button
                onClick={runDeploy}
                disabled={deploying}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                {deploying ? t('wk.deploying') || 'Deploying…' : t('wk.deploy') || 'Deploy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkersPanel;
