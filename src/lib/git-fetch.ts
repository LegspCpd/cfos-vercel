// Download a repository's files from GitHub or GitLab, for the Pages deploy feature
// ("deploy from a Git repository"). Returns a flat list of { path, content } ready to feed
// the shared deploy pipeline.
//
// Both providers are fetched via their REST APIs using the user's connected OAuth token.
// GitHub downloads the whole repo as a zip in one request (zipball endpoint, then unzip);
// GitLab uses the repository tree API with `recursive=true` then the raw file endpoint.

import { getGitHubToken } from '@/lib/github';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/credentials';
import { unzip } from '@/lib/unzip';

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

  // Download the whole repo as a zip in ONE request. We prefer codeload's direct zip URL for
  // public repos — it avoids the api.github.com 302 redirect (which can be flaky on
  // serverless for large archives). For private repos we fall back to the api zipball with the
  // user's token.
  const branch = ref || 'HEAD';
  const [owner, repo] = repoFullName.split('/');
  let buf: Buffer | null = null;

  // 1) codeload direct zip (public repos; no auth, no redirect hop).
  try {
    const res = await fetch(
      `https://codeload.github.com/${encodeURIComponent(owner || '')}/${encodeURIComponent(repo || '')}/zip/refs/heads/${encodeURIComponent(branch)}`,
      { redirect: 'follow' },
    );
    if (res.ok) buf = Buffer.from(await res.arrayBuffer());
  } catch {
    buf = null;
  }

  // 2) api zipball with token (private repos / non-branch refs).
  if (!buf) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(repoFullName)}/zipball/${encodeURIComponent(branch)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, redirect: 'follow' },
      );
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch {
      buf = null;
    }
  }

  if (!buf) {
    throw new Error(
      'GitHub: unable to download this repository. If it is private, your connected token may lack repo read access. Reconnect GitHub (Profile → Connections) and, on the authorization screen, choose the repositories to grant — then retry.',
    );
  }

  // The zipball archive nests everything under a `<repo>-<sha>/` folder; strip that prefix.
  const entries = unzip(buf);
  const prefix = commonRootPrefix(entries.map((e) => e.path));
  const files: GitFile[] = [];
  let total = 0;
  for (const e of entries) {
    const path = prefix ? e.path.slice(prefix.length) : e.path;
    if (!path) continue;
    if (path.split('/').some((seg) => seg.startsWith('.') && seg !== '_redirects' && seg !== '_headers')) continue;
    total += e.content.byteLength;
    if (total > MAX_BYTES) throw new Error('Repository exceeds 100 MB total size limit');
    files.push({ path, content: e.content });
  }
  if (files.length === 0) throw new Error('Repository has no files to deploy');
  return files;
}

// Find the common leading directory prefix shared by all paths (e.g. "repo-main-abc123/").
// Computed across ALL entries (not just the first) so a zip whose first entry is a nested
// file still strips the correct root. Returns '' when there's no shared single-segment root.
function commonRootPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  const first = paths[0].split('/');
  if (first.length < 2) return '';
  const root = `${first[0]}/`;
  // Every path must share the same first segment; otherwise there is no single root to strip.
  for (const p of paths) {
    if (!p.startsWith(root)) return '';
  }
  return root;
}

// List a connected GitHub user's repos (name + default branch) for the picker. Fetches ALL
// repos by paging through the GitHub API (per_page=100) so the frontend can paginate freely.
const MAX_GITHUB_REPOS = 1000;
export async function githubRepos(userId: string): Promise<{ name: string; branch: string; language: string | null }[]> {
  const token = await getGitHubToken(userId);
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const out: { name: string; branch: string; language: string | null }[] = [];
  let page = 1;
  // Keep paging until GitHub returns an empty page (or we hit the safety cap).
  while (out.length < MAX_GITHUB_REPOS) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`,
      { headers },
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      full_name: string;
      default_branch: string;
      language: string | null;
    }[];
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) {
      out.push({ name: r.full_name, branch: r.default_branch, language: r.language });
    }
    page += 1;
  }
  return out;
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

// Strict format check for a GitHub repo "owner/repo": exactly one slash, and only the
// characters GitHub allows in owner/repo names. Rejects path traversal / extra slashes /
// control chars that could smuggle extra path segments into download URLs.
const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITLAB_PROJECT_RE = /^[A-Za-z0-9_.\-/]+$/;

// Verify the requested GitHub repo belongs to the current user's connected account BEFORE
// any download happens. Without this, a caller could make the server download an arbitrary
// public repo with the user's OAuth token (and, for private repos they have access to, leak
// that they're downloading). Throws if the repo isn't in the user's own repo list.
export async function assertGithubRepoOwned(userId: string, repo: string): Promise<void> {
  if (!GITHUB_REPO_RE.test(repo)) throw new Error('GitHub: invalid repository name (expected "owner/repo").');
  const owned = await githubRepos(userId);
  if (!owned.some((r) => r.name === repo)) {
    throw new Error(
      'GitHub: you can only deploy repositories from your own connected account. Reconnect GitHub and grant access to this repo ("All repositories"), then retry.',
    );
  }
}

// Same ownership check for GitLab. The project may contain a namespace slash, so validate
// with a slightly looser pattern but still require membership.
export async function assertGitlabRepoOwned(userId: string, project: string): Promise<void> {
  if (!GITLAB_PROJECT_RE.test(project) || project.includes('..')) {
    throw new Error('GitLab: invalid repository name.');
  }
  const owned = await gitlabRepos(userId);
  if (!owned.some((r) => r.name === project)) {
    throw new Error(
      'GitLab: you can only deploy repositories from your own connected account. Reconnect GitLab and grant access to this repo, then retry.',
    );
  }
}
