import { isCfAccessEnabled, verifyCfAccess } from './cf-access';

// Guard helper for API routes. When Cloudflare Access is enabled (CF_ACCESS_TEAM set),
// the request must carry a valid CF Access JWT. Returns true if allowed, false otherwise.
//
// NOTE: With CF Access the *entire site* is usually behind the Access policy, so CF itself
// blocks unauthenticated visitors before they ever reach this code. This helper is a
// defense-in-depth check for API routes that handle sensitive operations.
export async function requireCfAccess(req: Request): Promise<boolean> {
  if (!isCfAccessEnabled()) return true; // not enabled → allow
  const verified = await verifyCfAccess(req.headers);
  return Boolean(verified);
}
