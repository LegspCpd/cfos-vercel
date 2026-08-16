'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, List, Search, FileCode2 } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { formatIcon } from '@/components/FormatBadge';

interface FormatMeta {
  id: string;
  output: { id: string; noun: string; plural: string; icon: string };
}

export default function OutputsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [formats, setFormats] = useState<Map<string, FormatMeta>>(new Map());
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
    api
      .listFormats()
      .then((res) =>
        setFormats(new Map(res.formats.map((f) => [f.id, { id: f.id, output: f.output }]))),
      )
      .catch(() => {});
  }, [router]);

  const filtered = search
    ? workspaces.filter((w) => w.title.toLowerCase().includes(search.toLowerCase()))
    : workspaces;

  // Group workspaces by their format's output.id (the "kind" of thing produced).
  // Workspaces without a format fall into the generic "app" group.
  const groups = useMemo(() => {
    const map = new Map<string, { output: { id: string; noun: string; plural: string; icon: string }; items: WorkspaceSummary[] }>();
    for (const w of filtered) {
      const meta = w.formatId ? formats.get(w.formatId) : undefined;
      const output = meta?.output ?? { id: 'app', noun: 'App', plural: 'Apps', icon: 'appWindow' };
      let g = map.get(output.id);
      if (!g) {
        g = { output, items: [] };
        map.set(output.id, g);
      }
      g.items.push(w);
    }
    return Array.from(map.values());
  }, [filtered, formats]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('out.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('out.sub')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('out.search')}
              className="w-full rounded-md border bg-card py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-48"
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-card">
              <div className="skeleton h-32 rounded-none" />
              <div className="p-4">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton mt-2 h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="animate-fade-in rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {search ? t('out.noMatch') : t('out.empty')}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const Icon = formatIcon(group.output.icon);
            return (
              <section key={group.output.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-semibold">
                    {group.output.plural}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {group.items.length}
                    </span>
                  </h2>
                </div>
                {view === 'grid' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((w, i) => (
                      <Link
                        key={w.id}
                        href={`/workspace/${w.id}`}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className="reveal-row press group overflow-hidden rounded-lg border bg-card transition-colors duration-200 hover:border-primary/50 hover:shadow-md"
                      >
                        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 to-secondary">
                          <Icon className="h-8 w-8 text-primary/50" />
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
                    {group.items.map((w, i) => (
                      <Link
                        key={w.id}
                        href={`/workspace/${w.id}`}
                        style={{ animationDelay: `${i * 30}ms` }}
                        className="reveal-row flex items-center justify-between border-b px-4 py-3 last:border-0 hover:bg-secondary/50"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-primary" />
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
