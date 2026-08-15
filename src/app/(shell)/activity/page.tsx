'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity as ActivityIcon, Loader2, Search, Filter } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

interface LogRow {
  id: string;
  userId: string;
  username: string;
  action: string;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  tokens: number | null;
  createdAt: string;
}

const ACTION_GROUPS = [
  { value: '', labelKey: 'act.all' },
  { value: 'workspace', labelKey: 'act.workspace' },
  { value: 'pages', labelKey: 'act.pages' },
  { value: 'worker', labelKey: 'act.worker' },
  { value: 'share', labelKey: 'act.share' },
  { value: 'auth', labelKey: 'act.auth' },
  { value: 'ticket', labelKey: 'act.ticket' },
];

// Group action prefixes to a readable category label.
function actionCategory(action: string): string {
  if (action.startsWith('workspace')) return 'workspace';
  if (action.startsWith('pages') || action.startsWith('deploy')) return 'pages';
  if (action.startsWith('worker')) return 'worker';
  if (action.startsWith('share')) return 'share';
  if (action.startsWith('auth') || action.startsWith('login') || action.startsWith('logout')) return 'auth';
  if (action.startsWith('ticket')) return 'ticket';
  return 'other';
}

const CATEGORY_STYLES: Record<string, string> = {
  workspace: 'bg-blue-500/10 text-blue-600',
  pages: 'bg-purple-500/10 text-purple-600',
  worker: 'bg-orange-500/10 text-orange-600',
  share: 'bg-green-500/10 text-green-600',
  auth: 'bg-gray-500/10 text-gray-600',
  ticket: 'bg-yellow-500/10 text-yellow-600',
  other: 'bg-secondary text-muted-foreground',
};

export default function ActivityPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listActivity({ limit, offset, action: filter || undefined });
      setLogs(res.logs as LogRow[]);
      setTotal(res.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [offset, filter]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  // Local search filter (client-side) on top of the server-side action filter.
  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) => l.action.toLowerCase().includes(q) || (l.detail ?? '').toLowerCase().includes(q),
    );
  }, [logs, search]);

  const hasMore = offset + limit < total;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ActivityIcon className="h-6 w-6 text-primary" /> {t('act.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('act.subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
            }}
            className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none"
          >
            {ACTION_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 items-center gap-1 rounded-md border px-2.5 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('act.searchPlaceholder')}
            className="flex-1 border-none bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">{t('act.empty')}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {filteredLogs.map((log, idx) => {
            const cat = actionCategory(log.action);
            return (
              <div
                key={log.id}
                style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
                className={clsx(
                  'reveal-row flex items-start gap-3 px-4 py-3',
                  idx > 0 && 'border-t',
                )}
              >
                <span className={clsx('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', CATEGORY_STYLES[cat])}>
                  {log.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{log.detail || log.action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                    {log.ip && ` · ${log.ip}`}
                    {log.tokens != null && log.tokens > 0 && ` · ${log.tokens} tokens`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(offset > 0 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            {t('act.prev')}
          </button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}-{Math.min(offset + limit, total)} / {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasMore || loading}
            className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            {t('act.next')}
          </button>
        </div>
      )}
    </div>
  );
}
