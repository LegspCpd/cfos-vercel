import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { r2Delete, isR2Configured } from '@/lib/r2';
import { getColdStatus } from '@/lib/cold-migrate';
import { warmCache, cacheGetRaw, cacheSetRaw } from '@/lib/kv-cache';
import { listPagesProjects } from '@/lib/cf-pages';
import { listWorkers } from '@/lib/cf-worker';
import { nextMatchAfter, parseCron } from '@/lib/scheduled-tasks';
import { runAgent } from '@/lib/agent';
import { writeAudit } from '@/lib/audit';
import { getSiteSettings } from '@/lib/settings';
import { backupNeonToD1, dumpD1ToD1 } from '@/lib/d1-backup';
import { isD1Enabled } from '@/lib/d1';
import { assertSafeFetchUrl } from '@/lib/ssrf';
import { safeEqual } from '@/lib/safe-equal';

// GET /api/cron/daily — the single scheduled sweep.
//
// Vercel's free (Hobby) plan only allows cron jobs that run **once per day**; anything
// more frequent fails deployment. This endpoint bundles the previously separate cron
// jobs (cleanup / cache-warm / scheduled tasks / D1 backup) into ONE daily invocation
// that runs each sub-job in order, reporting per-job results. Each sub-job keeps its
// own guard (e.g. cache-warm's interval, D1's enabled flag), so it is safe to run once
// a day — and safe to re-trigger manually any time.
//
// SECURITY: CRON_SECRET is REQUIRED, exactly like the other cron endpoints. Without it
// the endpoint refuses to run rather than exposing data-mutating maintenance to the
// public internet. Triggered by vercel.json ("0 3 * * *" by default).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!safeEqual(header ?? '', secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: Record<string, unknown> = {};

  // 1. Cleanup: expired shared files (R2 + DB) + due account deletions.
  try {
    const now = new Date();
    const expired = await prisma.sharedFile.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, r2Key: true },
    });
    let deletedFromR2 = 0;
    if (isR2Configured()) {
      for (const f of expired) {
        try {
          await r2Delete(f.r2Key);
          deletedFromR2++;
        } catch {
          /* ignore individual failures */
        }
      }
    }
    const deletedRecords = await prisma.sharedFile.deleteMany({
      where: { id: { in: expired.map((f) => f.id) } },
    });
    const due = await prisma.user.findMany({
      where: { deleteAt: { not: null, lt: now } },
      select: { id: true },
    });
    const deletedAccounts = due.length
      ? (await prisma.user.deleteMany({ where: { id: { in: due.map((u) => u.id) } } })).count
      : 0;
    const cold = await getColdStatus();
    results.cleanup = {
      ok: true,
      deletedFromR2,
      deletedRecords: deletedRecords.count,
      deletedAccounts,
      multiDb: cold.enabled ? { shards: cold.shards, coldTables: cold.coldTables } : 'disabled',
    };
  } catch (e) {
    results.cleanup = { ok: false, error: (e as Error).message };
  }

  // 2. Cache warm (respects CACHE_WARM_INTERVAL_MINUTES internally; harmless daily).
  try {
    const intervalMin = Math.max(0, Number(process.env.CACHE_WARM_INTERVAL_MINUTES) || 60);
    const intervalMs = intervalMin * 60_000;
    let last = 0;
    try {
      const raw = await cacheGetRaw('cache-warm-last');
      if (raw) last = Number(raw) || 0;
    } catch {
      /* ignore */
    }
    if (intervalMs > 0 && last > 0 && Date.now() - last < intervalMs) {
      results.cacheWarm = { ok: true, skipped: 'within interval', intervalMinutes: intervalMin };
    } else {
      await Promise.allSettled([
        warmCache('pages', 'projects', () => listPagesProjects(), {
          ttlSeconds: Number(process.env.KV_PAGES_PROJECTS_TTL) || 15,
        }),
        warmCache('workers', 'scripts', () => listWorkers(), {
          ttlSeconds: Number(process.env.KV_WORKERS_TTL) || 15,
        }),
      ]);
      try {
        await cacheSetRaw('cache-warm-last', String(Date.now()));
      } catch {
        /* ignore */
      }
      results.cacheWarm = { ok: true, intervalMinutes: intervalMin };
    }
  } catch (e) {
    results.cacheWarm = { ok: false, error: (e as Error).message };
  }

  // 3. Scheduled tasks (window-matched — fires any task due since its last run).
  try {
    const now = new Date();
    const minuteStart = new Date(now);
    minuteStart.setSeconds(0, 0);
    const tasks = await prisma.scheduledTask.findMany({
      where: { enabled: true },
      include: { workspace: { select: { ownerId: true, title: true } } },
    });
    const ran: { id: string; name: string; status: string; error?: string }[] = [];
    for (const task of tasks) {
      const schedule = parseCron(task.schedule);
      if (!schedule) {
        await prisma.scheduledTask.update({
          where: { id: task.id },
          data: { enabled: false, lastStatus: 'failed', lastError: 'Invalid cron expression' },
        });
        ran.push({ id: task.id, name: task.name, status: 'failed', error: 'Invalid cron expression' });
        continue;
      }
      const since = task.lastRunAt ?? new Date(now);
      since.setHours(0, 0, 0, 0);
      const next = nextMatchAfter(schedule, since);
      if (!next || next > now) continue;
      if (task.lastRunAt && task.lastRunAt >= minuteStart) continue;
      try {
        if (task.action === 'webhook' && task.url) {
          // SSRF guard at fetch time: re-resolve the host and reject private/reserved
          // addresses (closes the DNS-rebinding window after creation-time validation).
          const ssrfErr = await assertSafeFetchUrl(task.url);
          if (ssrfErr) {
            await prisma.scheduledTask.update({
              where: { id: task.id },
              data: { lastRunAt: now, lastStatus: 'failed', lastError: `Webhook URL rejected: ${ssrfErr}` },
            });
            ran.push({ id: task.id, name: task.name, status: 'failed', error: ssrfErr });
            continue;
          }
          const res = await fetch(task.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: task.prompt ?? '{}',
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
          await prisma.scheduledTask.update({
            where: { id: task.id },
            data: { lastRunAt: now, lastStatus: 'ok', lastError: null },
          });
          ran.push({ id: task.id, name: task.name, status: 'ok' });
        } else {
          const files = await prisma.workspaceFile.findMany({
            where: { workspaceId: task.workspaceId },
            select: { path: true, content: true },
          });
          const siteSettings = await getSiteSettings();
          const result = await runAgent(
            task.prompt || 'Run the scheduled task.',
            files.map((f) => ({ path: f.path, content: f.content })),
            [],
            undefined,
            siteSettings.defaultModel || undefined,
            siteSettings.agentInstructions || undefined,
            undefined,
            task.workspace.ownerId,
          );
          if (result.files) {
            for (const f of result.files) {
              await prisma.workspaceFile.upsert({
                where: { workspaceId_path: { workspaceId: task.workspaceId, path: f.path } },
                update: { content: f.content },
                create: { workspaceId: task.workspaceId, path: f.path, content: f.content },
              });
            }
          }
          await writeAudit({
            userId: task.workspace.ownerId,
            username: task.workspace.ownerId,
            action: 'agent.run',
            targetId: task.workspaceId,
            detail: `Scheduled task "${task.name}" ran the agent`,
            tokens: result.tokens ?? undefined,
          });
          await prisma.scheduledTask.update({
            where: { id: task.id },
            data: { lastRunAt: now, lastStatus: 'ok', lastError: null },
          });
          ran.push({ id: task.id, name: task.name, status: 'ok' });
        }
      } catch (e) {
        await prisma.scheduledTask.update({
          where: { id: task.id },
          data: { lastRunAt: now, lastStatus: 'failed', lastError: (e as Error).message?.slice(0, 500) },
        });
        ran.push({ id: task.id, name: task.name, status: 'failed', error: (e as Error).message });
      }
    }
    results.tasks = { ok: true, ran: ran.length, results: ran };
  } catch (e) {
    results.tasks = { ok: false, error: (e as Error).message };
  }

  // 4. D1 backup (skipped when D1 is disabled).
  try {
    if (!isD1Enabled()) {
      results.d1Backup = { ok: true, skipped: 'D1 disabled (set D1_ENABLED=true)' };
    } else {
      const neon = await backupNeonToD1();
      const dump = await dumpD1ToD1();
      results.d1Backup = { ok: true, neonBackup: neon, d1Dump: dump };
    }
  } catch (e) {
    results.d1Backup = { ok: false, error: (e as Error).message };
  }

  return NextResponse.json({ ok: true, jobs: results });
}
