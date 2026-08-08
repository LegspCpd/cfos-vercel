'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Compass, FileCode2 } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';

// Sample blueprint ideas shown when the user has no workspaces yet.
const SAMPLE_IDEAS = [
  { emoji: '📈', title: 'Sales Dashboard', desc: 'Charts and KPIs for your team' },
  { emoji: '📝', title: 'Markdown Notes', desc: 'A simple notes app' },
  { emoji: '⏱️', title: 'Pomodoro Timer', desc: 'Focus with the 25/5 technique' },
  { emoji: '🌐', title: 'Portfolio Site', desc: 'A personal landing page' },
];

export default function ExplorePage() {
  const router = useRouter();
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
      <h1 className="text-2xl font-bold">Explore</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Discover apps and ideas you can build with the agent.
      </p>

      {/* Sample ideas */}
      <h2 className="mt-8 mb-3 text-base font-semibold">Try building</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_IDEAS.map((idea) => (
          <Link
            key={idea.title}
            href={`/?prompt=${encodeURIComponent(`Build ${idea.title}: ${idea.desc}`)}`}
            className="rounded-lg border bg-card p-4 transition hover:border-primary/50"
          >
            <span className="text-2xl">{idea.emoji}</span>
            <p className="mt-2 font-medium">{idea.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{idea.desc}</p>
          </Link>
        ))}
      </div>

      {/* Your creations */}
      <h2 className="mt-10 mb-3 text-base font-semibold">Your creations</h2>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Compass className="mb-2 h-8 w-8" />
          <p>No creations yet. Start with an idea above or describe your own.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <Link
              key={w.id}
              href={`/workspace/${w.id}`}
              className="rounded-lg border bg-card p-4 transition hover:border-primary/50"
            >
              <div className="flex h-24 items-center justify-center rounded-md bg-gradient-to-br from-primary/10 to-secondary">
                <FileCode2 className="h-7 w-7 text-primary/50" />
              </div>
              <h3 className="mt-3 truncate font-medium">{w.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{w._count.files} files</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
