import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { clientIp } from '@/lib/ip';
import { runAgent, type WorkspaceFileDraft } from '@/lib/agent';
import { requireCfAccess } from '@/lib/require-access';
import { getSiteSettings } from '@/lib/settings';
import { userHasPermission, PERMISSIONS } from '@/lib/permissions';
import { isSafeFilePath } from '@/lib/path';
import { getFormat } from '@/lib/formats';
import { workspaceAccess } from '@/lib/collaboration';
import { effectiveAiLimit, aiUsageToday } from '@/lib/quota';

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
// The agent may call GitHub/GitLab tools (multi-turn loop); write tools are gated
// on the per-connection writeAccess grant.
// The owner, or a write collaborator, may run the agent.
export async function POST(req: Request, { params }: Ctx) {
  if (!(await requireCfAccess(req))) {
    return NextResponse.json({ error: 'Cloudflare Access verification required' }, { status: 401 });
  }
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await userHasPermission(session.userId, PERMISSIONS.workspace))) {
    return NextResponse.json({ error: 'You do not have permission to use the AI agent.' }, { status: 403 });
  }

  const access = await workspaceAccess(session.userId, params.id);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (access === 'read') {
    return NextResponse.json({ error: 'You do not have permission to edit this workspace.' }, { status: 403 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
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

  // Per-user AI quota (agent runs + AI calls share the same daily budget). The limit
  // comes from the user's own override, their group's limit, or the AGENT_DAILY_LIMIT
  // env fallback (default 100). Hard stop: refuse to run once at/over the limit.
  const { limit: quotaLimit, source: quotaSource } = await effectiveAiLimit(session.userId);
  if (quotaLimit != null) {
    const usedToday = await aiUsageToday(session.userId);
    if (usedToday >= quotaLimit) {
      return NextResponse.json(
        {
          error: `Daily AI limit reached (${quotaLimit}/day, ${quotaSource}). Try again tomorrow.`,
        },
        { status: 429 },
      );
    }
  }

  const currentFiles: WorkspaceFileDraft[] = workspace.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  // Load the user's context documents AND the approved public library, and attach them
  // so the agent can reference them. Private docs come first (owner-authored, most
  // relevant); public docs fill the rest of the budget.
  const [privateDocs, publicDocs] = await Promise.all([
    prisma.contextDoc.findMany({
      where: { ownerId: session.userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.contextDoc.findMany({
      where: { visibility: 'public', status: 'approved' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    }),
  ]);
  const contextDocs = [...privateDocs, ...publicDocs];
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

  // The workspace's output-format agent hint (e.g. "prefer for documents..."), so the
  // agent knows what format this workspace was created as.
  let formatHint: string | undefined;
  if (workspace.formatId) {
    const format = await getFormat(workspace.formatId);
    if (format?.agentHint) formatHint = format.agentHint;
  }

  let result;
  try {
    result = await runAgent(
      finalPrompt,
      currentFiles,
      [],
      providerId,
      effectiveModel,
      siteSettings.agentInstructions || undefined,
      formatHint,
      session.userId,
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
  // The agent's file paths come from LLM output and are NOT trusted: drop any path that
  // isn't safe (rejects ../, absolute paths, control chars) so a model can't write files
  // outside the intended workspace key-space.
  const safeFiles = result.files.filter((f) => isSafeFilePath(f.path));
  const incoming = new Map(safeFiles.map((f) => [f.path, f]));
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
    toolCalls: result.toolCalls ?? [],
  });
}
