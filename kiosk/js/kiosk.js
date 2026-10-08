/**
 * e-Solat Mosque Digital Signage - TV Kiosk Controller
 * Handles 1-second state synchronization, smooth clock, slideshow, audio, and overlay transitions.
 */

let currentSlideIndex = 0;
let slidesList = [];
let slideTimer = null;
let lastReloadCounter = null;
let lastKioskData = null;
let lastOverlayPhase = null;

// Audio elements
const audioAdhan = document.getElementById('audioAdhan');
const audioSubuh = document.getElementById('audioSubuh');
const audioBeep = document.getElementById('audioBeep');
const audioPreAdhan = document.getElementById('audioPreAdhan');

function formatSeconds(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatHoursSeconds(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `- ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const MALAY_DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const MALAY_MONTHS = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
];

function getSystemGregorianDateFormatted(now = new Date()) {
  const dayName = MALAY_DAYS[now.getDay()];
  const dayNum = now.getDate();
  const monthName = MALAY_MONTHS[now.getMonth()];
  const year = now.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

function timeStringToSeconds(tStr) {
  if (!tStr || typeof tStr !== 'string') return 0;
  const parts = tStr.trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
}

function formatTimestampToHHMM(ts) {
  if (!ts) return '--:--';
  if (typeof ts === 'string' && ts.includes(':')) {
    const parts = ts.trim().split(':');
    return `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`;
  }
  const dt = new Date(typeof ts === 'number' && ts < 10000000000 ? ts * 1000 : ts);
  if (isNaN(dt.getTime())) return '--:--';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function getFallbackOrCachedTakwim(now = new Date()) {
  let takwimList = null;
  let zone = 'SGR01';
  try {
    zone = localStorage.getItem('esolat_zone') || 'SGR01';
    const cached = localStorage.getItem(`cached_takwim_${zone}`);
    if (cached) {
      takwimList = JSON.parse(cached);
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cached_takwim_')) {
          try {
            takwimList = JSON.parse(localStorage.getItem(key));
            if (takwimList) break;
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  let items = [];
  if (takwimList) {
    if (Array.isArray(takwimList)) {
      items = takwimList;
    } else if (Array.isArray(takwimList.prayers)) {
      items = takwimList.prayers;
    } else if (Array.isArray(takwimList.prayerTime)) {
      items = takwimList.prayerTime;
    }
  }

  const dayNum = now.getDate();
  const monthNum = now.getMonth() + 1;
  const yearNum = now.getFullYear();
  const todayIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

  let matchedRecord = null;
  if (items && items.length > 0) {
    matchedRecord = items.find(it => {
      const d = it.date || it.day_date || '';
      return String(d).includes(todayIso);
    });

    if (!matchedRecord) {
      matchedRecord = items.find(it => {
        const d = parseInt(it.day || it.day_number || it.date, 10);
        return d === dayNum;
      });
    }

    if (!matchedRecord) {
      const idx = Math.min(Math.max(0, dayNum - 1), items.length - 1);
      matchedRecord = items[idx] || items[0];
    }
  }

  let ribbon = {};
  let hijriStr = '';

  if (matchedRecord) {
    const subuhStr = formatTimestampToHHMM(matchedRecord.fajr || matchedRecord.subuh || matchedRecord.Subuh);
    const syurukStr = formatTimestampToHHMM(matchedRecord.syuruk || matchedRecord.sunrise || matchedRecord.Syuruk);
    const zohorStr = formatTimestampToHHMM(matchedRecord.dhuhr || matchedRecord.zohor || matchedRecord.Zohor);
    const asarStr = formatTimestampToHHMM(matchedRecord.asr || matchedRecord.asar || matchedRecord.Asar);
    const maghribStr = formatTimestampToHHMM(matchedRecord.maghrib || matchedRecord.Maghrib);
    const isyakStr = formatTimestampToHHMM(matchedRecord.isha || matchedRecord.isyak || matchedRecord.Isyak);
    
    let imsakStr = formatTimestampToHHMM(matchedRecord.imsak || matchedRecord.Imsak);
    if (imsakStr === '--:--' && subuhStr !== '--:--') {
      const sSec = timeStringToSeconds(subuhStr);
      const imSec = Math.max(0, sSec - 600);
      const m = Math.floor(imSec / 60);
      imsakStr = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }

    ribbon = {
      Imsak: imsakStr !== '--:--' ? imsakStr : '05:46',
      Subuh: subuhStr !== '--:--' ? subuhStr : '05:56',
      Syuruk: syurukStr !== '--:--' ? syurukStr : '07:05',
      Zohor: zohorStr !== '--:--' ? zohorStr : '13:06',
      Asar: asarStr !== '--:--' ? asarStr : '16:16',
      Maghrib: maghribStr !== '--:--' ? maghribStr : '19:07',
      Isyak: isyakStr !== '--:--' ? isyakStr : '20:16'
    };

    if (matchedRecord.hijri) {
      hijriStr = String(matchedRecord.hijri);
      if (/^\d{4}-\d{2}-\d{2}$/.test(hijriStr)) {
        const parts = hijriStr.split('-');
        const hYear = parts[0];
        const hMonth = parseInt(parts[1], 10);
        const hDay = parseInt(parts[2], 10);
        const monthNames = [
          "Muharram", "Safar", "Rabiulawal", "Rabiulakhir",
          "Jamadilawal", "Jamadilakhir", "Rejab", "Syaaban",
          "Ramadhan", "Syawal", "Zulkaedah", "Zulhijjah"
        ];
        hijriStr = `${hDay} ${monthNames[hMonth - 1] || 'Hijri'} ${hYear}H`;
      }
    }
  } else {
    ribbon = {
      Imsak: '05:46',
      Subuh: '05:56',
      Syuruk: '07:05',
      Zohor: '13:06',
      Asar: '16:16',
      Maghrib: '19:07',
      Isyak: '20:16'
    };
  }

  if (!hijriStr && window.HijriCountdown) {
    try {
      const fbH = window.HijriCountdown.getFallbackHijriDate(now);
      if (fbH && fbH.formatted) hijriStr = fbH.formatted;
    } catch (_) {}
  }

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // Fardhu prayers only for Next Prayer countdown
  const fardhuSecs = [
    { name: 'Subuh', sec: timeStringToSeconds(ribbon.Subuh) },
    { name: 'Zohor', sec: timeStringToSeconds(ribbon.Zohor) },
    { name: 'Asar', sec: timeStringToSeconds(ribbon.Asar) },
    { name: 'Maghrib', sec: timeStringToSeconds(ribbon.Maghrib) },
    { name: 'Isyak', sec: timeStringToSeconds(ribbon.Isyak) }
  ];

  let nextPrayer = 'Subuh';
  let timeToNext = (86400 - nowSec) + fardhuSecs[0].sec;
  for (const f of fardhuSecs) {
    if (f.sec > nowSec) {
      nextPrayer = f.name;
      timeToNext = f.sec - nowSec;
      break;
    }
  }

  // All slots for active ribbon indicator
  const allSlots = [
    { name: 'Imsak', sec: timeStringToSeconds(ribbon.Imsak) },
    { name: 'Subuh', sec: timeStringToSeconds(ribbon.Subuh) },
    { name: 'Syuruk', sec: timeStringToSeconds(ribbon.Syuruk) },
    { name: 'Zohor', sec: timeStringToSeconds(ribbon.Zohor) },
    { name: 'Asar', sec: timeStringToSeconds(ribbon.Asar) },
    { name: 'Maghrib', sec: timeStringToSeconds(ribbon.Maghrib) },
    { name: 'Isyak', sec: timeStringToSeconds(ribbon.Isyak) }
  ];
  let currentSlot = 'Isyak';
  for (const s of allSlots) {
    if (s.sec <= nowSec) {
      currentSlot = s.name;
    }
  }

  return {
    ribbon,
    hijriStr: hijriStr || '22 Rabiulawal 1448H',
    currentSlot,
    nextPrayer,
    timeToNext
  };
}

function getFallbackOrCachedState() {
  const now = new Date();
  const gregorianStr = getSystemGregorianDateFormatted(now);
  const takwim = getFallbackOrCachedTakwim(now);

  let savedSettings = {};
  try {
    savedSettings = JSON.parse(localStorage.getItem('esolat_admin_settings') || '{}');
  } catch (_) {}

  const defaultSettings = {
    mosque_name: 'SURAU DARUL TAQWA',
    mosque_location: 'Seksyen 7, Shah Alam, Selangor',
    ticker_text: 'Selamat Menunaikan Solat Fardhu • Sila Rapatkan Saf & Matikan Nada Dering Telefon Bimbit',
    kiosk_font_family: 'outfit',
    kiosk_theme: 'emerald_nabawi',
    kiosk_layout_preset: 'horizontal_glass',
    active_layout_mode: 'fullscreen_signage',
    kiosk_layout: 'split_right',
    pip_mode: 'none',
    bank_name: 'Maybank Islamic',
    bank_account_no: '5621 0671 8923',
    bank_account_holder: 'Tabung Pengurusan Surau Darul Taqwa',
    hadith_text: 'Sebaik-baik amalan adalah solat pada awal waktunya.',
    hadith_source: 'HR. Al-Bukhari & Muslim',
    hijri_countdown_enabled: '1',
    janazah_enabled: '0',
    janazah_arwah_name: '',
    janazah_solat_time: 'Selepas Solat Zohor',
    janazah_solat_loc: 'Surau Darul Taqwa',
    janazah_kubur_loc: 'Tanah Perkuburan Islam Seksyen 21, Shah Alam',
    jumaat_khutbah_title: 'Membina Ummah MADANI Berteraskan Taqwa'
  };

  const mergedSettings = Object.assign({}, defaultSettings, savedSettings);

  return {
    state: 'NORMAL',
    gregorian_date: gregorianStr,
    hijri_date: takwim.hijriStr,
    ribbon_times: takwim.ribbon,
    current_prayer_slot: takwim.currentSlot,
    next_prayer: takwim.nextPrayer,
    time_to_next_seconds: takwim.timeToNext,
    settings: mergedSettings,
    license_status: { license_state: 'ACTIVATED', days_left: 365 },
    slides: [
      {
        id: 1,
        title: "Selamat Datang ke Surau Darul Taqwa",
        description: "Pusat Ibadah, Kebajikan & Pembangunan Ummah Kariah Seksyen 7 Shah Alam.",
        badge: "AHLAN WA SAHLAN",
        arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        duration: 12
      },
      {
        id: 2,
        title: "Kempen Infaq & Wakaf Pembangunan Surau",
        description: "Sumbangan anda mengalirkan pahala berterusan untuk pembangunan fasiliti surau.",
        badge: "INFAQ JARIAH",
        arabic: "مَنْ بَنَى مَسْجِدًا لِلَّهِ بَنَى اللَّهُ لَهُ فِي الْجَنَّةِ مِثْلَهُ",
        duration: 12
      }
    ]
  };
}

const HIJRI_MONTH_NAMES_MY = [
  "Muharram", "Safar", "Rabiulawal", "Rabiulakhir",
  "Jamadilawal", "Jamadilakhir", "Rejab", "Syaaban",
  "Ramadhan", "Syawal", "Zulkaedah", "Zulhijjah"
];

function formatHijriDateDisplay(hijriInput) {
  if (!hijriInput) {
    if (window.HijriCountdown) {
      try {
        return window.HijriCountdown.getFallbackHijriDate().formatted;
      } catch (_) {}
    }
    return '';
  }
  if (typeof hijriInput === 'string') {
    const trimmed = hijriInput.trim();
    if (trimmed.includes(' ') && (trimmed.endsWith('H') || trimmed.endsWith('h'))) {
      for (const mName of HIJRI_MONTH_NAMES_MY) {
        if (trimmed.toLowerCase().includes(mName.toLowerCase())) {
          return trimmed;
        }
      }
    }
  }
  if (window.HijriCountdown) {
    try {
      const p = window.HijriCountdown.parseHijriDate(hijriInput);
      if (p && p.month && p.day) {
        const mName = HIJRI_MONTH_NAMES_MY[p.month - 1] || 'Hijri';
        const yr = p.year || 1448;
        return `${p.day} ${mName} ${yr}H`;
      }
    } catch (_) {}
  }
  return String(hijriInput);
}

// 1. Digital Clock & Fullscreen Kuliah State Controller
function setKuliahFullScreen(isFullScreen) {
  const active = (isFullScreen === true || isFullScreen === 'true' || isFullScreen === 1 || isFullScreen === '1');
  if (active) {
    document.body.classList.add('mode-kuliah-fullscreen');
    const kc = document.getElementById('kioskContainer');
    if (kc) kc.classList.add('mode-kuliah-fullscreen');
  } else {
    document.body.classList.remove('mode-kuliah-fullscreen');
    const kc = document.getElementById('kioskContainer');
    if (kc) kc.classList.remove('mode-kuliah-fullscreen');
  }
  try {
    localStorage.setItem('kuliah_fullscreen', active ? 'true' : 'false');
  } catch (_) {}
}
window.setKuliahFullScreen = setKuliahFullScreen;

function startClientClock() {
  const clockEl = document.getElementById('digitalClock');
  const pipClockEl = document.getElementById('pipClock');
  const hudClockEl = document.getElementById('hudClock');
  const gDateEl = document.getElementById('gregorianDate');
  const pipDateEl = document.getElementById('pipDate');
  const hDateEl = document.getElementById('hijriDate');

  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    if (clockEl && clockEl.textContent !== timeStr) clockEl.textContent = timeStr;
    if (pipClockEl && pipClockEl.textContent !== timeStr) pipClockEl.textContent = timeStr;
    if (hudClockEl && hudClockEl.textContent !== timeStr) hudClockEl.textContent = timeStr;

    // 100% Pure Malay Single Source of Truth (Zero Flicker, Zero English)
    const gFormatted = getSystemGregorianDateFormatted(now);
    if (gDateEl && gDateEl.textContent !== gFormatted) {
      gDateEl.textContent = gFormatted;
    }
    if (pipDateEl && pipDateEl.textContent !== gFormatted) {
      pipDateEl.textContent = gFormatted;
    }

    if (hDateEl) {
      const effectiveHijri = (lastKioskData && lastKioskData.hijri_date)
        ? formatHijriDateDisplay(lastKioskData.hijri_date)
        : (window.HijriCountdown ? window.HijriCountdown.getFallbackHijriDate(now).formatted : '');
      if (effectiveHijri && hDateEl.textContent !== effectiveHijri) {
        hDateEl.textContent = effectiveHijri;
      }
    }
  }
  update();
  setInterval(update, 250);
}

// ==================== MULTI-SOURCE MEDIA & PiP ENGINE ====================
let hlsInstance = null;
let currentLoadedMediaUrl = null;

const ALL_LAYOUT_MODES = [
  'mode-fullscreen-signage',
  'mode-fullscreen_signage',
  'mode-fullscreen-video',
  'mode-fullscreen_video',
  'mode-split-equal',
  'mode-split_equal',
  'mode-split-video-focus',
  'mode-split_video_focus',
  'mode-split-signage-focus',
  'mode-split_signage_focus',
  'mode-pip-video',
  'mode-pip_video',
  'mode-pip-signage',
  'mode-pip_signage'
];

function applyLayoutMode(mode) {
  const container = document.getElementById('kioskContainer');
  if (!container) return;

  const rawMode = (mode || 'fullscreen_signage').toString().trim().toLowerCase();
  const normalized = rawMode.replace(/_/g, '-');
  const targetHyphen = `mode-${normalized}`;
  const targetUnderscore = `mode-${rawMode.replace(/-/g, '_')}`;

  ALL_LAYOUT_MODES.forEach(cls => container.classList.remove(cls));
  container.classList.add(targetHyphen);
  container.classList.add(targetUnderscore);
}

function getYouTubeEmbedUrl(url, muted = true) {
  if (window.mediaPlayerEngine && typeof window.mediaPlayerEngine.getYouTubeEmbedUrl === 'function') {
    return window.mediaPlayerEngine.getYouTubeEmbedUrl(url, muted);
  }
  if (!url) return '';
  const regExp = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/;
  const match = url.match(regExp);
  const videoId = (match && match[1]) ? match[1] : null;
  if (!videoId) return url;
  const muteParam = muted ? 1 : 0;
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muteParam}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
}

function playStream(url, options = {}) {
  if (window.mediaPlayerEngine && typeof window.mediaPlayerEngine.playStream === 'function') {
    return window.mediaPlayerEngine.playStream(url, options);
  }
}

function setupMediaStream(url, type, isMuted, volume) {
  if (window.mediaPlayerEngine && typeof window.mediaPlayerEngine.setupMediaStream === 'function') {
    return window.mediaPlayerEngine.setupMediaStream(url, type, isMuted, volume);
  }

  const video = document.getElementById('hls-video') || document.getElementById('kioskVideoPlayer') || document.getElementById('kioskVideo');
  const iframe = document.getElementById('kioskIframePlayer') || document.getElementById('kioskIframe');
  const stageMedia = document.getElementById('persistent-stream-container') || document.getElementById('stageMediaLayer');
  const stageSlides = document.getElementById('stageSlidesLayer');
  const fallbackLayer = document.getElementById('mediaFallbackLayer');
  const fallbackTitle = document.getElementById('fallbackTitle');
  const fallbackDesc = document.getElementById('fallbackDesc');
  const badgeText = document.getElementById('mediaBadgeText');

  const normalizedType = (type || 'slides').toLowerCase();

  // 1. Source: SLIDES
  if (normalizedType === 'slides') {
    if (stageMedia) stageMedia.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (stageSlides) stageSlides.style.display = 'block';
    if (video) { video.pause(); video.src = ''; }
    if (iframe) { iframe.src = ''; }
    currentLoadedMediaUrl = null;
    return;
  }

  // 2. Source: VIDEO (MP4 looping)
  if (normalizedType === 'video' || normalizedType === 'mp4') {
    if (!url || url.trim() === '') {
      if (stageMedia) stageMedia.style.display = 'none';
      if (stageSlides) stageSlides.style.display = 'block';
      if (fallbackLayer) {
        fallbackLayer.style.display = 'flex';
        if (fallbackTitle) fallbackTitle.textContent = 'Fail Video Tidak Ditetapkan';
        if (fallbackDesc) fallbackDesc.textContent = 'Sila pilih atau muat naik fail video MP4 di Panel Pentadbir. Slaid poster dipaparkan secara automatik.';
      }
      if (video) { video.pause(); video.src = ''; }
      if (iframe) { iframe.src = ''; }
      currentLoadedMediaUrl = null;
      return;
    }

    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (stageSlides) stageSlides.style.display = 'none';
    if (stageMedia) stageMedia.style.display = 'block';
    if (iframe) { iframe.style.display = 'none'; iframe.src = ''; }

    if (video) {
      video.style.display = 'block';
      video.volume = Math.max(0, Math.min(1, volume / 100));
      video.muted = isMuted;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      if (isMuted) video.setAttribute('muted', '');

      if (currentLoadedMediaUrl !== url) {
        currentLoadedMediaUrl = url;
        video.src = url;
        video.load();
        video.play().catch(err => {
          console.warn('[KIOSK] Video playback error:', err.message);
        });
      } else if (video.paused && !video.ended) {
        video.play().catch(() => {});
      }

      if (badgeText) badgeText.textContent = 'VIDEO KULIAH MP4';
    }
    return;
  }

  // 3. Source: STREAM (HLS / RTSP / YouTube)
  if (normalizedType === 'stream' || normalizedType === 'hls' || normalizedType === 'youtube') {
    if (!url || url.trim() === '') {
      if (stageMedia) stageMedia.style.display = 'none';
      if (stageSlides) stageSlides.style.display = 'block';
      if (fallbackLayer) {
        fallbackLayer.style.display = 'flex';
        if (fallbackTitle) fallbackTitle.textContent = 'Pautan Strim Belum Ditetapkan';
        if (fallbackDesc) fallbackDesc.textContent = 'Sila masukkan URL strim langsung yang sah (HLS .m3u8 atau YouTube Live) di Panel Pentadbir.';
      }
      if (video) { video.pause(); video.src = ''; }
      if (iframe) { iframe.src = ''; }
      currentLoadedMediaUrl = null;
      return;
    }

    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (stageSlides) stageSlides.style.display = 'none';
    if (stageMedia) stageMedia.style.display = 'block';

    // YouTube Live / Embed
    if (normalizedType === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      if (video) { video.style.display = 'none'; video.pause(); }
      if (iframe) {
        iframe.style.display = 'block';
        const embedUrl = getYouTubeEmbedUrl(url, isMuted);
        if (iframe.src !== embedUrl) {
          iframe.src = embedUrl;
        }
      }
      if (badgeText) badgeText.textContent = 'YOUTUBE LIVE';
      currentLoadedMediaUrl = url;
      return;
    }

    // HTML5 HLS or Direct Stream
    if (iframe) { iframe.style.display = 'none'; iframe.src = ''; }
    if (video) {
      video.style.display = 'block';
      video.volume = Math.max(0, Math.min(1, volume / 100));
      video.muted = isMuted;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      if (isMuted) video.setAttribute('muted', '');

      if (currentLoadedMediaUrl !== url) {
        currentLoadedMediaUrl = url;
        const isHls = url.includes('.m3u8') || normalizedType === 'hls';

        if (isHls && window.Hls && window.Hls.isSupported()) {
          if (hlsInstance) hlsInstance.destroy();
          hlsInstance = new window.Hls({ autoStartLoad: true });
          hlsInstance.loadSource(url);
          hlsInstance.attachMedia(video);
          hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
            video.muted = isMuted;
            video.play().catch(e => console.log('Autoplay blocked:', e));
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.muted = isMuted;
          video.play().catch(e => console.log('Autoplay blocked:', e));
        } else {
          video.src = url;
          video.load();
          video.play().catch(e => console.log('Autoplay blocked:', e));
        }

        if (badgeText) badgeText.textContent = isHls ? 'STRIM LANGSUNG HLS' : 'SIARAN LANGSUNG KULIAH';
      } else if (video.paused && !video.ended) {
        video.play().catch(() => {});
      }
    }
  }
}

// 2. Slideshow Manager
const DEFAULT_SLIDES = [
  { id: 1, title: 'Adab & Hadis Masjid', file_url: '/assets/slides/slide1.svg', media_type: 'image', duration: 12 },
  { id: 2, title: 'Peringatan Rapatkan Saf', file_url: '/assets/slides/slide2.svg', media_type: 'image', duration: 12 },
  { id: 3, title: 'Tabung Infaq & Wakaf', file_url: '/assets/slides/slide3.svg', media_type: 'image', duration: 15 }
];

function isSlideActiveToday(slide) {
  if (!slide || !slide.days_active || slide.days_active === 'all' || slide.days_active === '') return true;
  const daysMap = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
  const engMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const todayIdx = new Date().getDay();
  const myDay = daysMap[todayIdx];
  const engDay = engMap[todayIdx];
  
  const rules = String(slide.days_active).toUpperCase().split(',').map(s => s.trim());
  return rules.includes(myDay) || rules.includes(engDay) || rules.includes('ALL');
}

function renderSlides(slides) {
  const filtered = (slides && slides.length > 0) ? slides.filter(isSlideActiveToday) : [];
  const activeSlides = (filtered && filtered.length > 0) ? filtered : ((slides && slides.length > 0) ? slides : DEFAULT_SLIDES);

  // Check if slides list has changed
  const newIds = activeSlides.map(s => (s.id || s.title) + s.file_url).join('|');
  const oldIds = slidesList.map(s => (s.id || s.title) + s.file_url).join('|');

  if (newIds === oldIds && slidesList.length > 0) return;

  slidesList = activeSlides;
  const container = document.getElementById('slidesContainer');
  const dotsContainer = document.getElementById('slideIndicators');
  if (!container) return;
  container.innerHTML = '';
  if (dotsContainer) dotsContainer.innerHTML = '';

  slidesList.forEach((slide, idx) => {
    const div = document.createElement('div');
    div.className = `slide-item ${idx === 0 ? 'active' : ''}`;
    div.dataset.index = idx;

    if (slide.media_type === 'video') {
      const vid = document.createElement('video');
      vid.src = slide.file_url;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      div.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = slide.file_url;
      img.alt = slide.title || 'Slide';
      div.appendChild(img);
    }

    container.appendChild(div);

    if (dotsContainer) {
      const dot = document.createElement('div');
      dot.className = `dot ${idx === 0 ? 'active' : ''}`;
      dotsContainer.appendChild(dot);
    }
  });

  currentSlideIndex = 0;
  
  // Only start slide timer if slides layer is actually visible
  const stageSlides = document.getElementById('stageSlidesLayer');
  if (stageSlides && stageSlides.style.display !== 'none') {
    restartSlideTimer();
  }
}

function nextSlide() {
  if (slidesList.length <= 1) return;
  const stageSlides = document.getElementById('stageSlidesLayer');
  if (stageSlides && stageSlides.style.display === 'none') return;

  const items = document.querySelectorAll('.slide-item');
  const dots = document.querySelectorAll('.dot');

  if (items.length === 0) return;

  items[currentSlideIndex].classList.remove('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.remove('active');

  currentSlideIndex = (currentSlideIndex + 1) % items.length;

  items[currentSlideIndex].classList.add('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.add('active');
}

function pauseSlideTimer() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function resumeSlideTimer() {
  const stageSlides = document.getElementById('stageSlidesLayer');
  if (stageSlides && stageSlides.style.display === 'none') return;
  if (!slideTimer && slidesList.length > 1) {
    const durationSec = (slidesList[currentSlideIndex] && slidesList[currentSlideIndex].duration) || 12;
    slideTimer = setInterval(nextSlide, durationSec * 1000);
  }
}

function restartSlideTimer() {
  pauseSlideTimer();
  const stageSlides = document.getElementById('stageSlidesLayer');
  if (stageSlides && stageSlides.style.display === 'none') return;
  const durationSec = (slidesList[currentSlideIndex] && slidesList[currentSlideIndex].duration) || 12;
  slideTimer = setInterval(nextSlide, durationSec * 1000);
}

window.pauseSlideTimer = pauseSlideTimer;
window.resumeSlideTimer = resumeSlideTimer;

// 2b. Bottom Card Cycling Manager (Infaq QR <-> Next Kuliah <-> Hijri Countdown <-> Hadith)
let bottomCycleTimer = null;
let currentCycleSlide = 0; // 0=infaq, 1=kuliah, 2=hijri_event, 3=hadith

const DAILY_HADITHS = [
  { text: "Sebaik-baik amalan adalah solat pada awal waktunya.", ref: "HR. Al-Bukhari & Muslim" },
  { text: "Solat berjemaah itu lebih afdal daripada solat bersendirian dengan 27 darjat.", ref: "HR. Al-Bukhari & Muslim" },
  { text: "Sesiapa yang membina masjid kerana Allah, Allah bina untuknya istana di syurga.", ref: "HR. Muslim" },
  { text: "Senyumanmu kepada saudaramu adalah sedekah.", ref: "HR. At-Tirmizi" },
  { text: "Kebersihan dan kesucian itu adalah sebahagian daripada cabang iman.", ref: "HR. Muslim" },
  { text: "Permudahkanlah urusan dan jangan kamu menyukarkannya.", ref: "HR. Al-Bukhari" },
  { text: "Orang yang paling dekat denganku di hari kiamat adalah yang paling banyak berselawat ke atasku.", ref: "HR. At-Tirmizi" }
];

function isCurrentSlideInfaq() {
  if (!slidesList || slidesList.length === 0) return false;
  const slide = slidesList[currentSlideIndex];
  if (!slide) return false;
  const str = `${slide.title || ''} ${slide.file_url || ''}`.toLowerCase();
  return str.includes('infaq') || str.includes('wakaf') || str.includes('duitnow') || str.includes('qr') || str.includes('derma') || str.includes('tabung');
}

function updateHadithContent() {
  const hadithText = document.getElementById('sideHadithText');
  const hadithRef = document.getElementById('sideHadithRef');
  const hadithSource = document.getElementById('sideHadithSource');
  if (!hadithText) return;
  const dayIdx = new Date().getDay() % DAILY_HADITHS.length;
  const item = DAILY_HADITHS[dayIdx] || DAILY_HADITHS[0];
  hadithText.textContent = `"${item.text}"`;
  if (hadithRef) hadithRef.textContent = item.ref;
  if (hadithSource) hadithSource.textContent = item.ref;
}

function updateHijriEventCard(hijriStr) {
  try {
    if (!window.HijriCountdown) return;
    const eventInfo = window.HijriCountdown.getNextEvent(hijriStr || null);
    if (!eventInfo) return;
    const nameEl = document.getElementById('sideHijriEventName');
    const daysEl = document.getElementById('sideHijriEventDays');
    if (nameEl && eventInfo.name) nameEl.textContent = eventInfo.name;
    if (daysEl && eventInfo.days !== undefined) daysEl.textContent = eventInfo.days;
  } catch (err) {
    console.warn('[HIJRI] Could not update Hijri event card:', err);
  }
}

function startBottomWidgetCycle() {
  if (bottomCycleTimer) return;
  updateHadithContent();
  updateHijriEventCard(null);

  const slides = [
    { id: 'cycleSlideInfaq', dot: 'dotCycle0', isInfaq: true },
    { id: 'cycleSlideKuliah', dot: 'dotCycle1', isInfaq: false },
    { id: 'cycleSlideHijriEvent', dot: 'dotCycle2', isInfaq: false },
    { id: 'cycleSlideHadith', dot: 'dotCycle3', isInfaq: false },
    { id: 'cycleSlideRoster', dot: 'dotCycle4', isInfaq: false },
    { id: 'cycleSlideTabung', dot: 'dotCycle5', isInfaq: false }
  ];

  bottomCycleTimer = setInterval(() => {
    // Smart Infaq Deduplication: If center main stage displays Infaq/QR, skip right-side Infaq card
    const skipInfaq = isCurrentSlideInfaq();
    let availableIndices = [0, 1, 2, 3, 4, 5];
    if (skipInfaq) {
      availableIndices = [1, 2, 3, 4, 5];
    }

    let nextIdxPos = availableIndices.indexOf(currentCycleSlide);
    if (nextIdxPos === -1) {
      currentCycleSlide = availableIndices[0];
    } else {
      currentCycleSlide = availableIndices[(nextIdxPos + 1) % availableIndices.length];
    }

    slides.forEach((s, idx) => {
      const el = document.getElementById(s.id);
      const d = document.getElementById(s.dot);
      if (el) {
        if (idx === currentCycleSlide) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
      if (d) {
        if (idx === currentCycleSlide) {
          d.classList.add('active');
        } else {
          d.classList.remove('active');
        }
      }
    });
  }, 10000);
}

// 2c. Dynamic Azan Audio Playback Engine
let currentAdhanAudio = null;
let adhanFadeTimer = null;
let adhanFallbackTimer = null;
let isDoaScreenActive = false;

function showDoaSelepasAzan() {
  if (adhanFallbackTimer) {
    clearTimeout(adhanFallbackTimer);
    adhanFallbackTimer = null;
  }
  isDoaScreenActive = true;

  const overlayAdhan = document.getElementById('overlayAdhan');
  const overlayDoa = document.getElementById('overlayDoa');
  if (overlayAdhan) overlayAdhan.classList.remove('show');
  if (overlayDoa) overlayDoa.classList.add('show');
}

function playKioskAdhan(prayer, settings) {
  stopKioskAdhan(false);
  stopPreAdhanNotificationAudio();
  isDoaScreenActive = false;
  if (adhanFallbackTimer) {
    clearTimeout(adhanFallbackTimer);
    adhanFallbackTimer = null;
  }

  const isSubuh = (prayer && (prayer.toLowerCase() === 'subuh' || prayer.toLowerCase() === 'fajr'));
  const pKey = prayer ? prayer.toLowerCase() : '';
  const adhanMode = (settings && (settings[`adhan_mode_${pKey}`] || settings.adhan_mode)) || 'auto';

  const rawVol = (settings && typeof settings.audio_volume !== 'undefined')
    ? settings.audio_volume
    : (settings && typeof settings.audio_azan_volume !== 'undefined' ? settings.audio_azan_volume : 80);
  const volume = Math.max(0, Math.min(100, parseInt(rawVol, 10))) / 100;

  if (adhanMode === 'silent') {
    // Mute / Silent Mode: Reasonable fallback timer before transitioning to Doa Selepas Azan (e.g., 3.5 to 4.5 minutes)
    const silentDurationSec = isSubuh ? 270 : 210;
    adhanFallbackTimer = setTimeout(() => {
      showDoaSelepasAzan();
    }, silentDurationSec * 1000);
    return;
  }

  if (adhanMode === 'beep') {
    if (audioBeep) {
      try {
        audioBeep.currentTime = 0;
        audioBeep.volume = volume;
        audioBeep.play().catch(() => {});
      } catch (_) {}
    }
    // Beep Mode fallback timer before switching to Doa
    adhanFallbackTimer = setTimeout(() => {
      showDoaSelepasAzan();
    }, 15000);
    return;
  }

  // Build prioritized candidate list for Subuh or Regular Azan
  const candidates = [];
  if (isSubuh) {
    const custom = settings && (settings.audio_azan_subuh || settings.audio_azan_subuh_file);
    if (custom) {
      candidates.push(custom.startsWith('/') || custom.startsWith('http') ? custom : `/kiosk/audio/azan/${custom}`);
      candidates.push(`/assets/audio/${custom}`);
    }
    candidates.push('/kiosk/audio/azan/azan_subuh.mp3');
    candidates.push('/kiosk/audio/azan/azan_subuh_special.mp3');
    candidates.push('/assets/audio/adhan_subuh.mp3');
    candidates.push('/assets/audio/azan_subuh.mp3');
  } else {
    const custom = settings && (settings.audio_azan_regular || settings.audio_azan_standard_file);
    if (custom) {
      candidates.push(custom.startsWith('/') || custom.startsWith('http') ? custom : `/kiosk/audio/azan/${custom}`);
      candidates.push(`/assets/audio/${custom}`);
    }
    candidates.push('/kiosk/audio/azan/azan_mekah.mp3');
    candidates.push('/kiosk/audio/azan/azan_lazim.mp3');
    candidates.push('/assets/audio/adhan.mp3');
    candidates.push('/assets/audio/azan_lazim.mp3');
  }

  // Remove duplicate URLs
  const uniqueCandidates = [...new Set(candidates)];
  let candidateIndex = 0;

  function tryNextCandidate() {
    if (candidateIndex >= uniqueCandidates.length) {
      console.warn('[KIOSK] All primary candidate paths failed. Attempting preloaded DOM fallback audio...');
      const fallback = isSubuh ? (audioSubuh || document.getElementById('audioSubuh')) : (audioAdhan || document.getElementById('audioAdhan'));
      if (fallback) {
        try {
          fallback.volume = volume;
          fallback.currentTime = 0;
          currentAdhanAudio = fallback;
          fallback.addEventListener('ended', () => {
            console.log('[KIOSK] Fallback adhan audio finished. Transitioning to Doa.');
            showDoaSelepasAzan();
          }, { once: true });
          const p = fallback.play();
          if (p !== undefined) {
            p.catch(e => {
              console.warn('[KIOSK] DOM fallback audio play failed (autoplay block?):', e);
              const fallbackTimeoutSec = isSubuh ? 270 : 210;
              adhanFallbackTimer = setTimeout(() => showDoaSelepasAzan(), fallbackTimeoutSec * 1000);
            });
          }
        } catch (e) {
          const fallbackTimeoutSec = isSubuh ? 270 : 210;
          adhanFallbackTimer = setTimeout(() => showDoaSelepasAzan(), fallbackTimeoutSec * 1000);
        }
      } else {
        const fallbackTimeoutSec = isSubuh ? 270 : 210;
        adhanFallbackTimer = setTimeout(() => showDoaSelepasAzan(), fallbackTimeoutSec * 1000);
      }
      return;
    }

    const currentUrl = uniqueCandidates[candidateIndex];
    candidateIndex++;

    try {
      const audio = new Audio(currentUrl);
      audio.volume = volume;
      currentAdhanAudio = audio;

      audio.addEventListener('ended', () => {
        console.log(`[KIOSK] Azan audio (${currentUrl}) completed 100%. Transitioning to Doa Selepas Azan.`);
        showDoaSelepasAzan();
      });

      audio.addEventListener('error', (err) => {
        console.warn(`[KIOSK] Error loading azan audio (${currentUrl}):`, err);
        tryNextCandidate();
      });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn(`[KIOSK] Play error on ${currentUrl}:`, err.message);
          tryNextCandidate();
        });
      }
    } catch (err) {
      console.warn(`[KIOSK] Exception creating Audio for ${currentUrl}:`, err);
      tryNextCandidate();
    }
  }

  // Safety fallback timer in case audio stalls or network fails
  const maxSafetySec = isSubuh ? 310 : 260;
  adhanFallbackTimer = setTimeout(() => {
    if (!isDoaScreenActive && (!currentAdhanAudio || currentAdhanAudio.paused || currentAdhanAudio.ended)) {
      showDoaSelepasAzan();
    }
  }, maxSafetySec * 1000);

  // Start playback sequence
  tryNextCandidate();
}

function stopKioskAdhan(fade = true) {
  if (adhanFadeTimer) {
    clearInterval(adhanFadeTimer);
    adhanFadeTimer = null;
  }
  if (adhanFallbackTimer) {
    clearTimeout(adhanFallbackTimer);
    adhanFallbackTimer = null;
  }

  // Also stop static fallbacks
  if (audioAdhan) { try { audioAdhan.pause(); audioAdhan.currentTime = 0; } catch (_) {} }
  if (audioSubuh) { try { audioSubuh.pause(); audioSubuh.currentTime = 0; } catch (_) {} }

  if (!currentAdhanAudio) return;
  const audio = currentAdhanAudio;

  if (fade && audio.volume > 0.05 && !audio.paused) {
    adhanFadeTimer = setInterval(() => {
      if (audio.volume > 0.1) {
        audio.volume = Math.max(0, audio.volume - 0.15);
      } else {
        clearInterval(adhanFadeTimer);
        adhanFadeTimer = null;
        audio.pause();
        audio.currentTime = 0;
        if (currentAdhanAudio === audio) currentAdhanAudio = null;
      }
    }, 80);
  } else {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (_) {}
    currentAdhanAudio = null;
  }
}

// Pre-Adhan Warning Chime Notification (Soft single harmonic chime, non-looping)
let preAdhanAudioTimer = null;
let currentPreAdhanAudio = null;
let preAdhanAudioCtx = null;

function playSoftWarningChime(volume = 0.6) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!preAdhanAudioCtx || preAdhanAudioCtx.state === 'closed') {
        preAdhanAudioCtx = new AudioContextClass();
      }
      if (preAdhanAudioCtx.state === 'suspended') {
        preAdhanAudioCtx.resume().catch(() => {});
      }
      const ctx = preAdhanAudioCtx;
      const now = ctx.currentTime;
      const targetGain = Math.max(0.01, Math.min(0.35, volume * 0.35));

      // Dual harmonic chime tones with soft exponential decay
      function triggerChimeTone(t, f1, f2, dur = 0.8) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, t);
        osc1.frequency.exponentialRampToValueAtTime(f1 * 0.99, t + dur);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(f2, t);
        osc2.frequency.exponentialRampToValueAtTime(f2 * 0.99, t + dur * 0.8);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(targetGain, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + dur + 0.05);
        osc2.stop(t + dur + 0.05);
      }

      // Soft harmonic chime pair (E5 + B5 followed by G#5 + E6)
      triggerChimeTone(now, 659.25, 987.77, 0.85);
      triggerChimeTone(now + 0.40, 830.61, 1318.5, 1.10);
      return;
    }
  } catch (e) {
    console.warn('[KIOSK] WebAudio chime notice, fallback to audio element:', e);
  }

  // Fallback to pre-recorded pre_adhan audio element (non-looping)
  try {
    const audio = audioPreAdhan || new Audio('/assets/audio/pre_adhan.wav');
    audio.loop = false;
    audio.volume = volume;
    audio.currentTime = 0;
    currentPreAdhanAudio = audio;
    audio.play().catch(() => {});
  } catch (_) {}
}

function playPreAdhanNotificationAudio(settings) {
  stopPreAdhanNotificationAudio();

  const rawVol = (settings && typeof settings.audio_volume !== 'undefined')
    ? settings.audio_volume
    : (settings && typeof settings.audio_azan_volume !== 'undefined' ? settings.audio_azan_volume : 80);
  const volume = Math.max(0, Math.min(100, parseInt(rawVol, 10))) / 100;

  playSoftWarningChime(volume);
}

function stopPreAdhanNotificationAudio() {
  if (preAdhanAudioTimer) {
    clearTimeout(preAdhanAudioTimer);
    preAdhanAudioTimer = null;
  }

  if (currentPreAdhanAudio) {
    try {
      currentPreAdhanAudio.pause();
      currentPreAdhanAudio.currentTime = 0;
    } catch (_) {}
    currentPreAdhanAudio = null;
  }

  if (audioBeep) {
    try {
      audioBeep.pause();
      audioBeep.currentTime = 0;
    } catch (_) {}
  }
  if (audioPreAdhan) {
    try {
      audioPreAdhan.pause();
      audioPreAdhan.currentTime = 0;
    } catch (_) {}
  }
}

function playTripleBeepNotification(volume = 0.8) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!preAdhanAudioCtx || preAdhanAudioCtx.state === 'closed') {
        preAdhanAudioCtx = new AudioContextClass();
      }
      if (preAdhanAudioCtx.state === 'suspended') {
        preAdhanAudioCtx.resume().catch(() => {});
      }
      const ctx = preAdhanAudioCtx;
      const now = ctx.currentTime;
      const targetVol = Math.max(0.01, Math.min(0.4, volume * 0.4));

      // 3 crisp distinct notification chimes/beeps
      [0, 0.65, 1.30].forEach((offset, idx) => {
        const t = now + offset;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(idx === 2 ? 1046.5 : 880, t);
        osc1.frequency.exponentialRampToValueAtTime(idx === 2 ? 987.77 : 800, t + 0.35);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(idx === 2 ? 1567.98 : 1320, t);
        osc2.frequency.exponentialRampToValueAtTime(idx === 2 ? 1480 : 1200, t + 0.30);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(targetVol, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (idx === 2 ? 0.55 : 0.40));

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + (idx === 2 ? 0.60 : 0.45));
        osc2.stop(t + (idx === 2 ? 0.60 : 0.45));
      });
      return;
    }
  } catch (e) {
    console.warn('[KIOSK] WebAudio triple beep error, falling back:', e);
  }

  // Fallback: Audio element repeated 3 times
  let count = 0;
  const playBeep = () => {
    if (count >= 3) return;
    try {
      const audio = new Audio('/assets/audio/beep.wav');
      audio.volume = volume;
      audio.play().catch(() => {});
      count++;
      if (count < 3) {
        setTimeout(playBeep, 650);
      }
    } catch (_) {}
  };
  playBeep();
}

let safAudioCtx = null;

function playSafAlertBeeps(volume = 0.8) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!safAudioCtx || safAudioCtx.state === 'closed') {
        safAudioCtx = new AudioContextClass();
      }
      if (safAudioCtx.state === 'suspended') {
        safAudioCtx.resume().catch(() => {});
      }
      const ctx = safAudioCtx;
      const now = ctx.currentTime;
      const targetGain = Math.max(0.01, Math.min(0.5, volume * 0.45));

      function singleTone(time, duration = 0.18, freq = 950) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(targetGain, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
      }

      // Pasangan 1 (Beep Beep)
      singleTone(now + 0.0, 0.18, 950);
      singleTone(now + 0.25, 0.18, 950);

      // Pasangan 2 (Beep Beep) - jeda 600ms
      singleTone(now + 0.9, 0.18, 950);
      singleTone(now + 1.15, 0.18, 950);

      // Pasangan 3 (Beep Beep) - jeda 600ms
      singleTone(now + 1.8, 0.18, 950);
      singleTone(now + 2.05, 0.18, 950);
      return;
    }
  } catch (e) {
    console.warn('[KIOSK] WebAudio Saf alert beeps notice, falling back to audio element:', e);
  }

  // Fallback using HTML5 audio element (3 pairs of beeps)
  const playPair = (pairIdx) => {
    if (pairIdx >= 3) return;
    try {
      const b1 = new Audio('/assets/audio/beep.wav');
      b1.volume = volume;
      b1.play().catch(() => {});
      setTimeout(() => {
        try {
          const b2 = new Audio('/assets/audio/beep.wav');
          b2.volume = volume;
          b2.play().catch(() => {});
        } catch (_) {}
      }, 250);
    } catch (_) {}
    if (pairIdx < 2) {
      setTimeout(() => playPair(pairIdx + 1), 900);
    }
  };
  playPair(0);
}

// Function to immediately stop and silence all audio
function silenceAllKioskAudio() {
  stopKioskAdhan(false);
  stopPreAdhanNotificationAudio();
  if (audioAdhan) { try { audioAdhan.pause(); audioAdhan.currentTime = 0; } catch (_) {} }
  if (audioSubuh) { try { audioSubuh.pause(); audioSubuh.currentTime = 0; } catch (_) {} }
  if (audioBeep) { try { audioBeep.pause(); audioBeep.currentTime = 0; } catch (_) {} }
  if (audioPreAdhan) { try { audioPreAdhan.pause(); audioPreAdhan.currentTime = 0; } catch (_) {} }
  if (currentAdhanAudio) {
    try {
      currentAdhanAudio.pause();
      currentAdhanAudio.currentTime = 0;
    } catch (_) {}
    currentAdhanAudio = null;
  }
}

// Global audio unlock on first user gesture or browser event
let isAudioUnlocked = false;
function unlockKioskAudioContext() {
  if (isAudioUnlocked) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!preAdhanAudioCtx || preAdhanAudioCtx.state === 'closed') {
        preAdhanAudioCtx = new AudioContextClass();
      }
      if (preAdhanAudioCtx.state === 'suspended') {
        preAdhanAudioCtx.resume().catch(() => {});
      }
      if (!safAudioCtx || safAudioCtx.state === 'closed') {
        safAudioCtx = new AudioContextClass();
      }
      if (safAudioCtx.state === 'suspended') {
        safAudioCtx.resume().catch(() => {});
      }
    }

    // Pre-warm HTML5 audio elements with instant silent play/pause
    [audioAdhan, audioSubuh, audioBeep, audioPreAdhan].forEach(el => {
      if (el) {
        try {
          const prevVol = el.volume;
          el.volume = 0;
          const p = el.play();
          if (p !== undefined) {
            p.then(() => {
              el.pause();
              el.currentTime = 0;
              el.volume = prevVol;
            }).catch(() => {});
          }
        } catch (_) {}
      }
    });

    isAudioUnlocked = true;
    console.log('[KIOSK] Audio context and media elements successfully unlocked.');
  } catch (err) {
    console.warn('[KIOSK] Audio unlock notice:', err);
  }
}

['click', 'touchstart', 'pointerdown', 'keydown', 'wheel', 'mousedown'].forEach(evtName => {
  window.addEventListener(evtName, unlockKioskAudioContext, { passive: true, once: true });
});

// 2d. Running Ticker / Marquee Manager
let currentTickerText = '';
let pendingTickerText = null;
let isTickerInitialized = false;

function initTickerSystem() {
  const tickerEl = document.getElementById('tickerContent') || document.getElementById('tickerText');
  if (!tickerEl) return;

  tickerEl.addEventListener('animationiteration', () => {
    if (pendingTickerText && pendingTickerText !== currentTickerText) {
      applyTickerTextAndDuration(tickerEl, pendingTickerText);
    } else {
      recalcTickerBounds(tickerEl);
    }
  });

  tickerEl.addEventListener('animationend', () => {
    if (pendingTickerText && pendingTickerText !== currentTickerText) {
      applyTickerTextAndDuration(tickerEl, pendingTickerText);
    }
  });

  window.addEventListener('resize', () => {
    recalcTickerBounds(tickerEl);
  });
}

function recalcTickerBounds(tickerEl) {
  if (!tickerEl) return;
  const wrapper = tickerEl.parentElement || document.getElementById('tickerWrapper');
  const wrapperWidth = wrapper ? wrapper.offsetWidth : window.innerWidth;
  const textWidth = tickerEl.scrollWidth || 500;

  tickerEl.style.setProperty('--marquee-start', `${wrapperWidth}px`);
  tickerEl.style.setProperty('--marquee-end', `-${textWidth + 60}px`);

  const speed = 65; // pixels per second for comfortable reading speed
  const totalDistance = wrapperWidth + textWidth + 60;
  const duration = Math.max(12, totalDistance / speed);
  tickerEl.style.animationDuration = `${duration}s`;
}

function updateTickerDisplay(newText, forceImmediate = false) {
  const tickerEl = document.getElementById('tickerContent') || document.getElementById('tickerText');
  if (!tickerEl) return;

  const text = (newText || '').trim();
  if (!text) return;

  if (!isTickerInitialized) {
    initTickerSystem();
    isTickerInitialized = true;
  }

  if (text === currentTickerText && !forceImmediate) {
    return;
  }

  if (!currentTickerText || forceImmediate) {
    applyTickerTextAndDuration(tickerEl, text);
  } else {
    pendingTickerText = text;
  }
}

function applyTickerTextAndDuration(tickerEl, text) {
  currentTickerText = text;
  pendingTickerText = null;
  tickerEl.textContent = text;

  const wrapper = tickerEl.parentElement || document.getElementById('tickerWrapper');
  const wrapperWidth = wrapper ? wrapper.offsetWidth : window.innerWidth;
  const textWidth = tickerEl.scrollWidth || (text.length * 18);

  tickerEl.style.setProperty('--marquee-start', `${wrapperWidth}px`);
  tickerEl.style.setProperty('--marquee-end', `-${textWidth + 60}px`);

  const speed = 65; // pixels per second
  const totalDistance = wrapperWidth + textWidth + 60;
  const duration = Math.max(12, totalDistance / speed);

  tickerEl.style.animation = 'none';
  void tickerEl.offsetWidth; // force DOM reflow
  tickerEl.style.animation = `marqueeLinear ${duration}s linear infinite`;
}

// 3. Overlay State Switcher
function applyState(data) {
  const overlays = {
    PRE_ADHAN: document.getElementById('overlayPreAdhan'),
    ADHAN: document.getElementById('overlayAdhan'),
    DOA_ADHAN: document.getElementById('overlayDoa'),
    IQAMAH: document.getElementById('overlayIqamah'),
    SOLAT: document.getElementById('overlaySolat'),
    LIVE_CAM: document.getElementById('overlayLiveCam'),
    LOCKED: document.getElementById('overlayLocked')
  };

  // Hide all overlays first
  Object.values(overlays).forEach(el => {
    if (el) el.classList.remove('show');
  });

  const state = data.state || 'NORMAL';
  const prayer = data.active_prayer || 'Zohor';
  const sec = data.countdown_seconds || 0;
  const isPhaseTransition = (lastOverlayPhase !== state);

  if (state === 'LOCKED') {
    silenceAllKioskAudio();
    overlays.LOCKED.classList.add('show');
    document.getElementById('lockedHwid').textContent = data.hwid || 'ESOLAT-XXXX-XXXX-XXXX';
    document.getElementById('lockedIp').textContent = window.location.hostname || 'localhost';
    lastOverlayPhase = state;
    return;
  }

  if (state === 'LIVE_CAM') {
    if (overlays.LIVE_CAM) overlays.LIVE_CAM.classList.add('show');
    if (!window.liveCameraStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          window.liveCameraStream = stream;
          const vid = document.getElementById('liveCamVideo');
          if (vid) vid.srcObject = stream;
        }).catch(err => {
          console.warn('[KIOSK] Camera stream notice:', err.message);
        });
    }
  } else {
    if (window.liveCameraStream) {
      window.liveCameraStream.getTracks().forEach(t => t.stop());
      window.liveCameraStream = null;
    }
  }

  if (state === 'PRE_ADHAN') {
    isDoaScreenActive = false;
    overlays.PRE_ADHAN.classList.add('show');
    document.getElementById('preAdhanPrayer').textContent = prayer.toUpperCase();
    document.getElementById('preAdhanCounter').textContent = formatSeconds(sec);

    if (isPhaseTransition) {
      silenceAllKioskAudio();
      playPreAdhanNotificationAudio(data.settings || {});
    }
  } else if (state === 'ADHAN') {
    stopPreAdhanNotificationAudio();
    if (isPhaseTransition) {
      isDoaScreenActive = false;
      silenceAllKioskAudio();
      playKioskAdhan(prayer, data.settings || {});
    }

    if (isDoaScreenActive) {
      overlays.DOA_ADHAN.classList.add('show');
    } else {
      overlays.ADHAN.classList.add('show');
      document.getElementById('adhanPrayerName').textContent = prayer.toUpperCase();
      document.getElementById('adhanTimer').textContent = formatSeconds(sec);
    }
  } else if (state === 'DOA_ADHAN') {
    stopPreAdhanNotificationAudio();
    // If Azan audio is STILL actively playing, keep showing ADHAN overlay and DO NOT stop audio!
    const isAdhanStillPlaying = currentAdhanAudio && !currentAdhanAudio.paused && !currentAdhanAudio.ended;
    if (isAdhanStillPlaying && !isDoaScreenActive) {
      overlays.ADHAN.classList.add('show');
      document.getElementById('adhanPrayerName').textContent = prayer.toUpperCase();
      document.getElementById('adhanTimer').textContent = formatSeconds(sec);
    } else {
      overlays.DOA_ADHAN.classList.add('show');
      if (lastOverlayPhase === 'ADHAN' && !isAdhanStillPlaying) {
        stopKioskAdhan(true);
      }
    }
  } else if (state === 'IQAMAH') {
    isDoaScreenActive = false;
    stopPreAdhanNotificationAudio();
    overlays.IQAMAH.classList.add('show');
    document.getElementById('iqamahPrayerName').textContent = `SOLAT ${prayer.toUpperCase()}`;
    document.getElementById('iqamahDigits').textContent = formatSeconds(sec);
    if (lastOverlayPhase === 'ADHAN' || lastOverlayPhase === 'DOA_ADHAN') {
      stopKioskAdhan(true);
    }
    if (isPhaseTransition) {
      silenceAllKioskAudio();
      const rawVol = (data.settings && typeof data.settings.audio_volume !== 'undefined')
        ? data.settings.audio_volume
        : (data.settings && typeof data.settings.audio_azan_volume !== 'undefined' ? data.settings.audio_azan_volume : 80);
      const volume = Math.max(0, Math.min(100, parseInt(rawVol, 10))) / 100;
      playTripleBeepNotification(volume);
    }
  } else if (state === 'SOLAT') {
    isDoaScreenActive = false;
    stopPreAdhanNotificationAudio();
    overlays.SOLAT.classList.add('show');

    // 100% SILENCE during Solat in progress
    if (isPhaseTransition) {
      silenceAllKioskAudio();
      // Saf alert notification: 3 pairs of twin beeps (Beep Beep x 3)
      if (lastOverlayPhase === 'IQAMAH' || lastOverlayPhase === 'DOA_ADHAN' || lastOverlayPhase === 'ADHAN') {
        const rawVol = (data.settings && typeof data.settings.audio_volume !== 'undefined')
          ? data.settings.audio_volume
          : (data.settings && typeof data.settings.audio_azan_volume !== 'undefined' ? data.settings.audio_azan_volume : 80);
        const volume = Math.max(0, Math.min(100, parseInt(rawVol, 10))) / 100;
        playSafAlertBeeps(volume);
      }
    } else {
      // Keep strictly muted throughout solat
      if (audioBeep && !audioBeep.paused) audioBeep.pause();
    }
  } else {
    // NORMAL state
    isDoaScreenActive = false;
    stopPreAdhanNotificationAudio();
    if (lastOverlayPhase === 'ADHAN') {
      stopKioskAdhan(true);
    }
  }

  lastOverlayPhase = state;
}

// ==================== INTERACTIVE DRAG & RESIZE CANVAS ENGINE ====================
let isCanvasDragging = false;
let isCanvasResizing = false;
let activeZoneElement = null;
let activeResizeHandleType = null;
let activePointerId = null;
let activePointerTarget = null;
let startPointerX = 0;
let startPointerY = 0;
let startZoneX = 0;
let startZoneY = 0;
let startZoneW = 0;
let startZoneH = 0;
let currentCustomZones = {
  media_stage: { x: 30, y: 270, width: 1250, height: 730 },
  sidebar_takwim: { x: 1300, y: 270, width: 590, height: 730 },
  pip_overlay: { x: 1340, y: 650, width: 540, height: 320 }
};
let isCustomLayoutActive = false;
let isLayoutEditModeActive = false;

const ZONE_CONFIG = {
  media_stage: { id: 'kioskLeftColumn', name: 'Zon 1: Media Stage' },
  sidebar_takwim: { id: 'kioskRightColumn', name: 'Zon 2: Sidebar Takwim' },
  pip_overlay: { id: 'pipSignageWidget', name: 'Zon 3: PiP Overlay' }
};

function getZoneElement(zoneId) {
  const conf = ZONE_CONFIG[zoneId];
  if (!conf) return null;
  return document.getElementById(conf.id);
}

function updateHudBadge(zoneName, x, y, width, height) {
  const hud = document.getElementById('canvasLayoutHudBadge');
  const text = document.getElementById('canvasLayoutHudText');
  if (!hud || !text) return;
  text.innerHTML = `<span class="hud-zone-name">${zoneName}</span> X: <b>${Math.round(x)}px</b> | Y: <b>${Math.round(y)}px</b> | W: <b>${Math.round(width)}px</b> | H: <b>${Math.round(height)}px</b>`;
  hud.style.display = 'flex';
}

function hideHudBadge() {
  const hud = document.getElementById('canvasLayoutHudBadge');
  if (hud && !isLayoutEditModeActive) {
    hud.style.display = 'none';
  }
}

function applyCustomZoneGeometry(zones) {
  if (!zones) return;
  currentCustomZones = Object.assign({}, currentCustomZones, zones);

  Object.entries(currentCustomZones).forEach(([zoneId, geom]) => {
    const el = getZoneElement(zoneId);
    if (el && geom) {
      el.style.left = `${Math.round(geom.x)}px`;
      el.style.top = `${Math.round(geom.y)}px`;
      el.style.width = `${Math.round(geom.width)}px`;
      el.style.height = `${Math.round(geom.height)}px`;
    }
  });
}

function clearCustomZoneGeometry() {
  Object.keys(ZONE_CONFIG).forEach(zoneId => {
    const el = getZoneElement(zoneId);
    if (el) {
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
    }
  });
}

function setupZoneEditHandles(zoneId) {
  const el = getZoneElement(zoneId);
  if (!el || el.querySelector('.zone-edit-header')) return;

  const conf = ZONE_CONFIG[zoneId];

  // 1. Zone Drag Header
  const header = document.createElement('div');
  header.className = 'zone-edit-header';
  header.innerHTML = `
    <span class="header-zone-title">${conf.name}</span>
    <span class="header-drag-hint">↔ Seret &amp; Ubah Saiz</span>
  `;
  el.appendChild(header);

  // 2. Corner and Edge Resize Handles
  const handleTypes = ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'];
  handleTypes.forEach(type => {
    const handle = document.createElement('div');
    handle.className = `resize-handle resize-${type}`;
    handle.dataset.handle = type;
    handle.dataset.zone = zoneId;
    el.appendChild(handle);
  });
}

function removeZoneEditHandles() {
  document.querySelectorAll('.zone-edit-header, .resize-handle').forEach(el => el.remove());
}

async function saveZoneGeometry(zoneId, x, y, width, height) {
  const payload = {
    zone_id: zoneId,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };

  currentCustomZones[zoneId] = {
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height
  };

  try {
    await fetch('/api/layout/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[KIOSK] Failed to save custom zone geometry:', err.message);
  }
}

function getZoneContainerCoords(zoneEl, container) {
  const cRect = container.getBoundingClientRect();
  const zRect = zoneEl.getBoundingClientRect();
  return {
    x: zRect.left - cRect.left,
    y: zRect.top - cRect.top,
    width: zRect.width,
    height: zRect.height
  };
}

function initCanvasInteractionListeners() {
  const container = document.getElementById('kioskContainer') || document.body;

  // Pointer Down on Zone or Handle
  document.addEventListener('pointerdown', (e) => {
    if (!isLayoutEditModeActive) return;

    // Check if clicking a resize handle
    const handleEl = e.target.closest('.resize-handle');
    if (handleEl) {
      e.preventDefault();
      e.stopPropagation();
      const zoneEl = handleEl.closest('[data-zone]');
      if (!zoneEl) return;

      isCanvasResizing = true;
      activeZoneElement = zoneEl;
      activeResizeHandleType = handleEl.dataset.handle;
      startPointerX = e.clientX;
      startPointerY = e.clientY;

      const coords = getZoneContainerCoords(zoneEl, container);
      startZoneX = coords.x;
      startZoneY = coords.y;
      startZoneW = coords.width;
      startZoneH = coords.height;

      if (e.target.setPointerCapture && e.pointerId !== undefined) {
        try {
          e.target.setPointerCapture(e.pointerId);
          activePointerId = e.pointerId;
          activePointerTarget = e.target;
        } catch (_) {}
      }

      zoneEl.classList.add('is-resizing');
      const zoneId = zoneEl.dataset.zone;
      const zoneName = (ZONE_CONFIG[zoneId] && ZONE_CONFIG[zoneId].name) || zoneId;
      updateHudBadge(zoneName, startZoneX, startZoneY, startZoneW, startZoneH);
      return;
    }

    // Check if clicking inside a zone
    const zoneEl = e.target.closest('[data-zone]');
    if (zoneEl) {
      e.preventDefault();
      isCanvasDragging = true;
      activeZoneElement = zoneEl;
      startPointerX = e.clientX;
      startPointerY = e.clientY;

      const coords = getZoneContainerCoords(zoneEl, container);
      startZoneX = coords.x;
      startZoneY = coords.y;
      startZoneW = coords.width;
      startZoneH = coords.height;

      if (zoneEl.setPointerCapture && e.pointerId !== undefined) {
        try {
          zoneEl.setPointerCapture(e.pointerId);
          activePointerId = e.pointerId;
          activePointerTarget = zoneEl;
        } catch (_) {}
      }

      zoneEl.classList.add('is-dragging');
      const zoneId = zoneEl.dataset.zone;
      const zoneName = (ZONE_CONFIG[zoneId] && ZONE_CONFIG[zoneId].name) || zoneId;
      updateHudBadge(zoneName, startZoneX, startZoneY, startZoneW, startZoneH);
    }
  });

  // Pointer Move on Window
  window.addEventListener('pointermove', (e) => {
    if (!isLayoutEditModeActive) return;
    if (!activeZoneElement) return;

    const canvasW = container.clientWidth || window.innerWidth || 1920;
    const canvasH = container.clientHeight || window.innerHeight || 1080;
    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;
    const zoneId = activeZoneElement.dataset.zone;
    const zoneName = (ZONE_CONFIG[zoneId] && ZONE_CONFIG[zoneId].name) || zoneId;

    if (isCanvasDragging) {
      let newX = startZoneX + deltaX;
      let newY = startZoneY + deltaY;

      // Constrain inside canvas
      newX = Math.max(0, Math.min(canvasW - startZoneW, newX));
      newY = Math.max(0, Math.min(canvasH - startZoneH, newY));

      activeZoneElement.style.left = `${Math.round(newX)}px`;
      activeZoneElement.style.top = `${Math.round(newY)}px`;

      updateHudBadge(zoneName, newX, newY, startZoneW, startZoneH);
    } else if (isCanvasResizing) {
      let newX = startZoneX;
      let newY = startZoneY;
      let newW = startZoneW;
      let newH = startZoneH;
      const minW = 200;
      const minH = 120;

      const hType = activeResizeHandleType || 'se';

      if (hType.includes('e')) {
        newW = Math.max(minW, Math.min(canvasW - startZoneX, startZoneW + deltaX));
      }
      if (hType.includes('s')) {
        newH = Math.max(minH, Math.min(canvasH - startZoneY, startZoneH + deltaY));
      }
      if (hType.includes('w')) {
        const potentialW = startZoneW - deltaX;
        if (potentialW >= minW) {
          const potentialX = startZoneX + deltaX;
          if (potentialX >= 0) {
            newX = potentialX;
            newW = potentialW;
          }
        } else {
          newX = startZoneX + (startZoneW - minW);
          newW = minW;
        }
      }
      if (hType.includes('n')) {
        const potentialH = startZoneH - deltaY;
        if (potentialH >= minH) {
          const potentialY = startZoneY + deltaY;
          if (potentialY >= 0) {
            newY = potentialY;
            newH = potentialH;
          }
        } else {
          newY = startZoneY + (startZoneH - minH);
          newH = minH;
        }
      }

      activeZoneElement.style.left = `${Math.round(newX)}px`;
      activeZoneElement.style.top = `${Math.round(newY)}px`;
      activeZoneElement.style.width = `${Math.round(newW)}px`;
      activeZoneElement.style.height = `${Math.round(newH)}px`;

      updateHudBadge(zoneName, newX, newY, newW, newH);
    }
  });

  // Pointer Up / Cancel on Window
  const handlePointerUp = async () => {
    if (!activeZoneElement) return;

    const zoneEl = activeZoneElement;
    const zoneId = zoneEl.dataset.zone;
    
    // Release pointer capture
    if (activePointerTarget && activePointerId !== null && activePointerTarget.releasePointerCapture) {
      try {
        activePointerTarget.releasePointerCapture(activePointerId);
      } catch (_) {}
    }
    activePointerTarget = null;
    activePointerId = null;

    const coords = getZoneContainerCoords(zoneEl, container);
    const finalX = coords.x;
    const finalY = coords.y;
    const finalW = coords.width;
    const finalH = coords.height;

    zoneEl.classList.remove('is-dragging', 'is-resizing');
    activeZoneElement = null;
    isCanvasDragging = false;
    isCanvasResizing = false;
    activeResizeHandleType = null;

    if (zoneId) {
      await saveZoneGeometry(zoneId, finalX, finalY, finalW, finalH);
    }
  };

  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);
}

// 4. Polling Sync Loop
async function syncState() {
  try {
    let data = null;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    if (!data) {
      data = getFallbackOrCachedState();
    }

    lastKioskData = data;

    // Check remote reload trigger
    if (data.kiosk_reload_counter !== undefined && lastReloadCounter !== null && data.kiosk_reload_counter > lastReloadCounter) {
      window.location.reload();
      return;
    }
    if (data.kiosk_reload_counter !== undefined) {
      lastReloadCounter = data.kiosk_reload_counter;
    }

    // Mosque Branding
    if (data.settings) {
      document.getElementById('mosqueName').textContent = (data.settings.mosque_name || 'SURAU DARUL TAQWA').toUpperCase();
      document.getElementById('mosqueLocation').textContent = data.settings.mosque_location || '';
      
      // Ticker text update with optional Hijri Islamic Event Countdown injection
      const isTickerCountdownEnabled = (data.settings.hijri_countdown_enabled !== '0' && data.settings.hijri_countdown_enabled !== false);
      let targetTickerText = (data.settings.ticker_text || '').trim();
      try {
        if (window.HijriCountdown && isTickerCountdownEnabled) {
          targetTickerText = window.HijriCountdown.formatTickerWithCountdown(targetTickerText, data.hijri_date || null, true);
          updateHijriEventCard(data.hijri_date || null);
        }
      } catch (err) {
        console.warn('[HIJRI] Ticker countdown injection notice:', err);
      }

      updateTickerDisplay(targetTickerText);

      const mainContainer = document.getElementById('main-container') || document.getElementById('kioskMainBody');
      const kioskContainer = document.getElementById('kioskContainer');

      // 0. Custom Canvas Drag & Resize Layout Sync
      const customLayoutEnabled = (data.settings.custom_layout_enabled === '1' || data.settings.custom_layout_enabled === true);
      const editMode = (data.settings.layout_edit_mode === '1' || data.settings.layout_edit_mode === true);
      isCustomLayoutActive = customLayoutEnabled || editMode;
      isLayoutEditModeActive = editMode;

      if (isCustomLayoutActive) {
        if (kioskContainer) kioskContainer.classList.add('custom-layout-active');
        document.body.classList.add('custom-layout-active');
        if (!isCanvasDragging && !isCanvasResizing) {
          applyCustomZoneGeometry(data.settings.custom_layout_zones);
        }
      } else {
        if (kioskContainer) kioskContainer.classList.remove('custom-layout-active');
        document.body.classList.remove('custom-layout-active');
        clearCustomZoneGeometry();
      }

      if (isLayoutEditModeActive) {
        if (kioskContainer) kioskContainer.classList.add('layout-edit-mode-active');
        document.body.classList.add('layout-edit-mode-active');
        Object.keys(ZONE_CONFIG).forEach(setupZoneEditHandles);
        const hud = document.getElementById('canvasLayoutHudBadge');
        if (hud && !isCanvasDragging && !isCanvasResizing) {
          hud.style.display = 'flex';
          const hudText = document.getElementById('canvasLayoutHudText');
          if (hudText && !hudText.innerHTML) {
            hudText.innerHTML = '<span style="color:#34d399;">MOD SUSUN BEBAS AKTIF</span> | Seret atau ubah saiz mana-mana zon';
          }
        }
      } else {
        if (kioskContainer) kioskContainer.classList.remove('layout-edit-mode-active');
        document.body.classList.remove('layout-edit-mode-active');
        removeZoneEditHandles();
        hideHudBadge();
      }

      // Font Family Typography Sync
      const fontChoice = (data.settings.kiosk_font_family || 'outfit').toLowerCase().replace(/-/g, '_');
      ['font-outfit', 'font-amiri', 'font-inter', 'font-montserrat', 'font-reem_kufi', 'font-scheherazade'].forEach(c => {
        document.body.classList.remove(c);
        if (kioskContainer) kioskContainer.classList.remove(c);
      });
      document.body.classList.add(`font-${fontChoice}`);
      if (kioskContainer) kioskContainer.classList.add(`font-${fontChoice}`);

      // Kiosk Scale (Resize / Zoom)
      if (data.settings.kiosk_scale) {
        const scaleVal = parseFloat(data.settings.kiosk_scale) || 1.0;
        const targetZoomEl = document.getElementById('mainContainer') || kioskContainer;
        if (targetZoomEl) {
          targetZoomEl.style.transform = (scaleVal >= 0.7 && scaleVal <= 1.4 && scaleVal !== 1.0) ? `scale(${scaleVal})` : '';
          targetZoomEl.style.transformOrigin = 'center center';
        }
      }

      // Kiosk Text Scale (Senior Readability)
      const textScale = data.settings.kiosk_text_scale || '100';
      ['text-scale-100', 'text-scale-115', 'text-scale-130'].forEach(c => {
        document.body.classList.remove(c);
        if (kioskContainer) kioskContainer.classList.remove(c);
      });
      document.body.classList.add(`text-scale-${textScale}`);
      if (kioskContainer) kioskContainer.classList.add(`text-scale-${textScale}`);

      // Kiosk Screen Brightness / Night Dimmer
      if (typeof data.settings.kiosk_brightness !== 'undefined') {
        const bVal = parseInt(data.settings.kiosk_brightness, 10);
        if (!isNaN(bVal) && bVal >= 30 && bVal <= 100) {
          document.documentElement.style.filter = bVal === 100 ? '' : `brightness(${bVal}%)`;
        }
      }

      // Screen Orientation (Landscape vs Portrait)
      const orient = (data.settings.kiosk_orientation || 'landscape').toLowerCase();
      if (orient === 'portrait') {
        document.body.classList.add('orientation-portrait');
        if (kioskContainer) kioskContainer.classList.add('orientation-portrait');
      } else {
        document.body.classList.remove('orientation-portrait');
        if (kioskContainer) kioskContainer.classList.remove('orientation-portrait');
      }

      // High Contrast Mode for Seniors
      const isHighContrast = (data.settings.high_contrast_mode === '1' || data.settings.high_contrast_mode === 1 || data.settings.high_contrast_mode === true);
      if (isHighContrast) {
        document.body.classList.add('high-contrast-mode');
      } else {
        document.body.classList.remove('high-contrast-mode');
      }

      // Multi-Theme Engine Sync
      const currentTheme = data.settings.selected_theme || data.settings.kiosk_theme || localStorage.getItem('selected_theme') || 'emerald';
      if (window.applyTheme) {
        window.applyTheme(currentTheme);
      }
      const themeChoice = currentTheme.toLowerCase().replace(/-/g, '_');
      const ALL_THEMES = [
        'theme-emerald-nabawi', 'theme-emerald_nabawi', 'theme-emerald',
        'theme-royal-sapphire', 'theme-royal_sapphire', 'theme-sapphire',
        'theme-midnight-oled', 'theme-midnight_oled', 'theme-clean-minimalist', 'theme-clean_minimalist',
        'theme-madinah-bronze', 'theme-madinah_bronze', 'theme-terracotta',
        'theme-al-aqsa-teal', 'theme-al_aqsa_teal', 'theme-ottoman',
        'theme-dark-glass', 'theme-dark_glass'
      ];
      ALL_THEMES.forEach(c => {
        document.body.classList.remove(c);
        if (kioskContainer) kioskContainer.classList.remove(c);
      });
      document.body.classList.add(`theme-${themeChoice}`);
      if (kioskContainer) kioskContainer.classList.add(`theme-${themeChoice}`);

      // Fullscreen Kuliah Mode Sync
      if (typeof data.settings.kuliah_fullscreen !== 'undefined') {
        setKuliahFullScreen(data.settings.kuliah_fullscreen);
      }

      // Update Floating Minimal HUD Next Prayer
      const hudNextEl = document.getElementById('hudNextPrayer');
      if (hudNextEl && data.next_prayer) {
        const nextTime = (data.ribbon_times && data.ribbon_times[data.next_prayer]) ? data.ribbon_times[data.next_prayer] : '';
        hudNextEl.textContent = `${data.next_prayer.toUpperCase()}: ${nextTime || formatSeconds(data.time_to_next_seconds || 0)}`;
      }

      // Instant Janazah Notice Board
      const janazahActive = (data.settings.janazah_enabled === '1' || data.settings.janazah_enabled === 1 || data.settings.janazah_enabled === true);
      const janazahLayer = document.getElementById('stageJanazahLayer');
      if (janazahLayer) {
        if (janazahActive) {
          janazahLayer.style.display = 'flex';
          const nameEl = document.getElementById('janazahArwahName');
          if (nameEl) nameEl.textContent = data.settings.janazah_arwah_name || 'Allahyarham / Allahyarhamah';
          const timeEl = document.getElementById('janazahSolatTime');
          if (timeEl) timeEl.textContent = data.settings.janazah_solat_time || 'Selepas Solat Zohor';
          const locEl = document.getElementById('janazahSolatLoc');
          if (locEl) locEl.textContent = data.settings.janazah_solat_loc || 'Surau Darul Taqwa';
          const kuburEl = document.getElementById('janazahKuburLoc');
          if (kuburEl) kuburEl.textContent = data.settings.janazah_kubur_loc || 'Tanah Perkuburan Islam Seksyen 21, Shah Alam';
        } else {
          janazahLayer.style.display = 'none';
        }
      }

      // Friday Auto Mode (Jumaat Khutbah / Solat Jumaat)
      const isFriday = (new Date().getDay() === 5);
      const currentSlot = (data.current_prayer_slot || '').toLowerCase();
      const isFridayPrayerTime = isFriday && (currentSlot === 'zohor' || currentSlot === 'jumaat' || data.state === 'JUMAAT');
      const jumaatLayer = document.getElementById('stageJumaatLayer');
      if (jumaatLayer) {
        if (isFridayPrayerTime && !janazahActive) {
          jumaatLayer.style.display = 'flex';
          const khutbahTitleEl = document.getElementById('jumaatKhutbahTitle');
          if (khutbahTitleEl && data.settings.jumaat_khutbah_title) {
            khutbahTitleEl.textContent = data.settings.jumaat_khutbah_title;
          }
        } else {
          jumaatLayer.style.display = 'none';
        }
      }

      // 1. Dynamic Kiosk Layout Mode Sync
      const layoutPreset = (data.settings.kiosk_layout_preset || 'horizontal_glass').toLowerCase().replace('-', '_');
      ['layout-preset-horizontal_glass', 'layout-preset-sidebar_elegance', 'layout-preset-grid_contemporary'].forEach(c => {
        document.body.classList.remove(c);
        if (kioskContainer) kioskContainer.classList.remove(c);
      });
      document.body.classList.add(`layout-preset-${layoutPreset}`);
      if (kioskContainer) kioskContainer.classList.add(`layout-preset-${layoutPreset}`);

      const activeLayout = (data.settings.active_layout_mode || (data.settings.media_fullscreen_enabled === '1' ? 'fullscreen_video' : (data.settings.kiosk_layout_mode || 'fullscreen_signage'))).toLowerCase();
      applyLayoutMode(activeLayout);

      const isFullscreenMedia = (activeLayout === 'fullscreen_video') || 
        (!data.settings.active_layout_mode && (data.settings.kiosk_layout_mode === 'fullscreen' || data.settings.media_fullscreen_enabled === '1'));

      if (isFullscreenMedia) {
        if (mainContainer) mainContainer.classList.add('fullscreen-media');
        if (kioskContainer) kioskContainer.classList.add('fullscreen-media');
        document.body.classList.add('fullscreen-media');
      } else {
        if (mainContainer) mainContainer.classList.remove('fullscreen-media');
        if (kioskContainer) kioskContainer.classList.remove('fullscreen-media');
        document.body.classList.remove('fullscreen-media');
      }

      // Sub-layout positioning for split mode ('split_right' vs 'split_left')
      const subLayout = data.settings.kiosk_layout || 'split_right';
      if (mainContainer) {
        mainContainer.classList.remove('layout-full', 'layout-split-right', 'layout-split-left');
        if (isFullscreenMedia || subLayout === 'full') {
          mainContainer.classList.add('layout-full');
        } else if (subLayout === 'split_left') {
          mainContainer.classList.add('layout-split-left');
        } else {
          mainContainer.classList.add('layout-split-right');
        }
      }

      // 2. Picture-in-Picture (PiP) Corner Positioning
      const pipMode = (data.settings.pip_mode || 'none').toLowerCase();
      const pipWidget = document.getElementById('pipSignageWidget');
      if (pipWidget) {
        pipWidget.classList.remove('pip-bottom-right', 'pip-bottom-left', 'pip-top-right', 'pip-top-left', 'bottom_right', 'bottom_left');
        if (pipMode === 'bottom_right' || pipMode === 'pip_signage') {
          pipWidget.classList.add('pip-bottom-right');
          pipWidget.style.display = 'flex';
        } else if (pipMode === 'bottom_left') {
          pipWidget.classList.add('pip-bottom-left');
          pipWidget.style.display = 'flex';
        } else if (pipMode === 'top_right') {
          pipWidget.classList.add('pip-top-right');
          pipWidget.style.display = 'flex';
        } else if (pipMode === 'top_left') {
          pipWidget.classList.add('pip-top-left');
          pipWidget.style.display = 'flex';
        } else {
          pipWidget.style.display = 'none';
        }
      }

      // 3. Bank Details & Custom DuitNow QR Image
      const bankNameEl = document.getElementById('sideBankName');
      if (bankNameEl && data.settings.bank_name) bankNameEl.textContent = data.settings.bank_name;
      const bankAccEl = document.getElementById('sideBankAcc');
      if (bankAccEl && data.settings.bank_account_no) bankAccEl.textContent = data.settings.bank_account_no;
      const bankHolderEl = document.getElementById('sideBankHolder');
      if (bankHolderEl && (data.settings.bank_account_holder || data.settings.bank_holder_name)) {
        bankHolderEl.textContent = data.settings.bank_account_holder || data.settings.bank_holder_name;
      }

      const qrContainer = document.getElementById('infaqQrFrameBox') || document.querySelector('.qr-frame-box');
      if (qrContainer) {
        const bankQrUrl = (data.settings && data.settings.bank_qr_url) ? data.settings.bank_qr_url.trim() : '';
        if (bankQrUrl !== '') {
          const effectiveUrl = bankQrUrl.includes('?') ? bankQrUrl : (bankQrUrl + '?v=' + Date.now());
          let qrImg = qrContainer.querySelector('img.custom-bank-qr');
          if (!qrImg) {
            qrContainer.innerHTML = `<img src="${effectiveUrl}" alt="DuitNow QR" class="custom-bank-qr" data-qr-src="${bankQrUrl}">`;
          } else {
            const currentRaw = qrImg.getAttribute('data-qr-src') || qrImg.getAttribute('src');
            if (currentRaw !== bankQrUrl) {
              qrImg.src = effectiveUrl;
              qrImg.setAttribute('data-qr-src', bankQrUrl);
            }
          }
        } else {
          // Restore default fallback SVG if custom bank QR was previously rendered
          if (qrContainer.querySelector('img.custom-bank-qr')) {
            qrContainer.innerHTML = `<svg viewBox="0 0 160 160" class="duitnow-qr-svg" xmlns="http://www.w3.org/2000/svg">
                  <!-- White QR background -->
                  <rect width="160" height="160" rx="10" fill="#ffffff"/>
                  <!-- Top-Left Finder -->
                  <rect x="15" y="15" width="40" height="40" rx="6" fill="#022c22"/>
                  <rect x="23" y="23" width="24" height="24" rx="3" fill="#ffffff"/>
                  <rect x="29" y="29" width="12" height="12" rx="2" fill="#059669"/>
                  <!-- Top-Right Finder -->
                  <rect x="105" y="15" width="40" height="40" rx="6" fill="#022c22"/>
                  <rect x="113" y="23" width="24" height="24" rx="3" fill="#ffffff"/>
                  <rect x="119" y="29" width="12" height="12" rx="2" fill="#059669"/>
                  <!-- Bottom-Left Finder -->
                  <rect x="15" y="105" width="40" height="40" rx="6" fill="#022c22"/>
                  <rect x="23" y="113" width="24" height="24" rx="3" fill="#ffffff"/>
                  <rect x="29" y="119" width="12" height="12" rx="2" fill="#059669"/>
                  <!-- QR Grid Elements -->
                  <rect x="65" y="18" width="10" height="10" fill="#022c22"/>
                  <rect x="85" y="22" width="10" height="10" fill="#022c22"/>
                  <rect x="65" y="38" width="14" height="10" fill="#059669"/>
                  <rect x="85" y="42" width="8" height="8" fill="#022c22"/>
                  <rect x="20" y="65" width="10" height="10" fill="#022c22"/>
                  <rect x="38" y="70" width="16" height="8" fill="#022c22"/>
                  <rect x="105" y="65" width="12" height="12" fill="#022c22"/>
                  <rect x="125" y="75" width="16" height="10" fill="#022c22"/>
                  <rect x="65" y="105" width="12" height="14" fill="#022c22"/>
                  <rect x="85" y="115" width="10" height="10" fill="#022c22"/>
                  <rect x="105" y="105" width="35" height="10" fill="#022c22"/>
                  <rect x="120" y="125" width="20" height="14" fill="#059669"/>
                  <!-- Center DuitNow Logo Badge -->
                  <circle cx="80" cy="80" r="18" fill="#e11d48"/>
                  <text x="80" y="85" font-family="'Outfit', sans-serif" font-size="11" font-weight="900" fill="#ffffff" text-anchor="middle">QR</text>
                </svg>`;
          }
        }
      }

      // 5. Media Source Switcher ('slides', 'video', 'stream')
      const mediaSourceType = data.settings.media_source_type || data.settings.video_source_type || 'slides';
      const mediaStreamUrl = data.settings.media_stream_url || data.settings.video_source_url || '';
      const isPrayerActive = data.state && data.state !== 'NORMAL';
      const audioAllowed = (data.settings.video_audio_enabled === '1' || data.settings.video_audio_enabled === true);
      const isMuted = isPrayerActive || !audioAllowed;
      const vol = parseInt(data.settings.video_volume) || 80;

      setupMediaStream(mediaStreamUrl, mediaSourceType, isMuted, vol);

      // Lower-Third Broadcast Overlay during Video / Live Stream
      const ltOverlay = document.getElementById('kioskLowerThird');
      if (ltOverlay) {
        const isMediaStage = (mediaSourceType === 'video' || mediaSourceType === 'stream');
        const ltEnabled = (data.settings.lower_third_enabled === '1' || data.settings.lower_third_enabled === 1 || data.settings.lower_third_enabled === true);
        if (isMediaStage && ltEnabled && !janazahActive && !isFridayPrayerTime) {
          ltOverlay.style.display = 'flex';
          const spkEl = document.getElementById('ltSpeakerName');
          if (spkEl && data.settings.lower_third_speaker) spkEl.textContent = data.settings.lower_third_speaker;
          const topEl = document.getElementById('ltTopicTitle');
          if (topEl && data.settings.lower_third_topic) topEl.textContent = data.settings.lower_third_topic;
          const kitEl = document.getElementById('ltKitabName');
          if (kitEl && data.settings.lower_third_kitab) kitEl.textContent = `📖 ${data.settings.lower_third_kitab}`;
        } else {
          ltOverlay.style.display = 'none';
        }
      }

      // PiP Mosque Name
      const pipMosque = document.getElementById('pipMosqueName');
      if (pipMosque && data.settings.mosque_name) pipMosque.textContent = data.settings.mosque_name.toUpperCase();

      // Kuliah Details in Side Info / Bottom Widget
      const kuliahTitleEl = document.getElementById('sideKuliahTitle');
      if (kuliahTitleEl && data.settings.kuliah_title) kuliahTitleEl.textContent = data.settings.kuliah_title;
      const kuliahUstazEl = document.getElementById('sideKuliahUstaz');
      if (kuliahUstazEl && data.settings.kuliah_ustaz) kuliahUstazEl.textContent = data.settings.kuliah_ustaz;
      const kuliahDateEl = document.getElementById('sideKuliahDate');
      if (kuliahDateEl && data.settings.kuliah_date) kuliahDateEl.textContent = data.settings.kuliah_date;

      // Duty Roster Details (Imam, Bilal, Siak)
      const rosterImamEl = document.getElementById('sideRosterImam');
      if (rosterImamEl && data.settings.roster_imam) rosterImamEl.textContent = data.settings.roster_imam;
      const rosterBilalEl = document.getElementById('sideRosterBilal');
      if (rosterBilalEl && data.settings.roster_bilal) rosterBilalEl.textContent = data.settings.roster_bilal;
      const rosterSiakEl = document.getElementById('sideRosterSiak');
      if (rosterSiakEl && data.settings.roster_siak) rosterSiakEl.textContent = data.settings.roster_siak;

      // Mosque Tabung & Financial Collection Summary
      const tabungJumaatEl = document.getElementById('sideTabungJumaat');
      if (tabungJumaatEl && data.settings.tabung_jumaat) tabungJumaatEl.textContent = data.settings.tabung_jumaat;
      const tabungSubuhEl = document.getElementById('sideTabungSubuh');
      if (tabungSubuhEl && data.settings.tabung_infaq_subuh) tabungSubuhEl.textContent = data.settings.tabung_infaq_subuh;
      const tabungPbEl = document.getElementById('sideTabungPembangunan');
      if (tabungPbEl && data.settings.tabung_pembangunan) tabungPbEl.textContent = data.settings.tabung_pembangunan;
      const tabungDateEl = document.getElementById('sideTabungDate');
      if (tabungDateEl && data.settings.tabung_tarikh) tabungDateEl.textContent = data.settings.tabung_tarikh;

      // Hadith of the Day
      if (data.settings.hadith_text) {
        const hadithTextEl = document.getElementById('sideHadithText');
        if (hadithTextEl) hadithTextEl.textContent = `"${data.settings.hadith_text}"`;
      }
      if (data.settings.hadith_source) {
        const hadithSourceEl = document.getElementById('sideHadithSource');
        if (hadithSourceEl) hadithSourceEl.textContent = data.settings.hadith_source;
        const hadithRefEl = document.getElementById('sideHadithRef');
        if (hadithRefEl) hadithRefEl.textContent = data.settings.hadith_source;
      }
    }

    // Dates (Single Unified Source of Truth - Pure Malay formatting)
    const effectiveGregorian = getSystemGregorianDateFormatted(new Date());
    const gDateEl = document.getElementById('gregorianDate');
    if (gDateEl && gDateEl.textContent !== effectiveGregorian) {
      gDateEl.textContent = effectiveGregorian;
    }
    const pipDateEl = document.getElementById('pipDate');
    if (pipDateEl && pipDateEl.textContent !== effectiveGregorian) {
      pipDateEl.textContent = effectiveGregorian;
    }

    const hijriDateEl = document.getElementById('hijriDate');
    const effectiveHijri = data.hijri_date
      ? formatHijriDateDisplay(data.hijri_date)
      : (window.HijriCountdown ? window.HijriCountdown.getFallbackHijriDate().formatted : '');
    if (hijriDateEl && effectiveHijri && hijriDateEl.textContent !== effectiveHijri) {
      hijriDateEl.textContent = effectiveHijri;
    }

    // Status Masuk Waktu under Center Digital Clock
    const statusBadge = document.getElementById('clockPrayerStatus');
    if (statusBadge) {
      if (data.state && data.state !== 'NORMAL') {
        const pName = (data.active_prayer || data.current_prayer_slot || '').toUpperCase();
        if (data.state === 'ADHAN') {
          statusBadge.textContent = `📢 AZAN ${pName}`;
          statusBadge.style.display = 'inline-block';
        } else if (data.state === 'IQAMAH') {
          statusBadge.textContent = `⏳ IQAMAH ${pName} (${formatSeconds(data.countdown_seconds || 0)})`;
          statusBadge.style.display = 'inline-block';
        } else if (data.state === 'SOLAT') {
          statusBadge.textContent = `🕌 SOLAT ${pName} BERJEMAAH`;
          statusBadge.style.display = 'inline-block';
        } else if (data.state === 'DOA_ADHAN') {
          statusBadge.textContent = `🤲 DOA SELEPAS AZAN`;
          statusBadge.style.display = 'inline-block';
        } else if (data.state === 'PRE_ADHAN') {
          statusBadge.textContent = `⏰ PERSEDIAAN AZAN ${pName}`;
          statusBadge.style.display = 'inline-block';
        } else {
          statusBadge.style.display = 'none';
        }
      } else if (data.next_prayer) {
        const nextName = String(data.next_prayer).toUpperCase();
        const nextTime = (data.ribbon_times && (data.ribbon_times[data.next_prayer] || data.ribbon_times[data.next_prayer.toLowerCase()])) || '';
        statusBadge.textContent = nextTime ? `MENUJU ${nextName} (${nextTime})` : `MENUJU ${nextName}`;
        statusBadge.style.display = 'inline-block';
      } else {
        statusBadge.style.display = 'none';
      }
    }

    // Update Hijri Event Countdown Badge
    const isBadgeCountdownEnabled = (data.settings && data.settings.hijri_countdown_enabled !== '0' && data.settings.hijri_countdown_enabled !== false);
    if (window.HijriCountdown) {
      try {
        window.HijriCountdown.updateCountdownBadge('hijri-countdown-badge', data.hijri_date || null, isBadgeCountdownEnabled);
      } catch (err) {
        console.warn('[HIJRI] Badge update notice:', err);
      }
    }

    // Ribbon Times
    const canonicalPrayers = ['Imsak', 'Subuh', 'Syuruk', 'Zohor', 'Asar', 'Maghrib', 'Isyak'];
    if (data.ribbon_times) {
      canonicalPrayers.forEach(pName => {
        const timeVal = data.ribbon_times[pName] || 
                        data.ribbon_times[pName.toLowerCase()] || 
                        data.ribbon_times[pName.toUpperCase()] || 
                        (pName === 'Subuh' ? data.ribbon_times['Fajr'] || data.ribbon_times['fajr'] : null) ||
                        (pName === 'Zohor' ? data.ribbon_times['Dhuhr'] || data.ribbon_times['dhuhr'] : null) ||
                        (pName === 'Asar' ? data.ribbon_times['Asr'] || data.ribbon_times['asr'] : null) ||
                        (pName === 'Isyak' ? data.ribbon_times['Isha'] || data.ribbon_times['isha'] : null) ||
                        '--:--';
        const el = document.getElementById(`time${pName}`);
        if (el) el.textContent = timeVal;
      });
    }

    // Active prayer highlight on ribbon
    const currentSlot = data.current_prayer_slot;
    document.querySelectorAll('.prayer-card').forEach(card => {
      const cardP = (card.dataset.prayer || '').toLowerCase();
      const slotP = (currentSlot || '').toLowerCase();
      if (cardP === slotP) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Countdown to next prayer
    if (data.next_prayer) {
      const nextName = String(data.next_prayer).toUpperCase();
      const countStr = formatHoursSeconds(data.time_to_next_seconds || 0);

      // Giant countdown widget in top right card
      const giantPrayerEl = document.getElementById('giantNextPrayer');
      if (giantPrayerEl) giantPrayerEl.textContent = nextName;

      const giantCountEl = document.getElementById('giantCountdown');
      if (giantCountEl) giantCountEl.textContent = countStr;

      // Target Azan time label
      const cdTargetEl = document.getElementById('cdTargetTime');
      if (cdTargetEl && data.ribbon_times) {
        const targetTime = data.ribbon_times[data.next_prayer] || 
                           data.ribbon_times[data.next_prayer.toLowerCase()] || 
                           data.ribbon_times[data.next_prayer.toUpperCase()] || 
                           '';
        if (targetTime) {
          cdTargetEl.textContent = `AZAN ${targetTime}`;
        }
      }

      // Legacy fallback in case element exists
      const oldNameEl = document.getElementById('nextPrayerName');
      if (oldNameEl) oldNameEl.textContent = nextName;
      const oldCountEl = document.getElementById('nextPrayerCountdown');
      if (oldCountEl) oldCountEl.textContent = countStr;

      const pipNext = document.getElementById('pipNextPrayer');
      if (pipNext) pipNext.textContent = nextName;
      const pipCount = document.getElementById('pipCountdown');
      if (pipCount) pipCount.textContent = countStr;
    }

    // Trial Pill Badge
    const trialPill = document.getElementById('trialPill');
    if (data.license_status && data.license_status.license_state === 'TRIAL') {
      trialPill.style.display = 'block';
      trialPill.textContent = `PERCUBAAN: ${data.license_status.days_left} HARI`;
    } else {
      trialPill.style.display = 'none';
    }

    // Slides
    if (data.slides) {
      renderSlides(data.slides);
    }

    // State machine overlays
    applyState(data);

  } catch (err) {
    console.error("Kiosk execution error:", err);
  }
}

// 5. Fullscreen Toggle on Double-Click
document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// ==================== KIOSK MAINTENANCE & PIN MODAL SYSTEM ====================
let maintEnteredPin = '';
let maintVerifiedPin = '';
let maintWrongAttempts = 0;
let maintIsLockedOut = false;
let maintLockoutTimer = null;
let maintLockoutSecondsLeft = 0;
let maintInactivityTimer = null;
const MAINT_INACTIVITY_LIMIT_MS = 15000; // 15 seconds auto-close
const MAINT_LOCKOUT_DURATION_SEC = 30;   // 30 seconds lockout after 3 fails
const MAINT_MAX_WRONG_ATTEMPTS = 3;

function resetMaintInactivityTimer() {
  if (maintInactivityTimer) {
    clearTimeout(maintInactivityTimer);
    maintInactivityTimer = null;
  }
  const modal = document.getElementById('maintenanceModal');
  if (modal && modal.style.display !== 'none') {
    maintInactivityTimer = setTimeout(() => {
      closeMaintenanceModal();
    }, MAINT_INACTIVITY_LIMIT_MS);
  }
}

function openMaintenanceModal() {
  const modal = document.getElementById('maintenanceModal');
  if (!modal) return;

  maintEnteredPin = '';
  maintVerifiedPin = '';
  updatePinDotsUI();
  hidePinError();

  // Show PIN step, hide Menu step
  const pinStep = document.getElementById('maintenancePinStep');
  const menuStep = document.getElementById('maintenanceMenuStep');
  if (pinStep) pinStep.style.display = 'block';
  if (menuStep) menuStep.style.display = 'none';

  const statusBanner = document.getElementById('maintStatusBanner');
  if (statusBanner) {
    statusBanner.style.display = 'none';
    statusBanner.textContent = '';
  }

  modal.style.display = 'flex';
  resetMaintInactivityTimer();
}

function closeMaintenanceModal() {
  const modal = document.getElementById('maintenanceModal');
  if (modal) modal.style.display = 'none';

  maintEnteredPin = '';
  maintVerifiedPin = '';
  updatePinDotsUI();
  hidePinError();

  if (maintInactivityTimer) {
    clearTimeout(maintInactivityTimer);
    maintInactivityTimer = null;
  }
}

function updatePinDotsUI() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pinDot${i}`);
    if (dot) {
      if (i < maintEnteredPin.length) {
        dot.classList.add('filled');
        dot.classList.remove('error');
      } else {
        dot.classList.remove('filled');
        dot.classList.remove('error');
      }
    }
  }
}

