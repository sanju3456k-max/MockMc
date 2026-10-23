// Service Worker for Math Mock Test Practice PWA (WebAPK Compliant)
const CACHE_NAME = 'math-mock-pwa-v3';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// Install: Cache critical shell assets safely without failing if one asset is missing
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn('[SW] Could not precache:', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous cache versions & claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for static assets, network-first with offline fallback for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin extension requests
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Bypass Firebase API or telemetry calls
  if (request.url.includes('firestore.googleapis.com') || request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Handle SPA Navigation requests
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html') || await cache.match('/');
          if (cachedIndex) return cachedIndex;
          return new Response('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // Handle static assets & scripts with 0ms cache-first strategy + graceful offline fallback
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately for 0ms offline launch
        // Background revalidate if online
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Not in cache: fetch from network and store copy in cache
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      } catch (err) {
        console.warn('[SW] Offline asset fetch failed:', request.url);
        // Safe fallbacks so script/style tags don't throw uncaught network errors that block React
        if (request.destination === 'script' || request.url.endsWith('.js') || request.url.endsWith('.tsx')) {
          return new Response('/* Offline JS fallback */', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
        if (request.destination === 'style' || request.url.endsWith('.css')) {
          return new Response('/* Offline CSS fallback */', {
            status: 200,
            headers: { 'Content-Type': 'text/css' }
          });
        }
        return new Response('', { status: 204, statusText: 'Offline Asset Unavailable' });
      }
    })
  );
});

// Listen for skip waiting message from app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
