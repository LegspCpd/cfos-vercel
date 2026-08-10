// Feature-permission system backed by user groups.
//
// A group's `permissions` field is a JSON array of permission codes. A user's effective
// permissions come from their group (permissions fully decide capability). isAdmin is
// only a fallback so an admin with NO group isn't locked out (e.g. the first user).

// Permission codes (the checkboxes you tick when creating a group).
export const PERMISSIONS = {
  workspace: 'workspace.create', // workspaces & AI agent
  fileshare: 'file.share', // file sharing / blueprints
  context: 'context.manage', // context doc library
  connections: 'connections.manage', // external connections
  admin: 'admin.access', // admin panel (管理类)
  userAdmin: 'admin.users', // user management (管理类)
  tickets: 'tickets.manage', // support-ticket panel (管理类)
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// All possible permission codes, for the group-creation checkboxes.
export const ALL_PERMISSIONS: { code: PermissionCode; label: string; desc: string }[] = [
  { code: PERMISSIONS.workspace, label: '工作区 & AI agent', desc: '创建/删除/编辑工作区，使用 AI agent' },
  { code: PERMISSIONS.fileshare, label: '文件分享/蓝图', desc: '分享文件(R2)、蓝图导出导入、公开分享链接' },
  { code: PERMISSIONS.context, label: '上下文文档库', desc: '上传/编辑 agent 参考文档' },
  { code: PERMISSIONS.connections, label: '外部连接', desc: 'GitHub/Google/GitLab 外部连接' },
  { code: PERMISSIONS.admin, label: '管理后台访问', desc: '进入管理后台 /admin' },
  { code: PERMISSIONS.userAdmin, label: '用户管理', desc: '管理用户和分组（需同时有管理后台访问）' },
  { code: PERMISSIONS.tickets, label: '工单管理', desc: '查看和处理用户提交的工单（需同时有管理后台访问）' },
];

// The special group that has every permission (auto-created on first run).
export const SUPER_ADMIN_PERMISSIONS: PermissionCode[] = ALL_PERMISSIONS.map((p) => p.code);

export function parsePermissions(raw: string | null | undefined): PermissionCode[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((p) => ALL_PERMISSIONS.some((x) => x.code === p));
    return [];
  } catch {
    return [];
  }
}

export function serializePermissions(codes: PermissionCode[]): string {
  const unique: PermissionCode[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }
  return JSON.stringify(unique);
}

export function isAdminPermission(code: string): boolean {
  return code === PERMISSIONS.admin || code === PERMISSIONS.userAdmin;
}

// Resolve a user's effective permissions.
// - A user with a group: uses the group's permissions (group fully decides).
// - A user with NO group but isAdmin=true: treated as super admin (full perms, fallback).
// - A user with NO group and not admin: no explicit perms (must be assigned a group).
export function resolvePermissions(user: {
  isAdmin: boolean;
  group?: { permissions: string } | null;
}): PermissionCode[] {
  if (user.group?.permissions) {
    return parsePermissions(user.group.permissions);
  }
  if (user.isAdmin) {
    return SUPER_ADMIN_PERMISSIONS;
  }
  return [];
}

export function can(perms: PermissionCode[], code: PermissionCode): boolean {
  return perms.includes(code);
}

// Convenience: can this permission set access the admin panel / user management?
export function canAccessAdmin(perms: PermissionCode[]): boolean {
  return perms.includes(PERMISSIONS.admin);
}
export function canManageUsers(perms: PermissionCode[]): boolean {
  return perms.includes(PERMISSIONS.userAdmin) && perms.includes(PERMISSIONS.admin);
}
