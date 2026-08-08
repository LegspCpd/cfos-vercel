'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, FileCode2, LogOut } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { clearToken, getToken } from '@/lib/client/auth';

export default function HomePage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

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

  async function createWorkspace() {
    setCreating(true);
    try {
      const res = await api.createWorkspace(newTitle.trim() || 'Untitled Workspace');
      router.push(`/workspace/${res.workspace.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function removeWorkspace(id: string) {
    await api.deleteWorkspace(id);
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">Cloudflare OS</h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Workspaces</h2>
          <div className="flex items-center gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
              placeholder="Workspace name"
              className="w-48 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={createWorkspace}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : workspaces.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No workspaces yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one and ask the agent to build you an app.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <div
                key={w.id}
                className="group relative rounded-lg border bg-card p-4 transition hover:border-primary/50"
              >
                <Link href={`/workspace/${w.id}`} className="block">
                  <h3 className="truncate font-medium">{w.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w._count.files} files · {new Date(w.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  onClick={() => removeWorkspace(w.id)}
                  className="absolute right-3 top-3 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                  aria-label="Delete workspace"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
