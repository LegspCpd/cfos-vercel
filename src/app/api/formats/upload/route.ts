import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { isOutputIcon, serializeTemplateVariants, toFormatRecord, type FormatTemplateVariant } from '@/lib/formats';
import { z } from 'zod';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

const createSchema = z.object({
  id: z.string().min(3).max(80).regex(/^[a-z0-9][a-z0-9.-]*$/, 'id must be lowercase alphanumeric with dots/dashes'),
  title: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  outputId: z.string().min(1).max(50),
  noun: z.string().min(1).max(50),
  plural: z.string().min(1).max(50),
  icon: z.string(),
  agentHint: z.string().max(400).default(''),
  variants: z.array(z.unknown()).min(1, 'At least one template variant is required'),
});

// POST /api/formats/upload — submit a user-created format template to the
// marketplace. The submission starts "pending" and becomes visible to everyone
// only after an admin approves it (review-then-publish).
export async function POST(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = createSchema.parse(await req.json());

  if (!isOutputIcon(body.icon)) {
    return NextResponse.json({ error: `Invalid icon. Must be one of: ${['fileText', 'gridNine', 'presentation', 'appWindow', 'flowArrow', 'kanban', 'chartBar', 'table', 'notebook', 'listChecks'].join(', ')}` }, { status: 400 });
  }

  const variants = body.variants.filter(
    (v): v is FormatTemplateVariant =>
      !!v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' && Array.isArray((v as { files?: unknown }).files),
  );
  if (variants.length === 0) {
    return NextResponse.json({ error: 'At least one template variant with files is required' }, { status: 400 });
  }

  const existing = await prisma.outputFormat.findUnique({ where: { id: body.id } });
  if (existing) {
    return NextResponse.json({ error: `A format with id "${body.id}" already exists` }, { status: 409 });
  }

  const format = await prisma.outputFormat.create({
    data: {
      id: body.id,
      title: body.title,
      description: body.description,
      outputId: body.outputId,
      noun: body.noun,
      plural: body.plural,
      icon: body.icon,
      agentHint: body.agentHint,
      templateFiles: serializeTemplateVariants(variants),
      isBundled: false,
      enabled: false, // not offered until approved
      status: 'pending',
      authorId: session.userId,
    },
  });

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'format.upload',
    targetId: format.id,
    detail: `Submitted format "${format.title}" for review`,
  });

  return NextResponse.json({ ok: true, format: toFormatRecord(format) }, { status: 201 });
}