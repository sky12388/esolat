/**
 * Skywalker e-Solat - Real-Time Theme Manager (theme-manager.js)
 * Manages zero-refresh instant theme hot-swapping across Kiosk TV and Admin PWA.
 */

(function() {
  'use strict';

  const DEFAULT_THEME = 'emerald';
  const VALID_THEMES = ['emerald', 'navy-gold', 'clean-ivory', 'onyx-dark', 'ottoman-cyan'];

  /**
   * Normalizes theme names for backwards compatibility
   */
  function normalizeTheme(name) {
    if (!name) return DEFAULT_THEME;
    const clean = String(name).toLowerCase().trim().replace(/_/g, '-');
    if (clean === 'emerald-nabawi' || clean === 'emerald') return 'emerald';
    if (clean === 'navy-gold' || clean === 'royal-sapphire') return 'navy-gold';
    if (clean === 'clean-ivory' || clean === 'ivory') return 'clean-ivory';
    if (clean === 'onyx-dark' || clean === 'midnight-oled' || clean === 'clean-minimalist') return 'onyx-dark';
    if (clean === 'ottoman-cyan' || clean === 'al-aqsa-teal') return 'ottoman-cyan';
    return clean;
  }

  /**
   * Applies the theme to HTML root & body instantly without reloading
   */
  function applyTheme(themeName) {
    const theme = normalizeTheme(themeName);
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem('selected_theme', theme);
      localStorage.setItem('kiosk_theme', theme);
    } catch (_) {}
  }

  // Expose globally
  window.applyTheme = applyTheme;
  window.normalizeTheme = normalizeTheme;

  // 1. Initial immediate execution before DOM render to prevent theme flashing
  try {
    const initialTheme = localStorage.getItem('selected_theme') || localStorage.getItem('kiosk_theme') || DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', normalizeTheme(initialTheme));
  } catch (_) {}

  // 2. DOM Ready listener
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const savedTheme = localStorage.getItem('selected_theme') || localStorage.getItem('kiosk_theme') || DEFAULT_THEME;
      applyTheme(savedTheme);
    } catch (_) {}

    // 3. BroadcastChannel listener for instant live hot-swapping from Mobile Admin
    try {
      const syncChannel = new BroadcastChannel('esolat_sync');
      syncChannel.onmessage = (event) => {
        if (!event || !event.data) return;
        const msg = event.data;
        if (msg.type === 'THEME_CHANGED' && msg.theme) {
          applyTheme(msg.theme);
        } else if (msg.type === 'SETTINGS_UPDATED' && (msg.selected_theme || msg.kiosk_theme)) {
          applyTheme(msg.selected_theme || msg.kiosk_theme);
        }
      };
    } catch (_) {}

    // 4. Cross-tab storage event listener
    window.addEventListener('storage', (event) => {
      if (event.key === 'selected_theme' || event.key === 'kiosk_theme') {
        if (event.newValue) {
          applyTheme(event.newValue);
        }
      }
    });
  });
})();
