import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

// GET /api/admin/stats — deployment statistics (admin only).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [users, workspaces, files, shares, contexts, aiCalls, agentRuns] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.workspaceFile.count(),
    prisma.sharedFile.count(),
    prisma.contextDoc.count(),
    prisma.auditLog.count({ where: { action: 'ai.call' } }),
    prisma.auditLog.count({ where: { action: 'agent.run' } }),
  ]);

  return NextResponse.json({
    stats: {
      users,
      workspaces,
      files,
      shares,
      contexts,
      aiCalls,
      agentRuns,
    },
  });
}
