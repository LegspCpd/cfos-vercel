'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Users, ShieldCheck, KeyRound, Mail, UserPlus, Save } from 'lucide-react';
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

const ALL_PERM_LABELS: { code: string; label: string }[] = [
  { code: 'workspace.create', label: '工作区 & AI agent' },
  { code: 'file.share', label: '文件分享/蓝图' },
  { code: 'context.manage', label: '上下文文档库' },
  { code: 'connections.manage', label: '外部连接' },
  { code: 'admin.access', label: '管理后台访问' },
  { code: 'admin.users', label: '用户管理' },
  { code: 'tickets.manage', label: '工单管理' },
];

export default function AdminUsersPage() {
  const router = useRouter();
  const { t } = useI18n();
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
      setError('请输入分组名称');
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
    if (!confirm('确定删除该用户？其所有数据将一并删除。')) return;
    setError('');
    try {
      await api.adminDeleteUser(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('确定删除该分组？组内用户将变为未分组。')) return;
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
        <p className="mt-1 text-sm text-muted-foreground">新建/删除用户，修改密码、邮箱，并移动用户到分组；新建分组并勾选功能权限。</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* ===== Groups ===== */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-1 text-base font-semibold">用户分组</h2>
        <p className="mb-4 text-sm text-muted-foreground">分组决定用户拥有的功能权限。用户移入分组即获得该组权限。</p>

        {/* Create group */}
        <div className="mb-4 rounded-md border p-4">
          <p className="mb-2 text-sm font-medium">新建分组</p>
          <div className="space-y-3">
            <input className={inputCls} placeholder="分组名称，如：运营、开发者" value={ngName} onChange={(e) => setNgName(e.target.value)} />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">勾选该分组的功能权限：</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_PERM_LABELS.map((p) => (
                  <label key={p.code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input type="checkbox" checked={ngPerms.includes(p.code)} onChange={() => togglePerm(p.code)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={createGroup} className={btnCls}>
              <Plus className="mr-1 inline h-4 w-4" /> 创建分组
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
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">管理组</span>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground">{g.memberCount} 人</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {g.permissions.length ? g.permissions.map((p) => ALL_PERM_LABELS.find((x) => x.code === p)?.label || p).join('、') : '无权限'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => { setEditGroup(g); setEdPerms(g.permissions); }} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">编辑权限</button>
                {g.name !== '__super_admin__' && g.name !== '__default__' && (
                  <button onClick={() => deleteGroup(g.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Users ===== */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-1 text-base font-semibold">用户列表</h2>
        <p className="mb-4 text-sm text-muted-foreground">共 {users.length} 个用户。</p>

        {/* Create user */}
        <div className="mb-4 rounded-md border p-4">
          <p className="mb-2 flex items-center gap-1 text-sm font-medium"><UserPlus className="h-4 w-4" /> 新建用户</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={inputCls} placeholder="用户名" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
            <input className={inputCls} placeholder="显示名" value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} />
            <input className={inputCls} placeholder="密码（至少6位）" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            <input className={inputCls} placeholder="邮箱（可选）" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
            <select className={inputCls} value={nu.groupId} onChange={(e) => setNu({ ...nu, groupId: e.target.value })}>
              <option value="">默认分组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={createUser} className={btnCls}><Plus className="mr-1 inline h-4 w-4" /> 创建用户</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">用户</th>
                <th className="py-2 pr-4 font-medium">邮箱</th>
                <th className="py-2 pr-4 font-medium">分组</th>
                <th className="py-2 pr-4 font-medium">工作区</th>
                <th className="py-2 font-medium">操作</th>
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
                  <td className="py-2 pr-4 text-xs">{u.groupName || '未分组'}</td>
                  <td className="py-2 pr-4">{u.workspaces}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button onClick={() => { setEditUser(u); setNewEmail(u.email || ''); setNewGroupId(u.groupId || ''); setNewPassword(''); }} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                        <Save className="h-3 w-3 inline" /> 编辑
                      </button>
                      <button onClick={() => deleteUser(u.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3 inline" /> 删除
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
            <h3 className="mb-4 text-base font-semibold">编辑用户：{editUser.username}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">新密码（留空不改）</label>
                <input type="password" className={inputCls} placeholder="新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">邮箱</label>
                <input className={inputCls} placeholder="邮箱" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">移动分组</label>
                <select className={inputCls} value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)}>
                  <option value="">未分组</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditUser(null)} className="rounded-md border px-3 py-2 text-sm">取消</button>
              <button onClick={saveUserEdits} className={btnCls}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit group modal */}
      {editGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6">
            <h3 className="mb-4 text-base font-semibold">编辑分组：{editGroup.name}</h3>
            <p className="mb-2 text-xs font-medium text-muted-foreground">功能权限：</p>
            <div className="space-y-2">
              {ALL_PERM_LABELS.map((p) => (
                <label key={p.code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" checked={edPerms.includes(p.code)} onChange={() => toggleEdPerm(p.code)} />
                  {p.label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditGroup(null)} className="rounded-md border px-3 py-2 text-sm">取消</button>
              <button onClick={saveGroupEdits} className={btnCls}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
