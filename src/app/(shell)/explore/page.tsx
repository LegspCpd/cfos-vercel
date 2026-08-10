'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Compass, FileCode2, BarChart3, StickyNote, Timer, Globe } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

// Sample blueprint ideas shown when the user has no workspaces yet.
const SAMPLE_IDEAS = [
  { icon: BarChart3, titleKey: 'ex.idea0Title', descKey: 'ex.idea0Desc' },
  { icon: StickyNote, titleKey: 'ex.idea1Title', descKey: 'ex.idea1Desc' },
  { icon: Timer, titleKey: 'ex.idea2Title', descKey: 'ex.idea2Desc' },
  { icon: Globe, titleKey: 'ex.idea3Title', descKey: 'ex.idea3Desc' },
];

export default function ExplorePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold">{t('ex.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('ex.sub')}
      </p>

      {/* Sample ideas */}
      <h2 className="mt-8 mb-3 text-base font-semibold">{t('ex.try')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_IDEAS.map((idea, i) => (
          <Link
            key={idea.titleKey}
            href={`/?prompt=${encodeURIComponent(`Build ${t(idea.titleKey)}: ${t(idea.descKey)}`)}`}
            style={{ animationDelay: `${i * 50}ms` }}
            className="reveal-row press rounded-lg border bg-card p-4 transition-colors duration-200 hover:border-primary/50 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <idea.icon className="h-5 w-5" />
            </span>
            <p className="mt-2 font-medium">{t(idea.titleKey)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(idea.descKey)}</p>
          </Link>
        ))}
      </div>

      {/* Your creations */}
      <h2 className="mt-10 mb-3 text-base font-semibold">{t('ex.your')}</h2>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="skeleton h-24" />
              <div className="skeleton mt-3 h-4 w-2/3" />
              <div className="skeleton mt-2 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="animate-fade-in flex flex-col items-center rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Compass className="mb-2 h-8 w-8" />
          <p>{t('ex.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w, i) => (
            <Link
              key={w.id}
              href={`/workspace/${w.id}`}
              style={{ animationDelay: `${i * 40}ms` }}
              className="reveal-row press rounded-lg border bg-card p-4 transition-colors duration-200 hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex h-24 items-center justify-center rounded-md bg-gradient-to-br from-primary/10 to-secondary">
                <FileCode2 className="h-7 w-7 text-primary/50" />
              </div>
              <h3 className="mt-3 truncate font-medium">{w.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{w._count.files} {t('ws.files')}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
