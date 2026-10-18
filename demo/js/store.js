/**
 * store.js — shared state for the interactive e-Solat demo.
 *
 * The demo signage (/demo/) and the mock admin panel (/admin/) run on the same
 * origin, so a single localStorage key plus a BroadcastChannel keeps both in
 * sync instantly. Nothing here talks to a server: the settings live only in the
 * visitor's own browser, which is exactly what a marketing demo should do.
 */
(function (root) {
  'use strict';

  var KEY = 'esolat_demo_state_v1';
  var CHANNEL = 'esolat_demo_sync';

  var DEFAULTS = {
    zone: 'SGR03',
    mosqueName: 'SURAU DARUL TAQWA',
    mosqueLocation: 'Seksyen 7, Shah Alam, Selangor',
    ipDisplay: '192.168.1.50',

    announcement: 'Selamat Datang ke Surau Darul Taqwa. Sila pastikan telefon bimbit diletakkan dalam mod senyap.',

    bankName: 'Bank Islam Malaysia Berhad',
    bankAcc: '1202-9010-0456-78',
    bankHolder: 'Tabung Pembangunan Surau Darul Taqwa',

    kuliahDate: 'Rabu Ini (Lepas Maghrib)',
    kuliahTitle: 'Kuliah Maghrib Perdana: Menghayati Al-Quran',
    kuliahUstaz: 'Ustaz Hj. Ahmad Fauzi',
    kuliahHint: 'Semua muslimin dan muslimat dijemput hadir mengimarahkan majlis ilmu.',

    hadithText: 'Sebaik-baik amalan adalah solat pada awal waktunya.',
    hadithSource: 'HR. Al-Bukhari & Muslim',

    rosterImam: 'Ustaz Hj. Wan Ahmad',
    rosterBilal: 'En. Roslan Ismail',
    rosterSiak: 'En. Mohd Khairi',

    tabungDate: 'Jumaat Lepas',
    tabungJumaat: 'RM 3,450.00',
    tabungSubuh: 'RM 820.00',
    tabungPembangunan: 'RM 45,200.00',

    slideEyebrow1: 'Surau Darul Taqwa',
    slideEyebrow2: 'Sumbangan Anda',
    slideEyebrow3: 'Setiap Jumaat',
    slideTitle1: 'PROGRAM MAJLIS ILMU',
    slideSub1: 'Kuliah maghrib setiap Rabu selepas solat Maghrib',
    slideTitle2: 'INFAQ & WAKAF',
    slideSub2: 'Sumbangan anda membina rumah Allah dan membantu anak yatim',
    slideTitle3: 'JADUAL SOLAT JUMAAT',
    slideSub3: 'Khutbah pertama 12.30 petang · Khutbah kedua 13.15 petang',

    theme: 'emerald',
    cycleSeconds: 12
  };

  var FIELD_LABELS = {
    mosqueName: 'Nama Surau',
    mosqueLocation: 'Lokasi',
    ipDisplay: 'Alamat IP kiosk',
    announcement: 'Ticker pengumuman',
    bankName: 'Nama bank',
    bankAcc: 'Nombor akaun',
    bankHolder: 'Nama pemohon akaun',
    kuliahDate: 'Tarikh kuliah',
    kuliahTitle: 'Tajuk kuliah',
    kuliahUstaz: 'Ustaz',
    kuliahHint: 'Undangan',
    hadithText: 'Teks hadis',
    hadithSource: 'Rujukan hadis',
    rosterImam: 'Imam',
    rosterBilal: 'Bilal',
    rosterSiak: 'Siak',
    tabungDate: 'Tarikh penyata',
    tabungJumaat: 'Kutipan Jumaat',
    tabungSubuh: 'Infaq Subuh',
    tabungPembangunan: 'Tabung pembangunan',
    slideEyebrow1: 'Slaid 1 — label atas',
    slideEyebrow2: 'Slaid 2 — label atas',
    slideEyebrow3: 'Slaid 3 — label atas',
    slideTitle1: 'Slaid 1 — tajuk',
    slideSub1: 'Slaid 1 — teks',
    slideTitle2: 'Slaid 2 — tajuk',
    slideSub2: 'Slaid 2 — teks',
    slideTitle3: 'Slaid 3 — tajuk',
    slideSub3: 'Slaid 3 — teks'
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function get(key) {
    return read()[key];
  }

  function all() {
    return read();
  }

  /** Persists a patch, notifies same-origin tabs, and returns the merged state. */
  function set(patch, source) {
    var next = Object.assign({}, read(), patch || {});
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {}
    broadcast({ type: 'STATE_UPDATED', patch: patch || {}, source: source || 'admin' });
    return next;
  }

  function reset(source) {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
    broadcast({ type: 'STATE_RESET', source: source || 'admin' });
    return Object.assign({}, DEFAULTS);
  }

  function channel() {
    if (typeof BroadcastChannel === 'undefined') return null;
    try {
      return new BroadcastChannel(CHANNEL);
    } catch (e) {
      return null;
    }
  }

  function broadcast(message) {
    var c = channel();
    if (c) {
      try { c.postMessage(message); } catch (e) {}
    }
  }

  /**
   * Subscribes to remote changes. BroadcastChannel covers same-origin tabs in
   * modern browsers; the storage event covers everything else.
   * Returns an unsubscribe function.
   */
  function subscribe(handler) {
    var c = channel();
    if (c) {
      c.onmessage = function (event) {
        if (event.data) handler(event.data);
      };
    }
    function onStorage(event) {
      if (event.key === KEY) handler({ type: event.newValue ? 'STATE_UPDATED' : 'STATE_RESET' });
    }
    window.addEventListener('storage', onStorage);
    return function () {
      if (c) { try { c.close(); } catch (e) {} }
      window.removeEventListener('storage', onStorage);
    };
  }

  root.EsolatDemoStore = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    FIELD_LABELS: FIELD_LABELS,
    all: all,
    get: get,
    set: set,
    reset: reset,
    subscribe: subscribe
  };
})(typeof self !== 'undefined' ? self : this);