/**
 * Remove any service worker left behind by the legacy v1.3 site and clear its
 * caches. Safe to run on every page load; the new site does not use a worker.
 */
(() => {
  if (!('serviceWorker' in navigator)) return;

  try {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'ESOLAT_SW_RESET') return;
      try {
        if (sessionStorage.getItem('esolat_sw_reloaded')) return;
        sessionStorage.setItem('esolat_sw_reloaded', '1');
      } catch {
        // Fall through and reload once.
      }
      window.location.reload();
    });
  } catch {
    // Ignore unsupported browsers.
  }

  try {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => undefined);
  } catch {
    // Ignore unsupported browsers.
  }

  try {
    if (window.caches && typeof caches.keys === 'function') {
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== 'esolat-sw-reset-v5').map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  } catch {
    // Ignore storage errors.
  }
})();
