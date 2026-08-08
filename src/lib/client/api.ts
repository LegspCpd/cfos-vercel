'use client';

import { getAuthHeaders, getToken } from './auth';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () =>
    request<{ id: string; username: string; displayName: string; isAdmin: boolean }>('/api/me'),
  adminOverview: () =>
    request<{
      settings: { signupsEnabled: boolean };
      users: {
        id: string;
        username: string;
        displayName: string;
        isAdmin: boolean;
        createdAt: string;
        _count: { workspaces: number };
      }[];
    }>('/api/admin/overview'),
  adminSetSignups: (signupsEnabled: boolean) =>
    request<{ ok: boolean }>('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ signupsEnabled }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  signup: (username: string, displayName: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    }),
  listWorkspaces: () =>
    request<{ workspaces: WorkspaceSummary[] }>('/api/workspaces'),
  createWorkspace: (title: string) =>
    request<{ workspace: WorkspaceDetail }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  getWorkspace: (id: string) =>
    request<{ workspace: WorkspaceDetail }>(`/api/workspaces/${id}`),
  renameWorkspace: (id: string, title: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}`, { method: 'DELETE' }),
  saveFiles: (id: string, files: { path: string; content: string; isEntry?: boolean }[]) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}/files`, {
      method: 'PUT',
      body: JSON.stringify({ files }),
    }),
  runAgent: (id: string, prompt: string) =>
    request<{ message: string; files: { path: string; content: string; isEntry: boolean }[] }>(
      `/api/workspaces/${id}/agent`,
      { method: 'POST', body: JSON.stringify({ prompt }) },
    ),
};

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

export interface WorkspaceSummary {
  id: string;
  title: string;
  updatedAt: string;
  _count: { files: number };
}

export interface WorkspaceFile {
  id: string;
  path: string;
  content: string;
  isEntry: boolean;
}

export interface WorkspaceDetail {
  id: string;
  title: string;
  ownerId: string;
  files: WorkspaceFile[];
}

// Redirect to /login if no token present.
export function requireAuth(): boolean {
  return !!getToken();
}
