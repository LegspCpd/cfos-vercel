'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  FolderOpen,
  FileCode2,
  CalendarDays,
  LogIn,
  BrainCircuit,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface Analytics {
  joinedAt: string;
  workspaces: number;
  files: number;
  today: {
    loginCount: number;
    logins: { at: string; ip: string | null }[];
    aiCalls: number;
    tokens: number;
  };
  site: {
    todayLogins: number;
    todayTokens: number;
    todayAiCalls: number;
    todayUsersActive: number;
    topLoginIps: { ip: string; count: number }[];
  } | null;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .getAnalytics()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const joinedDate = new Date(data.joinedAt).toLocaleDateString();
  const myCards = [
    { label: t('an.workspaces'), value: data.workspaces, icon: FolderOpen, color: 'text-primary' },
    { label: t('an.files'), value: data.files, icon: FileCode2, color: 'text-amber-500' },
    { label: '今日登录', value: data.today.loginCount, icon: LogIn, color: 'text-blue-500' },
    { label: '今日 AI 调用', value: data.today.aiCalls, icon: BrainCircuit, color: 'text-green-500' },
    { label: '今日 Token', value: data.today.tokens, icon: BrainCircuit, color: 'text-violet-500' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">{t('an.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">注册时间：{joinedDate}</p>

      {/* Personal stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {myCards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className={`h-5 w-5 ${c.color}`} />
              <span className="text-sm">{c.label}</span>
            </div>
            <p className="mt-2 text-3xl font-bold">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</p>
          </div>
        ))}
      </div>

      {/* Today's login activity (my IPs) */}
      <section className="mt-8 rounded-lg border bg-card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <LogIn className="h-4 w-4 text-blue-500" /> 今日登录记录（我的 IP）
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">你今天登录这个网站所使用的 IP 地址。</p>
        {data.today.logins.length === 0 ? (
          <p className="text-sm text-muted-foreground">今天还没有登录记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">时间</th>
                  <th className="py-2 font-medium">IP 地址</th>
                </tr>
              </thead>
              <tbody>
                {data.today.logins.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                      {new Date(l.at).toLocaleString()}
                    </td>
                    <td className="py-2 font-mono text-xs">{l.ip ?? '未知'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Admin site-wide summary */}
      {data.site && (
        <section className="mt-8 rounded-lg border bg-card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> 全站今日概览（管理员）
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">今日全站登录、AI 调用与 token 用量。</p>

          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground">今日登录</p>
              <p className="mt-1 text-2xl font-bold">{data.site.todayLogins}</p>
            </div>
            <div className="rounded-md bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground">活跃用户</p>
              <p className="mt-1 text-2xl font-bold">{data.site.todayUsersActive}</p>
            </div>
            <div className="rounded-md bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground">AI 调用</p>
              <p className="mt-1 text-2xl font-bold">{data.site.todayAiCalls}</p>
            </div>
            <div className="rounded-md bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground">Token 用量</p>
              <p className="mt-1 text-2xl font-bold">{data.site.todayTokens.toLocaleString()}</p>
            </div>
          </div>

          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MapPin className="h-4 w-4" /> 今日登录 IP 分布
          </h3>
          {data.site.topLoginIps.length === 0 ? (
            <p className="text-sm text-muted-foreground">今日暂无登录记录。</p>
          ) : (
            <div className="space-y-2">
              {data.site.topLoginIps.map((row, i) => {
                const max = data.site!.topLoginIps[0].count;
                const pct = Math.max(6, Math.round((row.count / max) * 100));
                return (
                  <div key={row.ip} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="w-40 shrink-0 truncate font-mono text-xs">{row.ip}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{row.count} 次</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Workspaces overview */}
      <h2 className="mt-8 mb-3 text-base font-semibold">{t('an.workspaces')}</h2>
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
      >
        查看全部工作区 →
      </Link>

      <p className="mt-10 text-center text-xs text-muted-foreground">{t('an.footer')}</p>
    </div>
  );
}
