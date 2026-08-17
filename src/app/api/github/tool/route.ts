import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { githubListRepos, githubReadFile, githubCreateIssue } from '@/lib/github';
import { writeAudit } from '@/lib/audit';
import { requireCfAccess } from '@/lib/require-access';
import { externalToolLimiter } from '@/lib/rate-limit';

// POST /api/github/tool — let the agent call GitHub tools on the user's behalf.
// Read-only tools: { tool: "list_repos" } | { tool: "read_file", repo, path }
// Write tools (Gatekeeper side-effect approval): { tool: "create_issue", repo, title, body }
export async function POST(req: Request) {
  if (!(await requireCfAccess(req))) {
    return NextResponse.json({ error: 'Cloudflare Access verification required' }, { status: 401 });
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Cap external API calls per user so a script can't burn the GitHub API quota.
  if (externalToolLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const body = await req.json();
  const tool = body?.tool as string;

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'github.tool_call',
    detail: `GitHub tool: ${tool}`,
  });

  switch (tool) {
    case 'list_repos': {
      const result = await githubListRepos(session.userId);
      return NextResponse.json({ result });
    }
    case 'read_file': {
      const repo = String(body?.repo ?? '');
      const path = String(body?.path ?? '');
      if (!repo || !path) {
        return NextResponse.json({ error: 'repo and path are required' }, { status: 400 });
      }
      const result = await githubReadFile(session.userId, repo, path);
      return NextResponse.json({ result });
    }
    case 'create_issue': {
      const repo = String(body?.repo ?? '');
      const title = String(body?.title ?? '');
      if (!repo || !title) {
        return NextResponse.json({ error: 'repo and title are required' }, { status: 400 });
      }
      const result = await githubCreateIssue(session.userId, repo, title, String(body?.body ?? ''));
      return NextResponse.json({ result });
    }
    default:
      return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
  }
}
