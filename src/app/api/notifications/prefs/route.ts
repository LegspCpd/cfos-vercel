import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseEmailPrefs, serializeEmailPrefs, NOTIFICATION_TYPES } from '@/lib/notifications';

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/notifications/prefs — my email-notification preferences.
export async function GET(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const pref = await prisma.notificationPref.findUnique({ where: { userId: session.userId } });
  const emailPrefs = parseEmailPrefs(pref?.emailPrefs);

  return NextResponse.json({
    emailPrefs,
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    types: NOTIFICATION_TYPES,
  });
}

// PUT /api/notifications/prefs — update which event types send email.
// Body: { emailPrefs: { "collab.added": true, ... } }
export async function PUT(req: Request) {
  const session = await authUser(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const raw = body?.emailPrefs;
  const emailPrefs = raw && typeof raw === 'object' ? parseEmailPrefs(JSON.stringify(raw)) : {};

  await prisma.notificationPref.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, emailPrefs: serializeEmailPrefs(emailPrefs) },
    update: { emailPrefs: serializeEmailPrefs(emailPrefs) },
  });

  return NextResponse.json({ ok: true, emailPrefs });
}