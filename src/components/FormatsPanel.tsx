'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X, Pencil, Trash2, Eye, EyeOff, Plus } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { formatIcon } from '@/components/FormatBadge';
import { clsx } from 'clsx';

interface AdminFormat {
  id: string;
  title: string;
  description: string;
  output: { id: string; noun: string; plural: string; icon: string };
  agentHint: string;
  enabled: boolean;
  isBundled: boolean;
  status: string;
  authorId: string | null;
  variants: { name: string; description?: string; files: { path: string; content: string; isEntry?: boolean }[] }[];
  createdAt: string;
  updatedAt: string;
}

// The admin Formats tab: curate which output formats the deployment offers (enable/
// disable, edit presentation + agent hint) and review marketplace submissions
// (pending → approved/rejected). Bundled formats can't be deleted — disable instead.
export default function FormatsPanel() {
  const { t } = useI18n();
  const [formats, setFormats] = useState<AdminFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminFormat | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.adminListFormats();
      setFormats(res.formats);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(f: AdminFormat) {
    setFormats((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)),
    );
    try {
      await api.adminUpdateFormat(f.id, { enabled: !f.enabled });
    } catch {
      load();
    }
  }

  async function review(f: AdminFormat, status: 'approved' | 'rejected') {
    setFormats((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, status, enabled: status === 'approved' } : x)),
    );
    try {
      await api.adminUpdateFormat(f.id, { status, enabled: status === 'approved' });
    } catch {
      load();
    }
  }

  async function remove(f: AdminFormat) {
    if (!confirm(t('ad.fmtDeleteConfirm'))) return;
    try {
      await api.adminDeleteFormat(f.id);
      setFormats((prev) => prev.filter((x) => x.id !== f.id));
    } catch {
      /* ignore */
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await api.adminUpdateFormat(editing.id, {
        title: editing.title,
        description: editing.description,
        outputId: editing.output.id,
        noun: editing.output.noun,
        plural: editing.output.plural,
        icon: editing.output.icon,
        agentHint: editing.agentHint,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message || t('ad.fmtSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const pending = formats.filter((f) => f.status === 'pending');
  const curated = formats.filter((f) => f.status !== 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Marketplace submissions awaiting review */}
      {pending.length > 0 && (
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-1 font-semibold">{t('ad.fmtPending')}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t('ad.fmtPendingDesc')}</p>
          <div className="space-y-3">
            {pending.map((f) => {
              const Icon = formatIcon(f.output.icon);
              return (
                <div
                  key={f.id}
                  className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {f.title}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{f.id}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {f.description || `${f.output.noun} · ${f.variants.length} variant(s)`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => review(f, 'approved')}
                      className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> {t('ad.fmtApprove')}
                    </button>
                    <button
                      onClick={() => review(f, 'rejected')}
                      className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" /> {t('ad.fmtReject')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Curated formats */}
      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-1 font-semibold">{t('ad.fmtCurated')}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{t('ad.fmtCuratedDesc')}</p>
        <div className="space-y-2">
          {curated.map((f) => {
            const Icon = formatIcon(f.output.icon);
            return (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{f.title}</span>
                      {f.isBundled && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {t('ad.fmtBundled')}
                        </span>
                      )}
                      {!f.enabled && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t('ad.fmtDisabled')}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {f.output.noun} · {f.output.plural} · {f.variants.length} variant(s)
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditing(f)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title={t('edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleEnabled(f)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title={f.enabled ? t('ad.fmtDisable') : t('ad.fmtEnable')}
                  >
                    {f.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  {!f.isBundled && (
                    <button
                      onClick={() => remove(f)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title={t('delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {curated.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('ad.fmtEmpty')}</p>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl">
            <h3 className="mb-4 font-semibold">{t('ad.fmtEdit')}</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtTitle')}</span>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtDesc')}</span>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtNoun')}</span>
                  <input
                    value={editing.output.noun}
                    onChange={(e) =>
                      setEditing({ ...editing, output: { ...editing.output, noun: e.target.value } })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtPlural')}</span>
                  <input
                    value={editing.output.plural}
                    onChange={(e) =>
                      setEditing({ ...editing, output: { ...editing.output, plural: e.target.value } })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtIcon')}</span>
                <select
                  value={editing.output.icon}
                  onChange={(e) =>
                    setEditing({ ...editing, output: { ...editing.output, icon: e.target.value } })
                  }
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
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t('ad.fmtAgentHint')}</span>
                <textarea
                  value={editing.agentHint}
                  onChange={(e) => setEditing({ ...editing, agentHint: e.target.value })}
                  rows={2}
                  placeholder={t('ad.fmtAgentHintPlaceholder')}
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                {t('cancel')}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}