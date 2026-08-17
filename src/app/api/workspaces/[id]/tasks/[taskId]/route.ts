import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { workspaceAccess } from '@/lib/collaboration';
import { parseCron } from '@/lib/scheduled-tasks';
import { z } from 'zod';
import { miscWriteLimiter } from '@/lib/rate-limit';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string; taskId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  schedule: z.string().min(1).max(50).optional(),
  action: z.enum(['agent', 'webhook']).optional(),
  prompt: z.string().max(4000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  enabled: z.boolean().optional(),
});

// PATCH /api/workspaces/:id/tasks/:taskId — update a scheduled task.
export async function PATCH(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Cap task updates per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = patchSchema.parse(await req.json());
  if (body.schedule && !parseCron(body.schedule)) {
    return NextResponse.json({ error: 'Invalid cron expression (5 fields: minute hour dom month dow)' }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.schedule !== undefined) data.schedule = body.schedule;
  if (body.action !== undefined) data.action = body.action;
  if (body.prompt !== undefined) data.prompt = body.prompt;
  if (body.url !== undefined) data.url = body.url;
  if (body.enabled !== undefined) data.enabled = body.enabled;

  // SECURITY: scope the update to THIS workspace (id + taskId). Without the
  // workspaceId condition, a write collaborator of workspace A who learns a task id
  // from workspace B could modify B's task (cross-workspace IDOR).
  const task = await prisma.scheduledTask.updateMany({
    where: { id: params.taskId, workspaceId: params.id },
    data,
  });
  if (task.count === 0) {
    return NextResponse.json({ error: 'Task not found in this workspace' }, { status: 404 });
  }
  const updated = await prisma.scheduledTask.findUnique({ where: { id: params.taskId } });
  return NextResponse.json({ task: updated });
}

// DELETE /api/workspaces/:id/tasks/:taskId — delete a scheduled task.
export async function DELETE(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Cap task deletions per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // SECURITY: scope the delete to THIS workspace (id + taskId) — same cross-workspace
  // IDOR protection as PATCH.
  const task = await prisma.scheduledTask.deleteMany({
    where: { id: params.taskId, workspaceId: params.id },
  });
  if (task.count === 0) {
    return NextResponse.json({ error: 'Task not found in this workspace' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}