import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { seedBundledFormats } from '@/lib/format-seed';
import { isOutputIcon, serializeTemplateVariants, toFormatRecord, type FormatTemplateVariant } from '@/lib/formats';
import { invalidateCache } from '@/lib/kv-cache';
import { z } from 'zod';

async function authAdmin(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!(await isUserAdmin(session.userId))) return null;
  return session;
}

const patchSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  outputId: z.string().min(1).max(50).optional(),
  noun: z.string().min(1).max(50).optional(),
  plural: z.string().min(1).max(50).optional(),
  icon: z.string().optional(),
  agentHint: z.string().max(400).optional(),
  enabled: z.boolean().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  variants: z.array(z.unknown()).optional(),
});

// GET /api/admin/formats — all formats (including disabled and pending), for the
// admin Formats panel. Includes marketplace review state.
export async function GET(req: Request) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await seedBundledFormats();
  } catch {
    // serve whatever exists
  }

  const rows = await prisma.outputFormat.findMany({
    orderBy: [{ isBundled: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({
    formats: rows.map((r) => {
      const f = toFormatRecord(r);
      return {
        id: f.id,
        title: f.title,
        description: f.description,
        output: f.output,
        agentHint: f.agentHint,
        enabled: f.enabled,
        isBundled: f.isBundled,
        status: f.status,
        authorId: f.authorId,
        variants: f.variants,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      };
    }),
  });
}

// PATCH /api/admin/formats/:id — update one format's curation (enabled, presentation,
// agentHint) or review a marketplace submission (status).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = patchSchema.parse(await req.json());

  // Validate the icon against the closed vocabulary.
  if (body.icon !== undefined && !isOutputIcon(body.icon)) {
    return NextResponse.json({ error: `Invalid icon. Must be one of: ${['fileText', 'gridNine', 'presentation', 'appWindow', 'flowArrow', 'kanban', 'chartBar', 'table', 'notebook', 'listChecks'].join(', ')}` }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.outputId !== undefined) data.outputId = body.outputId;
  if (body.noun !== undefined) data.noun = body.noun;
  if (body.plural !== undefined) data.plural = body.plural;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.agentHint !== undefined) data.agentHint = body.agentHint;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.status !== undefined) data.status = body.status;
  if (body.variants !== undefined) {
    const variants = body.variants.filter(
      (v): v is FormatTemplateVariant =>
        !!v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' && Array.isArray((v as { files?: unknown }).files),
    );
    data.templateFiles = serializeTemplateVariants(variants);
  }

  const existing = await prisma.outputFormat.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Format not found' }, { status: 404 });

  const updated = await prisma.outputFormat.update({ where: { id: params.id }, data });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'format.update',
    targetId: updated.id,
    detail: `Updated format "${updated.title}"`,
  });
  // The public formats list is KV-cached; drop it so the change shows immediately.
  await invalidateCache('formats', 'list');
  return NextResponse.json({ ok: true, format: toFormatRecord(updated) });
}

// DELETE /api/admin/formats/:id — delete a format. Bundled formats are protected
// (disable instead); marketplace submissions can be deleted.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await authAdmin(req);
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.outputFormat.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Format not found' }, { status: 404 });
  if (existing.isBundled) {
    return NextResponse.json(
      { error: 'Bundled formats cannot be deleted. Disable them instead.' },
      { status: 400 },
    );
  }

  await prisma.outputFormat.delete({ where: { id: params.id } });
  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'format.delete',
    targetId: params.id,
    detail: `Deleted format "${existing.title}"`,
  });
  await invalidateCache('formats', 'list');
  return NextResponse.json({ ok: true });
}