'use client';

import { useEffect } from 'react';

// Custom site-wide background image.
//
// When the BEIJIN environment variable is set to a URL, that image is shown behind
// every page. It is re-fetched on every navigation/render by appending a cache-buster
// timestamp, so a refresh always requests the URL anew (the URL may return a fresh image).
//
// Accepted env names (Vercel): NEXT_PUBLIC_BEIJIN (preferred, client-readable) or BEIJIN.
// Both are inlined at build time; NEXT_PUBLIC_ is required for client components.
const BG_URL =
  process.env.NEXT_PUBLIC_BEIJIN || process.env.NEXT_PUBLIC_BEIJING || '';

export default function SiteBackground() {
  useEffect(() => {
    if (!BG_URL) return;
    // Cache-bust: request the URL fresh on every render (each navigation = a new image).
    const sep = BG_URL.includes('?') ? '&' : '?';
    const url = `${BG_URL}${sep}_t=${Date.now()}`;
    document.documentElement.style.setProperty('--site-bg-url', `url("${url}")`);
    return () => {
      document.documentElement.style.removeProperty('--site-bg-url');
    };
  }, []);

  return null;
}
