import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { workspaceAccess } from '@/lib/collaboration';
import { parseCron } from '@/lib/scheduled-tasks';
import { z } from 'zod';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string; taskId: string } };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  schedule: z.string().min(1).max(50).optional(),
  action: z.enum(['agent', 'webhook']).optional(),
  prompt: z.string().max(4000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  enabled: z.boolean().optional(),
});

// PATCH /api/workspaces/:id/tasks/:taskId — update a scheduled task.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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

  const task = await prisma.scheduledTask.update({
    where: { id: params.taskId },
    data,
  });
  return NextResponse.json({ task });
}

// DELETE /api/workspaces/:id/tasks/:taskId — delete a scheduled task.
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.scheduledTask.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}