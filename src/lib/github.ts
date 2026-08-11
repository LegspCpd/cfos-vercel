import { prisma } from './db';

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

export async function saveGitHubConnection(userId: string, accessToken: string): Promise<string> {
  const gh = await fetchGitHubUser(accessToken);
  const login = gh.login.toLowerCase();
  // If this GitHub identity is already linked to another account, block the connect
  // to avoid stealing another user's GitHub login.
  const boundTo = await prisma.user.findUnique({ where: { githubId: gh.id } });
  if (boundTo && boundTo.id !== userId) {
    throw new Error('该 GitHub 账号已绑定到另一个用户');
  }
  await prisma.gitHubConnection.upsert({
    where: { userId },
    update: { accessToken, githubLogin: login },
    create: { userId, accessToken, githubLogin: login },
  });
  // Store the GitHub numeric id on the user so a later OAuth sign-in resolves to the
  // same account (even if their GitHub username ever changes).
  await prisma.user.updateMany({
    where: { id: userId, githubId: null },
    data: { githubId: gh.id },
  });
  return login;
}

export async function getGitHubToken(userId: string): Promise<string | null> {
  const conn = await prisma.gitHubConnection.findUnique({ where: { userId } });
  return conn?.accessToken ?? null;
}

export async function isGitHubConnected(userId: string): Promise<boolean> {
  const conn = await prisma.gitHubConnection.findUnique({
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
export async function githubReadFile(userId: string, repoFullName: string, path: string): Promise<string> {
  try {
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
