import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  addWorkerRoute,
  deleteWorkerRoute,
  listWorkerRoutes,
  workerEnabled,
} from '@/lib/cf-worker';
import { writeAudit } from '@/lib/audit';
import { workerConfigLimiter } from '@/lib/rate-limit';

// GET /api/worker/:id/routes — the routes (custom domains / patterns) of the user's Worker.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!workerEnabled()) return NextResponse.json({ routes: [] });
  const routes = await listWorkerRoutes(rec.workerName);
  return NextResponse.json({ routes });
}

// POST /api/worker/:id/routes — add a custom domain route (pattern like "example.com/*").
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  let body: { pattern?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pattern = (body.pattern || '').trim().toLowerCase();
  // Validate a hostname pattern: "example.com" or "example.com/*" or "*.example.com".
  // Reject anything with a scheme, path beyond /*, or control characters (SSRF guard).
  if (!/^[a-z0-9*.-]+(\/\*)?$/.test(pattern) || pattern.includes('://') || pattern.length > 253) {
    return NextResponse.json({ error: 'Invalid domain pattern' }, { status: 400 });
  }

  try {
    await addWorkerRoute(rec.workerName, pattern);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.route.add',
    detail: `Added route "${pattern}" to worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// DELETE /api/worker/:id/routes?routeId=... — remove a route.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  const routeId = new URL(req.url).searchParams.get('routeId') || '';
  if (!routeId) return NextResponse.json({ error: 'Missing route id' }, { status: 400 });

  try {
    await deleteWorkerRoute(rec.workerName, routeId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.route.delete',
    detail: `Removed route from worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}