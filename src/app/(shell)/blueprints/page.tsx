'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Share2, FileCode2, Copy } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';

export default function BlueprintsPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

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

  async function copyShareLink(id: string) {
    const url = `${window.location.origin}/workspace/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold">Blueprints</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your apps as reusable templates. Share them with others.
      </p>

      {loading ? (
        <p className="mt-6 text-muted-foreground">Loading...</p>
      ) : workspaces.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No blueprints yet. Build an app and it will appear here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {workspaces.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
              <Link href={`/workspace/${w.id}`} className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Share2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{w.title}</p>
                  <p className="text-xs text-muted-foreground">{w._count.files} files</p>
                </div>
              </Link>
              <button
                onClick={() => copyShareLink(w.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied === w.id ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Note: share links currently open the workspace directly. Public blueprint publishing is
        available in the full Cloudflare OS version.
      </p>
    </div>
  );
}
