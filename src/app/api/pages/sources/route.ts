import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { githubRepos, gitlabRepos } from '@/lib/git-fetch';

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
export async function GET(req: Request) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
    try {
      github.repos = await githubRepos(session.userId);
    } catch {
      github.repos = [];
    }
  }

  let gitlab = { enabled: gitlabEnabled, connected: false, repos: [] as { name: string; branch: string; language: string | null }[] };
  if (gitlabEnabled && gitlabConn) {
    gitlab.connected = true;
    try {
      gitlab.repos = await gitlabRepos(session.userId);
    } catch {
      gitlab.repos = [];
    }
  }

  return NextResponse.json({
    available: Boolean(process.env.PAGES_KEY && process.env.PAGES_ACCOUNT_ID),
    workspaces: workspaces.map((w) => ({ id: w.id, title: w.title, files: w._count.files })),
    github,
    gitlab,
  });
}