function showPinError(msg) {
  const errEl = document.getElementById('pinErrorMsg');
  if (errEl) {
    errEl.textContent = msg || 'PIN tidak tepat. Sila cuba lagi.';
    errEl.style.display = 'block';
  }
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pinDot${i}`);
    if (dot) {
      dot.classList.add('error');
    }
  }
}

function hidePinError() {
  const errEl = document.getElementById('pinErrorMsg');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pinDot${i}`);
    if (dot) dot.classList.remove('error');
  }
}

function startLockoutCountdown() {
  maintIsLockedOut = true;
  maintLockoutSecondsLeft = MAINT_LOCKOUT_DURATION_SEC;

  const lockoutBox = document.getElementById('pinLockoutMsg');
  const countEl = document.getElementById('lockoutCountdown');
  const errEl = document.getElementById('pinErrorMsg');

  if (errEl) errEl.style.display = 'none';
  if (lockoutBox) lockoutBox.style.display = 'block';
  if (countEl) countEl.textContent = String(maintLockoutSecondsLeft);

  // Disable keypad buttons
  document.querySelectorAll('#maintKeypad .kp-btn').forEach(btn => {
    btn.disabled = true;
  });

  if (maintLockoutTimer) clearInterval(maintLockoutTimer);
  maintLockoutTimer = setInterval(() => {
    maintLockoutSecondsLeft--;
    if (countEl) countEl.textContent = String(maintLockoutSecondsLeft);

    if (maintLockoutSecondsLeft <= 0) {
      clearInterval(maintLockoutTimer);
      maintLockoutTimer = null;
      maintIsLockedOut = false;
      maintWrongAttempts = 0;
      if (lockoutBox) lockoutBox.style.display = 'none';
      document.querySelectorAll('#maintKeypad .kp-btn').forEach(btn => {
        btn.disabled = false;
      });
      hidePinError();
    }
  }, 1000);
}

