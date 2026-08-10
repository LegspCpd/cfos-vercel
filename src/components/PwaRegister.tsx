'use client';

import { useEffect } from 'react';

// Registers the Service Worker for PWA offline support. Only in production
// (Vercel) — in dev the SW would fight with the Next dev server caching.
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    // Register after load so it doesn't compete with initial render.
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('SW registration failed', err));
    };
    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad);
    }
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
