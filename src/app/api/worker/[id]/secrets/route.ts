import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  addWorkerSecret,
  deleteWorkerSecret,
  listWorkerSecrets,
  workerEnabled,
} from '@/lib/cf-worker';
import { getWorkerBindingsEnabled } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { workerConfigLimiter } from '@/lib/rate-limit';

// GET /api/worker/:id/secrets — the secret NAMES of the user's Worker (values are never
// returned by Cloudflare). Gated behind the beta flag like bindings.
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
  if (!enabled) return NextResponse.json({ enabled: false, secrets: [] });
  if (!workerEnabled()) return NextResponse.json({ enabled: true, secrets: [] });

  const secrets = await listWorkerSecrets(rec.workerName);
  return NextResponse.json({ enabled: true, secrets });
}

// POST /api/worker/:id/secrets — add or update a secret. Body: { name, value }.
// The value is sent to Cloudflare and never stored or returned by us.
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
  if (!enabled) return NextResponse.json({ error: 'Secrets management is disabled' }, { status: 403 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  let body: { name?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const value = body.value ?? '';
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    return NextResponse.json({ error: 'Invalid secret name' }, { status: 400 });
  }
  if (value.length === 0 || value.length > 4096) {
    return NextResponse.json({ error: 'Secret value must be 1-4096 characters' }, { status: 400 });
  }

  try {
    await addWorkerSecret(rec.workerName, name, value);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.secret.add',
    detail: `Set secret "${name}" on worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// DELETE /api/worker/:id/secrets?name=... — remove a secret.
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
  if (!enabled) return NextResponse.json({ error: 'Secrets management is disabled' }, { status: 403 });
  if (workerConfigLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many config changes. Please wait a minute.' }, { status: 429 });
  }

  const name = new URL(req.url).searchParams.get('name') || '';
  if (!name) return NextResponse.json({ error: 'Missing secret name' }, { status: 400 });

  try {
    await deleteWorkerSecret(rec.workerName, name);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'worker.secret.delete',
    detail: `Removed secret "${name}" from worker "${rec.workerName}"`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}