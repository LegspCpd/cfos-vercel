'use client';

import { useEffect, useState } from 'react';
import { Users, LayoutGrid, FileCode2, Share2, BookOpen, Cpu, Bot } from 'lucide-react';
import { api } from '@/lib/client/api';

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
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then((res) => setStats(res.stats))
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: '用户', value: stats.users, icon: Users },
    { label: '工作区', value: stats.workspaces, icon: LayoutGrid },
    { label: '文件', value: stats.files, icon: FileCode2 },
    { label: '分享', value: stats.shares, icon: Share2 },
    { label: '文档', value: stats.contexts, icon: BookOpen },
    { label: 'AI 调用', value: stats.aiCalls, icon: Cpu },
    { label: 'Agent 运行', value: stats.agentRuns, icon: Bot },
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
