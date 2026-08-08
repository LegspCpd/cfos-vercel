import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { runAgent, type WorkspaceFileDraft } from '@/lib/agent';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// POST /api/workspaces/:id/agent
// Body: { prompt: string }
// Runs the code-mode agent against the workspace's current files, applies the
// generated file changes to Postgres, and returns the new file set + agent message.
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: session.userId },
    include: { files: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }
  const providerId = typeof body?.providerId === 'string' ? body.providerId : undefined;

  const currentFiles: WorkspaceFileDraft[] = workspace.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  let result;
  try {
    result = await runAgent(prompt, currentFiles, [], providerId);
  } catch (e) {
    console.error('agent error', e);
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'agent.run_failed',
      targetId: workspace.id,
      detail: `Agent failed on workspace "${workspace.title}" (prompt: ${prompt.slice(0, 120)})`,
    });
    return NextResponse.json(
      { error: 'Failed to run agent. Configure an AI provider in Settings, or check your API key.' },
      { status: 500 },
    );
  }

  // Persist the generated files (merge: keep files the agent didn't touch).
  const incoming = new Map(result.files.map((f) => [f.path, f]));
  const upserts = incoming.size > 0
    ? Array.from(incoming.entries()).map(([path, f]) =>
        prisma.workspaceFile.upsert({
          where: { workspaceId_path: { workspaceId: workspace.id, path } },
          update: { content: f.content },
          create: { workspaceId: workspace.id, path, content: f.content, isEntry: path === 'index.html' },
        }),
      )
    : [];

  if (upserts.length > 0) {
    await Promise.all(upserts);
    // Ensure index.html is the entry if it exists.
    if (incoming.has('index.html')) {
      await prisma.workspaceFile.updateMany({
        where: { workspaceId: workspace.id, path: { not: 'index.html' } },
        data: { isEntry: false },
      });
    }
  }

  await prisma.workspace.update({ where: { id: workspace.id }, data: { updatedAt: new Date() } });

  const updatedFiles = await prisma.workspaceFile.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { path: 'asc' },
  });

  // Audit: agent run + AI call with affected files.
  const changedPaths = result.files.map((f) => f.path);
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'agent.run',
    targetId: workspace.id,
    detail: `Agent ran on "${workspace.title}" (provider: ${providerId ?? 'default'}) — touched files: ${changedPaths.join(', ') || 'none'}`,
  });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'ai.call',
    targetId: workspace.id,
    detail: `AI call from agent (prompt: ${prompt.slice(0, 120)})`,
  });

  return NextResponse.json({
    message: result.message,
    files: updatedFiles.map((f) => ({ path: f.path, content: f.content, isEntry: f.isEntry })),
  });
}
