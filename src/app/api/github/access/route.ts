import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { githubSetWriteAccess, type WriteAccess } from '@/lib/github';
import { writeAudit } from '@/lib/audit';
import { miscWriteLimiter } from '@/lib/rate-limit';

// POST /api/github/access — toggle the Gatekeeper write capability for the user's
// most-recently-connected GitHub account. Default is 'readonly'; the agent may only run
// write tools after the user explicitly grants 'readwrite'.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Cap access toggles per user.
  if (miscWriteLimiter.tryCall(session.userId) <= 0) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  let body: { access?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { access?: string };
  } catch {
    body = {};
  }
  const access = body.access;
  if (access !== 'readonly' && access !== 'readwrite') {
    return NextResponse.json({ error: 'access must be readonly or readwrite' }, { status: 400 });
  }

  const newAccess = await githubSetWriteAccess(session.userId, access as WriteAccess);

  await writeAudit({
    userId: session.userId,
    username: session.username,
    action: 'github.access_change',
    detail: `Gatekeeper write access set to ${newAccess}`,
  });

  return NextResponse.json({ writeAccess: newAccess });
}
