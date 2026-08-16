import { siteUrl } from './site';

// IndexNow — instant URL submission to Bing (and participating engines like Seznam/Naver).
// https://www.bing.com/indexnow/getstarted
//
// Protocol: the site must serve a key file at /{INDEXNOW_KEY}.txt (see
// src/app/indexnow-key.txt/route.ts), then POST the URLs to https://api.indexnow.org/indexnow.
// This is fire-and-forget: failures are swallowed (a failed ping just means Bing will
// discover the URL later via the sitemap). Never blocks the caller.

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const FETCH_TIMEOUT_MS = 5000;

/** Whether IndexNow is configured (INDEXNOW_KEY set). */
export function indexNowConfigured(): boolean {
  return Boolean(process.env.INDEXNOW_KEY);
}

/**
 * Notify Bing (and participating engines) that a URL was published/updated/deleted.
 * `keyLocation` defaults to the site root key file. Fire-and-forget.
 */
export async function submitIndexNow(urls: string[], opts?: { keyLocation?: string }): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || urls.length === 0) return;
  const host = new URL(siteUrl('/')).host;
  const keyLocation = opts?.keyLocation ?? siteUrl(`/${key}.txt`);
  try {
    await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => undefined);
  } catch {
    // fire-and-forget: ignore
  }
}

/** Convenience: notify a single URL. */
export async function submitIndexNowUrl(url: string): Promise<void> {
  await submitIndexNow([url]);
}