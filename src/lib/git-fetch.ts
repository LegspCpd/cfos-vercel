// Download a repository's file tree + contents from GitHub or GitLab, for the Pages
// deploy feature ("deploy from a Git repository"). Returns a flat list of { path, content }
// ready to feed the shared deploy pipeline.
//
// Both providers are fetched via their REST APIs using the user's connected OAuth token.
// GitHub uses the git trees API (recursive) then fetches each blob; GitLab uses the
// repository tree API with `recursive=true` then the raw file endpoint.

import { getGitHubToken } from '@/lib/github';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/credentials';

const GITLAB_BASE = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

export interface GitFile {
  path: string;
  content: Buffer;
}

// Limits to keep a single deploy well within serverless memory/time budgets.
const MAX_FILES = 500;
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB total

// ---- GitHub ----

export async function githubRepoFiles(userId: string, repoFullName: string, ref?: string): Promise<GitFile[]> {
  const token = await getGitHubToken(userId);
  if (!token) throw new Error('GitHub is not connected.');
  const api = `https://api.github.com/repos/${encodeURIComponent(repoFullName)}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  // Recursive git tree to enumerate every path.
  const treeRes = await fetch(`${api}/git/trees/${encodeURIComponent(ref || 'HEAD')}?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`);
  const treeData = (await treeRes.json()) as { tree?: { path?: string; type?: string; size?: number }[]; truncated?: boolean };
  const blobs = (treeData.tree || []).filter((t) => t.type === 'blob' && t.path);
  if (blobs.length > MAX_FILES) throw new Error(`Repo has too many files (max ${MAX_FILES})`);

  // Filter to deployable paths (skip dotfiles except Pages special files), then fetch the
  // blobs with a bounded concurrency pool — fetching sequentially would blow the serverless
  // timeout on repos with many files.
  const paths = blobs
    .map((b) => b.path as string)
    .filter((p) => !p.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'));
  const files: GitFile[] = [];
  let total = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p) => githubBlob(token, api, p)));
    for (let j = 0; j < batch.length; j++) {
      const content = results[j];
      if (!content) continue;
      total += content.byteLength;
      if (total > MAX_BYTES) throw new Error('Repository exceeds 100 MB total size limit');
      files.push({ path: batch[j], content });
    }
  }
  return files;
}

async function githubBlob(token: string, api: string, path: string): Promise<Buffer | null> {
  const res = await fetch(
    `${api}/contents/${encodeURIComponent(path)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json' } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching ${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 20 * 1024 * 1024) return null; // skip files > 20 MB
  return buf;
}

// List a connected GitHub user's repos (name + default branch) for the picker.
export async function githubRepos(userId: string): Promise<{ name: string; branch: string; language: string | null }[]> {
  const token = await getGitHubToken(userId);
  if (!token) return [];
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator',
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    full_name: string;
    default_branch: string;
    language: string | null;
  }[];
  return data.map((r) => ({ name: r.full_name, branch: r.default_branch, language: r.language }));
}

// ---- GitLab ----

export async function gitlabRepos(userId: string): Promise<{ name: string; branch: string; language: string | null }[]> {
  const token = await gitlabToken(userId);
  if (!token) return [];
  const res = await fetch(`${GITLAB_BASE}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { path_with_namespace: string; default_branch: string | null }[];
  return data.map((p) => ({ name: p.path_with_namespace, branch: p.default_branch || 'main', language: null }));
}

export async function gitlabRepoFiles(userId: string, project: string, ref?: string): Promise<GitFile[]> {
  const token = await gitlabToken(userId);
  if (!token) throw new Error('GitLab is not connected.');
  const proj = encodeURIComponent(project);
  const branch = ref || 'HEAD';

  // Recursive tree.
  const treeRes = await fetch(
    `${GITLAB_BASE}/api/v4/projects/${proj}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!treeRes.ok) throw new Error(`GitLab API error: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { type?: string; path?: string }[];
  const paths = tree
    .filter((t) => t.type === 'blob' && t.path)
    .map((t) => t.path as string)
    .filter((p) => !p.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers'));
  if (paths.length > MAX_FILES) throw new Error(`Repo has too many files (max ${MAX_FILES})`);

  // Bounded-concurrency fetch to avoid serverless timeouts on larger repos.
  const files: GitFile[] = [];
  let total = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (path) => {
        const res = await fetch(
          `${GITLAB_BASE}/api/v4/projects/${proj}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitLab API error ${res.status} fetching ${path}`);
        return Buffer.from(await res.arrayBuffer());
      }),
    );
    for (let j = 0; j < batch.length; j++) {
      const buf = results[j];
      if (!buf || buf.byteLength > 20 * 1024 * 1024) continue;
      total += buf.byteLength;
      if (total > MAX_BYTES) throw new Error('Repository exceeds 100 MB total size limit');
      files.push({ path: batch[j], content: buf });
    }
  }
  return files;
}

async function gitlabToken(userId: string): Promise<string | null> {
  const conn = await prisma.gitlabConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true },
  });
  if (!conn) return null;
  return decryptSecret(conn.accessToken) ?? conn.accessToken;
}
