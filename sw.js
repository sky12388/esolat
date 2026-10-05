/**
 * Skywalker e-Solat - Root Service Worker Uninstaller / Cache Cleaner
 * Retires root SW in favor of dedicated /admin/ and /keygen/ PWAs.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => !k.startsWith('esolat-admin-')).map(k => caches.delete(k))
      );
    }).then(() => {
      return self.registration.unregister();
    })
  );
});
