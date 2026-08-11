// Short-link client for the sink.cool short-link service (s.legspcpd.top).
// API: https://sink.cool/_docs/scalar — POST /api/link/upsert, GET /api/link/search.
// Auth: Authorization: Bearer <S_LINK token>.

const S_LINK_BASE = process.env.S_LINK_BASE || 'https://sink.cool';
const S_LINK_TOKEN = process.env.S_LINK || '';

// Create (or update) a short link for `url`. Returns the short URL like
// https://s.legspcpd.top/xxxxxx, or throws on failure.
export async function createShortLink(url: string): Promise<string> {
  if (!S_LINK_TOKEN) throw new Error('S_LINK is not configured; short links unavailable.');
  const res = await fetch(`${S_LINK_BASE}/api/link/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S_LINK_TOKEN}` },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Short-link error ${res.status}: ${text.slice(0, 200)}`);
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

// Find an existing short link for `url` (optional; used as a fallback).
export async function searchShortLink(url: string): Promise<string | null> {
  if (!S_LINK_TOKEN) return null;
  try {
    const res = await fetch(`${S_LINK_BASE}/api/link/search?url=${encodeURIComponent(url)}&limit=1`, {
      headers: { Authorization: `Bearer ${S_LINK_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ url?: string }> };
    return data?.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}