async function handlePinInput(digit) {
  if (maintIsLockedOut) return;
  if (maintEnteredPin.length >= 4) return;

  resetMaintInactivityTimer();
  hidePinError();

  maintEnteredPin += String(digit);
  updatePinDotsUI();

  if (maintEnteredPin.length === 4) {
    const pinToVerify = maintEnteredPin;
    // Verify PIN with backend
    try {
      const resp = await fetch('/api/maintenance/verify_pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToVerify })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        // PIN verified!
        maintVerifiedPin = pinToVerify;
        maintWrongAttempts = 0;
        maintEnteredPin = '';
        updatePinDotsUI();

        // Switch to maintenance menu step
        const pinStep = document.getElementById('maintenancePinStep');
        const menuStep = document.getElementById('maintenanceMenuStep');
        if (pinStep) pinStep.style.display = 'none';
        if (menuStep) menuStep.style.display = 'block';
        resetMaintInactivityTimer();
      } else {
        // Wrong PIN
        maintWrongAttempts++;
        showPinError(data.message || 'PIN tidak tepat. Sila cuba lagi.');
        if (maintWrongAttempts >= MAINT_MAX_WRONG_ATTEMPTS) {
          startLockoutCountdown();
        }
        setTimeout(() => {
          if (!maintIsLockedOut) {
            maintEnteredPin = '';
            updatePinDotsUI();
            hidePinError();
          }
        }, 800);
      }
    } catch (err) {
      maintWrongAttempts++;
      showPinError('Ralat sambungan pelayan. Sila cuba lagi.');
      setTimeout(() => {
        maintEnteredPin = '';
        updatePinDotsUI();
      }, 800);
    }
  }
}

