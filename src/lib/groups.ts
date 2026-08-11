import { prisma } from './db';
import {
  SUPER_ADMIN_PERMISSIONS,
  DEFAULT_GROUP_BASE_PERMISSIONS,
  DEFAULT_GROUP_NAME,
  serializePermissions,
} from './permissions';

export const SUPER_ADMIN_GROUP = '__super_admin__';
export const DEFAULT_GROUP = DEFAULT_GROUP_NAME;

// Ensure the built-in groups exist. Called on startup / bootstrap:
//  - "超级管理员" group: has every permission (members see all features incl. admin).
//  - "普通用户" group: has the base non-admin capabilities.
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

  // The default group grants the base non-admin capabilities (workspace, file
  // sharing, context docs, external connections). Management/admin perms stay
  // exclusive to the super-admin group. update: applies this to existing installs,
  // not just fresh ones, so enabling backend permission checks (step-by-step)
  // doesn't lock out existing ordinary users.
  await prisma.userGroup.upsert({
    where: { name: DEFAULT_GROUP },
    update: { permissions: serializePermissions(DEFAULT_GROUP_BASE_PERMISSIONS), isAdminGroup: false },
    create: {
      name: DEFAULT_GROUP,
      permissions: serializePermissions(DEFAULT_GROUP_BASE_PERMISSIONS),
      isAdminGroup: false,
    },
  });

  return superGroup.id;
}
