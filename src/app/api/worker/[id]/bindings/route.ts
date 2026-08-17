import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  addWorkerBinding,
  deleteWorkerBinding,
  listWorkerBindings,
  workerEnabled,
} from '@/lib/cf-worker';
import { getWorkerBindingsEnabled } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { workerConfigLimiter } from '@/lib/rate-limit';

// GET /api/worker/:id/bindings — the bindings of the user's Worker (ownership-checked).
// Gated behind the beta flag (WORKER_BINDINGS_ENABLED env or admin setting).
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const enabled = await getWorkerBindingsEnabled();
  if (!enabled) return NextResponse.json({ enabled: false, bindings: [] });
  if (!workerEnabled()) return NextResponse.json({ enabled: true, bindings: [] });

  const bindings = await listWorkerBindings(rec.workerName);
  return NextResponse.json({ enabled: true, bindings });
}

// POST /api/worker/:id/bindings — add a binding (KV namespace / D1 database / Queue).
// Body: { name, type, namespace_id?, database_id?, queue_name? }
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const enabled = await getWorkerBindingsEnabled();
  if (!enabled) return NextResponse.json({ error: 'Bindings management is disabled' }, { status: 403 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  let body: { name?: string; type?: string; namespace_id?: string; database_id?: string; queue_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const type = (body.type || '').trim();
  // Binding names are env-var-like identifiers (letters, digits, underscore).
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    return NextResponse.json({ error: 'Invalid binding name' }, { status: 400 });
  }
  const allowedTypes = ['kv_namespace', 'd1_database', 'queue'];
  if (!allowedTypes.includes(type)) {
    return NextResponse.json({ error: 'Unsupported binding type' }, { status: 400 });
  }

  try {
    await addWorkerBinding(rec.workerName, {
      name,
      type,
      namespace_id: body.namespace_id,
      database_id: body.database_id,
      queue_name: body.queue_name,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.binding.add',
    detail: `Added ${type} binding "${name}" to worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// DELETE /api/worker/:id/bindings?name=... — remove a binding.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const rec = await prisma.workerDeployment.findFirst({
    where: { id: params.id, userId: session.userId },
    select: { id: true, workerName: true },
  });
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const enabled = await getWorkerBindingsEnabled();
  if (!enabled) return NextResponse.json({ error: 'Bindings management is disabled' }, { status: 403 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  const bindingName = new URL(req.url).searchParams.get('name') || '';
  if (!bindingName) return NextResponse.json({ error: 'Missing binding name' }, { status: 400 });

  try {
    await deleteWorkerBinding(rec.workerName, bindingName);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.binding.delete',
    detail: `Removed binding "${bindingName}" from worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}