function handlePinBackspace() {
  if (maintIsLockedOut) return;
  resetMaintInactivityTimer();
  hidePinError();
  if (maintEnteredPin.length > 0) {
    maintEnteredPin = maintEnteredPin.slice(0, -1);
    updatePinDotsUI();
  }
}

function handlePinClear() {
  if (maintIsLockedOut) return;
  resetMaintInactivityTimer();
  hidePinError();
  maintEnteredPin = '';
  updatePinDotsUI();
}

async function triggerMaintenanceAction(actionName) {
  resetMaintInactivityTimer();
  const banner = document.getElementById('maintStatusBanner');

  try {
    if (banner) {
      banner.className = 'maint-status-banner';
      banner.style.display = 'block';
      banner.textContent = 'Memproses arahan...';
    }

    const resp = await fetch('/api/maintenance/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: maintVerifiedPin || '1234',
        action: actionName
      })
    });
    const data = await resp.json();

    if (resp.ok && data.success) {
      if (banner) {
        banner.className = 'maint-status-banner';
        banner.textContent = `✅ ${data.message}`;
      }

      if (actionName === 'exit_loop') {
        setTimeout(() => {
          closeMaintenanceModal();
        }, 1500);
      } else if (actionName === 'reload') {
        setTimeout(() => {
          location.reload();
        }, 800);
      } else if (actionName === 'minimize') {
        setTimeout(() => {
          closeMaintenanceModal();
        }, 1200);
      }
    } else {
      if (banner) {
        banner.className = 'maint-status-banner error';
        banner.textContent = `⚠️ Ralat: ${data.message || 'Tindakan gagal'}`;
      }
    }
  } catch (err) {
    if (banner) {
      banner.className = 'maint-status-banner error';
      banner.textContent = `⚠️ Ralat sambungan: ${err.message}`;
    }
  }
}

