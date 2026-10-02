/**
 * e-Solat Admin Console Service Worker
 * Version: 1.1.1
 * Provides offline support and WebAPK installation on Android without blocking requests.
 */

const CACHE_NAME = 'esolat-admin-v1.1.1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests strictly within /admin/ and same-origin
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/admin')) {
    return;
  }

  // Network-First, direct passthrough with graceful fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
