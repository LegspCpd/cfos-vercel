import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client so the pure helpers can be tested without a database.
vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
    },
    workspaceCollaborator: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    workspaceFile: {
      findUnique: vi.fn(),
    },
    fileShare: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { isCollabRole, workspaceAccess, fileAccess } from '@/lib/collaboration';
import { prisma } from '@/lib/db';

describe('collaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCollabRole', () => {
    it('accepts read/write', () => {
      expect(isCollabRole('read')).toBe(true);
      expect(isCollabRole('write')).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isCollabRole('owner')).toBe(false);
      expect(isCollabRole('admin')).toBe(false);
      expect(isCollabRole(null)).toBe(false);
      expect(isCollabRole(undefined)).toBe(false);
    });
  });

  describe('workspaceAccess', () => {
    it('returns null for a missing workspace', async () => {
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(await workspaceAccess('u1', 'w1')).toBeNull();
    });

    it('returns owner for the owner', async () => {
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u1' });
      expect(await workspaceAccess('u1', 'w1')).toBe('owner');
    });

    it('returns write for a write collaborator', async () => {
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'write' });
      expect(await workspaceAccess('u1', 'w1')).toBe('write');
    });

    it('returns read for a read collaborator', async () => {
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'read' });
      expect(await workspaceAccess('u1', 'w1')).toBe('read');
    });

    it('returns null for a stranger', async () => {
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(await workspaceAccess('u1', 'w1')).toBeNull();
    });
  });

  describe('fileAccess', () => {
    it('returns null for a missing file', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(await fileAccess('u1', 'f1')).toBeNull();
    });

    it('grants write to the workspace owner', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u1' });
      expect(await fileAccess('u1', 'f1')).toBe('write');
    });

    it('grants write to a workspace write collaborator', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'write' });
      expect(await fileAccess('u1', 'f1')).toBe('write');
    });

    it('grants read to a workspace read collaborator', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'read' });
      expect(await fileAccess('u1', 'f1')).toBe('read');
    });

    it('grants write via a file-level write share', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.fileShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'write' });
      expect(await fileAccess('u1', 'f1')).toBe('write');
    });

    it('grants read via a file-level read share', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.fileShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: 'read' });
      expect(await fileAccess('u1', 'f1')).toBe('read');
    });

    it('returns null with no workspace or file access', async () => {
      (prisma.workspaceFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: 'w1' });
      (prisma.workspace.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ownerId: 'u2' });
      (prisma.workspaceCollaborator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.fileShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(await fileAccess('u1', 'f1')).toBeNull();
    });
  });
});