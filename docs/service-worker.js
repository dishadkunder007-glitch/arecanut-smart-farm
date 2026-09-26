const CACHE_NAME = "arecanut-smart-farm-v41";

self.addEventListener("install", event => {
    // Force active state immediately without waiting for PWA relaunch
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    // Clean up older caches and claim clients immediately
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => {
                console.log("[ServiceWorker] Purging old cache:", k);
                return caches.delete(k);
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // Bypass cache for WebSocket, SSE, dynamic backend APIs, and non-GET requests
    if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/ws") ||
        event.request.method !== "GET"
    ) {
        return;
    }

    // Network-first with cache-busting for HTML documents so desktop PWA always gets latest UI updates
    if (event.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/") {
        event.respondWith(
            fetch(event.request, { cache: "no-cache" })
                .then(response => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Network-first strategy with cache fallback for other static assets
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});