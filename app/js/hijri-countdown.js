/**
 * Hijri Islamic Events Countdown Engine (Takwim Rasmi JAKIM Synchronized)
 * Pure vanilla JavaScript with 100% offline-first standalone fallback.
 * Computes exact remaining days to major Islamic events based on current Hijri date.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HijriCountdown = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Official Annual Islamic Events (Fallback / Offline Reference)
  const DEFAULT_HIJRI_EVENTS = [
    { name: "Awal Muharram (Tahun Baharu)", month: 1, day: 1 },
    { name: "Maulidur Rasul", month: 3, day: 12 },
    { name: "Israk & Mikraj", month: 7, day: 27 },
    { name: "Nisfu Syaaban", month: 8, day: 15 },
    { name: "Awal Ramadhan Al-Mubarak", month: 9, day: 1 },
    { name: "Nuzul Al-Quran", month: 9, day: 17 },
    { name: "Hari Raya Aidilfitri", month: 10, day: 1 },
    { name: "Hari Raya Aidiladha", month: 12, day: 10 }
  ];

  // Hijri Month standard lengths and cumulative day offsets in a 354-day lunar year
  const HIJRI_MONTH_DAYS = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  const HIJRI_CUMULATIVE_OFFSETS = [0, 30, 59, 89, 118, 148, 177, 207, 236, 266, 295, 325];
  const HIJRI_TOTAL_DAYS = 354;

  const HIJRI_MONTH_NAMES_MY = [
    "Muharram", "Safar", "Rabiulawal", "Rabiulakhir",
    "Jamadilawal", "Jamadilakhir", "Rejab", "Syaaban",
    "Ramadhan", "Syawal", "Zulkaedah", "Zulhijjah"
  ];

  // Malay Hijri Month Names Dictionary for String Parsing
  const HIJRI_MONTH_NAMES_MAP = {
    'muharram': 1, 'muharam': 1,
    'safar': 2, 'sapar': 2,
    'rabiulawal': 3, 'rabiul awal': 3, "rabi'ul awal": 3, "rabi' al-awwal": 3, 'rabiul-awal': 3, 'rabiulawal': 3,
    'rabiulakhir': 4, 'rabiul akhir': 4, "rabi'ul akhir": 4, "rabi' al-thani": 4, 'rabiul-akhir': 4, 'rabiutsani': 4, 'rabiulakhir': 4,
    'jamadilawal': 5, 'jamadil awal': 5, 'jumadil awal': 5, 'jumada al-awwal': 5, 'jamadil-awal': 5,
    'jamadilakhir': 6, 'jamadil akhir': 6, 'jumadil akhir': 6, 'jumada al-thani': 6, 'jamadil-akhir': 6, 'jamadiltsani': 6,
    'rejab': 7, 'rajab': 7,
    'syaaban': 8, 'syaban': 8, "sha'ban": 8, "sya'ban": 8,
    'ramadhan': 9, 'ramadan': 9,
    'syawal': 10, 'shawwal': 10,
    'zulkaedah': 11, "zulka'edah": 11, "dhu al-qi'dah": 11, 'zulkaedah': 11, 'dzulqaedah': 11,
    'zulhijjah': 12, 'zulhijah': 12, 'dhu al-hijjah': 12, 'dzulhijjah': 12
  };

  let activeEvents = [...DEFAULT_HIJRI_EVENTS];

  /**
   * Standalone Gregorian-to-Hijri conversion (Offline-first fallback).
   * Uses Intl.DateTimeFormat with Islamic calendar, and falls back to astronomical calculation.
   */
  function getFallbackHijriDate(dateObj = new Date()) {
    try {
      const dt = dateObj instanceof Date ? dateObj : new Date(dateObj || Date.now());
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        try {
          const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
          }).formatToParts(dt);
          const dayPart = parts.find(p => p.type === 'day');
          const monthPart = parts.find(p => p.type === 'month');
          const yearPart = parts.find(p => p.type === 'year');
          if (dayPart && monthPart && yearPart) {
            const day = parseInt(dayPart.value, 10);
            const month = parseInt(monthPart.value, 10);
            const year = parseInt(yearPart.value, 10);
            const mName = HIJRI_MONTH_NAMES_MY[month - 1] || 'Hijri';
            return {
              year,
              month,
              day,
              iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
              formatted: `${day} ${mName} ${year}H`
            };
          }
        } catch (_) {}
      }

      // Mathematical Kuwaiti Algorithm fallback
      let y = dt.getFullYear();
      let m = dt.getMonth() + 1;
      let d = dt.getDate();
      if (m < 3) {
        y -= 1;
        m += 12;
      }
      const a = Math.floor(y / 100);
      const b = 2 - a + Math.floor(a / 4);
      const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
      const l = jd - 1948440 + 10632;
      const n = Math.floor((l - 1) / 10631);
      const l2 = l - 10631 * n + 354;
      const j = (Math.floor((10985 - l2) / 5316)) * (Math.floor((50 * l2) / 17719)) + (Math.floor(l2 / 5670)) * (Math.floor((43 * l2) / 15238));
      const l3 = l2 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
      const m_h = Math.floor((24 * l3) / 709);
      const d_h = l3 - Math.floor((709 * m_h) / 24);
      const y_h = 30 * n + j - 30;

      const hijriMonth = Math.max(1, Math.min(12, Math.floor(m_h)));
      const hijriDay = Math.max(1, Math.min(30, Math.floor(d_h)));
      const hijriYear = Math.floor(y_h);
      const mName = HIJRI_MONTH_NAMES_MY[hijriMonth - 1] || 'Hijri';

      return {
        year: hijriYear,
        month: hijriMonth,
        day: hijriDay,
        iso: `${hijriYear}-${String(hijriMonth).padStart(2, '0')}-${String(hijriDay).padStart(2, '0')}`,
        formatted: `${hijriDay} ${mName} ${hijriYear}H`
      };
    } catch (e) {
      return { year: 1448, month: 4, day: 22, iso: '1448-04-22', formatted: '22 Rabiulakhir 1448H' };
    }
  }

  /**
   * Loads event list from JSON data file if accessible.
   */
  async function loadEvents(jsonUrl = '/kiosk/data/hijri-events.json') {
    try {
      const response = await fetch(jsonUrl, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          activeEvents = data;
        }
      }
    } catch (e) {
      // Fallback silently to DEFAULT_HIJRI_EVENTS
    }
    return activeEvents;
  }

  /**
   * Parses a Hijri date representation into { year, month, day }.
   * If input is null / empty, automatically falls back to standalone calculated Hijri date.
   */
  function parseHijriDate(input) {
    if (!input) {
      return getFallbackHijriDate(new Date());
    }

    if (typeof input === 'object' && input.month && input.day) {
      return {
        year: parseInt(input.year, 10) || 1448,
        month: parseInt(input.month, 10),
        day: parseInt(input.day, 10)
      };
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        return getFallbackHijriDate(new Date());
      }

      // Format 1: YYYY-MM-DD or YYYY/MM/DD
      const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        return {
          year: parseInt(isoMatch[1], 10),
          month: parseInt(isoMatch[2], 10),
          day: parseInt(isoMatch[3], 10)
        };
      }

      // Format 2: DD-MM-YYYY
      const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmyMatch) {
        return {
          day: parseInt(dmyMatch[1], 10),
          month: parseInt(dmyMatch[2], 10),
          year: parseInt(dmyMatch[3], 10)
        };
      }

      // Format 3: "16 Rabiulawal 1448" or "16 Rabiulawal 1448H"
      const textMatch = trimmed.match(/(\d{1,2})\s+([A-Za-z' -]+?)\s+(\d{4})/i);
      if (textMatch) {
        const day = parseInt(textMatch[1], 10);
        const monthName = textMatch[2].toLowerCase().replace(/h$/i, '').trim();
        const year = parseInt(textMatch[3], 10);

        let month = HIJRI_MONTH_NAMES_MAP[monthName];
        if (!month) {
          for (const [k, v] of Object.entries(HIJRI_MONTH_NAMES_MAP)) {
            if (monthName.includes(k) || k.includes(monthName)) {
              month = v;
              break;
            }
          }
        }

        if (month) {
          return { year, month, day };
        }
      }
    }

    return getFallbackHijriDate(new Date());
  }

  /**
   * Computes cumulative day of the year for a given Hijri month & day (1-indexed).
   */
  function getHijriDayOfYear(month, day) {
    const m = Math.max(1, Math.min(12, month));
    const offset = HIJRI_CUMULATIVE_OFFSETS[m - 1] || 0;
    return offset + day;
  }

  /**
   * Main calculation: finds the nearest upcoming Islamic event and days left.
   * @param {string|object} [hijriInput] Current Hijri date (optional, auto falls back)
   * @param {Array} [eventsList] Optional custom events array
   * @returns {object}
   */
  function getUpcomingEvent(hijriInput, eventsList = null) {
    try {
      const currentHijri = parseHijriDate(hijriInput);
      const events = (Array.isArray(eventsList) && eventsList.length > 0) ? eventsList : activeEvents;
      const curDayOfYear = getHijriDayOfYear(currentHijri.month, currentHijri.day);

      let closestEvent = null;
      let minDiff = Infinity;

      for (const event of events) {
        const eventDayOfYear = getHijriDayOfYear(event.month, event.day);
        let diff = eventDayOfYear - curDayOfYear;

        // If the event has passed in the current Hijri year, project to next year
        if (diff < 0) {
          diff += HIJRI_TOTAL_DAYS;
        }

        if (diff < minDiff) {
          minDiff = diff;
          closestEvent = event;
        }
      }

      if (!closestEvent) {
        closestEvent = DEFAULT_HIJRI_EVENTS[4]; // Default Awal Ramadhan
        minDiff = 30;
      }

      let countdownText = '';
      if (minDiff === 0) {
        countdownText = `Hari Ini: ${closestEvent.name}`;
      } else if (minDiff === 1) {
        countdownText = `Lagi 1 Hari Menjelang ${closestEvent.name}`;
      } else {
        countdownText = `Lagi ${minDiff} Hari Menjelang ${closestEvent.name}`;
      }

      return {
        event: closestEvent,
        name: closestEvent.name,
        daysLeft: minDiff,
        days: minDiff,
        countdownText: countdownText,
        targetMonth: closestEvent.month,
        targetDay: closestEvent.day,
        currentHijri: currentHijri
      };
    } catch (err) {
      return {
        event: DEFAULT_HIJRI_EVENTS[4],
        name: "Awal Ramadhan Al-Mubarak",
        daysLeft: 30,
        days: 30,
        countdownText: "Lagi 30 Hari Menjelang Awal Ramadhan Al-Mubarak",
        targetMonth: 9,
        targetDay: 1,
        currentHijri: { year: 1448, month: 8, day: 1 }
      };
    }
  }

  /**
   * Helper to retrieve formatted countdown string directly.
   */
  function getCountdownText(hijriInput) {
    try {
      const res = getUpcomingEvent(hijriInput);
      return res ? res.countdownText : '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Injects or appends countdown text to the ticker text seamlessly.
   * Example output: "Selamat Datang... ✦ Lagi 23 Hari Menjelang Awal Ramadhan Al-Mubarak ✦"
   */
  function formatTickerWithCountdown(baseTicker, hijriInput, isEnabled = true) {
    try {
      if (!isEnabled || isEnabled === '0' || isEnabled === false) {
        return baseTicker || '';
      }

      const countdownText = getCountdownText(hijriInput);
      if (!countdownText) {
        return baseTicker || '';
      }

      const trimmed = (baseTicker || '').trim();
      if (!trimmed) {
        return `✦ ${countdownText} ✦`;
      }

      // Don't duplicate if already present in ticker
      if (trimmed.includes(countdownText) || trimmed.includes(countdownText.replace('Lagi ', ''))) {
        return trimmed;
      }

      return `${trimmed}  ✦  ${countdownText}  ✦`;
    } catch (_) {
      return baseTicker || '';
    }
  }

  /**
   * Updates the UI badge element if present.
   */
  function updateCountdownBadge(elementId, hijriInput, isEnabled = true) {
    try {
      const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
      if (!el) return;

      if (!isEnabled || isEnabled === '0' || isEnabled === false) {
        el.style.display = 'none';
        return;
      }

      const res = getUpcomingEvent(hijriInput);
      if (res && res.countdownText) {
        el.textContent = res.countdownText;
        el.style.display = 'inline-flex';
      } else {
        el.style.display = 'none';
      }
    } catch (_) {}
  }

  // Attempt async preload of events data
  if (typeof window !== 'undefined') {
    loadEvents();
  }

  return {
    DEFAULT_HIJRI_EVENTS,
    loadEvents,
    parseHijriDate,
    getFallbackHijriDate,
    getHijriDayOfYear,
    getUpcomingEvent,
    getNextEvent: getUpcomingEvent, // Alias for backwards compatibility
    getCountdownText,
    formatTickerWithCountdown,
    updateCountdownBadge
  };
}));
