'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket,
  ArrowLeft,
  RefreshCw,
  Globe,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  ExternalLink,
  Github,
  Gitlab,
  UploadCloud,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface DeploymentDetail {
  id: string;
  workspaceId: string;
  workspaceTitle: string | null;
  pagesProject: string;
  projectName: string | null;
  source: string | null;
  repo: string | null;
  repoRef: string | null;
  cfDeploymentId: string | null;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  customDomains: string[];
  error: string | null;
  log: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDir: string | null;
  envJson: string | null;
  createdAt: string;
  updatedAt: string;
}

// The deployment detail page (/pages/[id]). Shows a single deployment's full result —
// status, project name, pages/short URLs, build config, and the complete saved log — with
// copy/open/check actions. The deploy screen auto-navigates here after a successful deploy.
function CopyButton({ url, copied, onCopy, dim, compact }: { url: string; copied: string; onCopy: (u: string) => void; dim?: boolean; compact?: boolean }) {
  return (
    <button
      onClick={() => onCopy(url)}
      className={
        'flex max-w-full items-center gap-1 hover:underline ' +
        (dim ? 'text-muted-foreground hover:text-primary' : 'text-primary')
      }
      title={url}
    >
      {copied === url ? <Check className={compact ? 'h-2.5 w-2.5 text-green-600' : 'h-3.5 w-3.5 text-green-600'} /> : <Copy className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />}
      <span className="truncate">{url}</span>
    </button>
  );
}

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [dep, setDep] = useState<DeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .getDeployment(id)
      .then((r) => setDep(r.deployment))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function copy(u: string) {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(u);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  }

  async function check() {
    if (!dep || checking) return;
    setChecking(true);
    try {
      const r = await api.checkDeployment(dep.id);
      setDep((prev) => (prev ? { ...prev, status: r.status, error: r.error ?? prev.error } : prev));
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (notFound || !dep) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{t('dd.notFound')}</p>
        <Link href="/pages" className="mt-4 inline-block text-primary hover:underline">
          {t('dd.back')}
        </Link>
      </div>
    );
  }

  const statusOk = dep.status === 'deployed';
  const isGit = dep.source === 'github' || dep.source === 'gitlab';
  const SourceIcon =
    dep.source === 'github' ? Github : dep.source === 'gitlab' ? Gitlab : dep.source === 'upload' ? UploadCloud : Rocket;
  const ageLabel = formatAge(dep.createdAt);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <Link href="/pages" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('dd.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{dep.projectName || dep.pagesProject}</h1>
          {dep.projectName && (
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{dep.pagesProject}</span>
          )}
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            statusOk
              ? 'bg-green-500/10 text-green-600'
              : dep.status === 'failed'
                ? 'bg-red-500/10 text-red-600'
                : 'bg-blue-500/10 text-blue-600'
          }`}
        >
          {statusOk ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : dep.status === 'failed' ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {dep.status}
        </span>
      </div>

      {dep.error && (
        <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{dep.error}</div>
      )}

      {/* Environments (CF-style table row: Environment | Source | Deployment | Status | Details) */}
      <section className="mb-6 overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Production</span>
          <button
            onClick={check}
            disabled={checking}
            className="flex items-center gap-1 text-[11px] normal-case text-primary hover:underline disabled:opacity-50"
          >
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {checking ? t('dd.checking') : t('dd.check')}
          </button>
        </div>

        {/* Deployment row */}
        <div className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto] sm:gap-4">
          {/* Source */}
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Source</div>
            <div className="flex items-center gap-1.5 text-sm">
              <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {isGit && dep.repo ? (
                <span className="truncate">
                  <span className="font-medium">{dep.repo}</span>
                  {dep.repoRef && <span className="ml-1 text-muted-foreground">@{dep.repoRef}</span>}
                </span>
              ) : dep.source === 'workspace' ? (
                <span className="truncate">{dep.workspaceTitle || t('dd.workspace')}</span>
              ) : dep.source === 'upload' ? (
                <span>{t('dd.uploadedSource') || 'Upload'}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>

          {/* Deployment (pagesUrl + short) */}
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Deployment</div>
            {dep.pagesUrl ? (
              <CopyButton url={dep.pagesUrl} copied={copied} onCopy={copy} />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            {dep.shortUrl && (
              <div className="mt-0.5">
                <CopyButton url={dep.shortUrl} copied={copied} onCopy={copy} dim />
              </div>
            )}
            {dep.customDomains.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                {dep.customDomains.map((dom) => (
                  <CopyButton key={dom} url={dom} copied={copied} onCopy={copy} dim compact />
                ))}
              </div>
            )}
          </div>

          {/* Status + age */}
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Status</div>
            <div className="flex items-center gap-1.5 text-sm">
              {statusOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : dep.status === 'failed' ? (
                <XCircle className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              <span>{ageLabel}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(dep.createdAt).toLocaleString()}</div>
          </div>

          {/* Details / actions */}
          <div className="flex items-center justify-end gap-1.5">
            {dep.pagesUrl && (
              <button
                onClick={() => window.open(dep.pagesUrl!, '_blank')}
                className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
                title={t('dd.open')}
              >
                <ExternalLink className="h-3 w-3" /> {t('dd.open')}
              </button>
            )}
            <button
              onClick={() => router.push(`/pages/${dep.id}`)}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
            >
              Details <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const src = dep.source;
            if (src === 'github' || src === 'gitlab') {
              const q = new URLSearchParams({ source: src });
              if (dep.repo) q.set('repo', dep.repo);
              if (dep.repoRef) q.set('ref', dep.repoRef);
              router.push(`/pages/deploy?${q.toString()}`);
            } else if (src === 'upload') {
              router.push('/pages/deploy?source=upload');
            } else if (src === 'workspace' && dep.workspaceId) {
              router.push(`/pages/deploy?source=workspace&workspace=${dep.workspaceId}`);
            } else {
              router.push('/pages/new');
            }
          }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" /> {t('dd.redeploy')}
        </button>
        {dep.pagesUrl && (
          <button
            onClick={() => window.open(dep.pagesUrl!, '_blank')}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-secondary"
          >
            <Globe className="h-4 w-4" /> {t('dd.open')}
          </button>
        )}
      </div>

      {/* Build config (flat rows) */}
      <section className="mb-6 overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('dd.config')}
        </div>
        <div className="divide-y">
          <ConfigRow label={t('dd.installCmd')} value={dep.installCommand || t('dd.none')} mono />
          <ConfigRow label={t('dd.buildCmd')} value={dep.buildCommand || t('dd.none')} mono />
          <ConfigRow label={t('dd.outputDir')} value={dep.outputDir || t('dd.none')} mono />
          <ConfigRow label={t('dd.envJson')} value={dep.envJson || t('dd.none')} mono multiline />
          {dep.workspaceTitle && (
            <ConfigRow label={t('dd.workspace')} value={dep.workspaceTitle} />
          )}
          {dep.repo && (
            <ConfigRow
              label={t('dd.source')}
              value={`${dep.source}${dep.repoRef ? ` @ ${dep.repoRef}` : ''}`}
              mono
            />
          )}
        </div>
      </section>

      {/* Saved log */}
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('dd.log')}
        </div>
        <div className="max-h-96 overflow-y-auto bg-black p-3 font-mono text-xs text-green-400">
          {dep.log ? (
            dep.log.split('\n').map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">{t('dd.noLog')}</span>
          )}
        </div>
      </section>
    </div>
  );
}

function ConfigRow({ label, value, mono, multiline }: { label: string; value: string; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-start gap-3 px-4 py-2 text-sm sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={
          'min-w-0 break-all ' +
          (mono ? 'font-mono' : '') +
          ' ' +
          (multiline ? 'whitespace-pre-wrap' : 'truncate')
        }
      >
        {value || '—'}
      </div>
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
