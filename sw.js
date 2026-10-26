/* Nexus Store service worker.
 * Network-first for eligible public pages/assets, with Cache Storage fallback offline.
 * Keep this file beside the Store HTML on the same GitHub Pages path.
 */
const CACHE_NAME = 'nexus-store-offline-v4-creation-events';

const STATIC_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
  'images.unsplash.com',
  'api.dicebear.com'
]);

self.addEventListener('install', (event) => {
  // Activate the new worker as soon as installation completes.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove the previous version of this Store shell cache to avoid stale UI.
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('nexus-store-v') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only cache safe, repeatable GET page/static-asset requests. Never cache POSTs or APIs.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = isSameOrigin && request.mode === 'navigate';
  const isSameOriginStatic = isSameOrigin && (
    ['script', 'style', 'font', 'image'].includes(request.destination) ||
    url.pathname.endsWith('.webmanifest')
  );
  const isCdnStatic = STATIC_HOSTS.has(url.hostname) &&
    ['script', 'style', 'font', 'image'].includes(request.destination);

  if (!isNavigation && !isSameOriginStatic && !isCdnStatic) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Network-first: update the local cache on successful requests.
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        try {
          await cache.put(request, response.clone());
        } catch (_) {
          // If storage is full or the browser blocks caching, still return the network response.
        }
      }
      return response;
    } catch (_) {
      // Offline fallback. Ignore query strings for navigation so the saved Store page can load.
      const cached = await cache.match(request, { ignoreSearch: isNavigation });
      if (cached) return cached;

      if (isNavigation) {
        // Try the site's cached root page as a final navigation fallback.
        const rootUrl = new URL('./', self.registration.scope).href;
        const rootPage = await cache.match(rootUrl, { ignoreSearch: true });
        if (rootPage) return rootPage;
      }

      return new Response(
        'Nexus Store is offline and this page or resource has not been cached yet.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }
  })());
});
