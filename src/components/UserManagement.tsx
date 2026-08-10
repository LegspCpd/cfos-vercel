'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Trash2, ShieldOff } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  _count: { workspaces: number };
}

export default function UserManagement() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.adminOverview();
      setUsers(res.users);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleRole(id: string, isAdmin: boolean) {
    setBusyId(id);
    setError('');
    try {
      await api.adminSetUserRole(id, !isAdmin);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(id: string) {
    setBusyId(id);
    setError('');
    try {
      await api.adminDeleteUser(id);
      setConfirmId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">{t('ad.users')}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-1 text-base font-semibold">
        {t('ad.users')} <span className="text-muted-foreground">({users.length})</span>
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">管理用户：提升/取消管理员、删除用户。</p>

      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t('auth.username')}</th>
            <th className="py-2 pr-4 font-medium">{t('ad.role')}</th>
            <th className="py-2 pr-4 font-medium">{t('ws.title')}</th>
            <th className="py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b last:border-0">
              <td className="py-2 pr-4">
                <span className="font-mono">{u.username}</span>
                <span className="ml-2 text-xs text-muted-foreground">{u.displayName}</span>
              </td>
              <td className="py-2 pr-4">
                {u.isAdmin ? (
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{t('ad.admin')}</span>
                ) : (
                  <span className="text-muted-foreground">{t('ad.user')}</span>
                )}
              </td>
              <td className="py-2 pr-4">{u._count.workspaces}</td>
              <td className="py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleRole(u.id, u.isAdmin)}
                    disabled={busyId === u.id}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    title={u.isAdmin ? '取消管理员' : '提升为管理员'}
                  >
                    {u.isAdmin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </button>
                  {confirmId === u.id ? (
                    <button
                      onClick={() => removeUser(u.id)}
                      disabled={busyId === u.id}
                      className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive"
                    >
                      确认删除
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(u.id)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      title="删除用户"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
