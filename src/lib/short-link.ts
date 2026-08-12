// Short-link client for the sink.cool short-link service (s.legspcpd.top).
// API: https://sink.cool/_docs/scalar — POST /api/link/upsert, GET /api/link/search.
// Auth: Authorization: Bearer <S_LINK token>.

const S_LINK_BASE = process.env.S_LINK_BASE || 'https://sink.cool';
const S_LINK_TOKEN = process.env.S_LINK || '';

// Create (or update) a short link for `url`. Returns the short URL like
// https://s.legspcpd.top/xxxxxx, or throws on failure.
//
// The sink.cool instance sits behind Cloudflare. A server-side (non-browser) request is often
// met with a Cloudflare JS challenge ("Just a moment...") / Bot Fight 403 when the CF zone
// enables bot protection on the API path. We send a clear non-browser User-Agent so CF can
// recognize a legitimate API client, and surface an actionable hint when it still challenges.
const API_UA = 'cfos-shortlink/1.0 (server-to-server; Bearer auth)';

export async function createShortLink(url: string): Promise<string> {
  if (!S_LINK_TOKEN) throw new Error('S_LINK is not configured; short links unavailable.');
  const res = await fetch(`${S_LINK_BASE}/api/link/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${S_LINK_TOKEN}`,
      'User-Agent': API_UA,
    },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = isCloudflareChallenge(text)
      ? ' (Cloudflare bot-protection challenged the request — in the sink.cool zone, disable Bot Fight Mode / JS Challenge for /api/*, or allowlist the deploy server IP)'
      : '';
    throw new Error(`Short-link error ${res.status}: ${text.slice(0, 200)}${hint}`);
  }
  let data: { url?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Some sinks return plain text; try to use the response URL.
  }
  if (data.url) return data.url;
  // Fall back to the base short domain + a lookup by url.
  const found = await searchShortLink(url);
  if (found) return found;
  throw new Error(`Short-link created but returned no URL (${res.status})`);
}

// Detect a Cloudflare challenge/bot-fight page so we can give an actionable error.
function isCloudflareChallenge(text: string): boolean {
  return (
    text.toLowerCase().includes('just a moment') ||
    text.includes('cf-challenge') ||
    text.includes('challenge-platform') ||
    (text.includes('cloudflare') && text.includes('checking your browser'))
  );
}

// Find an existing short link for `url` (optional; used as a fallback).
export async function searchShortLink(url: string): Promise<string | null> {
  if (!S_LINK_TOKEN) return null;
  try {
    const res = await fetch(`${S_LINK_BASE}/api/link/search?url=${encodeURIComponent(url)}&limit=1`, {
      headers: { Authorization: `Bearer ${S_LINK_TOKEN}`, 'User-Agent': API_UA },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ url?: string }> };
    return data?.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}
