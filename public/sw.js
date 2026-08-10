/* Service Worker for Cloudflare OS PWA.
   Strategy:
   - App shell / static assets (JS/CSS/images/fonts): cache-first for offline + speed.
   - Navigation (HTML) requests: network-first, fall back to cached shell when offline.
   - API & other requests: network-first, never block on cache (data must be fresh).
*/

const CACHE_VERSION = 'cfos-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_EXT = /\.(?:js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/;
const API_PREFIX = ['/api/', '/_next/data/'];

self.addEventListener('install', (event) => {
  // Pre-cache the app shell so the app can open offline.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: default

  // API + Next data: network-first (fresh data is more important than offline).
  if (API_PREFIX.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets: cache-first.
  if (STATIC_EXT.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests (HTML): network-first, offline fallback to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else: network-first.
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // For navigation offline, serve the shell (which bootstraps the app).
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
