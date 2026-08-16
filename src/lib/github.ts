import { prisma } from './db';
import { encryptSecret, decryptSecret } from './credentials';

// OAuth tokens are sensitive: store them encrypted at rest (AES-256-GCM via AUTH_SECRET),
// never plaintext. decryptGitHubToken tolerates legacy plaintext rows: an encrypted value
// is decrypted; a value that is not the iv:tag:data format (old plaintext) is returned as-is.
function decryptGitHubToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return decryptSecret(raw) ?? raw;
}

export interface GitHubUser {
  login: string;
  name?: string | null;
  id: number;
}
export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return (await res.json()) as GitHubUser;
}

// A single user may connect MULTIPLE GitHub accounts. Each row is keyed by the
// account's numeric githubId (unique), so connecting the same GitHub account twice just
// refreshes that row. `getGitHubToken` returns the MOST RECENTLY connected account's
// token, which keeps the agent's GitHub tools working when only one (or the last-used)
// account is intended.

export async function saveGitHubConnection(userId: string, accessToken: string): Promise<string> {
  const gh = await fetchGitHubUser(accessToken);
  const login = gh.login.toLowerCase();
  // Block if this GitHub identity is bound to a DIFFERENT user (account-stealing guard).
  const boundTo = await prisma.user.findUnique({ where: { githubId: gh.id } });
  if (boundTo && boundTo.id !== userId) {
    throw new Error('该 GitHub 账号已绑定到另一个用户');
  }
  // Upsert by the account's githubId (not userId) → supports multiple accounts per user.
  const existing = await prisma.gitHubConnection.findUnique({ where: { githubId: gh.id } });
  if (existing && existing.userId !== userId) {
    throw new Error('该 GitHub 账号已绑定到另一个用户');
  }
  // Encrypt the token at rest; never persist the raw OAuth token.
  const encrypted = encryptSecret(accessToken);
  await prisma.gitHubConnection.upsert({
    where: { githubId: gh.id },
    update: { userId, accessToken: encrypted, githubLogin: login },
    create: { userId, githubId: gh.id, accessToken: encrypted, githubLogin: login },
  });
  // Store the GitHub numeric id on the user so a later OAuth sign-in resolves to the
  // same account (even if their GitHub username ever changes).
  await prisma.user.updateMany({
    where: { id: userId, githubId: null },
    data: { githubId: gh.id },
  });
  return login;
}

// List all GitHub accounts connected to a user.
export async function listGitHubConnections(userId: string) {
  return prisma.gitHubConnection.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, githubLogin: true, updatedAt: true },
  });
}

export async function getGitHubToken(userId: string): Promise<string | null> {
  const conn = await prisma.gitHubConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return conn ? decryptGitHubToken(conn.accessToken) : null;
}

export async function isGitHubConnected(userId: string): Promise<boolean> {
  const conn = await prisma.gitHubConnection.findFirst({
    where: { userId },
    select: { accessToken: true },
  });
  return Boolean(conn);
}

// ---- Agent tools: call the GitHub API on behalf of a connected user ----

async function ghFetch(userId: string, path: string): Promise<unknown> {
  const token = await getGitHubToken(userId);
  if (!token) throw new Error('GitHub is not connected. Connect it in the Connections page first.');
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 404) throw new Error(`GitHub path not found: ${path}`);
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

// List the connected user's repos.
export async function githubListRepos(userId: string): Promise<string> {
  try {
    const data = (await ghFetch(userId, '/user/repos?per_page=50&sort=updated')) as {
      full_name: string;
      description?: string | null;
      language?: string | null;
    }[];
    if (!data.length) return 'No repositories found.';
    return data
      .slice(0, 20)
      .map((r) => `${r.full_name}${r.description ? ` — ${r.description}` : ''}${r.language ? ` [${r.language}]` : ''}`)
      .join('\n');
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}

// Read a file's content from a repo.
// SECURITY: only repos belonging to the user's own connected account may be read. Without
// this ownership check a caller (or a misdirected agent) could make the server read an
// arbitrary repo with the user's token — including private repos the user can see but never
// authorized this app to touch. This mirrors assertGithubRepoOwned used by the Pages deploy
// flow, but implemented here to avoid an import cycle with git-fetch.ts.
export async function githubReadFile(userId: string, repoFullName: string, path: string): Promise<string> {
  try {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
      return 'Error: invalid repository name (expected "owner/repo").';
    }
    // Confirm the repo is in the user's own connected account before reading.
    const owned = (await ghFetch(userId, '/user/repos?per_page=100&sort=updated')) as { full_name: string }[];
    if (!Array.isArray(owned) || !owned.some((r) => r.full_name === repoFullName)) {
      return 'Error: you can only read files from your own connected repositories.';
    }
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoFullName)}/contents/${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${await getGitHubToken(userId)}`, Accept: 'application/vnd.github.raw+json' } },
    );
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return await res.text();
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}

// ---- Gatekeeper capability: write access ----
// The connection defaults to 'readonly'; a write tool may only run when the user has
// explicitly granted 'readwrite'. This enforces the "side-effect approval" model: the agent
// can read freely but needs an explicit grant to mutate the external service.

export type WriteAccess = 'readonly' | 'readwrite';

// Whether the most-recently-connected GitHub account has write access granted.
export async function githubWriteGranted(userId: string): Promise<boolean> {
  const conn = await prisma.gitHubConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { writeAccess: true },
  });
  return conn?.writeAccess === 'readwrite';
}

// Set write access for the most-recently-connected account. Returns the new value.
export async function githubSetWriteAccess(userId: string, access: WriteAccess): Promise<string> {
  const conn = await prisma.gitHubConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!conn) throw new Error('GitHub is not connected.');
  return prisma.gitHubConnection.update({ where: { id: conn.id }, data: { writeAccess: access } }).then((c) => c.writeAccess);
}

// Create an issue in a repo (write operation — requires write access).
export async function githubCreateIssue(
  userId: string,
  repoFullName: string,
  title: string,
  body?: string,
): Promise<string> {
  if (!(await githubWriteGranted(userId))) {
    return 'Permission denied: this connection is read-only. Enable write access in Connections (Gatekeeper) first.';
  }
  try {
    // SECURITY: only repos belonging to the user's own connected account may be
    // written. Without this ownership check a caller (or a misdirected agent) could
    // create issues in ANY repo the token can reach — including org repos the user
    // merely collaborates on and never authorized this app to touch. Mirrors
    // githubReadFile's check (and GitLab's assertGitlabRepoOwned).
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
      return 'Error: invalid repository name (expected "owner/repo").';
    }
    const owned = (await ghFetch(userId, '/user/repos?per_page=100&sort=updated')) as { full_name: string }[];
    if (!Array.isArray(owned) || !owned.some((r) => r.full_name === repoFullName)) {
      return 'Error: you can only create issues in your own connected repositories.';
    }
    const token = await getGitHubToken(userId);
    if (!token) throw new Error('GitHub is not connected.');
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(repoFullName)}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: body ?? '' }),
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = (await res.json()) as { number: number; html_url: string };
    return `Created issue #${data.number}: ${data.html_url}`;
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}
