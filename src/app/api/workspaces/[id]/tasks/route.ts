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

type Ctx = { params: { id: string } };

const taskSchema = z.object({
  name: z.string().min(1).max(100),
  schedule: z.string().min(1).max(50),
  action: z.enum(['agent', 'webhook']).default('agent'),
  prompt: z.string().max(4000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  enabled: z.boolean().optional(),
});

// GET /api/workspaces/:id/tasks — list the workspace's scheduled tasks.
// Owner or write collaborator.
export async function GET(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const tasks = await prisma.scheduledTask.findMany({
    where: { workspaceId: params.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ tasks });
}

// POST /api/workspaces/:id/tasks — create a scheduled task.
export async function POST(req: Request, { params }: Ctx) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await workspaceAccess(session.userId, params.id);
  if (!access || access === 'read') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = taskSchema.parse(await req.json());
  if (!parseCron(body.schedule)) {
    return NextResponse.json({ error: 'Invalid cron expression (5 fields: minute hour dom month dow)' }, { status: 400 });
  }
  if (body.action === 'webhook' && !body.url) {
    return NextResponse.json({ error: 'Webhook tasks require a URL' }, { status: 400 });
  }
  const task = await prisma.scheduledTask.create({
    data: {
      workspaceId: params.id,
      name: body.name,
      schedule: body.schedule,
      action: body.action,
      prompt: body.prompt ?? null,
      url: body.url ?? null,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}