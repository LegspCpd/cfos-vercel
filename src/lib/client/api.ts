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
  listProviders: () =>
    request<{
      providers: {
        id: string;
        name: string;
        baseUrl: string;
        model: string;
        isEnabled: boolean;
        apiKeyMasked: string;
      }[];
    }>('/api/providers'),
  addProvider: (data: {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    isEnabled?: boolean;
  }) =>
    request<{ provider: { id: string } }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProvider: (
    id: string,
    data: { name?: string; baseUrl?: string; apiKey?: string; model?: string; isEnabled?: boolean },
  ) =>
    request<{ ok: boolean }>(`/api/providers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteProvider: (id: string) =>
    request<{ ok: boolean }>(`/api/providers/${id}`, { method: 'DELETE' }),
  updateProfile: (data: {
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => request<{ user: { displayName: string; username: string } }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  listShares: () =>
    request<{
      files: {
        id: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        expiresAt: string;
        createdAt: string;
      }[];
    }>('/api/share'),
  uploadShare: (data: { fileName: string; mimeType: string; content: string; expiresInDays?: number }) =>
    request<{
      file: { id: string; fileName: string; sizeBytes: number; expiresAt: string; mimeType: string };
    }>('/api/share', { method: 'POST', body: JSON.stringify(data) }),
  getShareLink: (id: string) =>
    request<{ url: string; fileName: string; sizeBytes: number; mimeType: string; expiresAt: string }>(
      `/api/share/${id}`,
    ),
  deleteShare: (id: string) =>
    request<{ ok: boolean }>(`/api/share/${id}`, { method: 'DELETE' }),
  githubStatus: () =>
    request<{ connected: boolean; githubLogin: string | null; updatedAt: string | null }>('/api/github/status'),
  githubDisconnect: () =>
    request<{ ok: boolean }>('/api/github/disconnect', { method: 'POST' }),
  listContext: () =>
    request<{
      docs: { id: string; title: string; tags: string; createdAt: string; updatedAt: string }[];
    }>('/api/context'),
  getContext: (id: string) =>
    request<{ doc: { id: string; title: string; content: string; tags: string } }>(`/api/context/${id}`),
  createContext: (data: { title: string; content: string; tags?: string }) =>
    request<{ doc: { id: string } }>('/api/context', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteContext: (id: string) =>
    request<{ ok: boolean }>(`/api/context/${id}`, { method: 'DELETE' }),
  cfAccessStatus: () =>
    request<{ enabled: boolean; team: string | null; audConfigured: boolean; audMasked: string | null }>(
      '/api/admin/cfaccess',
    ),
  getSiteSettings: () =>
    request<{
      settings: {
        signupsEnabled: boolean;
        siteName: string;
        siteTagline: string;
        bannerText: string;
        bannerEnabled: boolean;
        bannerColor: string;
        footerText: string;
        defaultModel: string;
        agentInstructions: string;
        siteFavicon: string;
        siteLogo: string;
        turnstileSiteKey: string;
        turnstileSecretKey: string;
        recaptchaSiteKey: string;
        recaptchaSecretKey: string;
      };
    }>('/api/admin/settings'),
  updateSiteSettings: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/admin/settings', { method: 'POST', body: JSON.stringify(data) }),
  getStats: () =>
    request<{
      stats: {
        users: number;
        workspaces: number;
        files: number;
        shares: number;
        contexts: number;
        aiCalls: number;
        agentRuns: number;
      };
    }>('/api/admin/stats'),
  getPublicSite: () =>
    request<{
      siteName: string;
      siteTagline: string;
      bannerText: string;
      bannerEnabled: boolean;
      bannerColor: string;
      footerText: string;
      siteFavicon: string;
      siteLogo: string;
      turnstileEnabled: boolean;
      turnstileSiteKey: string;
      recaptchaEnabled: boolean;
      recaptchaSiteKey: string;
    }>('/api/site'),
  updateContext: (id: string, data: { title?: string; content?: string; tags?: string }) =>
    request<{ doc: { id: string; title: string; content: string; tags: string } }>(`/api/context/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  adminSetUserRole: (id: string, isAdmin: boolean) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    }),
  adminDeleteUser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  signup: (data: {
    username?: string;
    displayName?: string;
    password: string;
    email?: string;
    verificationCode?: string;
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sendVerificationCode: (email: string) =>
    request<{ ok: boolean }>('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  confirmVerificationCode: (email: string, code: string) =>
    request<{ valid: boolean }>('/api/auth/verify-code/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
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
  listChats: (id: string) =>
    request<{
      chats: {
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
        messages: { id: string; role: 'user' | 'assistant' | 'tool'; content: string }[];
      }[];
    }>(`/api/workspaces/${id}/chat`),
  createChat: (id: string) =>
    request<{ chat: { id: string } }>(`/api/workspaces/${id}/chat`, { method: 'POST' }),
  appendChatMessage: (
    id: string,
    chatId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
  ) =>
    request<{ message: { id: string } }>(`/api/workspaces/${id}/chat/${chatId}`, {
      method: 'POST',
      body: JSON.stringify({ role, content }),
    }),
  listFavorites: () =>
    request<{ favorites: { workspaceId: string; createdAt: string }[] }>('/api/favorites'),
  setFavorite: (workspaceId: string, favorite: boolean) =>
    request<{ ok: boolean }>('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, favorite }),
    }),
  listFileVersions: (id: string, path: string) =>
    request<{ versions: { id: string; content: string; createdAt: string }[] }>(
      `/api/workspaces/${id}/versions?path=${encodeURIComponent(path)}`,
    ),
  restoreFileVersion: (id: string, path: string, versionId: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ path, versionId }),
    }),
  importWorkspace: (title: string, files: { path: string; content: string; isEntry: boolean }[]) =>
    request<{ workspace: WorkspaceDetail }>('/api/workspaces/import', {
      method: 'POST',
      body: JSON.stringify({ title, files }),
    }),
  createShareToken: (id: string) =>
    request<{ token: string; url: string }>(`/api/workspaces/${id}/share`, { method: 'POST' }),
  getPublicBlueprint: (token: string) =>
    request<{
      workspace: {
        id: string;
        title: string;
        updatedAt: string;
        owner: { displayName: string; username: string };
        files: { path: string; content: string; isEntry: boolean }[];
      };
    }>(`/api/blueprint/${token}`),
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
