'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, FileText, Loader2, BookOpen, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';

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
  const [docs, setDocs] = useState<ContextDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<ContextDoc | null>(null);

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
      setError('标题和内容都是必填的');
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
    } catch (e) {
      setError((e as Error).message);
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
          <h1 className="text-2xl font-bold">上下文文档库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传参考文档，agent 构建应用时会自动参考它们。
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? '取消' : '新建文档'}
        </button>
      </div>

      {error && <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Create form */}
      {showCreate && (
        <div className="mt-6 space-y-3 rounded-lg border bg-card p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文档标题"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签（逗号分隔，可选）"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="文档内容 / 参考资料..."
            rows={6}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={create}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            保存文档
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="mt-6 text-muted-foreground">加载中...</p>
      ) : docs.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <BookOpen className="mb-2 h-8 w-8" />
          <p>还没有文档。添加一些参考文档，agent 构建时会更懂你。</p>
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
                    更新于 {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : ''}
                    {d.tags ? ` · ${d.tags.split(',').map((t) => `#${t.trim()}`).join(' ')}` : ''}
                  </p>
                </div>
              </button>
              <button
                onClick={() => remove(d.id)}
                className="shrink-0 rounded p-2 text-destructive hover:bg-destructive/10"
                title="删除"
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
              <h3 className="font-semibold">{viewing.title}</h3>
              <button onClick={() => setViewing(null)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm">
              {viewing.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
