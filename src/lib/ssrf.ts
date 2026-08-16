import { isIP } from 'node:net';

// SSRF guard for user-supplied URLs (webhook tasks, remote fetch, etc.).
//
// Blocks requests to private / loopback / link-local / reserved addresses so a
// server-side fetch can't be used to probe internal networks or cloud metadata
// (169.254.169.254). DNS rebinding is mitigated by re-checking the resolved IP
// at fetch time (see assertSafeFetchUrl below).
const PRIVATE_IP = (ip: string): boolean => {
  if (isIP(ip) === 0) return false; // not an IP literal
  const parts = ip.split('.').map(Number);
  if (parts.length === 4) {
    // IPv4
    if (parts[0] === 0) return true; // 0.0.0.0/8
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (link-local / metadata)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true; // 198.18.0.0/15
    if (parts[0] === 224 || parts[0] >= 240) return true; // multicast + reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // unspecified + loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (ULA)
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  return false;
};

// Validate a user-supplied URL for server-side fetching. Returns an error string
// or null when the URL is acceptable.
export function validateFetchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Invalid URL';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Only http(s) URLs are allowed';
  }
  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'Localhost is not allowed';
  if (host.endsWith('.local') || host.endsWith('.internal')) return 'Internal hostnames are not allowed';
  // URL.hostname keeps the brackets for IPv6 literals ("[::1]"); strip them.
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(ipHost) && PRIVATE_IP(ipHost)) return 'Private / reserved IP addresses are not allowed';
  return null;
}

// Resolve a hostname and reject it when it points at a private/reserved address.
// Call this right before fetch() to close the DNS-rebinding window.
export async function assertSafeFetchUrl(raw: string): Promise<string | null> {
  const err = validateFetchUrl(raw);
  if (err) return err;
  const url = new URL(raw);
  const host = url.hostname;
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(ipHost)) return null; // literal IP already validated
  try {
    const { lookup } = await import('node:dns/promises');
    const addresses = await lookup(host, { all: true });
    for (const a of addresses) {
      if (PRIVATE_IP(a.address)) return 'Host resolves to a private / reserved address';
    }
    return null;
  } catch {
    return 'Could not resolve host';
  }
}