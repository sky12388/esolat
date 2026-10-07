/**
 * Skywalker e-Solat - PWA Service Worker
 */
const CACHE_NAME = 'esolat-pwa-v1.3.16';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Minimum fetch handler required by Chrome PWA engine
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
