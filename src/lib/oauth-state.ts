// Stateless OAuth state signing.
//
// The connect-to-GitHub/Google/GitLab flows previously validated the `state` param
// ONLY against a cookie. When a browser blocks third-party cookies (Safari, Chrome
// third-party-cookie blocking) or the cookie is dropped during the cross-site
// redirect, that check fails → "Invalid OAuth state" and the flow breaks.
//
// This module signs the state with AUTH_SECRET so the callback can validate it
// WITHOUT the cookie. The signature binds userId + a nonce + expiry, so:
//   - CSRF is prevented (an attacker can't forge a valid signature),
//   - replay is bounded (a timestamp window),
//   - no cookie is required to pass the check.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'insecure-dev-secret-change-me';
// State remains valid for 15 minutes — long enough for the OAuth round-trip.
const STATE_TTL_MS = 15 * 60 * 1000;

// state format: connect:<userId>:<nonce>:<exp>:<sig>

export type OAuthStateKind = 'connect' | 'delete';

export function signOAuthState(kind: OAuthStateKind, userId: string): string {
  const nonce = createHmac('sha256', SECRET)
    .update(`${userId}:${Math.random()}`)
    .digest('hex')
    .slice(0, 24);
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${kind}:${userId}:${nonce}:${exp}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

interface VerifiedState {
  kind: OAuthStateKind;
  userId: string;
  ok: boolean;
}

// Validate a signed state string. Returns { ok, kind, userId }. When ok is true the
// state is authentic (signed by us) and unexpired. The old 3-part unsigned format is
// NOT accepted here (it must go through the cookie path).
export function verifyOAuthState(state: string): VerifiedState {
  const parts = state.split(':');
  if (parts.length < 3) return { ok: false, kind: 'connect', userId: '' };
  const kind = (parts[0] as OAuthStateKind) === 'delete' ? 'delete' : 'connect';
  const userId = parts[1];

  // Only the 5-part signed form passes the signature check.
  if (parts.length !== 5) return { ok: false, kind, userId };

  const [, , , expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, kind, userId };

  const payload = `${kind}:${userId}:${parts[2]}:${expStr}`;
  const expectedSig = createHmac('sha256', SECRET).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, kind, userId };

  return { ok: true, kind, userId };
}
