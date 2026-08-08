'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAuthHeaders } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface AuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

// Map action codes to friendly labels.
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'auth.login': '🔐 登录',
    'auth.login_failed': '⚠️ 登录失败',
    'auth.signup': '✨ 注册',
    'workspace.create': '📁 创建工作区',
    'workspace.delete': '🗑️ 删除工作区',
    'agent.run': '🤖 Agent 运行',
    'agent.run_failed': '❌ Agent 失败',
    'ai.call': '🧠 AI 调用',
    'file.save': '💾 保存文件',
    'file.delete': '🗑️ 删除文件',
  };
  return map[action] || action;
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
          <h2 className="text-base font-semibold">审计日志</h2>
          <p className="text-sm text-muted-foreground">记录登录、工作区操作、Agent 运行和 AI 调用（共 {total} 条）</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
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
          <option value="">所有操作</option>
          <option value="auth.login">登录</option>
          <option value="auth.login_failed">登录失败</option>
          <option value="auth.signup">注册</option>
          <option value="workspace.create">创建工作区</option>
          <option value="workspace.delete">删除工作区</option>
          <option value="agent.run">Agent 运行</option>
          <option value="agent.run_failed">Agent 失败</option>
          <option value="ai.call">AI 调用</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(0);
            }}
            placeholder="按用户筛选"
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
          暂无审计日志
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">时间</th>
                <th className="py-2 pr-3 font-medium">用户</th>
                <th className="py-2 pr-3 font-medium">操作</th>
                <th className="py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{formatTime(log.createdAt)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono">{log.username ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{actionLabel(log.action)}</td>
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
            第 {page + 1} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