function initMaintenanceSystem() {
  const triggerBtn = document.getElementById('btnMaintenanceTrigger');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMaintenanceModal();
    });
  }

  const btnCancelPin = document.getElementById('btnCancelMaintPin');
  if (btnCancelPin) {
    btnCancelPin.addEventListener('click', closeMaintenanceModal);
  }

  const btnCloseMenu = document.getElementById('btnCloseMaintMenu');
  if (btnCloseMenu) {
    btnCloseMenu.addEventListener('click', closeMaintenanceModal);
  }

  // Keypad numbers
  document.querySelectorAll('#maintKeypad .kp-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-key');
      handlePinInput(key);
    });
  });

  const btnClear = document.getElementById('kpBtnClear');
  if (btnClear) {
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePinClear();
    });
  }

  const btnBack = document.getElementById('kpBtnBack');
  if (btnBack) {
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePinBackspace();
    });
  }

  // Actions
  const btnMin = document.getElementById('btnActionMinimize');
  if (btnMin) {
    btnMin.addEventListener('click', () => triggerMaintenanceAction('minimize'));
  }

  const btnExit = document.getElementById('btnActionExitLoop');
  if (btnExit) {
    btnExit.addEventListener('click', () => triggerMaintenanceAction('exit_loop'));
  }

  const btnReload = document.getElementById('btnActionReload');
  if (btnReload) {
    btnReload.addEventListener('click', () => triggerMaintenanceAction('reload'));
  }

  // Modal backdrop click to close
  const modal = document.getElementById('maintenanceModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeMaintenanceModal();
      }
    });

    // Reset inactivity timer on any interaction inside modal
    ['mousemove', 'touchstart', 'click', 'keydown'].forEach(evtType => {
      modal.addEventListener(evtType, resetMaintInactivityTimer, { passive: true });
    });
  }

  // Physical keyboard listener when modal is open
  document.addEventListener('keydown', (e) => {
    const modalEl = document.getElementById('maintenanceModal');
    if (!modalEl || modalEl.style.display === 'none') return;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      handlePinInput(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handlePinBackspace();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMaintenanceModal();
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'Delete') {
      e.preventDefault();
      handlePinClear();
    }
  });
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    }).catch(() => {});
  }

  // Cross-tab Synchronization via BroadcastChannel & Storage Event
  try {
    const syncChannel = new BroadcastChannel('esolat_sync');
    syncChannel.onmessage = (event) => {
      if (event.data) {
        if (event.data.type === 'TOGGLE_KULIAH_FULLSCREEN') {
          setKuliahFullScreen(event.data.value);
        } else if (
          event.data.type === 'SIMULATE_TRIGGER' ||
          event.data.type === 'TAKWIM_UPDATED' || 
          event.data.type === 'SETTINGS_UPDATED' ||
          event.data.type === 'UPDATE_DEATH_NOTICE' ||
          event.data.type === 'kiosk_media_config' ||
          event.data.type === 'media_update'
        ) {
          if (event.data.type === 'kiosk_media_config' || event.data.type === 'media_update') {
            const cfg = event.data.media_config || event.data;
            if (cfg && window.setupMediaStream) {
              window.setupMediaStream(cfg.media_stream_url || '', cfg.media_source_type || 'slides', true, 80);
            }
          }
          syncState();
        }
      }
    };
  } catch (_) {}

  window.addEventListener('storage', (event) => {
    if (event.key) {
      if (event.key === 'kuliah_fullscreen') {
        setKuliahFullScreen(event.newValue === 'true' || event.newValue === true);
      } else if (
        event.key === 'esolat_sim_trigger' ||
        event.key.startsWith('cached_takwim') || 
        event.key === 'esolat_admin_settings' || 
        event.key === 'esolat_zone' ||
        event.key === 'kiosk_media_config'
      ) {
        if (event.key === 'kiosk_media_config' && event.newValue) {
          try {
            const cfg = JSON.parse(event.newValue);
            if (cfg && window.setupMediaStream) {
              window.setupMediaStream(cfg.media_stream_url || '', cfg.media_source_type || 'slides', true, 80);
            }
          } catch (_) {}
        }
        syncState();
      }
    }
  });

  startClientClock();
  startBottomWidgetCycle();
  initCanvasInteractionListeners();
  initMaintenanceSystem();
  initTvRemoteAndModals();
  syncState();
  setInterval(syncState, 1000);
});

