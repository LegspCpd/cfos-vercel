import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { isUserAdmin } from '@/lib/admin';
import { isCfAccessEnabled } from '@/lib/cf-access';

// GET /api/admin/cfaccess — Cloudflare Access config status (admin only).
// Does NOT expose any secrets; only whether it's enabled and the configured team/aud (masked).
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const admin = await isUserAdmin(session.userId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const team = process.env.CF_ACCESS_TEAM?.trim() || '';
  const aud = process.env.CF_ACCESS_AUD?.trim() || '';

  return NextResponse.json({
    enabled: isCfAccessEnabled(),
    team: team || null,
    audConfigured: Boolean(aud),
    audMasked: aud ? `${aud.slice(0, 6)}...${aud.slice(-4)}` : null,
  });
}
