import { prisma } from './db';
import { decryptSecret } from './credentials';
import { assertGitlabRepoOwned } from './git-fetch';

// ---------------------------------------------------------------------------
// GitLab agent tools: call the GitLab API on behalf of a connected user.
// Extracted from the /api/gitlab/tool route so the agent's multi-turn tool loop
// can reuse the same logic (and the same security checks).
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

async function getGitlabToken(userId: string): Promise<string | null> {
  const conn = await prisma.gitlabConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true },
  });
  if (!conn) return null;
  // Token is encrypted at rest; decrypt, tolerating legacy plaintext rows.
  return decryptSecret(conn.accessToken) ?? conn.accessToken;
}

// Whether the most-recently-connected GitLab account has write access granted.
export async function gitlabWriteGranted(userId: string): Promise<boolean> {
  const conn = await prisma.gitlabConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { writeAccess: true },
  });
  return conn?.writeAccess === 'readwrite';
}

// List the connected user's projects.
export async function gitlabListProjects(userId: string): Promise<string> {
  try {
    const token = await getGitlabToken(userId);
    if (!token) return 'GitLab is not connected. Connect it in the Connections page first.';
    const res = await fetch(`${BASE_URL}/api/v4/projects?membership=true&simple=true&per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GitLab API error: ${res.status}`);
    const data = (await res.json()) as { id: number; path_with_namespace: string }[];
    const names = data.map((p) => p.path_with_namespace);
    return names.length ? names.join('\n') : '(no accessible projects)';
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}

// Create an issue in a project (write operation — requires write access).
export async function gitlabCreateIssue(
  userId: string,
  project: string,
  title: string,
  body?: string,
): Promise<string> {
  try {
    const token = await getGitlabToken(userId);
    if (!token) return 'GitLab is not connected. Connect it in the Connections page first.';
    // Ownership check: only create issues in projects belonging to the user's own connected
    // account. Without this a caller could create issues in arbitrary projects the token can
    // see — a write-scoped IDOR / cross-project write.
    try {
      await assertGitlabRepoOwned(userId, project);
    } catch {
      return 'Error: you can only create issues in your own repositories.';
    }
    const res = await fetch(`${BASE_URL}/api/v4/projects/${encodeURIComponent(project)}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: body ?? '' }),
    });
    if (!res.ok) throw new Error(`GitLab API error: ${res.status}`);
    const data = (await res.json()) as { iid: number; web_url: string };
    return `Created issue #${data.iid}: ${data.web_url}`;
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}