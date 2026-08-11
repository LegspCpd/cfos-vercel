'use client';

import { useEffect, useState } from 'react';
import {
  Rocket,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  RefreshCw,
  Link as LinkIcon,
  Copy,
  Check,
} from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
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

export default function DeployPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!open) return;
    api.listWorkspaces().then((r) => {
      setWorkspaces(r.workspaces);
      if (!selected && r.workspaces.length) setSelected(r.workspaces[0].id);
    }).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function refresh() {
    try {
      const r = await api.listDeployments();
      setDeployments(r.deployments);
    } catch {
      /* ignore */
    }
  }

  async function deploy() {
    if (!selected || deploying) return;
    setDeploying(true);
    setMessage(null);
    try {
      const r = await api.deployWorkspace(selected);
      if (r.ok) {
        setMessage({
          ok: true,
          text: `${t('deploy.deployed')} ${r.pagesUrl ?? ''}${r.shortUrl ? ` · ${t('deploy.short')} ${r.shortUrl}` : ''}`,
        });
      } else {
        setMessage({ ok: false, text: r.error || t('deploy.failed') });
      }
      await refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || t('deploy.failed') });
    } finally {
      setDeploying(false);
    }
  }

  async function check(id: string) {
    setBusyId(id);
    try {
      await api.checkDeployment(id);
      await refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || t('deploy.checkFailed') });
    } finally {
      setBusyId(null);
    }
  }

  async function bindDomain(id: string) {
    const domain = domainInput.trim();
    if (!domain) return;
    setBusyId(id);
    try {
      const r = await api.bindDeploymentDomain(id, domain);
      if (r.ok) {
        setMessage({ ok: true, text: `${t('deploy.domainBound')} ${r.customDomain}` });
        setDomainInput('');
        await refresh();
      } else {
        setMessage({ ok: false, text: r.error || t('deploy.bindFailed') });
      }
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || t('deploy.bindFailed') });
    } finally {
      setBusyId(null);
    }
  }

  async function copyUrl(u: string) {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(u);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Rocket className="h-5 w-5 text-primary" /> {t('deploy.title')}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {message && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                message.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Select workspace */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('deploy.selectWorkspace')}</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-md border bg-card px-3 py-2 text-sm"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button
              onClick={deploy}
              disabled={!selected || deploying}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {t('deploy.build')}
            </button>
          </div>

          {/* Deployment history */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('deploy.history')}</h3>
              <button onClick={refresh} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {deployments.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('deploy.noHistory')}</p>
            ) : (
              <div className="space-y-2">
                {deployments.map((d) => (
                  <div key={d.id} className="rounded-md border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{d.workspaceTitle}</span>
                      <span
                        className={`flex items-center gap-1 ${
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

                    <div className="mt-2 space-y-1 text-muted-foreground">
                      {d.pagesUrl && (
                        <button onClick={() => copyUrl(d.pagesUrl ?? '')} className="flex items-center gap-1 hover:text-foreground">
                          {copied === d.pagesUrl ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          <span className="truncate">{d.pagesUrl}</span>
                        </button>
                      )}
                      {d.shortUrl && (
                        <button onClick={() => copyUrl(d.shortUrl ?? '')} className="flex items-center gap-1 hover:text-foreground">
                          {copied === d.shortUrl ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          <LinkIcon className="h-3 w-3" /> <span className="truncate">{d.shortUrl}</span>
                        </button>
                      )}
                      {d.customDomain && (
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {d.customDomain}
                        </div>
                      )}
                      {d.error && <div className="text-red-500">{d.error}</div>}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => check(d.id)}
                        disabled={busyId === d.id}
                        className="rounded border px-2 py-1 hover:bg-secondary disabled:opacity-50"
                      >
                        {busyId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('deploy.check')}
                      </button>
                      <button
                        onClick={() => d.pagesUrl && window.open(d.pagesUrl, '_blank')}
                        disabled={!d.pagesUrl}
                        className="rounded border px-2 py-1 hover:bg-secondary disabled:opacity-40"
                      >
                        {t('deploy.open')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bind domain (attached to the most recent deployment) */}
        {deployments.length > 0 && (
          <div className="border-t p-4">
            <label className="mb-1 block text-xs text-muted-foreground">{t('deploy.bindDomain')}</label>
            <div className="flex gap-2">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="app.example.com"
                className="flex-1 rounded-md border bg-card px-3 py-2 text-sm"
              />
              <button
                onClick={() => bindDomain(deployments[0].id)}
                disabled={busyId === deployments[0].id || !domainInput.trim()}
                className="rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/70 disabled:opacity-50"
              >
                {busyId === deployments[0].id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('deploy.bind')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
