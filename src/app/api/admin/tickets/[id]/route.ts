import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { writeAudit } from '@/lib/audit';
import { invalidateCache } from '@/lib/kv-cache';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['open', 'processing', 'closed']).optional(),
  reply: z.string().max(5000).optional(),
});

// PATCH /api/admin/tickets/[id] — update a ticket's status and/or reply (admin only).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!(await isUserAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: '工单不存在' }, { status: 404 });

    await prisma.ticket.update({
      where: { id: params.id },
      data: {
        status: body.status ?? ticket.status,
        reply: body.reply !== undefined ? body.reply : ticket.reply,
        handledBy: session.userId,
      },
    });

    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'ticket.handle',
      detail: `Handled ticket ${params.id} (status=${body.status ?? ticket.status})`,
    });

    // Drop the cached ticket list so the user sees the reply/status immediately.
    await invalidateCache('tickets', ticket.userId).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('ticket handle error', e);
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 });
  }
}
