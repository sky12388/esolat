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

// 1. Digital Clock (Client-side high precision)
function startClientClock() {
  const clockEl = document.getElementById('digitalClock');
  const pipClockEl = document.getElementById('pipClock');
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    if (clockEl) clockEl.textContent = timeStr;
    if (pipClockEl) pipClockEl.textContent = timeStr;
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
function renderSlides(slides) {
  if (!slides || slides.length === 0) return;

  // Check if slides list has changed
  const newIds = slides.map(s => s.id + s.file_url).join('|');
  const oldIds = slidesList.map(s => s.id + s.file_url).join('|');

  if (newIds === oldIds) return;

  slidesList = slides;
  const container = document.getElementById('slidesContainer');
  const dotsContainer = document.getElementById('slideIndicators');
  container.innerHTML = '';
  dotsContainer.innerHTML = '';

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

    const dot = document.createElement('div');
    dot.className = `dot ${idx === 0 ? 'active' : ''}`;
    dotsContainer.appendChild(dot);
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

// 2b. Bottom Card Cycling Manager (Infaq QR <-> Next Kuliah / Announcement)
let bottomCycleTimer = null;
let currentCycleSlide = 0; // 0 = infaq, 1 = kuliah

function startBottomWidgetCycle() {
  if (bottomCycleTimer) return;
  bottomCycleTimer = setInterval(() => {
    const slideInfaq = document.getElementById('cycleSlideInfaq');
    const slideKuliah = document.getElementById('cycleSlideKuliah');
    const dot0 = document.getElementById('dotCycle0');
    const dot1 = document.getElementById('dotCycle1');

    if (!slideInfaq || !slideKuliah) return;

    currentCycleSlide = (currentCycleSlide + 1) % 2;
    if (currentCycleSlide === 0) {
      slideInfaq.classList.add('active');
      slideKuliah.classList.remove('active');
      if (dot0) dot0.classList.add('active');
      if (dot1) dot1.classList.remove('active');
    } else {
      slideInfaq.classList.remove('active');
      slideKuliah.classList.add('active');
      if (dot0) dot0.classList.remove('active');
      if (dot1) dot1.classList.add('active');
    }
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
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();

    // Check remote reload trigger
    if (lastReloadCounter !== null && data.kiosk_reload_counter > lastReloadCounter) {
      window.location.reload();
      return;
    }
    lastReloadCounter = data.kiosk_reload_counter;

    // Mosque Branding
    if (data.settings) {
      document.getElementById('mosqueName').textContent = (data.settings.mosque_name || 'SURAU DARUL TAQWA').toUpperCase();
      document.getElementById('mosqueLocation').textContent = data.settings.mosque_location || '';
      
      // Ticker text update
      const tickerEl = document.getElementById('tickerContent');
      if (tickerEl && tickerEl.textContent.trim() !== data.settings.ticker_text.trim()) {
        tickerEl.textContent = data.settings.ticker_text;
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

      // 1. Dynamic Kiosk Layout Mode Sync
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
    }

    // Dates
    if (data.gregorian_date) {
      const gDateEl = document.getElementById('gregorianDate');
      if (gDateEl) gDateEl.textContent = data.gregorian_date;
      const pipDateEl = document.getElementById('pipDate');
      if (pipDateEl) pipDateEl.textContent = data.gregorian_date;
    }
    if (data.hijri_date) {
      // Format Hijri string into friendly Malaysian Malay e.g. "16 Rabiulawal 1448H"
      document.getElementById('hijriDate').textContent = data.hijri_date;
    }

    // Ribbon Times
    if (data.ribbon_times) {
      Object.entries(data.ribbon_times).forEach(([name, timeStr]) => {
        const el = document.getElementById(`time${name}`);
        if (el) el.textContent = timeStr;
      });
    }

    // Active prayer highlight on ribbon
    const currentSlot = data.current_prayer_slot;
    document.querySelectorAll('.prayer-card').forEach(card => {
      if (card.dataset.prayer === currentSlot) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Countdown to next prayer
    if (data.next_prayer) {
      const nextName = data.next_prayer.toUpperCase();
      const countStr = formatHoursSeconds(data.time_to_next_seconds || 0);

      // Giant countdown widget in top right card
      const giantPrayerEl = document.getElementById('giantNextPrayer');
      if (giantPrayerEl) giantPrayerEl.textContent = nextName;

      const giantCountEl = document.getElementById('giantCountdown');
      if (giantCountEl) giantCountEl.textContent = countStr;

      // Target Azan time label
      const cdTargetEl = document.getElementById('cdTargetTime');
      if (cdTargetEl && data.ribbon_times && data.ribbon_times[data.next_prayer]) {
        cdTargetEl.textContent = `AZAN ${data.ribbon_times[data.next_prayer]}`;
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
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((reg) => console.log('e-Solat App SW registered:', reg.scope))
      .catch((err) => console.warn('e-Solat App SW registration failed:', err));
  }
  startClientClock();
  startBottomWidgetCycle();
  initCanvasInteractionListeners();
  initMaintenanceSystem();
  syncState();
  setInterval(syncState, 1000);
});
