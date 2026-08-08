import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

// Cloudflare Access JWT verification.
//
// How it works: when your domain is behind Cloudflare Access, CF injects a signed JWT into
// the `Cf-Access-Jwt-Assertion` header after the user authenticates. We verify it using the
// public keys CF publishes (JWKS) for your team. This is a "full" Cloudflare Access check —
// the login-redirect / IdP part is handled by Cloudflare itself, we only validate the result.
//
// Config:
//   CF_ACCESS_TEAM: your Cloudflare team name, e.g. "mycompany" (if your Access domain is
//                   "mycompany.cloudflareaccess.com"). When set, Access verification is enabled.
//   CF_ACCESS_AUD:  optional; the AUD tag of your Access application. If omitted we skip the
//                   aud claim check (still secure if the audience is your own team, but best to set it).

let remoteJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getTeam(): string | null {
  const team = process.env.CF_ACCESS_TEAM?.trim();
  return team || null;
}

// Whether Cloudflare Access verification is enabled.
export function isCfAccessEnabled(): boolean {
  return Boolean(getTeam());
}

function getJWKS() {
  const team = getTeam();
  if (!team) throw new Error('CF_ACCESS_TEAM not set');
  if (!remoteJWKS) {
    remoteJWKS = createRemoteJWKSet(
      new URL(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`),
    );
  }
  return remoteJWKS;
}

export interface CfAccessUser {
  email?: string;
  name?: string;
  userId?: string;
  team?: string;
  verified?: boolean;
}

// Verify the CF Access JWT from the request headers.
// Returns the verified payload, or null if invalid/absent/not enabled.
export async function verifyCfAccess(
  headers: Headers,
): Promise<{ payload: JWTPayload; user: CfAccessUser } | null> {
  const team = getTeam();
  if (!team) return null; // not enabled

  const token = headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  try {
    const jwks = getJWKS();
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${team}.cloudflareaccess.com`,
      // audience is optional here; we validate it below if CF_ACCESS_AUD is set
    });

    const aud = process.env.CF_ACCESS_AUD?.trim();
    if (aud && Array.isArray(payload.aud)) {
      if (!payload.aud.includes(aud)) return null;
    } else if (aud && payload.aud !== aud) {
      return null;
    }

    // Extract user claims from CF's standard claims.
    const user: CfAccessUser = {
      email: (payload.email as string) || undefined,
      name: (payload.name as string) || undefined,
      userId: (payload.sub as string) || undefined,
      team: (payload.common_name as string) || undefined,
      verified: (payload.email_verified as boolean) ?? undefined,
    };

    return { payload, user };
  } catch (e) {
    console.error('CF Access verification failed', e);
    return null;
  }
}
