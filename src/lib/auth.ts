import { SignJWT, jwtVerify } from 'jose';

// Resolve the JWT signing secret. SECURITY: in production the fallback secret is a
// hardcoded, publicly-known value — using it would let anyone forge session tokens.
// So we REQUIRE AUTH_SECRET to be set in production; only local dev may use the fallback.
function resolveAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (raw) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production. Set it in your environment variables.');
  }
  return new TextEncoder().encode('insecure-dev-secret-change-me');
}

const secret = resolveAuthSecret();

export interface SessionPayload {
  userId: string;
  username: string;
}

// Issue a short-lived session JWT (like the original session token).
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== 'string' || typeof payload.username !== 'string') return null;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
