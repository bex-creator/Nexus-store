/* Nexus Store service worker.
 * Network-first for eligible public pages/assets, with Cache Storage fallback offline.
 * Keep this file beside the Store HTML on the same GitHub Pages path.
 */

const CACHE_NAME = 'nexus-store-v2';

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

// Install and activate the new service worker.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete the previous Store cache version.
    const names = await caches.keys();

    await Promise.all(
      names
        .filter(name => name === 'nexus-store-v1')
        .map(name => caches.delete(name))
    );

    // Allow the new service worker to control open pages.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only cache GET requests. Never cache form submissions or POST requests.
  if (request.method !== 'GET') return;

  let url;

  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;

  const isNavigation =
    isSameOrigin && request.mode === 'navigate';

  const isSameOriginStatic =
    isSameOrigin && (
      ['script', 'style', 'font', 'image'].includes(request.destination) ||
      url.pathname.endsWith('.webmanifest')
    );

  const isCdnStatic =
    STATIC_HOSTS.has(url.hostname) &&
    ['script', 'style', 'font', 'image'].includes(request.destination);

  // Don't intercept unrelated requests, APIs, or dynamic data.
  if (!isNavigation && !isSameOriginStatic && !isCdnStatic) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Network-first: use fresh content when online.
    try {
      const response = await fetch(request);

      // Cache successful responses for later offline use.
      if (response && (response.ok || response.type === 'opaque')) {
        try {
          await cache.put(request, response.clone());
        } catch (_) {
          // If caching fails because storage is full or unavailable,
          // the network response can still be used.
        }
      }

      return response;

    } catch (_) {
      // Offline fallback: use a previously cached response.
      const cached = await cache.match(request, {
        ignoreSearch: isNavigation
      });

      if (cached) {
        return cached;
      }

      // If a specific page isn't cached, try the Store's root page.
      if (isNavigation) {
        const rootUrl = new URL(
          './',
          self.registration.scope
        ).href;

        const rootPage = await cache.match(rootUrl, {
          ignoreSearch: true
        });

        if (rootPage) {
          return rootPage;
        }
      }

      // Return a clear offline message when no cached copy exists.
      return new Response(
        'Nexus Store is offline and this page or resource has not been cached yet.',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        }
      );
    }
  })());
});
