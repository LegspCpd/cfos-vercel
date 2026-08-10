'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, FolderOpen, FileCode2, FolderPlus, CalendarDays } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface WorkspaceSummary {
  id: string;
  title: string;
  updatedAt: string;
  _count: { files: number };
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [joined, setJoined] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        setJoined(new Date(me.groupId ? Date.now() : Date.now()).toLocaleDateString());
      })
      .catch(() => router.replace('/login'));
    api
      .listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const totalFiles = workspaces.reduce((s, w) => s + w._count.files, 0);
  const recent = [...workspaces].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

  const cards = [
    { label: t('an.workspaces'), value: workspaces.length, icon: FolderOpen, color: 'text-primary' },
    { label: t('an.files'), value: totalFiles, icon: FileCode2, color: 'text-amber-500' },
    { label: t('an.recent'), value: recent.length, icon: CalendarDays, color: 'text-green-500' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">{t('an.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('an.sub')}</p>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-5">
                <div className={`flex items-center gap-2 text-muted-foreground`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                  <span className="text-sm">{c.label}</span>
                </div>
                <p className="mt-2 text-3xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Recent workspaces */}
          <h2 className="mt-8 mb-3 text-base font-semibold">{t('an.recentWorkspaces')}</h2>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('ws.empty')}
              <div className="mt-3">
                <Link href="/" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  <FolderPlus className="h-4 w-4" /> {t('ws.new')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((w, i) => (
                <Link
                  key={w.id}
                  href={`/workspace/${w.id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="reveal-row flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition hover:border-primary/40"
                >
                  <span className="truncate text-sm font-medium">{w.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {w._count.files} {t('ws.files')} · {new Date(w.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">{t('an.footer')}</p>
        </>
      )}
    </div>
  );
}
