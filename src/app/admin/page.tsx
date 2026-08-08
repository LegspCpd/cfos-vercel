'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import ProvidersManager from '@/components/ProvidersManager';

interface Overview {
  settings: { signupsEnabled: boolean };
  users: {
    id: string;
    username: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    _count: { workspaces: number };
  }[];
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notAdmin, setNotAdmin] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .adminOverview()
      .then(setData)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) setNotAdmin(true);
        else setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function toggleSignups() {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const next = !data.settings.signupsEnabled;
      await api.adminSetSignups(next);
      setData({ ...data, settings: { signupsEnabled: next } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : notAdmin ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
            You don't have admin access.
          </div>
        ) : data ? (
          <div className="space-y-8">
            {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

            {/* Settings */}
            <section className="rounded-lg border bg-card p-6">
              <h2 className="mb-4 text-base font-semibold">Settings</h2>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <p className="font-medium">Public registration</p>
                  <p className="text-sm text-muted-foreground">
                    When enabled, anyone can create an account. When disabled, only the admin can log in
                    (the first user is the admin).
                  </p>
                </div>
                <button
                  onClick={toggleSignups}
                  disabled={saving}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    data.settings.signupsEnabled ? 'bg-primary' : 'bg-secondary'
                  }`}
                  aria-label="Toggle registration"
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      data.settings.signupsEnabled ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Current: {data.settings.signupsEnabled ? '🟢 Open registration' : '🔴 Registration closed'}
              </p>
            </section>

            {/* Users */}
            <section className="rounded-lg border bg-card p-6">
              <h2 className="mb-4 text-base font-semibold">
                Users <span className="text-muted-foreground">({data.users.length})</span>
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Username</th>
                    <th className="py-2 pr-4 font-medium">Display name</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Workspaces</th>
                    <th className="py-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{u.username}</td>
                      <td className="py-2 pr-4">{u.displayName}</td>
                      <td className="py-2 pr-4">
                        {u.isAdmin ? (
                          <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                            Admin
                          </span>
                        ) : (
                          <span className="text-muted-foreground">User</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{u._count.workspaces}</td>
                      <td className="py-2 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* AI Providers */}
            <ProvidersManager />
          </div>
        ) : null}
      </div>
    </main>
  );
}
