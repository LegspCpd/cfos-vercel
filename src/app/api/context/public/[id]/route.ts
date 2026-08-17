import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { isUserAdmin } from '@/lib/admin';
import { notify } from '@/lib/notifications';
import { invalidatePublicLibrary } from '@/lib/context-cache';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/context/public/:id — admin review decision.
// Body: { action: "approve" | "reject" }
export async function PATCH(req: Request, props: Ctx) {
  const params = await props.params;
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await isUserAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const doc = await prisma.contextDoc.findFirst({
    where: { id: params.id, visibility: 'public', status: 'pending' },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'approve') {
    await prisma.contextDoc.update({
      where: { id: doc.id },
      data: { status: 'approved', publishedAt: new Date() },
    });
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'context.approve',
      targetId: doc.id,
      detail: `Approved public context document "${doc.title}"`,
    });
    await notify({
      userId: doc.ownerId,
      type: 'context.approved',
      title: '你的文档已发布到公共库',
      body: `《${doc.title}》已通过审核，现在所有用户都能看到。`,
      href: '/context',
    });
  } else {
    await prisma.contextDoc.update({
      where: { id: doc.id },
      data: { status: 'rejected', publishedAt: null },
    });
    await writeAudit({
      userId: session.userId,
      username: session.username,
      action: 'context.reject',
      targetId: doc.id,
      detail: `Rejected public context document "${doc.title}"`,
    });
    await notify({
      userId: doc.ownerId,
      type: 'context.rejected',
      title: '你的文档未通过审核',
      body: `《${doc.title}》未通过审核。你可以编辑后重新提交。`,
      href: '/context',
    });
  }

  // The public library list is KV-cached; drop it so the change shows immediately.
  await invalidatePublicLibrary();

  return NextResponse.json({ ok: true });
}