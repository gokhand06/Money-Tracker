/* Money Tracker — offline service worker.
 *
 * Turns the app into an installable, offline-capable PWA and is the shared
 * prerequisite for every APK packaging route (PWA / TWA / Capacitor).
 *
 * ┌─ IMPORTANT ───────────────────────────────────────────────────────────┐
 * │ Bump CACHE_VERSION on EVERY deploy. Otherwise phones get stuck serving │
 * │ a stale build from the cache (the "PWA caches stale version" gotcha,   │
 * │ context.md §12). The version string is the only thing you must change. │
 * └───────────────────────────────────────────────────────────────────────┘
 */
const CACHE_VERSION = '2026-07-01-forecast';         // ← bump this each deploy
const CACHE_NAME    = 'money-tracker-' + CACHE_VERSION;

// The app shell (everything needed to boot offline). All same-origin & local.
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Precache the shell, then take over immediately.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Drop every old versioned cache, then claim open pages.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Only ever touch our OWN same-origin GET requests. Cloud sync, the CORS
  // price proxies, Yahoo, minkabu, etc. must pass straight through untouched
  // so the app keeps degrading gracefully when the network is flaky/offline.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for the HTML shell: a fresh deploy is picked up the instant
  // the phone is online; the cache only serves it when the network fails.
  const isShell = req.mode === 'navigate'
               || req.destination === 'document'
               || url.pathname.endsWith('/index.html')
               || url.pathname.endsWith('/');
  if (isShell) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Other same-origin assets (icons, manifest): cache-first, then network.
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      });
    })
  );
});
