import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { githubListRepos, githubReadFile } from '@/lib/github';
import { writeAudit } from '@/lib/audit';

// POST /api/github/tool — let the agent call GitHub tools on the user's behalf.
// Body: { tool: "list_repos" } | { tool: "read_file", repo, path }
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

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
    default:
      return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
  }
}
