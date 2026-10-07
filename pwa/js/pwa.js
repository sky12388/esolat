/**
 * Skywalker e-Solat SPA Remote Controller
 * 100% Standalone PWA Architecture — Zero window.location.href redirects!
 */

let activeSurauHost = '';
let pollIntervalTimer = null;
let deferredInstallPrompt = null;
let html5QrScanner = null;
let isUserEditingTicker = false;
let isUserDraggingVolume = false;

const STORAGE_KEY_LAST_IP = 'esolat_remote_last_ip';
const STORAGE_KEY_HISTORY = 'esolat_remote_ip_history';

document.addEventListener('DOMContentLoaded', () => {
  setupPWAInstallation();
  initConnectionUI();
  initDashboardActions();
  renderConnectionHistory();

  // Auto-connect to last saved surau IP if available
  const savedHost = localStorage.getItem(STORAGE_KEY_LAST_IP);
  if (savedHost) {
    const input = document.getElementById('inputSurauIp');
    if (input) input.value = savedHost;
    showQuickReconnectCard(savedHost);
  }
});

// ==================== 1. PWA INSTALLATION LOGIC ====================
function setupPWAInstallation() {
  const installCard = document.getElementById('pwaInstallCard');
  const btnInstall = document.getElementById('btnTriggerInstall');

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((reg) => console.log('[PWA Remote] SW registered:', reg.scope))
        .catch((err) => console.warn('[PWA Remote] SW registration failed:', err));
    });
  }

  // Handle Chrome / Android WebAPK prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installCard) {
      installCard.style.display = 'block';
    }
  });

  // Check if running in standalone PWA mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone && installCard) {
    installCard.style.display = 'none';
  }

  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Aplikasi e-Solat Remote berjaya dipasang!');
          if (installCard) installCard.style.display = 'none';
        }
        deferredInstallPrompt = null;
      } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          alert('Panduan Pasang iPhone/iPad:\n1. Tekan butang Share (Kongsi) di bawah pelayar Safari\n2. Pilih "Add to Home Screen" (Tambah ke Skrin Utama)');
        } else {
          alert('Untuk memasang:\nTekan menu 3 titik di atas pelayar Chrome dan pilih "Pasang aplikasi" (Install app) atau "Tambah ke Skrin Utama".');
        }
      }
    });
  }
}

// ==================== 2. CONNECTION & ROUTING LOGIC ====================
function initConnectionUI() {
  const inputIp = document.getElementById('inputSurauIp');
  const btnConnect = document.getElementById('btnConnectSurau');
  const btnQuickConnect = document.getElementById('btnQuickReconnect');
  const btnScanQr = document.getElementById('btnScanQr');
  const btnCloseScanner = document.getElementById('btnCloseScanner');
  const btnDisconnect = document.getElementById('btnDisconnect');

  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      const rawIp = inputIp.value.trim();
      connectToSurau(rawIp);
    });
  }

  if (btnQuickConnect) {
    btnQuickConnect.addEventListener('click', () => {
      const saved = localStorage.getItem(STORAGE_KEY_LAST_IP);
      if (saved) connectToSurau(saved);
    });
  }

  if (inputIp) {
    inputIp.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') connectToSurau(inputIp.value.trim());
    });
  }

  if (btnScanQr) btnScanQr.addEventListener('click', openQrScanner);
  if (btnCloseScanner) btnCloseScanner.addEventListener('click', closeQrScanner);

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      disconnectFromSurau();
    });
  }
}

