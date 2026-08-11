'use client';

import { getAuthHeaders, getToken } from './auth';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      else if (body && typeof body === 'object') message = `${message}: ${JSON.stringify(body)}`;
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
    request<{
      id: string;
      username: string;
      displayName: string;
      isAdmin: boolean;
      avatarUrl: string;
      email: string;
      googleConnected: boolean;
      githubConnected: boolean;
      githubUsername: string | null;
      gitlabConnected: boolean;
      gitlabUsername: string | null;
      microsoftConnected: boolean;
      profileComplete: boolean;
      deleteRequestedAt: string | null;
      deleteAt: string | null;
      permissions: string[];
      groupId: string | null;
      groupName: string | null;
    }>('/api/me'),
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
    email?: string;
    verificationCode?: string;
  }) => request<{ user: { displayName: string; username: string; email: string | null } }>(
    '/api/profile',
    { method: 'PATCH', body: JSON.stringify(data) },
  ),
  // Required onboarding for OAuth-created accounts: username + password + human check.
  completeProfile: (data: {
    username: string;
    newPassword: string;
    email?: string;
    verificationCode?: string;
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ user: { id: string; username: string; displayName: string; email: string | null } }>(
      '/api/profile/complete',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  // Send a verification code to the user's CURRENT (already bound) email, for the
  // change-email flow (step 1). Bypasses the "already registered" guard in /verify-code.
  sendChangeEmailCode: (email: string) =>
    request<{ ok: boolean }>('/api/profile/change-email/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  // Change the bound email: oldEmail + oldCode, then newEmail + newCode.
  changeEmail: (data: {
    oldEmail: string;
    oldCode: string;
    newEmail: string;
    newCode: string;
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ ok: boolean; email: string }>('/api/profile/change-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Submit a support ticket (feedback / email-change appeal / other). Requires human check.
  submitTicket: (data: {
    type: string;
    title: string;
    content: string;
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ ticket: { id: string } }>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listMyTickets: () =>
    request<{ tickets: Ticket[] }>('/api/tickets'),
  listTickets: () =>
    request<{ tickets: Ticket[] }>('/api/admin/tickets'),
  handleTicket: (id: string, data: { status?: string; reply?: string }) =>
    request<{ ok: boolean }>(`/api/admin/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  // Public contact info (admin's email) shown on the profile appeal dialog.
  getPublicContact: () =>
    request<{ adminEmail: string | null }>('/api/site/contact'),
  // Per-user analytics (workspace counts, today's login IPs, AI token usage; admins
  // also get a site-wide summary).
  getAnalytics: () =>
    request<{
      joinedAt: string;
      workspaces: number;
      files: number;
      today: {
        loginCount: number;
        logins: { at: string; ip: string | null }[];
        aiCalls: number;
        tokens: number;
      };
      site: {
        todayLogins: number;
        todayTokens: number;
        todayAiCalls: number;
        todayUsersActive: number;
        topLoginIps: { ip: string; count: number }[];
      } | null;
      // The authoritative client IP as seen by the server for this request.
      currentIp: string | null;
      currentIpFamily: 'v4' | 'v6' | null;
    }>('/api/analytics'),
  // Record a "session view" (every visit to the analytics page) so admins can trace a
  // user's IP per visit. Fire-and-forget.
  reportVisit: () =>
    request<{ ok: boolean; ip: string | null }>('/api/analytics/visit', {
      method: 'POST',
    }),
  // Account deletion (注销账号): send code → verify + captcha → 4–7 day cooldown → delete.
  sendDeleteAccountCode: (email: string) =>
    request<{ ok: boolean }>('/api/profile/delete-account/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  requestDeleteAccount: (data: {
    email: string;
    code: string;
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ ok: boolean; deleteAt: string }>('/api/profile/delete-account', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  cancelDeleteAccount: () =>
    request<{ ok: boolean }>('/api/profile/delete-account/cancel', { method: 'POST' }),
  // For accounts without a bound email: request deletion after OAuth re-auth + captcha.
  requestDeleteAccountOauth: (data: {
    captchaProvider?: 'turnstile' | 'recaptcha';
    captchaToken?: string;
  }) =>
    request<{ ok: boolean; deleteAt: string }>('/api/profile/delete-account/oauth', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    // Use raw fetch — do NOT set Content-Type: application/json, or the multipart
    // boundary (required by the image host) won't be sent.
    const res = await fetch('/api/upload/avatar', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: fd,
    });
    if (!res.ok) {
      let message = `Upload failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return res.json() as Promise<{ url: string }>;
  },
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
  // Which external providers are configured in the environment (OAuth client creds set).
  connectionsAvailable: () =>
    request<{ github: boolean; google: boolean; microsoft: boolean; gitlab: boolean }>('/api/connections/available'),
  githubStatus: () =>
    request<{ connected: boolean; githubLogin: string | null; updatedAt: string | null; writeAccess: string }>(
      '/api/github/status',
    ),
  githubSetAccess: (access: 'readonly' | 'readwrite') =>
    request<{ writeAccess: string }>('/api/github/access', { method: 'POST', body: JSON.stringify({ access }) }),
  githubDisconnect: () =>
    request<{ ok: boolean }>('/api/github/disconnect', { method: 'POST' }),
  googleStatus: () =>
    request<{ connected: boolean; googleEmail: string | null; updatedAt: string | null }>('/api/google/status'),
  googleDisconnect: () =>
    request<{ ok: boolean }>('/api/google/disconnect', { method: 'POST' }),
  gitlabStatus: () =>
    request<{
      connected: boolean;
      gitlabUsername: string | null;
      writeAccess: string;
      updatedAt: string | null;
    }>('/api/gitlab/status'),
  gitlabSetAccess: (access: 'readonly' | 'readwrite') =>
    request<{ writeAccess: string }>('/api/gitlab/access', { method: 'POST', body: JSON.stringify({ access }) }),
  gitlabTool: (args: Record<string, unknown>) =>
    request<{ result?: string; error?: string }>('/api/gitlab/tool', { method: 'POST', body: JSON.stringify(args) }),
  gitlabDisconnect: () =>
    request<{ ok: boolean }>('/api/gitlab/disconnect', { method: 'POST' }),
  githubTool: (args: Record<string, unknown>) =>
    request<{ result?: string; error?: string }>('/api/github/tool', { method: 'POST', body: JSON.stringify(args) }),
  // Deploy a workspace to Cloudflare Pages (optionally mints a short link).
  deployWorkspace: (
    workspaceId: string,
    config?: { buildCommand?: string; installCommand?: string; outputDir?: string; envJson?: string },
  ) =>
    request<{ ok: boolean; deploymentId?: string; pagesUrl?: string; shortUrl?: string | null; error?: string }>(
      '/api/deploy',
      { method: 'POST', body: JSON.stringify({ workspaceId, ...config }) },
    ),
  // Stream a deploy, parsing SSE frames and calling onData({ text }) for each log line.
  // Resolves once the stream closes. Used by the deploy page to show real-time logs and to
  // navigate to the deployment detail page on success.
  streamDeploy: (
    workspaceId: string,
    config: DeployConfig,
    onData: (text: string) => void,
  ): Promise<DeployStreamResult> =>
    streamSse('/api/deploy/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, ...config }) }, onData),
  // Stream an uploaded ZIP deploy. Body is multipart/form-data (file + optional config).
  streamDeployUpload: (
    file: File,
    config: DeployConfig,
    onData: (text: string) => void,
  ): Promise<DeployStreamResult> => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (config.projectName) fd.append('projectName', config.projectName);
    if (config.installCommand) fd.append('installCommand', config.installCommand);
    if (config.buildCommand) fd.append('buildCommand', config.buildCommand);
    if (config.outputDir) fd.append('outputDir', config.outputDir);
    if (config.envJson) fd.append('envJson', config.envJson);
    // Raw fetch — do NOT set Content-Type, so the multipart boundary is preserved.
    return streamSse('/api/deploy/upload/stream', { method: 'POST', headers: {}, body: fd }, onData);
  },
  // Everything the Pages deploy page needs to build the "pick a source" screen.
  pagesSources: () =>
    request<{
      available: boolean;
      workspaces: { id: string; title: string; files: number }[];
      github: { enabled: boolean; connected: boolean; repos: { name: string; branch: string; language: string | null }[] };
      gitlab: { enabled: boolean; connected: boolean; repos: { name: string; branch: string; language: string | null }[] };
    }>('/api/pages/sources'),
  // Lightweight variant for list/dashboard pages: skips the (slow) git repo enumeration so
  // the project list loads fast. repos arrays are empty here; call pagesSources() when the
  // user actually opens the repo picker.
  pagesSourcesLight: () =>
    request<{
      available: boolean;
      workspaces: { id: string; title: string; files: number }[];
      github: { enabled: boolean; connected: boolean; repos: { name: string; branch: string; language: string | null }[] };
      gitlab: { enabled: boolean; connected: boolean; repos: { name: string; branch: string; language: string | null }[] };
    }>('/api/pages/sources?light=1'),
  // Deploy from a GitHub/GitLab repository, streaming logs.
  streamRepoDeploy: (
    provider: 'github' | 'gitlab',
    repo: string,
    ref: string | undefined,
    config: DeployConfig,
    onData: (text: string) => void,
  ): Promise<DeployStreamResult> =>
    streamSse(
      '/api/pages/repo/stream',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, repo, ref, ...config }),
      },
      onData,
    ),
  pagesStats: () =>
    request<{
      account: { id: string; subdomain: string };
      projects: { total: number; deployed: number; failed: number; thisMonth: number };
      usage: { used: number; quota: number };
      panels: { billingShow: boolean; accountShow: boolean };
      period: { start: string; end: string; label: string };
    }>('/api/pages/stats'),
  deleteDeployment: (id: string) =>
    request<{ ok: boolean }>(`/api/deploy/${id}`, { method: 'DELETE' }),
  getDeployment: (id: string) =>
    request<{
      deployment: {
        id: string;
        workspaceId: string;
        workspaceTitle: string | null;
        pagesProject: string;
        projectName: string | null;
        source: string | null;
        repo: string | null;
        repoRef: string | null;
        cfDeploymentId: string | null;
        status: string;
        pagesUrl: string | null;
        shortUrl: string | null;
        customDomain: string | null;
        error: string | null;
        log: string | null;
        buildCommand: string | null;
        installCommand: string | null;
        outputDir: string | null;
        envJson: string | null;
        createdAt: string;
        updatedAt: string;
      };
    }>(`/api/deploy/${id}`),
  listDeployments: () =>
    request<{
      deployments: {
        id: string;
        workspaceId: string;
        workspaceTitle: string;
        pagesProject: string;
        projectName: string | null;
        status: string;
        pagesUrl: string | null;
        shortUrl: string | null;
        customDomain: string | null;
        customDomains: string[];
        error: string | null;
        log: string | null;
        buildCommand: string | null;
        installCommand: string | null;
        outputDir: string | null;
        envJson: string | null;
        createdAt: string;
      }[];
    }>('/api/deploy/list'),
  checkDeployment: (id: string) =>
    request<{ ok: boolean; status: string; error?: string | null; cfStatus?: unknown }>(`/api/deploy/${id}/status`),
  bindDeploymentDomain: (id: string, domain: string) =>
    request<{ ok: boolean; customDomain?: string; error?: string }>(`/api/deploy/${id}/domain`, {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
  listSshHosts: () =>
    request<{
      hosts: {
        id: string;
        name: string;
        host: string;
        port: number;
        username: string;
        authMethod: string;
        saveCreds: boolean;
        hasCredential: boolean;
        country: string | null;
        region: string | null;
        createdAt: string;
        updatedAt: string;
      }[];
    }>('/api/ssh-hosts'),
  createSshHost: (data: {
    name: string;
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    authMethod?: 'password' | 'key' | 'keypassphrase';
    saveCreds?: boolean;
  }) => request<{ host: unknown }>('/api/ssh-hosts', { method: 'POST', body: JSON.stringify(data) }),
  updateSshHost: (
    id: string,
    data: {
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      privateKey?: string;
      passphrase?: string;
      authMethod?: 'password' | 'key' | 'keypassphrase';
      saveCreds?: boolean;
    },
  ) => request<{ host: unknown }>(`/api/ssh-hosts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSshHost: (id: string) => request<{ ok: boolean }>(`/api/ssh-hosts/${id}`, { method: 'DELETE' }),
  testSshHost: (id: string, creds?: { password?: string; privateKey?: string; passphrase?: string }) =>
    request<{ ok: boolean; message?: string; error?: string }>(`/api/ssh-hosts/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(creds || {}),
    }),
  monitorSshHost: (id: string) =>
    request<{
      ok: boolean;
      online: boolean;
      error?: string;
      checkedAt?: string;
      hostname?: string;
      os?: string | null;
      cores?: number | null;
      uptimeSec?: number;
      load?: { one: number | null; five: number | null; fifteen: number | null };
      memory?: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
      disk?: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
    }>(`/api/ssh-hosts/${id}/monitor`),
  // Stream a command's output over SSE. Returns { abort, done }: call abort() to stop the
  // stream early; await done to know when the stream has fully ended (for resetting UI state).
  // Each onData chunk carries { text, isError } so the UI can render failures (e.g. a
  // connection-timeout after retries) as a distinct red line.
  execSshHost: (
    id: string,
    command: string,
    onData: (chunk: { text: string; isError: boolean }) => void,
  ): { abort: () => void; done: Promise<void> } => {
    const controller = new AbortController();
    const done = (async () => {
      try {
        const res = await fetch(`/api/ssh-hosts/${id}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ command }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let message = `Command failed (${res.status})`;
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        // Parse every complete SSE frame in `buf` and drop it from the buffer.
        const drainFrames = () => {
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            let parsed: { type?: string; text?: string };
            try {
              parsed = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }
            if (parsed.type === 'data' && parsed.text) onData({ text: parsed.text, isError: false });
            if (parsed.type === 'error' && parsed.text) onData({ text: parsed.text, isError: true });
          }
        };
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          drainFrames();
        }
        // Flush any trailing frame the server sent without a closing blank line, so the
        // final chunk of output is not lost.
        if (buf.trim()) {
          const dataLine = buf.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.slice(6));
              if (parsed.type === 'data' && parsed.text) onData({ text: parsed.text, isError: false });
              if (parsed.type === 'error' && parsed.text) onData({ text: parsed.text, isError: true });
            } catch {
              /* ignore malformed tail */
            }
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          onData({ text: (e as Error).message || 'Command failed', isError: true });
        }
      }
    })();
    return { abort: () => controller.abort(), done };
  },
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
        turnstileEnvManaged: boolean;
        recaptchaEnvManaged: boolean;
        pagesBillingShow: boolean;
        pagesAccountShow: boolean;
        pagesBillingEnvManaged: boolean;
        pagesAccountEnvManaged: boolean;
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
  adminListUsers: () =>
    request<{
      users: {
        id: string;
        username: string;
        displayName: string;
        email: string | null;
        isAdmin: boolean;
        groupId: string | null;
        groupName: string | null;
        groupPermissions: string[];
        createdAt: string;
        workspaces: number;
      }[];
    }>('/api/admin/users'),
  adminCreateUser: (data: { username: string; displayName: string; password: string; email?: string; groupId?: string }) =>
    request<{ user: { id: string; username: string } }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdateUser: (id: string, data: { isAdmin?: boolean; newPassword?: string; email?: string | null; groupId?: string | null }) =>
    request<{ ok: boolean; username: string; isAdmin: boolean; groupId: string | null; groupName: string | null }>(
      `/api/admin/users/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
  adminListGroups: () =>
    request<{ groups: { id: string; name: string; permissions: string[]; isAdminGroup: boolean; memberCount: number }[] }>(
      '/api/admin/groups',
    ),
  adminCreateGroup: (data: { name: string; permissions: string[]; isAdminGroup?: boolean }) =>
    request<{ group: { id: string; name: string } }>('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdateGroup: (id: string, data: { name?: string; permissions?: string[] }) =>
    request<{ group: { id: string; name: string; permissions: string[] } }>(`/api/admin/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  adminDeleteGroup: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/groups/${id}`, { method: 'DELETE' }),
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
    request<{ workspace: WorkspaceDetail; previewUrl: string }>(`/api/workspaces/${id}`),
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
      previewUrl: string;
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

export interface Ticket {
  id: string;
  type: string;
  title: string;
  content: string;
  ip: string | null;
  status: string;
  reply: string | null;
  createdAt: string;
  updatedAt: string;
  user: { username: string; displayName: string; email: string | null };
}

export interface DeployConfig {
  projectName?: string; // user-facing display name (fallback: random pagesProject)
  installCommand?: string;
  buildCommand?: string;
  outputDir?: string;
  envJson?: string;
}

export interface DeployStreamResult {
  ok: boolean;
  recordId?: string; // Deployment record id — for navigating to /pages/[id]
  pagesUrl?: string;
  shortUrl?: string | null;
  error?: string;
}

// Shared SSE reader: POSTs `init` to `path` (auth headers are added, but the caller is
// responsible for NOT setting a JSON Content-Type when sending multipart), parses frames,
// calls onData(text) per log line, and resolves with the done frame's result.
async function streamSse(path: string, init: RequestInit, onData: (text: string) => void): Promise<DeployStreamResult> {
  const res = await fetch(path, {
    ...init,
    headers: { ...getAuthHeaders(), ...init.headers },
  });
  if (!res.ok || !res.body) {
    let message = `Deploy failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done: DeployStreamResult | null = null;

  const drainFrames = () => {
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let parsed: { type?: string; text?: string; ok?: boolean; recordId?: string; pagesUrl?: string; shortUrl?: string | null; error?: string };
      try {
        parsed = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (parsed.type === 'data' && parsed.text) onData(parsed.text);
      if (parsed.type === 'done') {
        done = parsed.ok
          ? { ok: true, recordId: parsed.recordId, pagesUrl: parsed.pagesUrl, shortUrl: parsed.shortUrl }
          : { ok: false, error: parsed.error || 'Deploy failed' };
      }
    }
  };

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    drainFrames();
  }
  if (buf.trim()) {
    const dataLine = buf.split('\n').find((l) => l.startsWith('data: '));
    if (dataLine) {
      try {
        const parsed = JSON.parse(dataLine.slice(6));
        if (parsed.type === 'done') {
          done = parsed.ok
            ? { ok: true, recordId: parsed.recordId, pagesUrl: parsed.pagesUrl, shortUrl: parsed.shortUrl }
            : { ok: false, error: parsed.error || 'Deploy failed' };
        }
      } catch {
        /* ignore malformed tail */
      }
    }
  }
  return done || { ok: false, error: 'Deploy stream ended without a result' };
}

// Redirect to /login if no token present.
export function requireAuth(): boolean {
  return !!getToken();
}
