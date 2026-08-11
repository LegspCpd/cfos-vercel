'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  LogIn,
  UserPlus,
  FolderPlus,
  Trash2,
  Bot,
  AlertTriangle,
  BrainCircuit,
  Save,
  FileX2,
  Star,
  History,
  Share2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface AuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetId: string | null;
  detail: string | null;
  ip?: string | null;
  tokens?: number | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

// Map action codes to an icon + friendly label.
function actionMeta(t: (k: string) => string, action: string): { icon: LucideIcon; label: string } {
  const map: Record<string, { icon: LucideIcon; label: string }> = {
    'auth.login': { icon: LogIn, label: t('audit.login') },
    'auth.login_failed': { icon: AlertTriangle, label: t('audit.loginFailed') },
    'auth.signup': { icon: UserPlus, label: t('audit.signup') },
    'workspace.create': { icon: FolderPlus, label: t('audit.workspaceCreate') },
    'workspace.delete': { icon: Trash2, label: t('audit.workspaceDelete') },
    'agent.run': { icon: Bot, label: t('audit.agentRun') },
    'agent.run_failed': { icon: AlertTriangle, label: t('audit.agentFailed') },
    'ai.call': { icon: BrainCircuit, label: t('audit.aiCall') },
    'file.save': { icon: Save, label: t('audit.fileSave') },
    'file.delete': { icon: FileX2, label: t('audit.fileDelete') },
    'favorite.add': { icon: Star, label: t('audit.favoriteAdd') },
    'favorite.remove': { icon: Star, label: t('audit.favoriteRemove') },
    'file.restore': { icon: History, label: t('audit.fileRestore') },
    'workspace.share': { icon: Share2, label: t('audit.workspaceShare') },
    'workspace.import': { icon: Upload, label: t('audit.workspaceImport') },
  };
  return map[action] || { icon: LogIn, label: action };
}

export default function AuditLogView() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      if (actionFilter) params.set('action', actionFilter);
      if (userFilter) params.set('user', userFilter);
      const res = await fetch(`/api/admin/audit?${params}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter]);

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('admin.audit')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('admin.auditDesc')} · {t('admin.totalCount')} {total}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t('refresh')}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
        >
          <option value="">{t('audit.allActions')}</option>
          <option value="auth.login">{t('audit.login')}</option>
          <option value="auth.login_failed">{t('audit.loginFailed')}</option>
          <option value="auth.signup">{t('audit.signup')}</option>
          <option value="workspace.create">{t('audit.workspaceCreate')}</option>
          <option value="workspace.delete">{t('audit.workspaceDelete')}</option>
          <option value="agent.run">{t('audit.agentRun')}</option>
          <option value="agent.run_failed">{t('audit.agentFailed')}</option>
          <option value="ai.call">{t('audit.aiCall')}</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(0);
            }}
            placeholder={t('audit.filterByUser')}
            className="rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm outline-none"
          />
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('audit.noLogs')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('audit.time')}</th>
                <th className="py-2 pr-3 font-medium">{t('audit.user')}</th>
                <th className="py-2 pr-3 font-medium">{t('audit.action')}</th>
                <th className="py-2 pr-3 font-medium">IP</th>
                <th className="py-2 pr-3 font-medium">Token</th>
                <th className="py-2 font-medium">{t('audit.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{formatTime(log.createdAt)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono">{log.username ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span className="flex items-center gap-1.5">
                      {(() => {
                        const meta = actionMeta(t, log.action);
                        const Icon = meta.icon;
                        return (
                          <>
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {meta.label}
                          </>
                        );
                      })()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-muted-foreground">{log.ip ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                    {log.tokens != null ? log.tokens.toLocaleString() : '—'}
                  </td>
                  <td className="max-w-md break-words py-2 text-xs text-muted-foreground">{log.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('audit.page')} {page + 1} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> {t('audit.prev')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40"
            >
              {t('audit.next')} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
