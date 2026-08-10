'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Star } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

export default function WorkspacesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'fav'>('all');

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
      .listFavorites()
      .then((res) => setFavorites(new Set(res.favorites.map((f) => f.workspaceId))))
      .catch(() => {});
  }, [router]);

  async function createWorkspace() {
    const res = await api.createWorkspace(newTitle.trim() || t('ws.untitled'));
    router.push(`/workspace/${res.workspace.id}`);
  }

  async function removeWorkspace(id: string) {
    await api.deleteWorkspace(id);
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function toggleFavorite(id: string) {
    const next = !favorites.has(id);
    setFavorites((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    try {
      await api.setFavorite(id, next);
    } catch {
      /* optimistic rollback */
      setFavorites((prev) => {
        const s = new Set(prev);
        if (!next) s.add(id);
        else s.delete(id);
        return s;
      });
    }
  }

  const shown = filter === 'fav' ? workspaces.filter((w) => favorites.has(w.id)) : workspaces;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('ws.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            {(['all', 'fav'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium capitalize ${
                  filter === v ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                }`}
              >
                {v === 'fav' && <Star className="h-3 w-3" />}
                {v === 'all' ? t('ws.all') : t('ws.favorites')}
              </button>
            ))}
          </div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
            placeholder={t('ws.namePlaceholder')}
            className="w-full min-w-0 flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-48 sm:flex-none"
          />
          <button
            onClick={createWorkspace}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t('ws.new')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton mt-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="animate-fade-in rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {filter === 'fav' ? t('ws.noFavorites') : t('ws.empty')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w, i) => (
            <div
              key={w.id}
              style={{ animationDelay: `${i * 40}ms` }}
              className="reveal-row press group relative rounded-lg border bg-card p-4 transition-colors duration-200 hover:border-primary/50 hover:shadow-md"
            >
              <Link href={`/workspace/${w.id}`} className="block">
                <h3 className="truncate font-medium">{w.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {w._count.files} {t('ws.files')} · {new Date(w.updatedAt).toLocaleDateString()}
                </p>
              </Link>
              <div className="absolute right-2 top-2 flex items-center gap-0.5">
                <button
                  onClick={() => toggleFavorite(w.id)}
                  className="press-exempt rounded p-1 text-muted-foreground hover:bg-secondary hover:text-amber-400"
                  aria-label="Favorite"
                  title={favorites.has(w.id) ? t('ws.unfavorite') : t('ws.favorite')}
                >
                  <Star
                    className={`h-4 w-4 transition-colors ${
                      favorites.has(w.id) ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                </button>
                <button
                  onClick={() => removeWorkspace(w.id)}
                  className="press-exempt hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                  aria-label="Delete workspace"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
