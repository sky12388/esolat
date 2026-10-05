const CACHE_NAME = 'esolat-app-redirect-v1.3.14';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim()).then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.navigate('../admin/');
        });
      });
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Always fetch fresh from network for redirect
  e.respondWith(fetch(e.request).catch(() => fetch('../admin/')));
});
