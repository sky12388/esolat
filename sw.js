/**
 * Skywalker e-Solat Service Worker
 */
const CACHE_NAME = 'esolat-pwa-v1.3.2';
const ASSETS = [
  '/esolat/',
  '/esolat/index.html',
  '/esolat/manifest.json',
  '/esolat/css/style.css',
  '/esolat/js/main.js',
  '/esolat/icons/icon-192.png',
  '/esolat/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('PWA Cache addAll non-fatal:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Chrome PWA requirement: Must have a fetch event listener
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/esolat/index.html');
        }
      });
    })
  );
});
