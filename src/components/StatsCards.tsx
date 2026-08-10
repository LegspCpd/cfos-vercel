'use client';

import { useEffect, useState } from 'react';
import { Users, LayoutGrid, FileCode2, Share2, BookOpen, Cpu, Bot } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface Stats {
  users: number;
  workspaces: number;
  files: number;
  shares: number;
  contexts: number;
  aiCalls: number;
  agentRuns: number;
}

export default function StatsCards() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then((res) => setStats(res.stats))
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: t('stats.users'), value: stats.users, icon: Users },
    { label: t('stats.workspaces'), value: stats.workspaces, icon: LayoutGrid },
    { label: t('stats.files'), value: stats.files, icon: FileCode2 },
    { label: t('stats.shares'), value: stats.shares, icon: Share2 },
    { label: t('stats.contexts'), value: stats.contexts, icon: BookOpen },
    { label: t('stats.aiCalls'), value: stats.aiCalls, icon: Cpu },
    { label: t('stats.agentRuns'), value: stats.agentRuns, icon: Bot },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-4">
          <item.icon className="h-5 w-5 text-primary" />
          <p className="mt-2 text-2xl font-bold">{item.value}</p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