function cleanHostString(rawInput) {
  if (!rawInput) return '';
  let host = rawInput.trim();
  // Remove protocols
  host = host.replace(/^https?:\/\//i, '');
  // Remove trailing slashes and paths
  host = host.split('/')[0];
  // Add default port if not provided
  if (!host.includes(':')) {
    host = `${host}:8080`;
  }
  return host;
}

function getBaseApiUrl(host) {
  return `http://${host}`;
}

async function remoteApiCall(endpoint, method = 'GET', body = null, timeoutMs = 4000) {
  if (!activeSurauHost) throw new Error('Tiada TV surau yang disambungkan.');
  
  const url = `${getBaseApiUrl(activeSurauHost)}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const options = {
    method,
    mode: 'cors',
    signal: controller.signal,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Ralat HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Sambungan tamat masa (Timeout). Pastikan peranti dan TV berada di Wi-Fi yang sama.');
    }
    throw err;
  }
}

async function connectToSurau(rawInput) {
  const host = cleanHostString(rawInput);
  if (!host) {
    showToast('Sila masukkan alamat IP TV surau!', true);
    return;
  }

  showToast(`Menyambung ke TV ${host}...`);

  try {
    activeSurauHost = host;
    const state = await remoteApiCall('/api/state', 'GET', null, 3500);

    // Connection Successful!
    localStorage.setItem(STORAGE_KEY_LAST_IP, host);
    saveToHistory(host);

    showToast(`✓ Berjaya disambung ke ${state.settings?.mosque_name || 'TV Surau'}!`);
    switchViewToDashboard(host);
    updateDashboardUI(state);
    startPollingLoop();

  } catch (err) {
    activeSurauHost = '';
    showToast(`Gagal menyambung ke ${host}: ${err.message}`, true);
  }
}

function disconnectFromSurau() {
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
    pollIntervalTimer = null;
  }
  activeSurauHost = '';
  document.getElementById('pairingView').style.display = 'flex';
  document.getElementById('dashboardView').style.display = 'none';
  showToast('Sambungan diputuskan.');
}

function switchViewToDashboard(host) {
  document.getElementById('pairingView').style.display = 'none';
  document.getElementById('dashboardView').style.display = 'flex';
  document.getElementById('dashHostIp').textContent = host;
}

function showQuickReconnectCard(savedHost) {
  const quickCard = document.getElementById('quickReconnectCard');
  const textHost = document.getElementById('quickSavedHost');
  if (quickCard && textHost) {
    textHost.textContent = savedHost;
    quickCard.style.display = 'block';
  }
}

function saveToHistory(host) {
  try {
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
    history = history.filter(item => item.host !== host);
    history.unshift({
      host: host,
      date: new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    });
    if (history.length > 5) history.pop();
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    renderConnectionHistory();
  } catch (e) {}
}

function renderConnectionHistory() {
  const container = document.getElementById('historyContainer');
  const listEl = document.getElementById('historyList');
  if (!container || !listEl) return;

  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
    if (history.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    listEl.innerHTML = '';

    history.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `
        <div>
          <div class="history-host">${item.host}</div>
          <div class="history-time">Disambung: ${item.date}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" style="width: auto; padding: 0.35rem 0.75rem;">
          Sambung ➔
        </button>
      `;
      row.querySelector('button').onclick = () => connectToSurau(item.host);
      listEl.appendChild(row);
    });
  } catch (e) {
    container.style.display = 'none';
  }
}

// ==================== 3. LIVE POLLING & DASHBOARD UI ====================
function startPollingLoop() {
  if (pollIntervalTimer) clearInterval(pollIntervalTimer);

  pollIntervalTimer = setInterval(async () => {
    if (!activeSurauHost) return;
    try {
      const state = await remoteApiCall('/api/state', 'GET', null, 2000);
      updateDashboardUI(state);
    } catch (e) {
      console.warn('[Remote Poll Warning]', e.message);
    }
  }, 1000);
}

function updateDashboardUI(data) {
  if (!data) return;

  const s = data.settings || {};

  // Mosque Name
  if (s.mosque_name) {
    document.getElementById('dashMosqueName').textContent = s.mosque_name;
  }

  // Live Clock
  if (data.current_time) {
    document.getElementById('dashLiveClock').textContent = data.current_time;
  }

  // State Badge
  const badgeEl = document.getElementById('dashStateBadge');
  if (badgeEl) {
    const state = data.state || 'NORMAL';
    const prayer = (data.active_prayer || data.current_prayer || '').toUpperCase();
    
    if (state === 'ADHAN') {
      badgeEl.className = 'badge badge-gold';
      badgeEl.textContent = `📢 AZAN ${prayer}`;
    } else if (state === 'IQAMAH') {
      badgeEl.className = 'badge badge-gold';
      badgeEl.textContent = `⏳ IQAMAH ${prayer}`;
    } else if (state === 'SOLAT') {
      badgeEl.className = 'badge';
      badgeEl.textContent = `🕌 MOD SOLAT (${prayer})`;
    } else if (state === 'PRE_ADHAN') {
      badgeEl.className = 'badge badge-gold';
      badgeEl.textContent = `🔔 MENJELANG ${prayer}`;
    } else {
      badgeEl.className = 'badge';
      badgeEl.textContent = `🟢 MOD NORMAL (${prayer || 'TAKWIN'})`;
    }
  }

  // Next Prayer & Countdown
  if (data.state === 'NORMAL') {
    document.getElementById('dashNextPrayerLabel').textContent = 'WAKTU SETERUSNYA';
    document.getElementById('dashNextPrayerName').textContent = (data.next_prayer || 'Solat').toUpperCase();
    document.getElementById('dashCountdownDigits').textContent = formatSeconds(data.time_to_next_seconds || 0);
  } else {
    document.getElementById('dashNextPrayerLabel').textContent = `FASA ${data.state}`;
    document.getElementById('dashNextPrayerName').textContent = (data.active_prayer || 'Solat').toUpperCase();
    document.getElementById('dashCountdownDigits').textContent = formatSeconds(data.countdown_seconds || 0);
  }

  // Ribbon Prayer Times
  if (data.ribbon_times) {
    Object.entries(data.ribbon_times).forEach(([name, timeStr]) => {
      const el = document.getElementById(`rb${name}`);
      if (el) el.textContent = timeStr;
    });
  }

  // Volume Slider Sync (Only if user is not actively dragging)
  if (!isUserDraggingVolume && typeof s.audio_volume !== 'undefined') {
    const slider = document.getElementById('sliderVolume');
    const lbl = document.getElementById('lblVolumePercent');
    if (slider) slider.value = s.audio_volume;
    if (lbl) lbl.textContent = `${s.audio_volume}%`;
  }

  // Running Ticker Sync (Only if user is not actively typing)
  if (!isUserEditingTicker && typeof s.ticker_text !== 'undefined') {
    const inputTicker = document.getElementById('inputTicker');
    if (inputTicker && inputTicker.value !== s.ticker_text && document.activeElement !== inputTicker) {
      inputTicker.value = s.ticker_text;
    }
  }

  // Janazah Sync
  const checkJanazah = document.getElementById('checkJanazah');
  const janazahForm = document.getElementById('janazahForm');
  const inputArwah = document.getElementById('inputArwahName');
  if (checkJanazah && typeof s.janazah_enabled !== 'undefined') {
    const isEnabled = s.janazah_enabled === '1' || s.janazah_enabled === true;
    checkJanazah.checked = isEnabled;
    if (janazahForm) janazahForm.style.display = isEnabled ? 'flex' : 'none';
    if (inputArwah && s.janazah_arwah_name && document.activeElement !== inputArwah) {
      inputArwah.value = s.janazah_arwah_name;
    }
  }
}

function formatSeconds(totalSec) {
  if (isNaN(totalSec) || totalSec < 0) return '00:00';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ==================== 4. REMOTE DASHBOARD ACTION HANDLERS ====================
function initDashboardActions() {
  // A. Big Iqamah Now Action
  const btnIqamahNow = document.getElementById('btnActionIqamahNow');
  if (btnIqamahNow) {
    btnIqamahNow.addEventListener('click', async () => {
      try {
        const res = await remoteApiCall('/api/iqamah/now', 'POST', {});
        showToast(`⚡ ${res.message || 'Iqamah ditamatkan! Skrin beralih ke mod Solat.'}`);
      } catch (err) {
        showToast(`Gagal: ${err.message}`, true);
      }
    });
  }

  // B. Audio Actions
  const btnTestSubuh = document.getElementById('btnTestSubuh');
  if (btnTestSubuh) {
    btnTestSubuh.addEventListener('click', async () => {
      try {
        const res = await remoteApiCall('/api/audio/test-kiosk', 'POST', { sound: 'subuh', file_name: 'adhan_subuh.mp3' });
        showToast('📢 Alunan Azan Subuh dimainkan pada pembesar suara TV.');
      } catch (err) {
        showToast(`Ralat audio: ${err.message}`, true);
      }
    });
  }

  const btnTestAdhan = document.getElementById('btnTestAdhan');
  if (btnTestAdhan) {
    btnTestAdhan.addEventListener('click', async () => {
      try {
        const res = await remoteApiCall('/api/audio/test-kiosk', 'POST', { sound: 'adhan', file_name: 'adhan.mp3' });
        showToast('🕌 Alunan Azan Lazim dimainkan pada pembesar suara TV.');
      } catch (err) {
        showToast(`Ralat audio: ${err.message}`, true);
      }
    });
  }

  const btnTestBeep = document.getElementById('btnTestBeep');
  if (btnTestBeep) {
    btnTestBeep.addEventListener('click', async () => {
      try {
        const res = await remoteApiCall('/api/audio/test-kiosk', 'POST', { sound: 'beep', file_name: 'beep.wav' });
        showToast('🔔 Nada Bilal (Beep) dimainkan.');
      } catch (err) {
        showToast(`Ralat audio: ${err.message}`, true);
      }
    });
  }

  const btnStopAudio = document.getElementById('btnStopAudio');
  if (btnStopAudio) {
    btnStopAudio.addEventListener('click', async () => {
      try {
        const res = await remoteApiCall('/api/audio/test-kiosk', 'POST', { action: 'stop' });
        showToast('⏹️ Semua output audio TV dihentikan.');
      } catch (err) {
        showToast(`Ralat: ${err.message}`, true);
      }
    });
  }

  // C. Volume Slider Live Sync
  const slider = document.getElementById('sliderVolume');
  const lblVol = document.getElementById('lblVolumePercent');
  if (slider) {
    slider.addEventListener('input', () => {
      isUserDraggingVolume = true;
      if (lblVol) lblVol.textContent = `${slider.value}%`;
    });

    slider.addEventListener('change', async () => {
      const vol = parseInt(slider.value, 10);
      try {
        await remoteApiCall('/api/settings', 'POST', { audio_volume: vol, audio_azan_volume: vol });
        showToast(`🔊 Kelantangan TV ditetapkan ke ${vol}%`);
      } catch (err) {
        showToast(`Gagal menetapkan kelantangan: ${err.message}`, true);
      } finally {
        setTimeout(() => { isUserDraggingVolume = false; }, 800);
      }
    });
  }

  // D. Simulation Controls
  const setupSimBtn = (btnId, state, duration = 10) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await remoteApiCall('/api/state/test_mode', 'POST', { state, prayer: 'Zohor', duration });
        showToast(`🔄 Simulasi fasa ${state} diaktifkan di TV (${duration}s).`);
      } catch (err) {
        showToast(`Ralat simulasi: ${err.message}`, true);
      }
    });
  };

  setupSimBtn('btnSimAdhan', 'ADHAN', 10);
  setupSimBtn('btnSimIqamah', 'IQAMAH', 10);
  setupSimBtn('btnSimSolat', 'SOLAT', 10);

  const btnSimDemo = document.getElementById('btnSimDemo');
  if (btnSimDemo) {
    btnSimDemo.addEventListener('click', async () => {
      try {
        await remoteApiCall('/api/state/demo_sequence', 'POST', { prayer: 'Zohor' });
        showToast('▶️ Demo urutan solat 35s dilancarkan pada TV Kiosk!');
      } catch (err) {
        showToast(`Ralat demo: ${err.message}`, true);
      }
    });
  }

  const btnSimClear = document.getElementById('btnSimClear');
  if (btnSimClear) {
    btnSimClear.addEventListener('click', async () => {
      try {
        await remoteApiCall('/api/state/clear_test', 'POST', {});
        showToast('✓ Ujian dibatalkan. TV kembali ke paparan waktu solat normal.');
      } catch (err) {
        showToast(`Ralat: ${err.message}`, true);
      }
    });
  }

  // E. Ticker Update
  const inputTicker = document.getElementById('inputTicker');
  const btnSaveTicker = document.getElementById('btnSaveTicker');
  if (inputTicker) {
    inputTicker.addEventListener('focus', () => { isUserEditingTicker = true; });
    inputTicker.addEventListener('blur', () => { setTimeout(() => { isUserEditingTicker = false; }, 1000); });
  }

  if (btnSaveTicker && inputTicker) {
    btnSaveTicker.addEventListener('click', async () => {
      const text = inputTicker.value.trim();
      try {
        await remoteApiCall('/api/settings', 'POST', { ticker_text: text });
        showToast('💾 Mesej teks bergerak TV berjaya dikemas kini!');
      } catch (err) {
        showToast(`Gagal kemas kini teks: ${err.message}`, true);
      }
    });
  }

  // F. Janazah Switch & Update
  const checkJanazah = document.getElementById('checkJanazah');
  const janazahForm = document.getElementById('janazahForm');
  const btnSaveJanazah = document.getElementById('btnSaveJanazah');
  const inputArwah = document.getElementById('inputArwahName');

  if (checkJanazah) {
    checkJanazah.addEventListener('change', async () => {
      const isEnabled = checkJanazah.checked;
      if (janazahForm) janazahForm.style.display = isEnabled ? 'flex' : 'none';
      if (!isEnabled) {
        try {
          await remoteApiCall('/api/settings', 'POST', { janazah_enabled: '0' });
          showToast('🖤 Notis Janazah ditutup.');
        } catch (err) {
          showToast(`Ralat: ${err.message}`, true);
        }
      }
    });
  }

  if (btnSaveJanazah && inputArwah) {
    btnSaveJanazah.addEventListener('click', async () => {
      const name = inputArwah.value.trim();
      try {
        await remoteApiCall('/api/settings', 'POST', {
          janazah_enabled: '1',
          janazah_arwah_name: name,
          janazah_solat_time: 'Selepas Solat Terdekat'
        });
        showToast('🖤 Notis Janazah kini dipaparkan di TV dewan solat.');
      } catch (err) {
        showToast(`Gagal: ${err.message}`, true);
      }
    });
  }
}

// ==================== 5. CAMERA QR SCANNER ====================
function openQrScanner() {
  const modal = document.getElementById('scannerModal');
  if (!modal) return;
  modal.style.display = 'flex';

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode('qrReaderViewport');
  }

  const qrConfig = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrScanner.start(
    { facingMode: 'environment' },
    qrConfig,
    (decodedText) => {
      console.log('[QR Scanned]', decodedText);
      handleQrDecoded(decodedText);
      closeQrScanner();
    },
    () => {}
  ).catch(err => {
    alert('Gagal mengakses kamera telefon: ' + err);
    closeQrScanner();
  });
}

function closeQrScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) modal.style.display = 'none';

  if (html5QrScanner && html5QrScanner.isScanning) {
    html5QrScanner.stop().catch(() => {});
  }
}

function handleQrDecoded(scannedText) {
  let host = cleanHostString(scannedText);
  const input = document.getElementById('inputSurauIp');
  if (input) input.value = host;
  connectToSurau(host);
}

// ==================== 6. TOAST NOTIFICATIONS ====================
function showToast(text, isError = false) {
  let toast = document.getElementById('toastMsg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastMsg';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.className = `toast-msg ${isError ? 'error' : ''} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}
