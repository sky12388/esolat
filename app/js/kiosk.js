/**
 * e-Solat Mosque Digital Signage - TV Kiosk Controller
 * Handles 1-second state synchronization, smooth clock, slideshow, audio, and overlay transitions.
 */

let currentSlideIndex = 0;
let slidesList = [];
let slideTimer = null;
let lastReloadCounter = null;
let lastState = null;

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
  const prayerSecs = [
    { name: 'Subuh', sec: timeStringToSeconds(ribbon.Subuh) },
    { name: 'Syuruk', sec: timeStringToSeconds(ribbon.Syuruk) },
    { name: 'Zohor', sec: timeStringToSeconds(ribbon.Zohor) },
    { name: 'Asar', sec: timeStringToSeconds(ribbon.Asar) },
    { name: 'Maghrib', sec: timeStringToSeconds(ribbon.Maghrib) },
    { name: 'Isyak', sec: timeStringToSeconds(ribbon.Isyak) }
  ];

  let currentSlot = 'Isyak';
  let nextPrayer = 'Subuh';
  let timeToNext = (86400 - nowSec) + prayerSecs[0].sec;

  if (nowSec < prayerSecs[0].sec) {
    currentSlot = 'Isyak';
    nextPrayer = 'Subuh';
    timeToNext = prayerSecs[0].sec - nowSec;
  } else if (nowSec < prayerSecs[1].sec) {
    currentSlot = 'Subuh';
    nextPrayer = 'Syuruk';
    timeToNext = prayerSecs[1].sec - nowSec;
  } else if (nowSec < prayerSecs[2].sec) {
    currentSlot = 'Syuruk';
    nextPrayer = 'Zohor';
    timeToNext = prayerSecs[2].sec - nowSec;
  } else if (nowSec < prayerSecs[3].sec) {
    currentSlot = 'Zohor';
    nextPrayer = 'Asar';
    timeToNext = prayerSecs[3].sec - nowSec;
  } else if (nowSec < prayerSecs[4].sec) {
    currentSlot = 'Asar';
    nextPrayer = 'Maghrib';
    timeToNext = prayerSecs[4].sec - nowSec;
  } else if (nowSec < prayerSecs[5].sec) {
    currentSlot = 'Maghrib';
    nextPrayer = 'Isyak';
    timeToNext = prayerSecs[5].sec - nowSec;
  } else {
    currentSlot = 'Isyak';
    nextPrayer = 'Subuh';
    timeToNext = (86400 - nowSec) + prayerSecs[0].sec;
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
    hijri_countdown_enabled: '1'
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

// 1. Digital Clock (Client-side high precision)
function startClientClock() {
  const clockEl = document.getElementById('digitalClock');
  const pipClockEl = document.getElementById('pipClock');
  const gDateEl = document.getElementById('gregorianDate');
  const pipDateEl = document.getElementById('pipDate');
  const hDateEl = document.getElementById('hijriDate');

  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    if (clockEl) clockEl.textContent = timeStr;
    if (pipClockEl) pipClockEl.textContent = timeStr;

    // Update live dates on client
    const gFormatted = getSystemGregorianDateFormatted(now);
    if (gDateEl && (!lastState || !lastState.gregorian_date)) gDateEl.textContent = gFormatted;
    if (pipDateEl && (!lastState || !lastState.gregorian_date)) pipDateEl.textContent = gFormatted;

    if (hDateEl && (!lastState || !lastState.hijri_date) && window.HijriCountdown) {
      try {
        const fb = window.HijriCountdown.getFallbackHijriDate(now);
        if (fb && fb.formatted) hDateEl.textContent = fb.formatted;
      } catch (_) {}
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

function getYouTubeEmbedUrl(url, muted) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;
  if (!videoId) return url;
  const muteParam = muted ? 1 : 0;
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muteParam}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
}

function setupMediaStream(url, type, isMuted, volume) {
  const video = document.getElementById('kioskVideoPlayer');
  const iframe = document.getElementById('kioskIframePlayer');
  const stageMedia = document.getElementById('stageMediaLayer');
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

      if (currentLoadedMediaUrl !== url) {
        currentLoadedMediaUrl = url;
        const isHls = url.includes('.m3u8') || normalizedType === 'hls';

        if (isHls && window.Hls && Hls.isSupported()) {
          if (hlsInstance) hlsInstance.destroy();
          hlsInstance = new Hls({ autoStartLoad: true });
          hlsInstance.loadSource(url);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
        } else {
          video.src = url;
          video.load();
          video.play().catch(() => {});
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
  restartSlideTimer();
}

function nextSlide() {
  if (slidesList.length <= 1) return;
  const items = document.querySelectorAll('.slide-item');
  const dots = document.querySelectorAll('.dot');

  if (items.length === 0) return;

  items[currentSlideIndex].classList.remove('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.remove('active');

  currentSlideIndex = (currentSlideIndex + 1) % items.length;

  items[currentSlideIndex].classList.add('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.add('active');
}

function restartSlideTimer() {
  if (slideTimer) clearInterval(slideTimer);
  const durationSec = (slidesList[currentSlideIndex] && slidesList[currentSlideIndex].duration) || 12;
  slideTimer = setInterval(nextSlide, durationSec * 1000);
}

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

function playKioskAdhan(prayer, settings) {
  stopKioskAdhan(false);

  const isSubuh = (prayer && prayer.toLowerCase() === 'subuh');
  let audioFile = isSubuh 
    ? (settings && (settings.audio_azan_subuh || settings.audio_azan_subuh_file) ? (settings.audio_azan_subuh || settings.audio_azan_subuh_file) : 'azan_subuh_special.mp3')
    : (settings && (settings.audio_azan_regular || settings.audio_azan_standard_file) ? (settings.audio_azan_regular || settings.audio_azan_standard_file) : 'azan_mekah.mp3');

  let audioUrl = audioFile;
  if (!audioUrl.startsWith('/') && !audioUrl.startsWith('http')) {
    audioUrl = `/kiosk/audio/azan/${audioFile}`;
  }

  const rawVol = (settings && typeof settings.audio_volume !== 'undefined')
    ? settings.audio_volume
    : (settings && typeof settings.audio_azan_volume !== 'undefined' ? settings.audio_azan_volume : 80);
  const volume = Math.max(0, Math.min(100, parseInt(rawVol, 10))) / 100;

  try {
    currentAdhanAudio = new Audio(audioUrl);
    currentAdhanAudio.volume = volume;
    currentAdhanAudio.play().catch(err => {
      console.warn('[KIOSK] Audio play error, falling back:', err.message);
      const fallback = isSubuh ? audioSubuh : audioAdhan;
      if (fallback) {
        fallback.volume = volume;
        fallback.play().catch(() => {});
      }
    });
  } catch (e) {
    console.warn('[KIOSK] Azan Audio instantiation failed:', e);
  }
}

function stopKioskAdhan(fade = true) {
  if (adhanFadeTimer) {
    clearInterval(adhanFadeTimer);
    adhanFadeTimer = null;
  }

  // Also stop static fallbacks
  if (audioAdhan) { audioAdhan.pause(); audioAdhan.currentTime = 0; }
  if (audioSubuh) { audioSubuh.pause(); audioSubuh.currentTime = 0; }

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
    audio.pause();
    audio.currentTime = 0;
    currentAdhanAudio = null;
  }
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

  const state = data.state;
  const prayer = data.active_prayer || 'Zohor';
  const sec = data.countdown_seconds || 0;

  if (state === 'LOCKED') {
    stopKioskAdhan(false);
    overlays.LOCKED.classList.add('show');
    document.getElementById('lockedHwid').textContent = data.hwid || 'ESOLAT-XXXX-XXXX-XXXX';
    document.getElementById('lockedIp').textContent = window.location.hostname || 'localhost';
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
    overlays.PRE_ADHAN.classList.add('show');
    document.getElementById('preAdhanPrayer').textContent = prayer.toUpperCase();
    document.getElementById('preAdhanCounter').textContent = formatSeconds(sec);
    if (lastState !== 'PRE_ADHAN') {
      audioPreAdhan.play().catch(() => {});
    }
  } else if (state === 'ADHAN') {
    overlays.ADHAN.classList.add('show');
    document.getElementById('adhanPrayerName').textContent = prayer.toUpperCase();
    document.getElementById('adhanTimer').textContent = formatSeconds(sec);
    if (lastState !== 'ADHAN') {
      playKioskAdhan(prayer, data.settings || {});
    }
  } else if (state === 'DOA_ADHAN') {
    overlays.DOA_ADHAN.classList.add('show');
    if (lastState === 'ADHAN') {
      stopKioskAdhan(true);
    }
  } else if (state === 'IQAMAH') {
    overlays.IQAMAH.classList.add('show');
    document.getElementById('iqamahPrayerName').textContent = `SOLAT ${prayer.toUpperCase()}`;
    document.getElementById('iqamahDigits').textContent = formatSeconds(sec);
    if (lastState === 'ADHAN' || lastState === 'DOA_ADHAN') {
      stopKioskAdhan(true);
    }
  } else if (state === 'SOLAT') {
    overlays.SOLAT.classList.add('show');
    stopKioskAdhan(false);
    if (lastState !== 'SOLAT') {
      audioBeep.play().catch(() => {});
    }
  } else {
    // NORMAL state
    if (lastState === 'ADHAN') {
      stopKioskAdhan(true);
    }
  }

  lastState = state;
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

    lastState = data;

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
      const countdownEnabled = (data.settings.hijri_countdown_enabled !== '0' && data.settings.hijri_countdown_enabled !== false);
      let targetTickerText = (data.settings.ticker_text || '').trim();
      try {
        if (window.HijriCountdown && countdownEnabled) {
          targetTickerText = window.HijriCountdown.formatTickerWithCountdown(targetTickerText, data.hijri_date || null, true);
          updateHijriEventCard(data.hijri_date || null);
        }
      } catch (err) {
        console.warn('[HIJRI] Ticker countdown injection notice:', err);
      }

      const tickerEl = document.getElementById('tickerContent');
      if (tickerEl && tickerEl.textContent.trim() !== targetTickerText.trim()) {
        tickerEl.textContent = targetTickerText;
      }

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

      // Multi-Theme Engine Sync
      const themeChoice = (data.settings.kiosk_theme || 'emerald_nabawi').toLowerCase().replace('-', '_');
      ['theme-emerald-nabawi', 'theme-emerald_nabawi', 'theme-dark-glass', 'theme-dark_glass', 'theme-clean-minimalist', 'theme-clean_minimalist'].forEach(c => {
        document.body.classList.remove(c);
        if (kioskContainer) kioskContainer.classList.remove(c);
      });
      document.body.classList.add(`theme-${themeChoice}`);
      if (kioskContainer) kioskContainer.classList.add(`theme-${themeChoice}`);

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

    // Dates
    if (data.gregorian_date) {
      const gDateEl = document.getElementById('gregorianDate');
      if (gDateEl) gDateEl.textContent = data.gregorian_date;
      const pipDateEl = document.getElementById('pipDate');
      if (pipDateEl) pipDateEl.textContent = data.gregorian_date;
    }

    const hijriDateEl = document.getElementById('hijriDate');
    const effectiveHijri = data.hijri_date || (window.HijriCountdown ? window.HijriCountdown.getFallbackHijriDate().formatted : '');
    if (hijriDateEl && effectiveHijri) {
      hijriDateEl.textContent = effectiveHijri;
    }

    // Update Hijri Event Countdown Badge
    const countdownEnabled = (data.settings && data.settings.hijri_countdown_enabled !== '0' && data.settings.hijri_countdown_enabled !== false);
    if (window.HijriCountdown) {
      try {
        window.HijriCountdown.updateCountdownBadge('hijri-countdown-badge', data.hijri_date || null, countdownEnabled);
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
      if (event.data && (event.data.type === 'TAKWIM_UPDATED' || event.data.type === 'SETTINGS_UPDATED')) {
        syncState();
      }
    };
  } catch (_) {}

  window.addEventListener('storage', (event) => {
    if (event.key && (event.key.startsWith('cached_takwim') || event.key === 'esolat_admin_settings' || event.key === 'esolat_zone')) {
      syncState();
    }
  });

  startClientClock();
  startBottomWidgetCycle();
  initCanvasInteractionListeners();
  initMaintenanceSystem();
  syncState();
  setInterval(syncState, 1000);
});
