/*
 * Yallacademy service worker. Registered by
 * src/components/pwa/service-worker-registration.tsx (production only).
 *
 * Its jobs are small on purpose:
 *   1. Offline: a page that can't load shows /offline.html instead of the
 *      browser's error screen.
 *   2. Speed: the build's hashed files (/_next/static) and the icons come from
 *      the cache once seen.
 *
 * What it never does: store pages or API responses. Pages and /api carry one
 * family's or one academy's data; on a shared phone or after signing out,
 * a cached copy could show it to the next person. They always go to the
 * network.
 *
 * Bump VERSION to drop the old caches (the browser installs a new worker
 * whenever this file's bytes change).
 */
const VERSION = 'v1';
const STATIC_CACHE = `ya-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/img/symbol-small.svg', '/assets/img/symbol-small-white.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ya-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Hashed build output and brand/sport artwork: safe to keep, never personal. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/sports/') ||
    url.pathname.startsWith('/assets/') ||
    /^\/(icon-[\w-]+\.png|apple-touch-icon\.png|favicon\.(ico|svg))$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network; the offline page only when it can't be reached.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((offline) => offline || Response.error())
      )
    );
    return;
  }

  if (!isStaticAsset(url)) return; // /api and everything else: untouched

  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(request).then((hit) => {
        // /_next/static is content-hashed: a URL's bytes never change, so the
        // cached copy is final. The artwork can be redrawn under the same URL,
        // so it is served from the cache and refreshed behind the scenes.
        if (hit && url.pathname.startsWith('/_next/static/')) return hit;
        const fresh = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        if (hit) {
          event.waitUntil(fresh.catch(() => undefined));
          return hit;
        }
        return fresh;
      })
    )
  );
});
