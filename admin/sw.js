/**
 * e-Solat Mobile Admin Service Worker
 * Version: 1.3.16-pwa2
 * Provides ultra-reliable offline caching and PWA WebAPK installability.
 */

const CACHE_NAME = 'esolat-admin-v1.3.16-pwa2';
const ALLOWED_ORIGINS = [
  'localhost',
  '127.0.0.1',
  '192.168.0.5',
  'esolat.local',
  'sky12388.github.io'
];

const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './css/admin.css',
  './js/admin.js?v=1.3.16',
  './js/qrcode.min.js',
  './js/html5-qrcode.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        console.warn('[SW] Non-critical precache fallback:', err);
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
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass API requests to allow fresh server data
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First with Cache Fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || ALLOWED_ORIGINS.some(o => url.hostname.includes(o)))) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match('./');
          }
        });
      })
  );
});
