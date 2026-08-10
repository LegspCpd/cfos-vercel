'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, FileText, Loader2, BookOpen, X, Pencil, Save } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface ContextDoc {
  id: string;
  title: string;
  tags: string;
  createdAt?: string;
  updatedAt?: string;
  content?: string;
}

export default function ContextPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [docs, setDocs] = useState<ContextDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<ContextDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  async function load() {
    try {
      const res = await api.listContext();
      setDocs(res.docs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function create() {
    if (!title.trim() || !content.trim()) {
      setError(t('ctx.titleContentRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createContext({ title, content, tags });
      setTitle('');
      setContent('');
      setTags('');
      setShowCreate(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function view(id: string) {
    try {
      const res = await api.getContext(id);
      setViewing(res.doc);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEditing() {
    if (!viewing) return;
    setEditTitle(viewing.title);
    setEditContent(viewing.content ?? '');
    setEditTags(viewing.tags || '');
    setEditing(true);
  }

  async function saveEdit() {
    if (!viewing || !editTitle.trim() || !editContent.trim()) {
      setError(t('ctx.titleContentRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.updateContext(viewing.id, {
        title: editTitle,
        content: editContent,
        tags: editTags,
      });
      setViewing(res.doc);
      setEditing(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await api.deleteContext(id);
    setDocs((d) => d.filter((x) => x.id !== id));
    if (viewing?.id === id) setViewing(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('ctx.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('ctx.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? t('cancel') : t('ctx.newDoc')}
        </button>
      </div>

      {error && <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Create form */}
      {showCreate && (
        <div className="mt-6 space-y-3 rounded-lg border bg-card p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('ctx.titlePlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('ctx.tagsPlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('ctx.contentPlaceholder')}
            rows={6}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={create}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('save')}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="mt-6 text-muted-foreground">{t('loading')}</p>
      ) : docs.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <BookOpen className="mb-2 h-8 w-8" />
          <p>{t('ctx.empty')}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <button onClick={() => view(d.id)} className="flex min-w-0 items-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t('ctx.updatedAt')} {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : ''}
                    {d.tags ? ` · ${d.tags.split(',').map((t) => `#${t.trim()}`).join(' ')}` : ''}
                  </p>
                </div>
              </button>
              <button
                onClick={() => remove(d.id)}
                className="shrink-0 rounded p-2 text-destructive hover:bg-destructive/10"
                title={t('delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* View modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="truncate font-semibold">{viewing.title}</h3>
              <div className="flex items-center gap-1">
                {!editing ? (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t('edit')}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="press flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" /> {saving ? t('saving') : t('save')}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                    >
                      {t('cancel')}
                    </button>
                  </>
                )}
                <button onClick={() => setViewing(null)} className="rounded p-1 hover:bg-secondary">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {editing ? (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={t('ctx.titlePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder={t('ctx.tagsPlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder={t('ctx.contentPlaceholder')}
                  rows={10}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm">
                {viewing.content}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
