/**
 * Skywalker e-Solat - PWA Service Worker
 * Version: v2.0.0
 */
const CACHE_NAME = 'esolat-pwa-v2';
const PRECACHE_ASSETS = [
  '/esolat/',
  '/esolat/index.html',
  '/esolat/css/style.css',
  '/esolat/js/main.js',
  '/esolat/manifest.json',
  '/esolat/icons/icon-192.png',
  '/esolat/icons/icon-512.png',
  '/esolat/icons/icon-maskable-512.png',
  '/esolat/icons/apple-touch-icon.png',
  '/esolat/icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-critical fallback:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/esolat/index.html');
          }
        });
      })
  );
});
