import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

const BASE_URL = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/+$/, '');

// POST /api/gitlab/tool — let the agent call GitLab tools on the user's behalf.
// Read tool:  { tool: "list_projects" }
// Write tool (Gatekeeper side-effect approval): { tool: "create_issue", project, title, body }
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const tool = String(body.tool ?? '');

  const conn = await prisma.gitlabConnection.findFirst({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true, writeAccess: true },
  });
  if (!conn) return NextResponse.json({ error: 'GitLab is not connected' }, { status: 400 });

  const glToken = conn.accessToken;

  if (tool === 'list_projects') {
    try {
      const res = await fetch(`${BASE_URL}/api/v4/projects?membership=true&simple=true&per_page=100`, {
        headers: { Authorization: `Bearer ${glToken}` },
      });
      if (!res.ok) return NextResponse.json({ error: `GitLab API error: ${res.status}` }, { status: 502 });
      const data = (await res.json()) as { id: number; path_with_namespace: string }[];
      const names = data.map((p) => p.path_with_namespace);
      return NextResponse.json({ result: names.length ? names.join('\n') : '(no accessible projects)' });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'GitLab API error' }, { status: 502 });
    }
  }

  if (tool === 'create_issue') {
    const project = String(body.project ?? '');
    const title = String(body.title ?? '');
    if (!project || !title) {
      return NextResponse.json({ error: 'project and title are required' }, { status: 400 });
    }
    // Gatekeeper side-effect approval: write tools only run when write access is granted.
    if (conn.writeAccess !== 'readwrite') {
      return NextResponse.json(
        { error: 'Permission denied: this connection is read-only. Enable write access in Connections (Gatekeeper) first.' },
        { status: 403 },
      );
    }
    try {
      const res = await fetch(`${BASE_URL}/api/v4/projects/${encodeURIComponent(project)}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${glToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: String(body.body ?? '') }),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `GitLab API error: ${res.status} ${text.slice(0, 200)}` }, { status: 502 });
      }
      const data = (await res.json()) as { iid: number; web_url: string };
      await writeAudit({
        userId: session.userId,
        username: session.username,
        action: 'gitlab.create_issue',
        detail: `Created issue #${data.iid} in ${project}`,
      });
      return NextResponse.json({ result: `Created issue #${data.iid}: ${data.web_url}` });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'GitLab API error' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
}
