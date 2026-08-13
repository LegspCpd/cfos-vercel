import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deployWorker, workerEnabled } from '@/lib/cf-worker';
import { writeAudit } from '@/lib/audit';
import { deployLimiter } from '@/lib/rate-limit';

// POST /api/worker/deploy — deploy a Worker script (JS code) to Cloudflare Workers.
// Body: { workerName?, projectName?, code }
// The worker is stored in the user's own WorkerDeployment rows (ownership-checked).
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!workerEnabled()) {
    return NextResponse.json({ error: 'Worker feature is not configured (set WORKER_API_TOKEN and WORKER_ACCOUNT_ID).' }, { status: 400 });
  }
  // Rate-limit worker deploys like Pages deploys.
  if (deployLimiter.tryCall(session.userId) === 0) {
    return NextResponse.json({ error: 'Too many deploys. Please wait a minute and try again.' }, { status: 429 });
  }

  let body: { workerName?: string; projectName?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code.trim()) return NextResponse.json({ error: 'Worker code is required' }, { status: 400 });
  // Cap code size (Workers scripts are small).
  if (code.length > 1_000_000) return NextResponse.json({ error: 'Worker code is too large (max 1 MB)' }, { status: 400 });

  // Worker name: user-supplied or auto-generated (3 random segments).
  const workerName =
    (typeof body.workerName === 'string' && body.workerName.trim()) ||
    slugifyWorkerName();
  const projectName =
    typeof body.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim().slice(0, 80)
      : null;

  const log: string[] = [`$ deploy worker:${workerName}`];
  let recordId: string | null = null;
  try {
    log.push(`[worker] deploying "${workerName}"…`);
    await deployWorker(workerName, code);
    log.push(`[worker] deployed ${workerName} → https://${workerName}.${process.env.WORKER_SUBDOMAIN || 'workers.dev'}`);

    const record = await prisma.workerDeployment.create({
      data: {
        userId: session.userId,
        workerName,
        projectName,
        code,
        status: 'deployed',
        log: log.join('\n'),
      },
    });
    recordId = record.id;

    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'deploy.worker',
      detail: `Deployed worker "${workerName}"`,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      deploymentId: recordId,
      workerName,
      projectName,
      url: `https://${workerName}.${process.env.WORKER_SUBDOMAIN || 'workers.dev'}`,
      log: log.join('\n'),
    });
  } catch (e) {
    const msg = (e as Error).message;
    log.push(`[worker] failed: ${msg}`);
    if (recordId) {
      await prisma.workerDeployment.update({ where: { id: recordId }, data: { status: 'failed', error: msg, log: log.join('\n') } }).catch(() => {});
    }
    // Worker deploys need a sensible error, but never leak internals beyond the CF message.
    return NextResponse.json({ ok: false, error: msg, log: log.join('\n') }, { status: 400 });
  }
}

// Random 3-segment name (letters only), like the Pages project ids.
function slugifyWorkerName(): string {
  const seg = () => Math.random().toString(36).slice(2, 7);
  return `wkr-${seg()}-${seg()}-${seg()}`;
}
