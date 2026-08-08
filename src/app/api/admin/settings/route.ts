import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { setSetting, SETTING_SIGNUPS_ENABLED } from '@/lib/settings';
import { z } from 'zod';

// POST /api/admin/settings — update admin settings (admin only).
const patchSchema = z.object({
  signupsEnabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = patchSchema.parse(await req.json());
  if (typeof body.signupsEnabled === 'boolean') {
    await setSetting(SETTING_SIGNUPS_ENABLED, String(body.signupsEnabled));
  }

  return NextResponse.json({ ok: true });
}
