// Resolve the client's IP address from a Next.js Request. Returns null when unknown.
// The first hop in X-Forwarded-For is the original client address (Vercel injects it);
// fall back to X-Real-IP when XFF is absent.
export function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

// True when the given address is an IPv6 literal (contains a colon).
export function isIpv6(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return ip.includes(':');
}

// Best-effort classification of a client address: 'v4', 'v6', or null when unknown.
export function ipFamily(ip: string | null | undefined): 'v4' | 'v6' | null {
  if (!ip) return null;
  // Strip a bracketed port if present, e.g. [2001:db8::1]:443
  const clean = ip.startsWith('[') ? ip.slice(1, ip.indexOf(']')) : ip;
  return isIpv6(clean) ? 'v6' : 'v4';
}
