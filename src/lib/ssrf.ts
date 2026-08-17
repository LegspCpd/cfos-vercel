import { isIP } from 'node:net';

// SSRF guard for user-supplied URLs (webhook tasks, remote fetch, etc.).
//
// Blocks requests to private / loopback / link-local / reserved addresses so a
// server-side fetch can't be used to probe internal networks or cloud metadata
// (169.254.169.254). DNS rebinding is mitigated by re-checking the resolved IP
// at fetch time (see assertSafeFetchUrl below).

// Parse an IPv6 literal into 8 groups of 16-bit numbers, or null when invalid.
// Handles "::" compression, embedded dotted-decimal IPv4 (::ffff:1.2.3.4) and
// hex-encoded IPv4 (::ffff:102:304). This is the only reliable way to detect
// IPv4-mapped / IPv4-compatible addresses — string matching misses variants
// like ::ffff:0:7f00:1 or 0:0:0:0:0:ffff:7f00:1.
function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  let groups: number[] = [];
  let v4: number[] | null = null;

  // Extract a trailing dotted-decimal IPv4 (last 32 bits).
  const v4Match = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    v4 = v4Match.slice(1).map(Number);
    if (v4.some((n) => n > 255)) return null;
    s = s.slice(0, v4Match.index);
    // The IPv4 occupies the last two 16-bit groups.
    groups = [v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]];
  }

  const doubleColon = s.indexOf('::');
  if (doubleColon !== -1) {
    if (s.indexOf('::', doubleColon + 1) !== -1) return null; // only one "::"
    const left = doubleColon === 0 ? [] : s.slice(0, doubleColon).split(':').filter(Boolean).map((g) => parseInt(g, 16));
    const right = doubleColon === s.length - 2 ? [] : s.slice(doubleColon + 2).split(':').filter(Boolean).map((g) => parseInt(g, 16));
    if (left.some((g) => Number.isNaN(g)) || right.some((g) => Number.isNaN(g))) return null;
    const missing = 8 - left.length - right.length - groups.length;
    if (missing < 1) return null;
    groups = [...left, ...new Array(missing).fill(0), ...right, ...groups];
  } else {
    const parts = s.split(':').filter(Boolean).map((g) => parseInt(g, 16));
    if (parts.some((g) => Number.isNaN(g))) return null;
    groups = [...parts, ...groups];
  }

  if (groups.length !== 8) return null;
  if (groups.some((g) => g < 0 || g > 0xffff)) return null;
  return groups;
}

const PRIVATE_IP = (ip: string): boolean => {
  const kind = isIP(ip);
  if (kind === 0) return false; // not an IP literal
  if (kind === 4) {
    // IPv4
    const parts = ip.split('.').map(Number);
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
  // IPv6 — parse into 16-bit groups and check numerically.
  const g = parseIPv6(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return true; // :: (unspecified)
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) return true; // ::1 (loopback)
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses embed
  // an IPv4 address that must be checked with the IPv4 rules — otherwise
  // `http://[::ffff:169.254.169.254]/` bypasses the guard and reaches the cloud
  // metadata service. IPv4-mapped: first 80 bits zero, group 5 == 0xffff.
  // IPv4-compatible: first 96 bits zero.
  const v4mapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const v4compat = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;
  if (v4mapped || v4compat) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return PRIVATE_IP(v4);
  }
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