/* ==================== TV REMOTE & MODAL CONTROLLERS ==================== */
function initTvRemoteAndModals() {
  const modalTvSettings = document.getElementById('modalTvSettings');
  const modalDonationQr = document.getElementById('modalDonationQr');
  const modalExitConfirm = document.getElementById('modalExitConfirm');
  const tvOfflineBadge = document.getElementById('tvOfflineBadge');

  const THEME_LIST = [
    'emerald_nabawi',
    'royal_sapphire',
    'midnight_oled',
    'madinah_bronze',
    'al_aqsa_teal',
    'dark_glass'
  ];

  function applyKioskTheme(themeName) {
    const cleanTheme = (themeName || 'emerald_nabawi').toLowerCase().replace(/-/g, '_');
    const ALL_THEMES = [
      'theme-emerald-nabawi', 'theme-emerald_nabawi', 'theme-emerald',
      'theme-royal-sapphire', 'theme-royal_sapphire', 'theme-sapphire',
      'theme-midnight-oled', 'theme-midnight_oled', 'theme-clean-minimalist', 'theme-clean_minimalist',
      'theme-madinah-bronze', 'theme-madinah_bronze', 'theme-terracotta',
      'theme-al-aqsa-teal', 'theme-al_aqsa_teal', 'theme-ottoman',
      'theme-dark-glass', 'theme-dark_glass'
    ];
    ALL_THEMES.forEach(c => {
      document.body.classList.remove(c);
      if (kioskContainer) kioskContainer.classList.remove(c);
    });
    document.body.classList.add(`theme-${cleanTheme}`);
    if (kioskContainer) kioskContainer.classList.add(`theme-${cleanTheme}`);
    localStorage.setItem('kiosk_theme', cleanTheme);

    // Update active state in modal buttons
    document.querySelectorAll('.tv-theme-btn').forEach(btn => {
      if (btn.getAttribute('data-theme') === cleanTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Save to server backend
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiosk_theme: cleanTheme })
    }).catch(() => {});

    try {
      const ch = new BroadcastChannel('esolat_sync');
      ch.postMessage({ type: 'SETTINGS_UPDATED', kiosk_theme: cleanTheme });
    } catch (_) {}
  }

  // Bind theme buttons in Quick Settings
  document.querySelectorAll('.tv-theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = btn.getAttribute('data-theme');
      if (t) applyKioskTheme(t);
    });
  });

  // Audio Toggle
  let tvAudioMuted = false;
  const btnTvToggleAudio = document.getElementById('btnTvToggleAudio');
  const tvAudioStatusText = document.getElementById('tvAudioStatusText');
  if (btnTvToggleAudio) {
    btnTvToggleAudio.addEventListener('click', () => {
      tvAudioMuted = !tvAudioMuted;
      [audioAdhan, audioSubuh, audioBeep, audioPreAdhan].forEach(a => {
        if (a) a.muted = tvAudioMuted;
      });
      if (tvAudioStatusText) {
        tvAudioStatusText.textContent = tvAudioMuted ? 'Audio Azan: SENYAP (MUTE)' : 'Audio Azan: AKTIF';
      }
    });
  }

  // Reload button
  const btnTvReload = document.getElementById('btnTvReload');
  if (btnTvReload) {
    btnTvReload.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Modal Close buttons
  const btnCloseTvSettings = document.getElementById('btnCloseTvSettings');
  if (btnCloseTvSettings) {
    btnCloseTvSettings.addEventListener('click', () => {
      if (modalTvSettings) modalTvSettings.classList.remove('active');
    });
  }

  const btnCloseDonationQr = document.getElementById('btnCloseDonationQr');
  if (btnCloseDonationQr) {
    btnCloseDonationQr.addEventListener('click', () => {
      if (modalDonationQr) modalDonationQr.classList.remove('active');
    });
  }

  const btnCancelExitConfirm = document.getElementById('btnCancelExitConfirm');
  if (btnCancelExitConfirm) {
    btnCancelExitConfirm.addEventListener('click', () => {
      if (modalExitConfirm) modalExitConfirm.classList.remove('active');
    });
  }

  const btnProceedExit = document.getElementById('btnProceedExit');
  if (btnProceedExit) {
    btnProceedExit.addEventListener('click', () => {
      window.location.href = '/admin/';
    });
  }

  // TV Remote Control & Keyboard D-Pad Navigation
  window.addEventListener('keydown', (e) => {
    // If PIN modal is open, let maintenance keypad handle digits
    const maintModal = document.getElementById('modalMaintenance');
    if (maintModal && maintModal.classList.contains('active')) {
      return;
    }

    const key = e.key;

    // 1. Menu / 'M' / 'N' key -> Toggle TV Quick Settings & Network QR
    if (key === 'm' || key === 'M' || key === 'n' || key === 'N' || key === 'ContextMenu') {
      e.preventDefault();
      if (modalTvSettings) {
        const isOpening = !modalTvSettings.classList.contains('active');
        modalTvSettings.classList.toggle('active');
        if (modalDonationQr) modalDonationQr.classList.remove('active');
        if (modalExitConfirm) modalExitConfirm.classList.remove('active');
        if (isOpening && window.renderKioskNetworkQr) {
          window.renderKioskNetworkQr(true);
        }
      }
    }

    // 2. 'T' key -> Cycle Theme instantly
    else if (key === 't' || key === 'T') {
      e.preventDefault();
      const cur = (localStorage.getItem('kiosk_theme') || 'emerald_nabawi').toLowerCase();
      let nextIdx = (THEME_LIST.indexOf(cur) + 1) % THEME_LIST.length;
      if (nextIdx < 0) nextIdx = 0;
      applyKioskTheme(THEME_LIST[nextIdx]);
    }

    // 3. 'Enter' / 'Space' / 'Q' -> Toggle DuitNow QR Donation Pop-up
    else if ((key === 'Enter' || key === ' ' || key === 'q' || key === 'Q') && !modalTvSettings?.classList.contains('active')) {
      e.preventDefault();
      if (modalDonationQr) {
        modalDonationQr.classList.toggle('active');
        if (modalExitConfirm) modalExitConfirm.classList.remove('active');
      }
    }

    // 4. 'Escape' / 'Back' -> Dismiss modal or show Exit Confirmation
    else if (key === 'Escape' || key === 'Backspace' || key === 'BrowserBack') {
      if (modalTvSettings?.classList.contains('active')) {
        e.preventDefault();
        modalTvSettings.classList.remove('active');
      } else if (modalDonationQr?.classList.contains('active')) {
        e.preventDefault();
        modalDonationQr.classList.remove('active');
      } else if (modalExitConfirm?.classList.contains('active')) {
        e.preventDefault();
        modalExitConfirm.classList.remove('active');
      } else {
        e.preventDefault();
        if (modalExitConfirm) modalExitConfirm.classList.add('active');
      }
    }
  });

  // Offline / Online Status Monitoring
  function updateOfflineStatus() {
    if (tvOfflineBadge) {
      if (!navigator.onLine) {
        tvOfflineBadge.style.display = 'flex';
      } else {
        tvOfflineBadge.style.display = 'none';
      }
    }
  }

  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  updateOfflineStatus();
}
