const CACHE_NAME = 'nexus-store-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
            const response = await fetch(request);

            if (response && (response.ok || response.type === 'opaque')) {
                try {
                    await cache.put(request, response.clone());
                } catch (_) {
                    // Still return the response if caching fails.
                }
            }

            return response;
        } catch (_) {
            return await cache.match(request, {
                ignoreSearch: request.mode === 'navigate'
            }) || new Response('Nexus Store is offline. This resource has not been cached yet.', {
                status: 503
            });
        }
    })());
});
