import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { nextMatchAfter, parseCron } from '@/lib/scheduled-tasks';
import { runAgent } from '@/lib/agent';
import { writeAudit } from '@/lib/audit';
import { getSiteSettings } from '@/lib/settings';
import { assertSafeFetchUrl } from '@/lib/ssrf';
import { safeEqual } from '@/lib/safe-equal';

// GET /api/cron/tasks — run every scheduled task that is due.
// Protected by CRON_SECRET (same as the other cron endpoints). Triggered by
// vercel.json (daily on the free plan, more often on Pro). Each invocation runs every
// task that has at least one matching moment between its last run and now — so a daily
// sweep still fires hourly tasks that came due since the previous sweep.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const header = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!safeEqual(header ?? '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);

  const tasks = await prisma.scheduledTask.findMany({
    where: { enabled: true },
    include: { workspace: { select: { ownerId: true, title: true } } },
  });

  const results: { id: string; name: string; status: string; error?: string }[] = [];
  for (const task of tasks) {
    const schedule = parseCron(task.schedule);
    if (!schedule) {
      // Invalid schedule — disable the task so it stops failing silently.
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: { enabled: false, lastStatus: 'failed', lastError: 'Invalid cron expression' },
      });
      results.push({ id: task.id, name: task.name, status: 'failed', error: 'Invalid cron expression' });
      continue;
    }
    // Window match: fire when at least one matching moment lies between the last run
    // (or the top of the day for a never-run task) and now. Handles daily sweeps.
    const since = task.lastRunAt ?? new Date(now);
    since.setHours(0, 0, 0, 0);
    const next = nextMatchAfter(schedule, since);
    if (!next || next > now) continue;
    // Already ran after the matched moment in this sweep?
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
          results.push({ id: task.id, name: task.name, status: 'failed', error: ssrfErr });
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
        results.push({ id: task.id, name: task.name, status: 'ok' });
      } else {
        // action=agent: run the workspace agent with the task prompt.
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
        // Apply the agent's file changes back to the workspace.
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
        results.push({ id: task.id, name: task.name, status: 'ok' });
      }
    } catch (e) {
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: { lastRunAt: now, lastStatus: 'failed', lastError: (e as Error).message?.slice(0, 500) },
      });
      results.push({ id: task.id, name: task.name, status: 'failed', error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results });
}