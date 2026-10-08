/**
 * Skywalker e-Solat Kiosk Media Player Engine
 * Robust HLS.js (.m3u8) Official Holy Stream & CloudFront Broadcast Integration
 * Features:
 *  1. Default HLS Makkah Live 24/7 (Kaabah: quran.m3u8) & Madinah Live (sunnah.m3u8)
 *  2. Real-Time Kuliah Mode Switcher (BroadcastChannel & LocalStorage)
 *  3. Intelligent Failover: Auto-fallback to Makkah Live / Slides if Stream fails > 10s
 *  4. Prayer Mode & Adhan Auto-Mute / Pause
 *  5. 30s Auto-Reconnect on temporary network drops
 *  6. Persistent Video Container & Slider Timer isolation (prevents unmount flicker)
 */

(function(window) {
  'use strict';

  const DEFAULT_MEDIA = {
    type: "hls",
    name: "Makkah Live 24/7 (Kaabah)",
    url: "https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8"
  };

  const MEDIA_PRESETS = {
    makkah: {
      id: "makkah",
      name: "Makkah Live 24/7 (Kaabah)",
      type: "hls",
      url: "https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8",
      backup_url: "https://win.holystream.site/live/quran.m3u8"
    },
    madinah: {
      id: "madinah",
      name: "Madinah Live 24/7 (Nabawi)",
      type: "hls",
      url: "https://cdn-globecast.akamaized.net/live/eds/saudi_sunnah/hls_roku/index.m3u8",
      backup_url: "https://win.holystream.site/live/sunnah.m3u8"
    },
    alhijrah: {
      id: "alhijrah",
      name: "TV Al-Hijrah / Berita RTM Live",
      type: "hls",
      url: "https://d25tgymtnqzu8s.cloudfront.net/smil:berita/playlist.m3u8?id=5",
      backup_url: "https://d25n2vd8bc3ll5.cloudfront.net/out/v1/a85d3886cf1646279f53d8650df4e286/index.m3u8"
    },
    hls_sample: {
      id: "hls_sample",
      name: "Strim Ujian HLS (Mux)",
      type: "hls",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
    }
  };

  let currentHlsInstance = null;
  let currentWebRtcPc = null;
  let webRtcSignalPollTimer = null;
  let activeMediaUrl = null;
  let activeMediaType = 'hls';
  let activeMediaMode = 'DEFAULT'; // 'DEFAULT' (Makkah), 'MADINAH', 'ALHIJRAH', 'KULIAH', 'SLIDES'
  let activeOptions = { muted: true, volume: 80 };
  let autoReconnectTimer = null;
  let streamFailoverTimer = null;
  let streamLoadTimeoutTimer = null;
  let isPrayerActive = false;

  /**
   * Helper to retrieve persistent stream container DOM element
   */
  function getStreamContainer() {
    return document.getElementById('persistent-stream-container') ||
           document.getElementById('stageMediaLayer');
  }

  /**
   * Helper to retrieve kiosk video element (supports #hls-video, #kioskVideo, #kioskVideoPlayer, #livePlayer)
   */
  function getVideoElement() {
    return document.getElementById('hls-video') ||
           document.getElementById('kioskVideoPlayer') ||
           document.getElementById('kioskVideo') ||
           document.getElementById('livePlayer');
  }

  /**
   * Helper to retrieve kiosk iframe element (supports #kioskIframe and #kioskIframePlayer)
   */
  function getIframeElement() {
    return document.getElementById('kioskIframe') || document.getElementById('kioskIframePlayer');
  }

  /**
   * Extract YouTube Channel ID (if applicable)
   */
  function extractYouTubeChannelId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/[?&]channel=([a-zA-Z0-9_-]+)/);
    return (match && match[1]) ? match[1] : null;
  }

  /**
   * Extract standard 11-character YouTube video ID
   */
  function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    if (cleanUrl.includes('live_stream?channel=')) return null;
    const regExp = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/;
    const match = cleanUrl.match(regExp);
    return (match && match[1]) ? match[1] : null;
  }

  /**
   * Check if a given URL is a YouTube stream/video
   */
  function isYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /youtube\.com|youtu\.be/i.test(url);
  }

  /**
   * Generate clean autoplay-ready YouTube embed URL
   */
  function getYouTubeEmbedUrl(url, muted = true) {
    if (!url || typeof url !== 'string') return '';
    const cleanUrl = url.trim();
    const muteParam = muted ? 1 : 0;
    const baseParams = `autoplay=1&mute=${muteParam}&controls=0&showinfo=0&rel=0&modestbranding=1&loop=1&enablejsapi=1`;

    const channelId = extractYouTubeChannelId(cleanUrl);
    if (channelId) {
      return `https://www.youtube.com/embed/live_stream?channel=${channelId}&${baseParams}`;
    }

    const videoId = extractYouTubeId(cleanUrl);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?${baseParams}&playlist=${videoId}`;
    }

    if (cleanUrl.includes('youtube.com/embed/')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${sep}${baseParams}`;
    }

    return cleanUrl;
  }

  /**
   * Clear failover & load timers
   */
  function clearFailoverTimer() {
    if (streamFailoverTimer) {
      clearTimeout(streamFailoverTimer);
      streamFailoverTimer = null;
    }
    if (streamLoadTimeoutTimer) {
      clearTimeout(streamLoadTimeoutTimer);
      streamLoadTimeoutTimer = null;
    }
  }

  /**
   * Fallback to Slides when stream fails completely
   */
  function fallbackToSlides() {
    console.warn('[MEDIA] ⚠️ Stream load timed out or failed. Falling back to Slideshow Carousel...');
    const stageMedia = getStreamContainer();
    const stageSlides = document.getElementById('stageSlidesLayer');
    const fallbackLayer = document.getElementById('mediaFallbackLayer');
    if (stageMedia) stageMedia.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (stageSlides) stageSlides.style.display = 'block';
    stopMediaStream();
    if (window.resumeSlideTimer && typeof window.resumeSlideTimer === 'function') {
      window.resumeSlideTimer();
    }
  }

  /**
   * Trigger 10-second stream failover fallback to Slides / Makkah Live
   */
  function scheduleStreamFailover() {
    if (streamFailoverTimer) return;
    console.warn('[MEDIA] ⚠️ Stream error detected. Scheduling 10s failover fallback...');
    streamFailoverTimer = setTimeout(() => {
      console.warn('[MEDIA] 🚨 10s Stream failover threshold reached.');
      if (activeMediaMode === 'KULIAH') {
        switchToDefaultMakkah();
      } else {
        fallbackToSlides();
      }
    }, 10000);
  }

  /**
   * Stop any ongoing video / HLS / YouTube playback safely
   */
  function stopMediaStream() {
    clearAutoReconnectTimer();
    clearFailoverTimer();

    if (webRtcSignalPollTimer) {
      clearInterval(webRtcSignalPollTimer);
      webRtcSignalPollTimer = null;
    }

    if (currentWebRtcPc) {
      try {
        currentWebRtcPc.close();
      } catch (e) {
        console.warn('[MEDIA] Error closing WebRTC peer connection:', e);
      }
      currentWebRtcPc = null;
    }

    if (currentHlsInstance) {
      try {
        currentHlsInstance.destroy();
      } catch (e) {
        console.warn('[MEDIA] Error destroying HLS instance:', e);
      }
      currentHlsInstance = null;
    }

    const video = getVideoElement();
    if (video) {
      try {
        video.pause();
        if (video.srcObject) {
          video.srcObject = null;
        }
        video.removeAttribute('src');
        video.load();
      } catch (e) {
        console.warn('[MEDIA] Error pausing video:', e);
      }
    }

    const iframe = getIframeElement();
    if (iframe) {
      iframe.src = '';
      iframe.style.display = 'none';
    }

    activeMediaUrl = null;
  }

  /**
   * Clear auto-reconnect timer
   */
  function clearAutoReconnectTimer() {
    if (autoReconnectTimer) {
      clearInterval(autoReconnectTimer);
      autoReconnectTimer = null;
    }
  }

  /**
   * Schedule auto-reconnect interval every 30s
   */
  function scheduleAutoReconnect() {
    if (autoReconnectTimer) return;
    console.log('[MEDIA] 🔄 Network issue detected. Scheduling auto-reconnect every 30s...');
    autoReconnectTimer = setInterval(() => {
      if (activeMediaUrl && activeMediaMode !== 'SLIDES') {
        console.log('[MEDIA] 🔄 Attempting stream reconnection for:', activeMediaUrl);
        playStream(activeMediaUrl, activeOptions);
      } else {
        clearAutoReconnectTimer();
      }
    }, 30000);
  }

  /**
   * Update screen live badge
   */
  function updateLiveBadge(badgeTextContent, isLive = true) {
    const badge = document.getElementById('mediaLiveBadge');
    const badgeText = document.getElementById('mediaBadgeText');
    if (badgeText) {
      badgeText.textContent = badgeTextContent;
    }
    if (badge) {
      badge.style.display = isLive ? 'flex' : 'none';
    }
  }

  /**
   * Core Stream Player Function
   * Handles HLS (.m3u8), Direct MP4 / WebRTC, and YouTube Embed with Chromium Autoplay Policy compliance
   */
  function playStream(url, options = {}) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      switchToDefaultMakkah();
      return;
    }

    const cleanUrl = url.trim();
    const video = getVideoElement();
    const iframe = getIframeElement();
    const isMuted = options.muted !== undefined ? options.muted : true;
    const volume = options.volume !== undefined ? options.volume : 80;
    const stageMedia = getStreamContainer();
    const stageSlides = document.getElementById('stageSlidesLayer');
    const fallbackLayer = document.getElementById('mediaFallbackLayer');

    // Pause slideshow carousel rotation completely during live stream to avoid unmount/flicker
    if (window.pauseSlideTimer && typeof window.pauseSlideTimer === 'function') {
      window.pauseSlideTimer();
    }

    if (stageMedia) stageMedia.style.display = 'block';
    if (stageSlides) stageSlides.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';

    // Idempotency check: If currently playing the exact same stream, DO NOT re-initialize to avoid flicker & disconnect
    if (activeMediaUrl === cleanUrl && !options.forceReload) {
      if (currentHlsInstance && video && !video.paused) {
        return;
      }
      if (isYouTubeUrl(cleanUrl) && iframe && iframe.style.display !== 'none' && iframe.src) {
        return;
      }
      if (video && !video.paused && !video.ended && video.src === cleanUrl) {
        return;
      }
    }

    activeMediaUrl = cleanUrl;
    activeMediaType = options.type || (isYouTubeUrl(cleanUrl) ? 'youtube' : 'hls');
    activeOptions = { muted: isMuted, volume: volume, type: activeMediaType };

    // Update Live Badges
    if (activeMediaMode === 'KULIAH') {
      updateLiveBadge('🔴 SIARAN LANGSUNG KULIAH DEWAN', true);
    } else if (cleanUrl.includes('saudi_quran') || cleanUrl.includes('quran.m3u8') || cleanUrl.includes('UC43k_H3fV0v-kZ9h1_H7G6g')) {
      updateLiveBadge('🕋 MAKKAH LIVE 24/7', true);
    } else if (cleanUrl.includes('saudi_sunnah') || cleanUrl.includes('sunnah.m3u8') || cleanUrl.includes('UCyJ7bL974VdYkH_9m6U6xLg')) {
      updateLiveBadge('🕌 MADINAH LIVE 24/7', true);
    } else if (cleanUrl.includes('cloudfront.net') || cleanUrl.includes('alhijrah') || cleanUrl.includes('berita')) {
      updateLiveBadge('📺 TV AL-HIJRAH LIVE', true);
    } else if (cleanUrl.includes('.m3u8') || activeMediaType === 'hls') {
      updateLiveBadge('STRIM LANGSUNG HLS', true);
    } else if (isYouTubeUrl(cleanUrl)) {
      updateLiveBadge('YOUTUBE LIVE', true);
    } else {
      updateLiveBadge('SIARAN LANGSUNG KULIAH', true);
    }

    // Set 10-second stream loading watchdog timeout
    clearFailoverTimer();
    streamLoadTimeoutTimer = setTimeout(() => {
      console.warn('[MEDIA] ⏱️ Stream did not start playing within 10s.');
      scheduleStreamFailover();
    }, 10000);

    // 1. YOUTUBE EMBED STREAM
    if (isYouTubeUrl(cleanUrl) || activeMediaType === 'youtube') {
      if (currentHlsInstance) {
        currentHlsInstance.destroy();
        currentHlsInstance = null;
      }
      if (video) {
        video.pause();
        video.style.display = 'none';
      }

      if (iframe) {
        iframe.style.display = 'block';
        const embedUrl = getYouTubeEmbedUrl(cleanUrl, isMuted);
        if (iframe.src !== embedUrl) {
          iframe.src = embedUrl;
        }
      }
      clearFailoverTimer();
      return;
    }

    // 2. WEBRTC DIRECT PHONE STREAMER
    const isWebRtc = activeMediaType === 'webrtc' || cleanUrl.startsWith('webrtc://') || cleanUrl.includes('/streamer') || cleanUrl === 'webrtc:kuliah';
    if (isWebRtc) {
      playWebRtcStream(cleanUrl, isMuted, volume);
      return;
    }

    // 3. HLS (.m3u8) OR DIRECT VIDEO STREAM
    if (iframe) {
      iframe.style.display = 'none';
      iframe.src = '';
    }

    if (!video) {
      console.warn('[MEDIA] Video element (#hls-video / #kioskVideoPlayer) not found in DOM.');
      return;
    }

    video.style.display = 'block';

    // Chromium Autoplay Policy: MUST be muted and playsinline to prevent black screen blocking
    video.muted = isMuted;
    video.defaultMuted = isMuted;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (isMuted) {
      video.setAttribute('muted', '');
    } else {
      video.removeAttribute('muted');
    }
    video.volume = Math.max(0, Math.min(1, volume / 100));

    const isHls = cleanUrl.includes('.m3u8') || activeMediaType === 'hls';

    if (isHls) {
      if (window.Hls && window.Hls.isSupported()) {
        if (currentHlsInstance) {
          currentHlsInstance.destroy();
          currentHlsInstance = null;
        }
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          autoStartLoad: true
        });
        currentHlsInstance = hls;

        hls.loadSource(cleanUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
          clearFailoverTimer();
          clearAutoReconnectTimer();
          video.muted = isMuted;
          video.setAttribute('playsinline', '');
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch(function(e) {
              console.log('Autoplay blocked:', e);
              video.muted = true;
              video.play().catch(() => {});
            });
          }
        });

        hls.on(window.Hls.Events.ERROR, function(event, data) {
          console.warn('[MEDIA] HLS Event Error:', data.type, data.details);
          if (data.fatal) {
            scheduleStreamFailover();
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[MEDIA] HLS Network error, attempting quick recovery...');
                hls.startLoad();
                scheduleAutoReconnect();
                break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[MEDIA] HLS Media error, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                console.error('[MEDIA] Fatal HLS error, resetting instance:', data);
                hls.destroy();
                scheduleAutoReconnect();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        if (currentHlsInstance) {
          currentHlsInstance.destroy();
          currentHlsInstance = null;
        }
        video.src = cleanUrl;
        video.muted = isMuted;
        video.setAttribute('playsinline', '');
        video.play().then(() => clearFailoverTimer()).catch(function(e) {
          console.log('Autoplay blocked:', e);
          video.muted = true;
          video.play().catch(() => {});
        });
      } else {
        console.warn('[MEDIA] HLS is not supported in this browser environment.');
      }
    } else {
      // Standard Direct Video / WebRTC / MP4
      if (currentHlsInstance) {
        currentHlsInstance.destroy();
        currentHlsInstance = null;
      }
      video.src = cleanUrl;
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => clearFailoverTimer()).catch(function(e) {
          console.log('Autoplay blocked:', e);
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    }
  }

  /**
   * Play WebRTC Phone / Browser Live Stream with automatic signaling exchange
   */
  async function playWebRtcStream(url, isMuted = true, volume = 80) {
    const iframe = getIframeElement();
    if (iframe) {
      iframe.style.display = 'none';
      iframe.src = '';
    }
    if (currentHlsInstance) {
      try {
        currentHlsInstance.destroy();
      } catch (_) {}
      currentHlsInstance = null;
    }
    if (currentWebRtcPc) {
      try {
        currentWebRtcPc.close();
      } catch (_) {}
      currentWebRtcPc = null;
    }
    if (webRtcSignalPollTimer) {
      clearInterval(webRtcSignalPollTimer);
      webRtcSignalPollTimer = null;
    }

    const video = getVideoElement();
    if (!video) return;

    video.style.display = 'block';
    video.muted = isMuted;
    video.defaultMuted = isMuted;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (isMuted) video.setAttribute('muted', '');
    else video.removeAttribute('muted');
    video.volume = Math.max(0, Math.min(1, volume / 100));

    let room = 'kuliah';
    if (url && typeof url === 'string' && url.includes('room=')) {
      const match = url.match(/room=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) room = match[1];
    }

    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    let pc = new RTCPeerConnection(rtcConfig);
    currentWebRtcPc = pc;

    pc.ontrack = (event) => {
      console.log('[MEDIA WebRTC] Remote video track received:', event.track.kind);
      if (video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0];
      }
      clearFailoverTimer();
      clearAutoReconnectTimer();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[MEDIA WebRTC] Autoplay blocked, muting:', err);
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await fetch(`/api/webrtc/ice?room=${encodeURIComponent(room)}&role=receiver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event.candidate)
          });
        } catch (_) {}
      }
    };

    let offerProcessed = false;

    async function checkAndConnectOffer() {
      try {
        const res = await fetch(`/api/webrtc/offer?room=${encodeURIComponent(room)}`);
        if (!res.ok) return;
        const offerData = await res.json();
        if (offerData && offerData.sdp && !offerProcessed) {
          offerProcessed = true;
          await pc.setRemoteDescription(new RTCSessionDescription(offerData));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await fetch(`/api/webrtc/answer?room=${encodeURIComponent(room)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sdp: answer.sdp,
              type: answer.type,
              room: room
            })
          });
          console.log('[MEDIA WebRTC] Answer sent to server for room:', room);
        }

        // Fetch ICE candidates from streamer
        const iceRes = await fetch(`/api/webrtc/ice?room=${encodeURIComponent(room)}&role=streamer`);
        if (iceRes.ok) {
          const candidates = await iceRes.json();
          if (Array.isArray(candidates)) {
            for (const c of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (_) {}
            }
          }
        }
      } catch (e) {
        console.warn('[MEDIA WebRTC] Signaling poll error:', e);
      }
    }

    checkAndConnectOffer();
    webRtcSignalPollTimer = setInterval(checkAndConnectOffer, 1500);
  }

  /**
   * Switch to Default Media (HLS Makkah Live 24/7)
   */
  function switchToDefaultMakkah() {
    activeMediaMode = 'DEFAULT';
    const stageMedia = getStreamContainer();
    const stageSlides = document.getElementById('stageSlidesLayer');
    const fallbackLayer = document.getElementById('mediaFallbackLayer');
    const lowerThird = document.getElementById('kioskLowerThird');
    if (stageMedia) stageMedia.style.display = 'block';
    if (stageSlides) stageSlides.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (lowerThird) lowerThird.style.display = 'none';

    playStream(DEFAULT_MEDIA.url, { type: 'hls', muted: true, volume: 80 });
  }

  /**
   * Switch to Live Kuliah Mode
   */
  function switchToKuliahMode(sourceUrl, type = 'hls', extra = {}) {
    activeMediaMode = 'KULIAH';
    const stageMedia = getStreamContainer();
    const stageSlides = document.getElementById('stageSlidesLayer');
    const fallbackLayer = document.getElementById('mediaFallbackLayer');
    const lowerThird = document.getElementById('kioskLowerThird');

    if (stageMedia) stageMedia.style.display = 'block';
    if (stageSlides) stageSlides.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';

    // Populate Lower-Third Banner if available
    if (lowerThird) {
      if (extra && (extra.speaker || extra.kuliah_ustaz)) {
        const el = document.getElementById('ltSpeakerName');
        if (el) el.textContent = extra.speaker || extra.kuliah_ustaz;
      }
      if (extra && (extra.title || extra.kuliah_title)) {
        const el = document.getElementById('ltTopicTitle');
        if (el) el.textContent = extra.title || extra.kuliah_title;
      }
      if (extra && (extra.kitab || extra.kuliah_kitab)) {
        const el = document.getElementById('ltKitabName');
        if (el) {
          el.textContent = `📖 ${extra.kitab || extra.kuliah_kitab}`;
          el.style.display = 'inline-block';
        }
      }
      lowerThird.style.display = 'flex';
    }

    const cleanUrl = sourceUrl || '/stream/live.m3u8';
    playStream(cleanUrl, { type: type || 'hls', muted: true, volume: 80 });
  }

  /**
   * High-Level Setup Function for Kiosk UI Layers Integration
   */
  function setupMediaStream(url, type, isMuted, volume) {
    const stageMedia = getStreamContainer();
    const stageSlides = document.getElementById('stageSlidesLayer');
    const fallbackLayer = document.getElementById('mediaFallbackLayer');

    const normalizedType = (type || 'slides').toLowerCase();

    // If prayer phase is active (Azan/Iqamah/Solat), silence and hide media
    if (isPrayerActive) {
      stopMediaStream();
      if (stageMedia) stageMedia.style.display = 'none';
      if (stageSlides) stageSlides.style.display = 'none';
      return;
    }

    // 1. Source: SLIDES (Only when explicit slides requested)
    if (normalizedType === 'slides' && (!url || url.trim() === '')) {
      activeMediaMode = 'SLIDES';
      if (stageMedia) stageMedia.style.display = 'none';
      if (fallbackLayer) fallbackLayer.style.display = 'none';
      if (stageSlides) stageSlides.style.display = 'block';
      stopMediaStream();
      if (window.resumeSlideTimer && typeof window.resumeSlideTimer === 'function') {
        window.resumeSlideTimer();
      }
      return;
    }

    // If no URL provided and not explicit slides, default to Makkah Live 24/7 (HLS)
    if (!url || url.trim() === '') {
      switchToDefaultMakkah();
      return;
    }

    if (stageSlides) stageSlides.style.display = 'none';
    if (fallbackLayer) fallbackLayer.style.display = 'none';
    if (stageMedia) stageMedia.style.display = 'block';

    playStream(url, { type: normalizedType, muted: isMuted, volume: volume });
  }

  /**
   * Handle Prayer State Changes (Azan / Iqamah / Solat)
   */
  function handlePrayerStateChange(state) {
    isPrayerActive = (state && state !== 'NORMAL');
    const video = getVideoElement();
    const iframe = getIframeElement();
    if (isPrayerActive) {
      if (video) {
        video.muted = true;
        video.pause();
      }
      if (iframe) {
        try {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        } catch (_) {}
      }
    } else {
      if (activeMediaUrl) {
        playStream(activeMediaUrl, activeOptions);
      } else {
        switchToDefaultMakkah();
      }
    }
  }

  // Cross-Window & Tab Real-Time Sync via BroadcastChannel & LocalStorage
  function handleMediaSyncEvent(data) {
    if (!data) return;

    if (data.mode === 'KULIAH' || (data.action === 'SWITCH_MEDIA' && (data.mode || '').toUpperCase() === 'KULIAH')) {
      switchToKuliahMode(data.sourceUrl || data.media_stream_url, data.streamType || data.type || 'hls', data);
      return;
    } else if (data.mode === 'DEFAULT' || (data.action === 'SWITCH_MEDIA' && (data.mode || '').toUpperCase() === 'DEFAULT')) {
      switchToDefaultMakkah();
      return;
    }

    if (data.type === 'kiosk_media_config' || data.type === 'media_update') {
      const cfg = data.media_config || data;
      if (cfg) {
        if (cfg.mode === 'KULIAH') {
          switchToKuliahMode(cfg.sourceUrl || cfg.media_stream_url, cfg.streamType || cfg.media_source_type || 'hls', cfg);
        } else {
          setupMediaStream(cfg.media_stream_url || '', cfg.media_source_type || 'stream', true, 80);
        }
      }
    }
  }

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const syncChannel = new BroadcastChannel('esolat_sync');
      syncChannel.onmessage = (e) => handleMediaSyncEvent(e.data);

      const mediaChannel = new BroadcastChannel('esolat_media_channel');
      mediaChannel.onmessage = (e) => handleMediaSyncEvent(e.data);
    }
  } catch (e) {
    console.warn('[MEDIA] BroadcastChannel error:', e);
  }

  window.addEventListener('storage', function(event) {
    if ((event.key === 'kiosk_media_config' || event.key === 'esolat_media_channel') && event.newValue) {
      try {
        const cfg = JSON.parse(event.newValue);
        handleMediaSyncEvent(cfg);
      } catch (e) {}
    }
  });

  window.addEventListener('online', function() {
    console.log('[MEDIA] 🌐 Network online resumed. Re-triggering active stream...');
    if (activeMediaUrl) {
      playStream(activeMediaUrl, activeOptions);
    } else {
      switchToDefaultMakkah();
    }
  });

  // Export functions to global window object
  window.DEFAULT_MEDIA = DEFAULT_MEDIA;
  window.MEDIA_PRESETS = MEDIA_PRESETS;
  window.extractYouTubeId = extractYouTubeId;
  window.extractYouTubeChannelId = extractYouTubeChannelId;
  window.getYouTubeEmbedUrl = getYouTubeEmbedUrl;
  window.isYouTubeUrl = isYouTubeUrl;
  window.playStream = playStream;
  window.stopMediaStream = stopMediaStream;
  window.setupMediaStream = setupMediaStream;
  window.switchToDefaultMakkah = switchToDefaultMakkah;
  window.switchToKuliahMode = switchToKuliahMode;
  window.handlePrayerStateChange = handlePrayerStateChange;
  window.fallbackToSlides = fallbackToSlides;

  window.mediaPlayerEngine = {
    DEFAULT_MEDIA,
    MEDIA_PRESETS,
    extractYouTubeId,
    extractYouTubeChannelId,
    getYouTubeEmbedUrl,
    isYouTubeUrl,
    playStream,
    stopMediaStream,
    setupMediaStream,
    switchToDefaultMakkah,
    switchToKuliahMode,
    handlePrayerStateChange,
    fallbackToSlides,
    getVideoElement,
    getIframeElement,
    getStreamContainer,
    getHlsInstance: () => currentHlsInstance,
    getActiveMode: () => activeMediaMode,
    getActiveUrl: () => activeMediaUrl
  };

})(typeof window !== 'undefined' ? window : this);
