'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, List, Search, FileCode2 } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

export default function OutputsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

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

  const filtered = search
    ? workspaces.filter((w) => w.title.toLowerCase().includes(search.toLowerCase()))
    : workspaces;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('out.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('out.sub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('out.search')}
              className="w-48 rounded-md border bg-card py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`rounded p-1.5 ${view === 'grid' ? 'bg-secondary' : 'text-muted-foreground'}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`rounded p-1.5 ${view === 'list' ? 'bg-secondary' : 'text-muted-foreground'}`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {search ? t('out.noMatch') : t('out.empty')}
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <Link
              key={w.id}
              href={`/workspace/${w.id}`}
              className="group overflow-hidden rounded-lg border bg-card transition hover:border-primary/50"
            >
              <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 to-secondary">
                <FileCode2 className="h-8 w-8 text-primary/50" />
              </div>
              <div className="p-4">
                <h3 className="truncate font-medium group-hover:text-primary">{w.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {w._count.files} {t('ws.files')} · {t('out.updated')} {new Date(w.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {filtered.map((w) => (
            <Link
              key={w.id}
              href={`/workspace/${w.id}`}
              className="flex items-center justify-between border-b px-4 py-3 last:border-0 hover:bg-secondary/50"
            >
              <div className="flex items-center gap-3">
                <FileCode2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{w.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {w._count.files} {t('ws.files')} · {t('out.updated')} {new Date(w.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className="text-sm text-primary">{t('out.open')} →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
