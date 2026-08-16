'use client';

import { useEffect, useState } from 'react';
import { Users, X, Loader2, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

interface Collaborator {
  id: string;
  role: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

// The workspace collaborator manager: add/remove users and switch their role.
// Only the workspace owner sees this (the parent page gates it on access === 'owner').
export default function CollaboratorsPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'read' | 'write'>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.listCollaborators(workspaceId);
      setCollaborators(res.collaborators);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId]);

  async function add() {
    if (!username.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.addCollaborator(workspaceId, { username: username.trim(), role });
      setCollaborators(res.collaborators);
      setUsername('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(c: Collaborator, next: 'read' | 'write') {
    try {
      const res = await api.updateCollaborator(workspaceId, { userId: c.user.id, role: next });
      setCollaborators(res.collaborators);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(c: Collaborator) {
    try {
      const res = await api.removeCollaborator(workspaceId, c.user.id);
      setCollaborators(res.collaborators);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        title={t('collab.title')}
      >
        <Users className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('collab.title')}</span>
        {collaborators.length > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{collaborators.length}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border bg-popover p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{t('collab.title')}</p>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {error && <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}

            {/* Add form */}
            <div className="mb-3 space-y-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder={t('collab.usernamePlaceholder')}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center gap-2">
                <div className="flex flex-1 rounded-md border p-0.5">
                  <button
                    onClick={() => setRole('read')}
                    className={clsx(
                      'flex-1 rounded px-2 py-1 text-xs font-medium',
                      role === 'read' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t('collab.read')}
                  </button>
                  <button
                    onClick={() => setRole('write')}
                    className={clsx(
                      'flex-1 rounded px-2 py-1 text-xs font-medium',
                      role === 'write' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t('collab.write')}
                  </button>
                </div>
                <button
                  onClick={add}
                  disabled={busy || !username.trim()}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {t('collab.add')}
                </button>
              </div>
            </div>

            {/* List */}
            {collaborators.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">{t('collab.empty')}</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {(c.user.displayName || c.user.username).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.user.displayName || c.user.username}</p>
                      <p className="truncate text-[11px] text-muted-foreground">@{c.user.username}</p>
                    </div>
                    <select
                      value={c.role}
                      onChange={(e) => changeRole(c, e.target.value as 'read' | 'write')}
                      className="rounded border bg-background px-1.5 py-0.5 text-xs outline-none"
                    >
                      <option value="read">{t('collab.read')}</option>
                      <option value="write">{t('collab.write')}</option>
                    </select>
                    <button
                      onClick={() => remove(c)}
                      className="rounded p-1 text-destructive hover:bg-destructive/10"
                      title={t('collab.remove')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}