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
// Headers that mimic a real browser request as closely as a server can. Cloudflare's bot
// scoring looks for a *consistent* set of HTTP headers; sending a plausible browser fingerprint
// reduces false-positive bot flagging. This can't beat a real JS challenge (that needs a
// browser to solve the PoW), but it avoids being blocked by basic UA/header heuristics.
const API_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function browserHeaders(auth: string): HeadersInit {
  return {
    Authorization: auth,
    'User-Agent': API_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };
}

export async function createShortLink(url: string): Promise<string> {
  if (!S_LINK_TOKEN) throw new Error('S_LINK is not configured; short links unavailable.');
  const res = await fetch(`${S_LINK_BASE}/api/link/upsert`, {
    method: 'POST',
    headers: { ...browserHeaders(`Bearer ${S_LINK_TOKEN}`), 'Content-Type': 'application/json' },
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
      headers: browserHeaders(`Bearer ${S_LINK_TOKEN}`),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ url?: string }> };
    return data?.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}
