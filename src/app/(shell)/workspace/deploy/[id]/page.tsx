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
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface DeploymentDetail {
  id: string;
  workspaceId: string;
  workspaceTitle: string | null;
  pagesProject: string;
  cfDeploymentId: string | null;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  error: string | null;
  log: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDir: string | null;
  envJson: string | null;
  createdAt: string;
  updatedAt: string;
}

// The deployment detail page (/workspace/deploy/[id]). Shows a single deployment's
// full result — status, project name, pages/short URLs, build config, and the complete
// saved log — with copy/open/check actions. The deploy page auto-navigates here after
// a successful deploy.
function CopyButton({ url, copied, onCopy }: { url: string; copied: string; onCopy: (u: string) => void }) {
  return (
    <button
      onClick={() => onCopy(url)}
      className="flex max-w-full items-center gap-1.5 text-primary hover:underline"
      title={url}
    >
      {copied === url ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
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
        <Link href="/workspace/deploy" className="mt-4 inline-block text-primary hover:underline">
          {t('dd.back')}
        </Link>
      </div>
    );
  }

  const statusOk = dep.status === 'deployed';

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/workspace/deploy" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('dd.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Rocket className="h-6 w-6 text-primary" /> {t('dd.title')}
        </h1>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            statusOk ? 'bg-green-500/10 text-green-600' : dep.status === 'failed' ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'
          }`}
        >
          {statusOk ? <CheckCircle2 className="h-4 w-4" /> : dep.status === 'failed' ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {dep.status}
        </span>
      </div>

      {dep.error && <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{dep.error}</div>}

      <div className="space-y-6">
        {/* Result */}
        <div className="rounded-lg border bg-card p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.project')}</dt>
              <dd className="font-mono text-foreground">{dep.pagesProject}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.workspace')}</dt>
              <dd>{dep.workspaceTitle || '—'}</dd>
            </div>
            {dep.pagesUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.pagesUrl')}</dt>
                <dd>
                  <CopyButton url={dep.pagesUrl} copied={copied} onCopy={copy} />
                </dd>
              </div>
            )}
            {dep.shortUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.shortUrl')}</dt>
                <dd>
                  <CopyButton url={dep.shortUrl} copied={copied} onCopy={copy} />
                </dd>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.createdAt')}</dt>
              <dd>{new Date(dep.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <button
              onClick={() => dep.pagesUrl && window.open(dep.pagesUrl, '_blank')}
              disabled={!dep.pagesUrl}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Globe className="h-4 w-4" /> {t('dd.open')}
            </button>
            <button
              onClick={check}
              disabled={checking}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {checking ? t('dd.checking') : t('dd.check')}
            </button>
            <button
              onClick={() => router.push(`/workspace/deploy${dep.workspaceId ? `?workspace=${dep.workspaceId}` : ''}`)}
              className="rounded-md border px-3 py-2 text-sm hover:bg-secondary"
            >
              {t('dd.redeploy')}
            </button>
          </div>
        </div>

        {/* Build config */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Terminal className="h-4 w-4 text-primary" /> {t('dd.config')}
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.installCmd')}</dt>
              <dd className="font-mono">{dep.installCommand || t('dd.none')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.buildCmd')}</dt>
              <dd className="font-mono">{dep.buildCommand || t('dd.none')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.outputDir')}</dt>
              <dd className="font-mono">{dep.outputDir || t('dd.none')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{t('dd.envJson')}</dt>
              <dd className="font-mono whitespace-pre-wrap break-all">{dep.envJson || t('dd.none')}</dd>
            </div>
          </dl>
        </div>

        {/* Saved log */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Terminal className="h-4 w-4 text-primary" /> {t('dd.log')}
          </h3>
          <div className="max-h-96 overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
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
        </div>
      </div>
    </div>
  );
}
