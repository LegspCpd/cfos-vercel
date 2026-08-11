'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Users, UserPlus, Save } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  groupId: string | null;
  groupName: string | null;
  workspaces: number;
}

interface Group {
  id: string;
  name: string;
  permissions: string[];
  isAdminGroup: boolean;
  memberCount: number;
}

function permLabels(t: (k: string) => string): { code: string; label: string }[] {
  return [
    { code: 'workspace.create', label: t('perm.workspace') },
    { code: 'file.share', label: t('perm.fileShare') },
    { code: 'context.manage', label: t('perm.context') },
    { code: 'connections.manage', label: t('perm.connections') },
    { code: 'admin.access', label: t('perm.adminAccess') },
    { code: 'admin.users', label: t('perm.userAdmin') },
    { code: 'tickets.manage', label: t('perm.tickets') },
  ];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const PERMS = permLabels(t);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New-user form
  const [nu, setNu] = useState({ username: '', displayName: '', password: '', email: '', groupId: '' });
  // New-group form
  const [ngName, setNgName] = useState('');
  const [ngPerms, setNgPerms] = useState<string[]>([]);
  // Edit-targets
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [edPerms, setEdPerms] = useState<string[]>([]);

  async function load() {
    try {
      const [u, g] = await Promise.all([api.adminListUsers(), api.adminListGroups()]);
      setUsers(u.users);
      setGroups(g.groups);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser() {
    setError('');
    try {
      await api.adminCreateUser({
        username: nu.username,
        displayName: nu.displayName || nu.username,
        password: nu.password,
        email: nu.email || undefined,
        groupId: nu.groupId || undefined,
      });
      setNu({ username: '', displayName: '', password: '', email: '', groupId: '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createGroup() {
    setError('');
    if (!ngName.trim()) {
      setError(t('users.groupNameRequired'));
      return;
    }
    try {
      await api.adminCreateGroup({ name: ngName.trim(), permissions: ngPerms });
      setNgName('');
      setNgPerms([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteUser(id: string) {
    if (!confirm(t('users.deleteUserConfirm'))) return;
    setError('');
    try {
      await api.adminDeleteUser(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm(t('users.deleteGroupConfirm'))) return;
    setError('');
    try {
      await api.adminDeleteGroup(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveUserEdits() {
    if (!editUser) return;
    setError('');
    try {
      const data: { newPassword?: string; email?: string | null; groupId?: string | null } = {};
      if (newPassword) data.newPassword = newPassword;
      if (newEmail !== undefined && newEmail !== null) data.email = newEmail || null;
      if (newGroupId !== undefined) data.groupId = newGroupId;
      await api.adminUpdateUser(editUser.id, data);
      setEditUser(null);
      setNewPassword('');
      setNewEmail('');
      setNewGroupId('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveGroupEdits() {
    if (!editGroup) return;
    setError('');
    try {
      await api.adminUpdateGroup(editGroup.id, { permissions: edPerms });
      setEditGroup(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function togglePerm(perm: string) {
    setNgPerms((p) => (p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]));
  }
  function toggleEdPerm(perm: string) {
    setEdPerms((p) => (p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]));
  }

  const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';
  const btnCls = 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" /> {t('nav.users')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('users.desc')}</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* ===== Groups ===== */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-1 text-base font-semibold">{t('users.groups')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('users.groupsHint')}</p>

        {/* Create group */}
        <div className="mb-4 rounded-md border p-4">
          <p className="mb-2 text-sm font-medium">{t('users.createGroup')}</p>
          <div className="space-y-3">
            <input className={inputCls} placeholder={t('users.groupNamePlaceholder')} value={ngName} onChange={(e) => setNgName(e.target.value)} />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('users.selectPerms')}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMS.map((p) => (
                  <label key={p.code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input type="checkbox" checked={ngPerms.includes(p.code)} onChange={() => togglePerm(p.code)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={createGroup} className={btnCls}>
              <Plus className="mr-1 inline h-4 w-4" /> {t('users.createGroupBtn')}
            </button>
          </div>
        </div>

        {/* Group list */}
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {g.name}
                  {g.isAdminGroup && (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{t('users.adminGroup')}</span>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground">{g.memberCount} {t('users.members')}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {g.permissions.length ? g.permissions.map((p) => PERMS.find((x) => x.code === p)?.label || p).join('、') : t('users.noPerms')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => { setEditGroup(g); setEdPerms(g.permissions); }} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">{t('users.editPerms')}</button>
                {g.name !== '__super_admin__' && g.name !== '__default__' && (
                  <button onClick={() => deleteGroup(g.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> {t('delete')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Users ===== */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-1 text-base font-semibold">{t('users.userList')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('users.total')} {users.length}</p>

        {/* Create user */}
        <div className="mb-4 rounded-md border p-4">
          <p className="mb-2 flex items-center gap-1 text-sm font-medium"><UserPlus className="h-4 w-4" /> {t('users.newUser')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={inputCls} placeholder={t('users.username')} value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
            <input className={inputCls} placeholder={t('users.displayName')} value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} />
            <input className={inputCls} placeholder={t('users.passwordPlaceholder')} type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            <input className={inputCls} placeholder={t('users.emailOptional')} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
            <select className={inputCls} value={nu.groupId} onChange={(e) => setNu({ ...nu, groupId: e.target.value })}>
              <option value="">{t('users.defaultGroup')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={createUser} className={btnCls}><Plus className="mr-1 inline h-4 w-4" /> {t('users.createUser')}</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t('users.user')}</th>
                <th className="py-2 pr-4 font-medium">{t('users.email')}</th>
                <th className="py-2 pr-4 font-medium">{t('users.group')}</th>
                <th className="py-2 pr-4 font-medium">{t('users.workspaces')}</th>
                <th className="py-2 font-medium">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <span className="font-mono">{u.username}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{u.displayName}</span>
                    {u.isAdmin && <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">admin</span>}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{u.email || '-'}</td>
                  <td className="py-2 pr-4 text-xs">{u.groupName || t('users.ungrouped')}</td>
                  <td className="py-2 pr-4">{u.workspaces}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button onClick={() => { setEditUser(u); setNewEmail(u.email || ''); setNewGroupId(u.groupId || ''); setNewPassword(''); }} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                        <Save className="h-3 w-3 inline" /> {t('edit')}
                      </button>
                      <button onClick={() => deleteUser(u.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3 inline" /> {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6">
            <h3 className="mb-4 text-base font-semibold">{t('users.editUser')}：{editUser.username}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('users.newPasswordHint')}</label>
                <input type="password" className={inputCls} placeholder={t('users.newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('users.email')}</label>
                <input className={inputCls} placeholder={t('users.email')} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('users.moveGroup')}</label>
                <select className={inputCls} value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)}>
                  <option value="">{t('users.ungrouped')}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditUser(null)} className="rounded-md border px-3 py-2 text-sm">{t('cancel')}</button>
              <button onClick={saveUserEdits} className={btnCls}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit group modal */}
      {editGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6">
            <h3 className="mb-4 text-base font-semibold">{t('users.editGroup')}：{editGroup.name}</h3>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('users.funcPerms')}：</p>
            <div className="space-y-2">
              {PERMS.map((p) => (
                <label key={p.code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" checked={edPerms.includes(p.code)} onChange={() => toggleEdPerm(p.code)} />
                  {p.label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditGroup(null)} className="rounded-md border px-3 py-2 text-sm">{t('cancel')}</button>
              <button onClick={saveGroupEdits} className={btnCls}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
