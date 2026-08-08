'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

export default function WorkspacesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

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

  async function createWorkspace() {
    const res = await api.createWorkspace(newTitle.trim() || '未命名工作区');
    router.push(`/workspace/${res.workspace.id}`);
  }

  async function removeWorkspace(id: string) {
    await api.deleteWorkspace(id);
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('ws.title')}</h1>
        <div className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
            placeholder={t('ws.namePlaceholder')}
            className="w-48 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={createWorkspace}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t('ws.new')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t('loading')}</p>
      ) : workspaces.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('ws.empty')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className="group relative rounded-lg border bg-card p-4 transition hover:border-primary/50"
            >
              <Link href={`/workspace/${w.id}`} className="block">
                <h3 className="truncate font-medium">{w.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {w._count.files} {t('ws.files')} · {new Date(w.updatedAt).toLocaleDateString()}
                </p>
              </Link>
              <button
                onClick={() => removeWorkspace(w.id)}
                className="absolute right-3 top-3 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                aria-label="Delete workspace"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
