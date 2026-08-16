'use client';

import { useEffect, useState } from 'react';
import { Loader2, Globe, Rocket, Copy, Check, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface PublishedSite {
  id: string;
  token: string;
  url: string;
  title: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

// One-click static publish panel: publish the workspace as a self-contained static
// site, show the public link, and allow republish/unpublish.
export default function PublishPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const [site, setSite] = useState<PublishedSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const res = await api.getPublishedSite(workspaceId);
      setSite(res.site);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function publish() {
    setBusy(true);
    setError('');
    try {
      const res = await api.publishWorkspace(workspaceId);
      setSite({
        id: res.id,
        token: res.token,
        url: res.url,
        title: res.title,
        fileCount: res.fileCount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!confirm(t('pub.confirmUnpublish'))) return;
    setBusy(true);
    setError('');
    try {
      await api.unpublishWorkspace(workspaceId);
      setSite(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!site) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${site.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const btnCls = 'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50';

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <Globe className="h-4 w-4 text-emerald-500" /> {t('pub.title')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('pub.desc')}</p>

      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : site ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
            <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
              {t('pub.published')}
            </span>
            <span className="text-xs text-muted-foreground">
              {site.fileCount} {t('pub.files')} · {t('pub.updated')} {new Date(site.updatedAt).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-xs">
              {window.location.origin}
              {site.url}
            </code>
            <button onClick={copyLink} className={btnCls} title={t('pub.copy')}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? t('pub.copied') : t('pub.copy')}
            </button>
            <a href={site.url} target="_blank" rel="noreferrer" className={btnCls} title={t('pub.open')}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="flex gap-2">
            <button onClick={publish} disabled={busy} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {t('pub.republish')}
            </button>
            <button onClick={unpublish} disabled={busy} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              {t('pub.unpublish')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('pub.notPublished')}</p>
          <button onClick={publish} disabled={busy} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {t('pub.publish')}
          </button>
        </div>
      )}
    </section>
  );
}