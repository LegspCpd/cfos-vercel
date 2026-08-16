'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Share2, Copy, Download, Upload, Store, X, Loader2 } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { formatIcon } from '@/components/FormatBadge';

interface GadgetArchive {
  format: 'cfos-gadget';
  version: 1;
  title: string;
  exportedAt: string;
  // Optional: the output format the workspace was created from. Preserved on import
  // so a blueprint restores into the same format family.
  formatId?: string;
  files: { path: string; content: string; isEntry: boolean }[];
}

interface FormatOffer {
  id: string;
  title: string;
  description: string;
  output: { id: string; noun: string; plural: string; icon: string };
  agentHint: string;
  variants: { name: string; description?: string }[];
}

export default function BlueprintsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [formats, setFormats] = useState<FormatOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketTitle, setMarketTitle] = useState('');
  const [marketDesc, setMarketDesc] = useState('');
  const [marketFormat, setMarketFormat] = useState('');
  const [marketNoun, setMarketNoun] = useState('');
  const [marketPlural, setMarketPlural] = useState('');
  const [marketIcon, setMarketIcon] = useState('appWindow');
  const [marketAgentHint, setMarketAgentHint] = useState('');
  const [marketVariantName, setMarketVariantName] = useState('');
  const [marketVariantDesc, setMarketVariantDesc] = useState('');
  const [marketWorkspaceId, setMarketWorkspaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
    api
      .listFormats()
      .then((res) => setFormats(res.formats))
      .catch(() => {});
  }, [router]);

  async function copyShareLink(id: string) {
    try {
      // Create/reuse a public share token and copy the public blueprint URL, so anyone
      // with the link can view the app without logging in.
      const res = await api.createShareToken(id);
      await navigator.clipboard.writeText(res.url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function exportWorkspace(id: string) {
    setExportingId(id);
    try {
      const res = await api.getWorkspace(id);
      const archive: GadgetArchive = {
        format: 'cfos-gadget',
        version: 1,
        title: res.workspace.title,
        exportedAt: new Date().toISOString(),
        formatId: res.workspace.formatId ?? undefined,
        files: res.workspace.files.map((f) => ({
          path: f.path,
          content: f.content,
          isEntry: f.isEntry,
        })),
      };
      const blob = new Blob([JSON.stringify(archive, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.workspace.title.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'workspace'}.gadget.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportingId(null);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const archive = JSON.parse(text) as GadgetArchive;
      if (archive.format !== 'cfos-gadget' || !Array.isArray(archive.files)) {
        throw new Error(t('bp.invalidArchive'));
      }
      const res = await api.importWorkspace(
        archive.title || file.name.replace(/\.gadget\.json$/i, '') || 'Imported workspace',
        archive.files.map((f) => ({
          path: f.path,
          content: f.content,
          isEntry: f.isEntry,
        })),
        archive.formatId ?? null,
      );
      router.push(`/workspace/${res.workspace.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Submit the current workspace's files as a marketplace template. The admin reviews
  // it in the Formats panel; once approved it becomes a "New …" option for everyone.
  async function submitToMarketplace() {
    if (!marketTitle.trim() || !marketNoun.trim() || !marketPlural.trim()) {
      setError(t('bp.marketRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const wsId = marketWorkspaceId;
      if (!wsId) return;
      const ws = await api.getWorkspace(wsId);
      const id = `market.${wsId.slice(0, 8)}`;
      await api.uploadFormat({
        id,
        title: marketTitle.trim(),
        description: marketDesc.trim(),
        outputId: marketFormat || 'app',
        noun: marketNoun.trim(),
        plural: marketPlural.trim(),
        icon: marketIcon,
        agentHint: marketAgentHint.trim(),
        variants: [
          {
            name: marketVariantName.trim() || 'Default',
            description: marketVariantDesc.trim() || undefined,
            files: ws.workspace.files.map((f) => ({
              path: f.path,
              content: f.content,
              isEntry: f.isEntry,
            })),
          },
        ],
      });
      setMarketOpen(false);
      setMarketTitle('');
      setMarketDesc('');
      setMarketNoun('');
      setMarketPlural('');
      setMarketIcon('appWindow');
      setMarketAgentHint('');
      setMarketVariantName('');
      setMarketVariantDesc('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function openMarket(wsId: string) {
    setMarketWorkspaceId(wsId);
    setMarketOpen(true);
    setError('');
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('bp.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('bp.sub')}
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="press flex shrink-0 items-center gap-1.5 self-start rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50 sm:self-auto"
        >
          <Upload className="h-4 w-4" /> {importing ? t('bp.importing') : t('bp.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.gadget.json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
          }}
        />
      </div>

      {error && <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-4">
              <div className="skeleton h-10 w-10 shrink-0 rounded-md" />
              <div className="flex-1">
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton mt-2 h-3 w-1/5" />
              </div>
            </div>
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="animate-fade-in mt-6 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('bp.empty')}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {workspaces.map((w, i) => (
            <div
              key={w.id}
              style={{ animationDelay: `${i * 35}ms` }}
              className="reveal-row flex items-center justify-between rounded-lg border bg-card p-4 transition-colors duration-200 hover:border-primary/50 hover:shadow-md"
            >
              <Link href={`/workspace/${w.id}`} className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Share2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{w.title}</p>
                  <p className="text-xs text-muted-foreground">{w._count.files} {t('ws.files')}</p>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => copyShareLink(w.id)}
                  className="press flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === w.id ? t('bp.copied') : t('bp.copyLink')}
                </button>
                <button
                  onClick={() => exportWorkspace(w.id)}
                  disabled={exportingId === w.id}
                  className="press flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> {t('bp.export')}
                </button>
                <button
                  onClick={() => openMarket(w.id)}
                  className="press flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                  title={t('bp.marketSubmit')}
                >
                  <Store className="h-3.5 w-3.5" /> {t('bp.marketSubmit')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {t('bp.note')}
      </p>

      {/* Marketplace submission dialog */}
      {marketOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{t('bp.marketTitle')}</h3>
              <button
                onClick={() => setMarketOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{t('bp.marketDesc')}</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketName')}</span>
                <input
                  value={marketTitle}
                  onChange={(e) => setMarketTitle(e.target.value)}
                  placeholder={t('bp.marketNamePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketDescLabel')}</span>
                <textarea
                  value={marketDesc}
                  onChange={(e) => setMarketDesc(e.target.value)}
                  rows={2}
                  placeholder={t('bp.marketDescPlaceholder')}
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketNoun')}</span>
                  <input
                    value={marketNoun}
                    onChange={(e) => setMarketNoun(e.target.value)}
                    placeholder="Report"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketPlural')}</span>
                  <input
                    value={marketPlural}
                    onChange={(e) => setMarketPlural(e.target.value)}
                    placeholder="Reports"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketOutput')}</span>
                  <select
                    value={marketFormat}
                    onChange={(e) => setMarketFormat(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t('bp.marketOutputGeneric')}</option>
                    {formats.map((f) => (
                      <option key={f.id} value={f.output.id}>
                        {f.output.plural}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketIcon')}</span>
                  <select
                    value={marketIcon}
                    onChange={(e) => setMarketIcon(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {[
                      'fileText',
                      'gridNine',
                      'presentation',
                      'appWindow',
                      'flowArrow',
                      'kanban',
                      'chartBar',
                      'table',
                      'notebook',
                      'listChecks',
                    ].map((icon) => (
                      <option key={icon} value={icon}>
                        {icon}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketAgentHint')}</span>
                <textarea
                  value={marketAgentHint}
                  onChange={(e) => setMarketAgentHint(e.target.value)}
                  rows={2}
                  placeholder={t('bp.marketAgentHintPlaceholder')}
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketVariant')}</span>
                  <input
                    value={marketVariantName}
                    onChange={(e) => setMarketVariantName(e.target.value)}
                    placeholder="Default"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('bp.marketVariantDesc')}</span>
                  <input
                    value={marketVariantDesc}
                    onChange={(e) => setMarketVariantDesc(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setMarketOpen(false)}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                {t('cancel')}
              </button>
              <button
                onClick={submitToMarketplace}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('bp.marketSubmitBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
