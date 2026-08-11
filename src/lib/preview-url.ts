import { createHmac, timingSafeEqual } from 'crypto';

// Signed preview URLs. /api/preview/:id serves a workspace's entry file inside a
// sandboxed iframe; that endpoint must NOT be reachable by just knowing a workspace id,
// or any user could read another user's private gadget source. So the endpoint only
// serves requests carrying a short-lived HMAC signature that a server-side route issues
// after it has already authorized the caller (the workspace owner, or a valid public
// blueprint share). No signature => 403.

// Signatures must use the same secret as session tokens so a compromised admin can't
// trivially mint preview access to a private workspace they can't otherwise read.
function resolveSecret(): Buffer {
  const raw = process.env.AUTH_SECRET;
  if (raw) return Buffer.from(raw, 'utf8');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production. Set it in your environment variables.');
  }
  return Buffer.from('insecure-dev-secret-change-me', 'utf8');
}

const PREVIEW_TTL_SECONDS = 600; // 10 minutes — enough for an editing session, short enough to limit window.

// Sign a preview URL for a workspace. `exp` (epoch seconds) defaults to now + TTL.
export function signPreviewUrl(workspaceId: string, exp = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS): string {
  const sig = createHmac('sha256', resolveSecret())
    .update(`preview:${workspaceId}:${exp}`)
    .digest('base64url');
  return `/api/preview/${encodeURIComponent(workspaceId)}?sig=${sig}&exp=${exp}`;
}

// Verify a preview request. Returns true only if the signature is valid, the exp is in
// the future, and the workspace id in the signature matches the requested id (prevents
// signature reuse across workspaces).
export function verifyPreview(workspaceId: string, sig: string | null, expRaw: string | null): boolean {
  if (!sig || !expRaw) return false;
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false; // expired

  const expected = createHmac('sha256', resolveSecret())
    .update(`preview:${workspaceId}:${exp}`)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
