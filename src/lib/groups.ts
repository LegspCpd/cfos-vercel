import { prisma } from './db';
import { SUPER_ADMIN_PERMISSIONS, serializePermissions } from './permissions';

export const SUPER_ADMIN_GROUP = '__super_admin__';
export const DEFAULT_GROUP = '__default__';

// Ensure the built-in groups exist. Called on startup / bootstrap:
//  - "超级管理员" group: has every permission (members see all features incl. admin).
//  - "普通用户" group: has only basic permissions (workspace & AI).
// Returns the super-admin group id.
export async function ensureDefaultGroups(): Promise<string> {
  const superGroup = await prisma.userGroup.upsert({
    where: { name: SUPER_ADMIN_GROUP },
    update: {},
    create: {
      name: SUPER_ADMIN_GROUP,
      permissions: serializePermissions(SUPER_ADMIN_PERMISSIONS),
      isAdminGroup: true,
    },
  });

  await prisma.userGroup.upsert({
    where: { name: DEFAULT_GROUP },
    update: {},
    create: {
      name: DEFAULT_GROUP,
      permissions: serializePermissions(['workspace.create']),
      isAdminGroup: false,
    },
  });

  return superGroup.id;
}
