'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Share2, FileCode2, Copy, Download, Upload } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface GadgetArchive {
  format: 'cfos-gadget';
  version: 1;
  title: string;
  exportedAt: string;
  files: { path: string; content: string; isEntry: boolean }[];
}

export default function BlueprintsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
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
      );
      router.push(`/workspace/${res.workspace.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {t('bp.note')}
      </p>
    </div>
  );
}
