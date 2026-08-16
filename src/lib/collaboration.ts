// Workspace + file collaboration: who can see/edit a workspace or a specific file.
//
// Access model (mirrors the original OS's collaborator sharing):
//   - The workspace OWNER always has full access.
//   - A WorkspaceCollaborator grants access to the whole workspace (read or write).
//   - A FileShare grants access to ONE file inside a workspace (read or write).
//   - A user with workspace-level access can also read any file in it; file-level
//     shares are for finer-grained sharing without granting the whole workspace.
//
// The effective role for a (user, file) pair is the max of the workspace role and the
// file role: write > read > none.

import { prisma } from './db';

export type CollabRole = 'read' | 'write';

export function isCollabRole(value: unknown): value is CollabRole {
  return value === 'read' || value === 'write';
}

// The effective access a user has to a workspace: 'owner' | 'write' | 'read' | null.
export async function workspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<'owner' | 'write' | 'read' | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!workspace) return null;
  if (workspace.ownerId === userId) return 'owner';

  const collab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return collab ? (collab.role === 'write' ? 'write' : 'read') : null;
}

// The effective role a user has on a specific file: 'write' | 'read' | null.
// Workspace write beats file read; file write beats workspace read.
export async function fileAccess(
  userId: string,
  fileId: string,
): Promise<'write' | 'read' | null> {
  const file = await prisma.workspaceFile.findUnique({
    where: { id: fileId },
    select: { workspaceId: true },
  });
  if (!file) return null;

  const ws = await workspaceAccess(userId, file.workspaceId);
  if (ws === 'owner' || ws === 'write') return 'write';
  if (ws === 'read') return 'read';

  const share = await prisma.fileShare.findUnique({
    where: { fileId_userId: { fileId, userId } },
    select: { role: true },
  });
  return share ? (share.role === 'write' ? 'write' : 'read') : null;
}

// List the users a workspace is shared with (for the owner's collaborator manager).
export async function listWorkspaceCollaborators(workspaceId: string) {
  return prisma.workspaceCollaborator.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

// List the users a file is shared with.
export async function listFileShares(fileId: string) {
  return prisma.fileShare.findMany({
    where: { fileId },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
}