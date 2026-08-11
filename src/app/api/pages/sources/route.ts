import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { githubRepos, gitlabRepos } from '@/lib/git-fetch';
import { cachedJson } from '@/lib/kv-cache';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/pages/sources — everything the Pages deploy page needs to populate the
// "new project → pick a source" screen:
//   workspaces: the user's workspaces (deployable files)
//   github:     { enabled, connected, repos[] }   (enabled when GITHUB OAuth is configured)
//   gitlab:     { enabled, connected, repos[] }   (enabled when GITLAB OAuth is configured)
//                gitlab.enabled is exposed only when GITLAB_CLIENT_* are set.
//
// Pass ?light=1 to skip fetching the git repositories (which can be slow — they call the
// GitHub/GitLab APIs). Light mode still returns `available`, `workspaces`, and the
// enabled/connected flags, so a page that only needs to know whether Pages is configured
// (e.g. the project list) responds fast instead of waiting on repo enumeration.
export async function GET(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const light = new URL(req.url).searchParams.get('light') === '1';
  const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const gitlabEnabled = Boolean(process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET);

  const [workspaces, githubConn, gitlabConn] = await Promise.all([
    prisma.workspace.findMany({
      where: { ownerId: session.userId },
      select: { id: true, title: true, _count: { select: { files: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    githubEnabled ? prisma.gitHubConnection.findFirst({ where: { userId: session.userId } }) : null,
    gitlabEnabled ? prisma.gitlabConnection.findFirst({ where: { userId: session.userId } }) : null,
  ]);

  let github = { enabled: githubEnabled, connected: false, repos: [] as { name: string; branch: string; language: string | null }[] };
  if (githubEnabled && githubConn) {
    github.connected = true;
    if (!light) {
      // Per-user repo list is slow (calls GitHub's API); cache it in KV for a short window.
      try {
        github.repos = await cachedJson('ghrepos', session.userId, () => githubRepos(session.userId), {
          ttlSeconds: Number(process.env.KV_GIT_REPOS_TTL) || 60,
        });
      } catch {
        github.repos = [];
      }
    }
  }

  let gitlab = { enabled: gitlabEnabled, connected: false, repos: [] as { name: string; branch: string; language: string | null }[] };
  if (gitlabEnabled && gitlabConn) {
    gitlab.connected = true;
    if (!light) {
      try {
        gitlab.repos = await cachedJson('glrepos', session.userId, () => gitlabRepos(session.userId), {
          ttlSeconds: Number(process.env.KV_GIT_REPOS_TTL) || 60,
        });
      } catch {
        gitlab.repos = [];
      }
    }
  }

  return NextResponse.json({
    available: Boolean(process.env.PAGES_KEY && process.env.PAGES_ACCOUNT_ID),
    workspaces: workspaces.map((w) => ({ id: w.id, title: w.title, files: w._count.files })),
    github,
    gitlab,
  });
}
