/**
 * e-Solat v5 — legacy service worker cleanup
 *
 * The previous v1.3 site registered a cache-first service worker at this exact
 * URL. Returning visitors could therefore keep seeing the old landing page
 * long after the new site was deployed. This worker replaces that registration,
 * clears every old cache and removes itself so the site is always served
 * straight from the network.
 *
 * No fetch handler is registered on purpose: after activation every request
 * goes directly to the network.
 */

const MARKER = 'esolat-sw-reset-v5';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Cache Storage unavailable — nothing to clean.
      }

      // Keep a marker so repeated activations stay harmless and idempotent.
      try {
        await caches.open(MARKER);
      } catch {
        // Ignore storage errors.
      }

      // Reload open tabs once. The navigation is deliberately not awaited:
      // awaiting it inside waitUntil would block activation, and the reload
      // would never complete. Caches are already empty at this point, so the
      // new request goes straight to the network.
      try {
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) => {
            clients.forEach((client) => {
              client.postMessage({ type: 'ESOLAT_SW_RESET' });
              client.navigate(client.url).catch(() => undefined);
            });
          })
          .catch(() => undefined);
      } catch {
        // Navigation is best-effort.
      }

      try {
        await self.registration.unregister();
      } catch {
        // Already unregistered.
      }
    })()
  );
});
