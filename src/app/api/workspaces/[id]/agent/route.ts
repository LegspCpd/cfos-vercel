import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { clientIp } from '@/lib/ip';
import { runAgent, type WorkspaceFileDraft } from '@/lib/agent';
import { requireCfAccess } from '@/lib/require-access';
import { getSiteSettings } from '@/lib/settings';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';

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
  if (!(await requireCfAccess(req))) {
    return NextResponse.json({ error: 'Cloudflare Access verification required' }, { status: 401 });
  }
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to use the AI agent.' }, { status: 403 });
  }

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
  // Cap the raw prompt to prevent a single request from blowing up token usage.
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length > 4000) {
    return NextResponse.json({ error: 'Prompt too long (max 4000 characters)' }, { status: 400 });
  }
  const providerId = typeof body?.providerId === 'string' ? body.providerId : undefined;

  // Basic per-user quota so a single account can't run the LLM unbounded and rack up
  // the site owner's AI cost. Default: 100 agent runs / day (configurable via env).
  const MAX_AGENT_PER_DAY = Number(process.env.AGENT_DAILY_LIMIT) || 100;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const runsToday = await prisma.auditLog.count({
    where: { userId: session.userId, action: 'agent.run', createdAt: { gte: dayStart } },
  });
  if (runsToday >= MAX_AGENT_PER_DAY) {
    return NextResponse.json(
      { error: `Daily agent limit reached (${MAX_AGENT_PER_DAY}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const currentFiles: WorkspaceFileDraft[] = workspace.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  // Load the user's context documents and attach them so the agent can reference them.
  const contextDocs = await prisma.contextDoc.findMany({
    where: { ownerId: session.userId },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  let finalPrompt = trimmedPrompt;
  if (contextDocs.length > 0) {
    const ctxBlock = contextDocs
      .map((d) => `\n===== Context: ${d.title} =====\n${d.content.slice(0, 4000)}`)
      .join('\n');
    finalPrompt = `${trimmedPrompt}\n\n--- Reference context documents ---\n${ctxBlock}\n--- End context ---`;
  }

  // Apply site-level agent configuration (default model + admin instructions).
  const siteSettings = await getSiteSettings();
  const effectiveModel = providerId ? undefined : siteSettings.defaultModel || undefined;

  let result;
  try {
    result = await runAgent(
      finalPrompt,
      currentFiles,
      [],
      providerId,
      effectiveModel,
      siteSettings.agentInstructions || undefined,
    );
  } catch (e) {
    console.error('agent error', e);
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'agent.run_failed',
      targetId: workspace.id,
      detail: `Agent failed on workspace "${workspace.title}" (prompt: ${trimmedPrompt.slice(0, 120)})`,
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
    ip: clientIp(req),
    detail: `Agent ran on "${workspace.title}" (provider: ${providerId ?? 'default'}) — touched files: ${changedPaths.join(', ') || 'none'}`,
  });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'ai.call',
    targetId: workspace.id,
    ip: clientIp(req),
    tokens: result.tokens ?? null,
    detail: `AI call from agent (prompt: ${trimmedPrompt.slice(0, 120)})${result.tokens ? ` — ${result.tokens} tokens` : ''}`,
  });

  return NextResponse.json({
    message: result.message,
    files: updatedFiles.map((f) => ({ path: f.path, content: f.content, isEntry: f.isEntry })),
  });
}
