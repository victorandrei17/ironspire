/**
 * Service worker (SPEC §17.4).
 *
 * Hand-written rather than Workbox: this is forty lines and the alternative is
 * a build-time dependency for a game whose whole point is not having any.
 *
 * Strategy, and why:
 *  - Navigations go NETWORK FIRST, falling back to cache. A cached index.html
 *    would pin the player to an old build forever, since it is the file that
 *    names every hashed asset.
 *  - Everything else is CACHE FIRST. Vite fingerprints those filenames, so a
 *    cached one can never be stale — a new build has a new name.
 */
const CACHE = 'iron-spire-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // Take over immediately: waiting for every tab to close means a fix can sit
  // undelivered for days on a game people keep open.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * The page tells the worker what it actually loaded.
 *
 * A worker registers AFTER the first load's requests have already gone out, so
 * its fetch handler never sees the hashed bundle on the very first visit — and
 * the app would then fail to boot offline until the second one. The page posts
 * the resource list once it is up, and the worker caches it.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === null || typeof data !== 'object' || data.type !== 'precache') return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls.map((u) =>
          c.match(u).then((hit) => (hit ? undefined : c.add(u).catch(() => undefined))),
        ),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // Opaque and error responses are not worth caching; a bad one would
          // stick around until the next version bump.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
