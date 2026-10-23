/* আমার পাঠাগার — sw.js (service worker)
   Precaches the app shell; runtime-caches Google Fonts (stale-while-revalidate).
   Never touches IndexedDB — app updates cannot delete user records.
   Relative URLs resolve against the SW scope → works under GitHub Pages subpaths. */

const VERSION = 'v1.0.0';
const SHELL_CACHE = `ap-shell-${VERSION}`;
const RUNTIME_CACHE = `ap-runtime-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/views.css',
  './js/util.js',
  './js/i18n.js',
  './js/db.js',
  './js/search.js',
  './js/seed.js',
  './js/state.js',
  './js/csv.js',
  './js/components.js',
  './js/book-form.js',
  './js/quick-forms.js',
  './js/actions.js',
  './js/sample.js',
  './js/app.js',
  './js/views/dashboard.js',
  './js/views/books.js',
  './js/views/book-detail.js',
  './js/views/people.js',
  './js/views/reading.js',
  './js/views/digital.js',
  './js/views/collections.js',
  './js/views/journal.js',
  './js/views/data.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const base = new URL('./', self.registration.scope);
    await Promise.all(PRECACHE_URLS.map(u => cache.add(new URL(u, base).href).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* app shell: navigation → network-first, fallback to cached index.html */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(new URL('./index.html', self.registration.scope).href))
          || (await cache.match(new URL('./', self.registration.scope).href))
          || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  /* same-origin static: network-first with cache fallback → updates apply
     immediately when online; the precached shell keeps the app offline-capable */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  /* Google Fonts: stale-while-revalidate */
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || network;
    })());
    return;
  }

  /* everything else (e.g. user's external book links): pass through, never cached */
});
