/**
 * e-Solat Mobile Admin Web Panel Controller
 * Handles authentication, GPS zone detection, takwim sync, adhan toggles,
 * media slide uploads, custom tickers, and offline machine-locked license activation.
 */

let authToken = localStorage.getItem('esolat_token') || '';
let currentSettings = {};
let availableZones = [];

// ==================== UTILS & TOASTS ====================
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function broadcastAdminSync(type = 'SETTINGS_UPDATED', payload = {}) {
  try {
    const ch = new BroadcastChannel('esolat_sync');
    ch.postMessage(Object.assign({ type, timestamp: Date.now() }, payload));
  } catch (_) {}
}

function formatNetworkErrorMessage(err) {
  if (window.location.protocol === 'https:') {
    return 'Pelayar menyekat sambungan HTTP tempatan (Mixed Content / HTTPS-ke-HTTP). Sila buka terus URL Tempatan LAN: http://[IP_PC]:8080/admin pada peranti anda.';
  }
  return `Gagal berhubung ke pelayan e-Solat (${err.message || 'Network Error'}). Sila pastikan PC Kiosk hidup dan peranti berada dalam satu rangkaian Wi-Fi yang sama (Port 8080).`;
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(endpoint, options);
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        handleUnauthorized();
      }
      throw new Error(data.message || 'Ralat komunikasi dengan pelayan');
    }
    return data;
  } catch (err) {
    if (window.location.protocol === 'https:') {
      console.warn('Mixed Content Warning: Direct HTTP fetch from HTTPS origin is blocked by modern browsers.');
    }
    throw err;
  }
}

function handleUnauthorized() {
  authToken = '';
  localStorage.removeItem('esolat_token');
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
}

// ==================== AUTHENTICATION ====================
async function checkAuth() {
  if (!authToken) {
    document.getElementById('loginModal').style.display = 'flex';
    return;
  }

  try {
    const me = await apiRequest('/api/auth/me');
    if (me.authenticated) {
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';

      if (me.force_password_change) {
        document.getElementById('changePasswordModal').style.display = 'flex';
      }
      initApp();
    } else {
      handleUnauthorized();
    }
  } catch (err) {
    handleUnauthorized();
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  const alertEl = document.getElementById('loginConnectionAlert');
  if (alertEl) alertEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      authToken = data.token;
      localStorage.setItem('esolat_token', authToken);
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';

      if (data.force_password_change) {
        document.getElementById('changePasswordModal').style.display = 'flex';
      }
      showToast('Log masuk berjaya.');
      initApp();
    } else {
      showToast(data.message || 'Nama pengguna atau kata laluan tidak sah.', true);
    }
  } catch (err) {
    const errorMsg = formatNetworkErrorMessage(err);
    showToast(errorMsg, true);
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.innerHTML = `<strong>⚠️ Ralat Sambungan / Mixed Content:</strong> ${errorMsg}`;
    }
  }
});

document.getElementById('forcePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = document.getElementById('newPassword').value.trim();
  const p2 = document.getElementById('confirmPassword').value.trim();

  if (p1 !== p2) {
    showToast('Kata laluan tidak sepadan!', true);
    return;
  }
  if (p1 !== '' && p1.length < 4) {
    showToast('Kata laluan sekurang-kurangnya 4 aksara!', true);
    return;
  }

  try {
    const res = await apiRequest('/api/auth/change_password', 'POST', { new_password: p1 });
    showToast(res.message || 'Kata laluan berjaya dikemas kini!');
    document.getElementById('changePasswordModal').style.display = 'none';
  } catch (err) {
    showToast(err.message, true);
  }
});

// Admin Password Panel Handler
const adminChangePasswordForm = document.getElementById('adminChangePasswordForm');
if (adminChangePasswordForm) {
  adminChangePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('adminNewPassInput').value.trim();
    const p2 = document.getElementById('adminConfirmPassInput').value.trim();

    if (p1 !== p2) {
      showToast('Kata laluan pengesahan tidak sepadan!', true);
      return;
    }
    if (p1 !== '' && p1.length < 4) {
      showToast('Kata laluan sekurang-kurangnya 4 aksara (atau klik butang Kosongkan Kata Laluan)!', true);
      return;
    }

    try {
      const res = await apiRequest('/api/auth/change_password', 'POST', { new_password: p1 });
      showToast(res.message || 'Kata laluan berjaya dikemas kini!');
      document.getElementById('adminNewPassInput').value = '';
      document.getElementById('adminConfirmPassInput').value = '';
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Reset to Blank Password Handler
const btnResetBlankPass = document.getElementById('btnResetBlankPass');
if (btnResetBlankPass) {
  btnResetBlankPass.addEventListener('click', async () => {
    if (!confirm('Adakah anda pasti mahu mengosongkan kata laluan pentadbir? Anda akan dapat log masuk terus tanpa perlu menaip kata laluan.')) {
      return;
    }
    try {
      const res = await apiRequest('/api/auth/change_password', 'POST', { new_password: '' });
      showToast(res.message || 'Kata laluan telah dikosongkan!');
      document.getElementById('adminNewPassInput').value = '';
      document.getElementById('adminConfirmPassInput').value = '';
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Top Bar Password Button
const btnTopPassword = document.getElementById('btnTopPassword');
if (btnTopPassword) {
  btnTopPassword.addEventListener('click', () => {
    const dashNav = document.querySelector('.nav-item[data-tab="tabDashboard"]');
    if (dashNav) dashNav.click();
    const panel = document.getElementById('adminPasswordPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = document.getElementById('adminNewPassInput');
      if (input) setTimeout(() => input.focus(), 300);
    }
  });
}

// Open Screen PIN Modal Button
const btnOpenPinModal = document.getElementById('btnOpenPinModal');
if (btnOpenPinModal) {
  btnOpenPinModal.addEventListener('click', () => {
    promptKioskPinSetup();
  });
}

document.getElementById('btnLogout').addEventListener('click', () => {
  if (confirm('Adakah anda pasti untuk log keluar?')) {
    handleUnauthorized();
  }
});

// ==================== TAB NAVIGATION ====================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetPane = document.getElementById(targetTabId);
    if (targetPane) targetPane.classList.add('active');
  });
});

const btnGoLic = document.getElementById('btnGoToLicense');
if (btnGoLic) {
  btnGoLic.addEventListener('click', () => {
    const tabLic = document.querySelector('.nav-item[data-tab="tabLicense"]');
    if (tabLic) tabLic.click();
    else showToast('Sila hubungi sokongan teknikal: +6011-1871 2388');
  });
}

// ==================== INITIALIZATION & DATA LOADING ====================
async function initApp() {
  await loadZones();
  await loadSettings();
  await loadAudioList();
  await loadQuranAudioList();
  await loadLicenseStatus();
  await loadSlides();
  await checkCameraStatus();
  await loadStorageInfo();
  await loadRecordings();
  startStatusPoller();
  initQuranAudioSystem();
  setInterval(checkCameraStatus, 3000);
}

async function loadZones() {
  try {
    const res = await apiRequest('/api/zones');
    availableZones = res.zones || [];
    const select = document.getElementById('selectJakimZone');
    select.innerHTML = '';

    // Group by state
    const states = {};
    availableZones.forEach(z => {
      if (!states[z.state]) states[z.state] = [];
      states[z.state].push(z);
    });

    Object.keys(states).sort().forEach(stateName => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = stateName;
      states[stateName].forEach(z => {
        const opt = document.createElement('option');
        opt.value = z.code;
        opt.textContent = `${z.code} - ${z.location}`;
        optGroup.appendChild(opt);
      });
      select.appendChild(optGroup);
    });
  } catch (err) {
    console.error('Error loading zones:', err);
  }
}

async function loadSettings() {
  let s = null;
  try {
    s = await apiRequest('/api/settings');
    currentSettings = s;
    localStorage.setItem('esolat_admin_settings', JSON.stringify(s));
    if (s.jakim_zone) localStorage.setItem('esolat_zone', s.jakim_zone);
  } catch (err) {
    try {
      s = JSON.parse(localStorage.getItem('esolat_admin_settings') || '{}');
      currentSettings = s;
    } catch (_) {}
  }
  if (!s) s = {};

  try {

    // Header & Titles
    const headerTitleEl = document.getElementById('appHeaderTitle');
    if (headerTitleEl) headerTitleEl.textContent = 'Skywalker E-Solat Manager';
    const mosqueTitleEl = document.getElementById('appMosqueTitle');
    if (mosqueTitleEl) mosqueTitleEl.textContent = s.mosque_name || 'Surau Darul Taqwa';
    const zoneSubtitleEl = document.getElementById('appZoneSubtitle');
    if (zoneSubtitleEl) zoneSubtitleEl.textContent = `${s.mosque_name || 'Surau Darul Taqwa'} • Zon: ${s.jakim_zone || 'SGR01'}`;
    document.getElementById('statZone').textContent = s.jakim_zone || 'SGR01';

    // Zone select
    if (s.jakim_zone) {
      document.getElementById('selectJakimZone').value = s.jakim_zone;
    }

    // Offsets
    ['subuh', 'syuruk', 'zohor', 'asar', 'maghrib', 'isyak'].forEach(p => {
      const el = document.getElementById(`offset_${p}`);
      if (el) el.value = s[`offset_${p}`] || 0;
    });

    // Adhan modes
    ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'].forEach(p => {
      const el = document.getElementById(`adhan_mode_${p}`);
      if (el) el.value = s[`adhan_mode_${p}`] || 'auto';
    });

    // Iqamah & Solat duration
    const defaultIqamahMap = { subuh: 10, zohor: 7, asar: 7, maghrib: 5, isyak: 7, jumaat: 0 };
    ['subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat'].forEach(p => {
      const el = document.getElementById(`iqamah_${p}`);
      if (el) el.value = s[`iqamah_${p}`] !== undefined ? s[`iqamah_${p}`] : defaultIqamahMap[p];
    });
    document.getElementById('solat_duration').value = s.solat_duration || 12;

    // Mosque & Ticker Info
    document.getElementById('inputMosqueName').value = s.mosque_name || '';
    document.getElementById('inputMosqueLocation').value = s.mosque_location || '';
    document.getElementById('inputTickerText').value = s.ticker_text || '';
    document.getElementById('inputBankName').value = s.bank_name || '';
    document.getElementById('inputBankAcc').value = s.bank_account_no || '';
    document.getElementById('inputBankHolder').value = s.bank_account_holder || '';

    // Hijri Islamic Events Countdown Toggle
    const isHijriCountdownOn = (s.hijri_countdown_enabled !== '0' && s.hijri_countdown_enabled !== false);
    const swCountdown = document.getElementById('switchHijriCountdown');
    if (swCountdown) swCountdown.checked = isHijriCountdownOn;
    const swCountdownTicker = document.getElementById('switchHijriCountdownTicker');
    if (swCountdownTicker) swCountdownTicker.checked = isHijriCountdownOn;

    // Typography Font Family
    const fontChoice = (s.kiosk_font_family || 'outfit').toLowerCase();
    const fontRadio = document.querySelector(`input[name="kiosk_font_family"][value="${fontChoice}"]`);
    if (fontRadio) fontRadio.checked = true;

    // Multi-Source Layout Mode
    const activeLayout = s.active_layout_mode || 'fullscreen_signage';
    const layoutRadio = document.querySelector(`input[name="active_layout_mode"][value="${activeLayout}"]`);
    if (layoutRadio) layoutRadio.checked = true;
    const dashLayoutRadio = document.querySelector(`input[name="dash_active_layout_mode"][value="${activeLayout}"]`);
    if (dashLayoutRadio) dashLayoutRadio.checked = true;

    document.querySelectorAll('#multiLayoutSelectorGrid .layout-option, #dashLayoutSelectorGrid .layout-option').forEach(opt => {
      if (opt.dataset.layoutMode === activeLayout) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    // Media Source Inputs
    const elVideoType = document.getElementById('selectVideoType');
    if (elVideoType) elVideoType.value = s.video_source_type || 'mp4';
    const elVideoUrl = document.getElementById('inputVideoUrl');
    if (elVideoUrl) elVideoUrl.value = s.video_source_url || '';

    // Audio & Volume
    const checkAudio = document.getElementById('checkVideoAudio');
    if (checkAudio) checkAudio.checked = (s.video_audio_enabled === '1' || s.video_audio_enabled === true);
    const rangeVol = document.getElementById('rangeVideoVolume');
    const volLabel = document.getElementById('videoVolLabel');
    const volVal = s.video_volume || '80';
    if (rangeVol) rangeVol.value = volVal;
    if (volLabel) volLabel.textContent = `${volVal}%`;

    // Layout Preset & Signage Sub-layout
    const elLayoutPreset = document.getElementById('selectKioskLayoutPreset');
    if (elLayoutPreset) elLayoutPreset.value = s.kiosk_layout_preset || 'horizontal_glass';

    const elSubLayout = document.getElementById('selectKioskSubLayout');
    if (elSubLayout) elSubLayout.value = s.kiosk_layout || 'full';

    // Lower-Third Live Broadcast Overlay & Kuliah Fullscreen
    const swLowerThird = document.getElementById('switchLowerThird');
    if (swLowerThird) swLowerThird.checked = (s.lower_third_enabled === '1' || s.lower_third_enabled === 1 || s.lower_third_enabled === true);
    const swKuliahFs = document.getElementById('switchKuliahFullscreen');
    if (swKuliahFs) swKuliahFs.checked = (s.kuliah_fullscreen === '1' || s.kuliah_fullscreen === 1 || s.kuliah_fullscreen === true);
    const elLtSpeaker = document.getElementById('inputLowerThirdSpeaker');
    if (elLtSpeaker) elLtSpeaker.value = s.lower_third_speaker || '';
    const elLtTopic = document.getElementById('inputLowerThirdTopic');
    if (elLtTopic) elLtTopic.value = s.lower_third_topic || '';
    const elLtKitab = document.getElementById('inputLowerThirdKitab');
    if (elLtKitab) elLtKitab.value = s.lower_third_kitab || '';

    // Kuliah Card Details
    const elKuliahTitle = document.getElementById('inputKuliahTitle');
    if (elKuliahTitle) elKuliahTitle.value = s.kuliah_title || '';
    const elKuliahUstaz = document.getElementById('inputKuliahUstaz');
    if (elKuliahUstaz) elKuliahUstaz.value = s.kuliah_ustaz || '';
    const elKuliahDate = document.getElementById('inputKuliahDate');
    if (elKuliahDate) elKuliahDate.value = s.kuliah_date || '';

    // Mosque Administration: Duty Roster (Imam, Bilal, Siak)
    const elRosterImam = document.getElementById('inputRosterImam');
    if (elRosterImam) elRosterImam.value = s.roster_imam || '';
    const elRosterBilal = document.getElementById('inputRosterBilal');
    if (elRosterBilal) elRosterBilal.value = s.roster_bilal || '';
    const elRosterSiak = document.getElementById('inputRosterSiak');
    if (elRosterSiak) elRosterSiak.value = s.roster_siak || '';

    // Mosque Administration: Tabung & Kewangan
    const elTabungJumaat = document.getElementById('inputTabungJumaat');
    if (elTabungJumaat) elTabungJumaat.value = s.tabung_jumaat || '';
    const elTabungSubuh = document.getElementById('inputTabungSubuh');
    if (elTabungSubuh) elTabungSubuh.value = s.tabung_infaq_subuh || '';
    const elTabungPb = document.getElementById('inputTabungPembangunan');
    if (elTabungPb) elTabungPb.value = s.tabung_pembangunan || '';
    const elTabungTarikh = document.getElementById('inputTabungTarikh');
    if (elTabungTarikh) elTabungTarikh.value = s.tabung_tarikh || '';

    // Mosque Administration: Hadith of the Day
    const elHadithText = document.getElementById('inputHadithText');
    if (elHadithText) elHadithText.value = s.hadith_text || '';
    const elHadithSource = document.getElementById('inputHadithSource');
    if (elHadithSource) elHadithSource.value = s.hadith_source || '';

    // Fullscreen Media Toggle & Kiosk Layout Mode
    const checkMediaFs = document.getElementById('checkMediaFullscreen');
    if (checkMediaFs) {
      checkMediaFs.checked = (s.kiosk_layout_mode === 'fullscreen' || s.media_fullscreen_enabled === '1' || s.media_fullscreen_enabled === 1 || s.media_fullscreen_enabled === true);
    }
    const selectLayoutMode = document.getElementById('selectKioskLayoutMode');
    if (selectLayoutMode) {
      selectLayoutMode.value = s.kiosk_layout_mode || ((s.media_fullscreen_enabled === '1' || s.media_fullscreen_enabled === 1) ? 'fullscreen' : 'split');
    }

    // PiP Mode
    const selectPip = document.getElementById('selectPipMode');
    if (selectPip) {
      selectPip.value = s.pip_mode || 'none';
    }

    // Media Source Type
    const selectMediaSource = document.getElementById('selectMediaSourceType');
    if (selectMediaSource) {
      if (s.media_source_type) {
        selectMediaSource.value = s.media_source_type;
      } else if (s.video_source_type === 'mp4') {
        selectMediaSource.value = 'video';
      } else if (s.video_source_type === 'hls' || s.video_source_type === 'youtube') {
        selectMediaSource.value = 'stream';
      } else {
        selectMediaSource.value = 'slides';
      }
    }

    // Drag & Resize Custom Canvas Layout Mode
    const checkEditMode = document.getElementById('checkLayoutEditMode');
    const editIndicator = document.getElementById('layoutEditModeIndicator');
    const isEditMode = (s.layout_edit_mode === '1' || s.layout_edit_mode === true);
    if (checkEditMode) {
      checkEditMode.checked = isEditMode;
    }
    if (editIndicator) {
      if (isEditMode) {
        editIndicator.innerHTML = '<span style="color:#34d399; font-weight:700;">🟢 Mod Susun Aktif (Buka Skrin Kiosk Untuk Drag &amp; Resize)</span>';
      } else {
        editIndicator.innerHTML = '<span style="color:#94a3b8;">🔒 Mod Kunci (Read-Only)</span>';
      }
    }

    // Bank QR Code Preview
    const qrImg = document.getElementById('bankQrPreviewImg');
    const qrPlaceholder = document.getElementById('bankQrPlaceholder');
    const btnRemoveQr = document.getElementById('btnRemoveBankQr');
    if (s.bank_qr_url) {
      if (qrImg) {
        qrImg.src = s.bank_qr_url + (s.bank_qr_url.includes('?') ? '&' : '?') + 't=' + Date.now();
        qrImg.style.display = 'block';
      }
      if (qrPlaceholder) qrPlaceholder.style.display = 'none';
      if (btnRemoveQr) btnRemoveQr.style.display = 'inline-block';
    } else {
      if (qrImg) qrImg.style.display = 'none';
      if (qrPlaceholder) qrPlaceholder.style.display = 'block';
      if (btnRemoveQr) btnRemoveQr.style.display = 'none';
    }

    // Azan Audio Tracks & Volume
    const azanSubuhVal = s.audio_azan_subuh || s.audio_azan_subuh_file;
    if (azanSubuhVal && document.getElementById('selectAzanSubuh')) {
      document.getElementById('selectAzanSubuh').value = azanSubuhVal;
    }
    const azanStdVal = s.audio_azan_regular || s.audio_azan_standard_file;
    if (azanStdVal && document.getElementById('selectAzanStandard')) {
      document.getElementById('selectAzanStandard').value = azanStdVal;
    }
    const rawAzanVol = typeof s.audio_volume !== 'undefined' ? s.audio_volume : s.audio_azan_volume;
    if (typeof rawAzanVol !== 'undefined') {
      const azanVol = parseInt(rawAzanVol);
      if (document.getElementById('inputAzanVolume')) document.getElementById('inputAzanVolume').value = azanVol;
      if (document.getElementById('valAzanVolume')) document.getElementById('valAzanVolume').textContent = `${azanVol}%`;
    }

    // Theme Selector (Multi-Theme Engine)
    let activeTheme = (s.selected_theme || s.kiosk_theme || 'emerald').toLowerCase().trim().replace(/_/g, '-');
    if (activeTheme === 'emerald-nabawi') activeTheme = 'emerald';
    if (activeTheme === 'royal-sapphire') activeTheme = 'navy-gold';
    if (activeTheme === 'midnight-oled' || activeTheme === 'clean-minimalist') activeTheme = 'onyx-dark';
    if (activeTheme === 'al-aqsa-teal') activeTheme = 'ottoman-cyan';
    if (activeTheme === 'ivory') activeTheme = 'clean-ivory';

    let themeRadio = document.querySelector(`input[name="kiosk_theme"][value="${activeTheme}"]`);
    if (!themeRadio) {
      themeRadio = document.querySelector(`input[name="kiosk_theme"][value="emerald"]`);
    }
    if (themeRadio) themeRadio.checked = true;

    // Instant Janazah Notice
    const swJanazah = document.getElementById('switchJanazahNotice');
    const boxJanazah = document.getElementById('boxJanazahDetails');
    const isJanazahActive = (s.janazah_enabled === '1' || s.janazah_enabled === 1 || s.janazah_enabled === true);
    if (swJanazah) swJanazah.checked = isJanazahActive;
    if (boxJanazah) boxJanazah.style.display = isJanazahActive ? 'block' : 'none';

    const inputJanazahName = document.getElementById('inputJanazahName');
    if (inputJanazahName) inputJanazahName.value = s.janazah_arwah_name || '';
    const inputJanazahTime = document.getElementById('inputJanazahSolatTime');
    if (inputJanazahTime) inputJanazahTime.value = s.janazah_solat_time || '';
    const inputJanazahLoc = document.getElementById('inputJanazahSolatLoc');
    if (inputJanazahLoc) inputJanazahLoc.value = s.janazah_solat_loc || '';
    const inputJanazahKubur = document.getElementById('inputJanazahKuburLoc');
    if (inputJanazahKubur) inputJanazahKubur.value = s.janazah_kubur_loc || '';

    // Friday Khutbah Title
    const inputJumaatKhutbah = document.getElementById('inputJumaatKhutbahTitle');
    if (inputJumaatKhutbah) inputJumaatKhutbah.value = s.jumaat_khutbah_title || '';

  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// ==================== GPS ZONE DETECTION ====================
function initGpsSecurityCheck() {
  const gpsBox = document.querySelector('.gps-box') || document.getElementById('btnDetectGps')?.closest('.gps-box');
  const isSecure = (window.isSecureContext === true) || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (gpsBox && !isSecure) {
    gpsBox.style.display = 'none';
  }
}

const btnGps = document.getElementById('btnDetectGps');
if (btnGps) {
  btnGps.addEventListener('click', () => {
    const statusEl = document.getElementById('gpsStatus');
    const isSecure = (window.isSecureContext === true) || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isSecure) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">💡 Pengesanan GPS memerlukan sambungan HTTPS. Sila pilih zon dari senarai di bawah.</span>';
      }
      document.getElementById('selectJakimZone')?.focus();
      return;
    }

    if (!navigator.geolocation) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">Pelayar ini tidak menyokong pengesanan GPS. Sila pilih zon secara manual di bawah.</span>';
      }
      document.getElementById('selectJakimZone')?.focus();
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#fbbf24;">Sedang mengesan koordinat GPS telefon anda...</span>';
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        try {
          const res = await apiRequest('/api/zones/match_gps', 'POST', { lat, lon });
          const matched = res.matched_zone;
          const dist = res.distance_km;

          if (statusEl) {
            statusEl.innerHTML = `
              <div style="background: rgba(2, 44, 34, 0.8); border: 1px solid #10b981; padding: 0.75rem; border-radius: 8px; margin-top: 0.5rem;">
                <div style="font-weight:700; color:#34d399;">✓ Zon Dipadankan: ${matched.code} (${matched.state})</div>
                <div style="font-size:0.8rem; color:#cbd5e1;">Kawasan: ${matched.location} (~${dist} km)</div>
              </div>
            `;
          }

          const selZone = document.getElementById('selectJakimZone');
          if (selZone) selZone.value = matched.code;

          // Auto prompt to apply and sync
          if (confirm(`Zon ${matched.code} (${matched.location}) dikesan melalui GPS. Tetapkan zon ini dan segerakkan takwim sekarang?`)) {
            await apiRequest('/api/settings', 'POST', { jakim_zone: matched.code });
            await triggerTakwimSync(matched.code);
            await loadSettings();
          }

        } catch (err) {
          if (statusEl) statusEl.innerHTML = `<span style="color:#94a3b8; font-size:0.85rem;">Sila pilih zon secara manual di bawah.</span>`;
        }
      },
      (err) => {
        console.warn('[GPS] Geolocation notice:', err.message);
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">Akses GPS tidak tersedia. Sila pilih zon secara manual di bawah.</span>';
        }
        document.getElementById('selectJakimZone')?.focus();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Manual Zone Sync
document.getElementById('btnSyncJakim').addEventListener('click', async () => {
  const zone = document.getElementById('selectJakimZone').value;
  await apiRequest('/api/settings', 'POST', { jakim_zone: zone });
  await triggerTakwimSync(zone);
  await loadSettings();
});

async function triggerTakwimSync(zone) {
  const fb = document.getElementById('syncFeedback');
  if (fb) fb.innerHTML = '<span style="color:#fbbf24;">Memuat turun takwim dari JAKIM...</span>';
  try {
    localStorage.setItem('esolat_zone', zone);
    const res = await apiRequest('/api/jakim/sync', 'POST', { zone, period: 'month' });
    if (res && res.success) {
      if (fb) fb.innerHTML = `<span style="color:#34d399;">✓ ${res.message}</span>`;
      showToast(res.message);
      broadcastAdminSync('TAKWIM_UPDATED', { zone });
      await syncAdminStatePoller();
      updateAdminRealTimeStatus();
      return;
    } else {
      throw new Error(res?.message || 'Gagal memuat turun data');
    }
  } catch (err) {
    console.warn('[Takwim] Local API unavailable, attempting public CORS / web simulation fallback:', err);
    try {
      if (fb) fb.innerHTML = '<span style="color:#38bdf8;">Menghubungi pelayan takwim sandaran...</span>';
      const fallbackUrl = `https://api.waktusolat.app/v2/solat/${encodeURIComponent(zone)}`;
      const res2 = await fetch(fallbackUrl, { cache: 'no-cache' }).then(r => r.json());
      if (res2 && (res2.prayers || res2.prayerTime)) {
        localStorage.setItem(`cached_takwim_${zone}`, JSON.stringify(res2));
        localStorage.setItem('esolat_zone', zone);
        const msg = `✓ Takwim zon ${zone} berjaya disegerakkan (Mod Web/Simulasi)!`;
        if (fb) fb.innerHTML = `<span style="color:#34d399;">${msg}</span>`;
        showToast(msg);
        broadcastAdminSync('TAKWIM_UPDATED', { zone });
        await syncAdminStatePoller();
        updateAdminRealTimeStatus();
        return;
      }
    } catch (fallbackErr) {
      console.warn('[Takwim] Alternative API fallback failed:', fallbackErr);
    }

    const errMsg = err.message || 'Gagal menyegerakkan takwim';
    if (fb) fb.innerHTML = `<span style="color:#ef4444;">${errMsg}</span>`;
    showToast(errMsg, true);
  }
}

// ==================== OFFSETS SAVE ====================
document.getElementById('btnSaveOffsets').addEventListener('click', async () => {
  const updates = {};
  ['subuh', 'syuruk', 'zohor', 'asar', 'maghrib', 'isyak'].forEach(p => {
    updates[`offset_${p}`] = parseInt(document.getElementById(`offset_${p}`).value) || 0;
  });

  try {
    await apiRequest('/api/settings', 'POST', updates);
    showToast('Pelarasan waktu solat berjaya disimpan!');
    await syncAdminStatePoller();
    updateAdminRealTimeStatus();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== AUDIO & AZAN MANAGEMENT ====================
let adminPreviewAudio = null;
let currentPreviewButton = null;
let originalPreviewButtonHtml = '';
let replacingTargetFileName = '';
let replacingTargetLabel = '';

function playAdminPreview(audioUrl, btnElement) {
  if (adminPreviewAudio) {
    adminPreviewAudio.pause();
    if (currentPreviewButton) {
      currentPreviewButton.innerHTML = originalPreviewButtonHtml || '🎧 Pratonton (Peranti Ini)';
      currentPreviewButton.classList.remove('playing');
    }
    // If clicking same button while playing, just stop
    if (currentPreviewButton === btnElement) {
      adminPreviewAudio = null;
      currentPreviewButton = null;
      originalPreviewButtonHtml = '';
      return;
    }
  }

  currentPreviewButton = btnElement;
  originalPreviewButtonHtml = btnElement.innerHTML;
  btnElement.innerHTML = '⏹️ Henti Pratonton';
  btnElement.classList.add('playing');

  adminPreviewAudio = new Audio(audioUrl);
  adminPreviewAudio.play().catch(err => {
    showToast('Gagal memainkan pratonton audio: ' + err.message, true);
    btnElement.innerHTML = originalPreviewButtonHtml || '🎧 Pratonton (Peranti Ini)';
    btnElement.classList.remove('playing');
    adminPreviewAudio = null;
    currentPreviewButton = null;
    originalPreviewButtonHtml = '';
  });

  adminPreviewAudio.onended = () => {
    btnElement.innerHTML = originalPreviewButtonHtml || '🎧 Pratonton (Peranti Ini)';
    btnElement.classList.remove('playing');
    adminPreviewAudio = null;
    currentPreviewButton = null;
    originalPreviewButtonHtml = '';
  };
}

async function testKioskAudio(soundName, btnElement = null) {
  try {
    if (btnElement) {
      btnElement.classList.add('testing');
    }
    showToast(`Sedang menguji pembesar suara TV dewan solat (${soundName})...`);
    const res = await apiRequest('/api/audio/test-kiosk', 'POST', { sound: soundName, file_name: soundName });
    showToast(`✓ ${res.message || 'Arahan audio dihantar ke pembesar suara TV.'}`);
  } catch (err) {
    showToast(`Ralat ujian audio TV: ${err.message}`, true);
  } finally {
    if (btnElement) {
      setTimeout(() => btnElement.classList.remove('testing'), 1500);
    }
  }
}

async function stopKioskAudio() {
  try {
    const res = await apiRequest('/api/audio/test-kiosk', 'POST', { action: 'stop' });
    showToast(res.message || 'Audio pembesar suara TV dihentikan.');
  } catch (err) {
    showToast(`Ralat: ${err.message}`, true);
  }
}

async function loadAudioList() {
  try {
    const res = await apiRequest('/api/audio/list');
    if (!res.success) return;

    const selectSubuh = document.getElementById('selectAzanSubuh');
    const selectStandard = document.getElementById('selectAzanStandard');
    const container = document.getElementById('audioTracksContainer');

    const currSubuh = res.current_subuh || 'azan_subuh_special.mp3';
    const currStandard = res.current_standard || res.current_regular || 'azan_mekah.mp3';
    const volume = typeof res.volume !== 'undefined' ? res.volume : 85;

    // Volume input & badge
    const rangeVol = document.getElementById('inputAzanVolume');
    const badgeVol = document.getElementById('valAzanVolume');
    if (rangeVol) rangeVol.value = volume;
    if (badgeVol) badgeVol.textContent = `${volume}%`;

    // Populate dropdowns
    if (selectSubuh) selectSubuh.innerHTML = '';
    if (selectStandard) selectStandard.innerHTML = '';

    res.tracks.forEach(t => {
      const optSubuh = document.createElement('option');
      optSubuh.value = t.file_name;
      optSubuh.textContent = `${t.label} (${t.file_name})`;
      if (t.file_name === currSubuh) optSubuh.selected = true;
      if (selectSubuh) selectSubuh.appendChild(optSubuh);

      const optStd = document.createElement('option');
      optStd.value = t.file_name;
      optStd.textContent = `${t.label} (${t.file_name})`;
      if (t.file_name === currStandard) optStd.selected = true;
      if (selectStandard) selectStandard.appendChild(optStd);
    });

    // Populate track library cards
    if (container) {
      container.innerHTML = '';
      if (!res.tracks || res.tracks.length === 0) {
        container.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:1rem;">Tiada fail audio dijumpai.</div>';
        return;
      }

      res.tracks.forEach(t => {
        const item = document.createElement('div');
        item.className = `audio-track-item ${t.is_active ? 'is-active' : ''}`;

        const sizeKb = Math.round(t.size_bytes / 1024);
        const sizeMb = (t.size_bytes / (1024 * 1024)).toFixed(1);
        const sizeStr = t.size_bytes > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

        const badgeType = t.is_preset ? '<span class="track-badge preset">Preset</span>' : '<span class="track-badge custom">Tersuai</span>';
        const badgeSubuh = t.is_subuh ? '<span class="track-badge subuh">Subuh</span>' : '';
        const badgeActive = t.is_active_subuh && t.is_active_regular ? '<span class="track-badge active">Aktif (Subuh & Lazim)</span>' :
                            t.is_active_subuh ? '<span class="track-badge active">Aktif (Subuh)</span>' :
                            t.is_active_regular ? '<span class="track-badge active">Aktif (Lazim)</span>' : '';

        const timeStr = t.modified_iso ? ` • ${t.modified_iso}` : '';

        item.innerHTML = `
          <div class="audio-track-info">
            <div class="audio-track-name">${t.label}</div>
            <div class="audio-track-meta">
              ${badgeActive}
              ${badgeType}
              ${badgeSubuh}
              <span>${t.file_name}</span>
              <span>•</span>
              <span>${sizeStr}</span>
              <span>${timeStr}</span>
            </div>
          </div>
          <div class="audio-track-actions">
            <button type="button" class="btn-inline-play" data-url="${t.file_url}" title="Pratonton audio di peranti / pelayar web ini">
              🎧 Pratonton (Peranti Ini)
            </button>
            <button type="button" class="btn-inline-kiosk" data-file="${t.file_name}" title="Uji pembesar suara TV fizikal dewan solat (Kiosk)">
              📢 Uji Pembesar Suara TV
            </button>
            <button type="button" class="btn-inline-replace" data-file="${t.file_name}" data-label="${t.label}" title="Gantikan fail audio ini">
              🔄 Ganti
            </button>
            <button type="button" class="btn-inline-delete" data-file="${t.file_name}" data-label="${t.label}" title="Padam fail audio">
              🗑️ Padam
            </button>
          </div>
        `;

        // 1. Play Local Device Preview
        const playBtn = item.querySelector('.btn-inline-play');
        playBtn.addEventListener('click', () => {
          playAdminPreview(t.file_url, playBtn);
        });

        // 2. Physical TV Kiosk Speaker Test
        const kioskBtn = item.querySelector('.btn-inline-kiosk');
        kioskBtn.addEventListener('click', () => {
          testKioskAudio(t.file_name, kioskBtn);
        });

        // 3. Inline Replace Action
        const replaceBtn = item.querySelector('.btn-inline-replace');
        replaceBtn.addEventListener('click', () => {
          replacingTargetFileName = t.file_name;
          replacingTargetLabel = t.label;
          const replaceInput = document.getElementById('replaceAudioInput');
          if (replaceInput) {
            replaceInput.value = '';
            replaceInput.click();
          }
        });

        // 4. Delete Action with Confirmation
        const deleteBtn = item.querySelector('.btn-inline-delete');
        deleteBtn.addEventListener('click', async () => {
          const confirmMsg = t.is_active
            ? `Fail audio "${t.label}" (${t.file_name}) sedang digunakan sebagai azan aktif.\n\nMemadam fail ini akan mengembalikan pilihan azan ke audio lalai sistem.\nAdakah anda pasti mahu memadamkannya?`
            : `Adakah anda pasti mahu memadam fail audio "${t.label}" (${t.file_name})?`;

          if (!confirm(confirmMsg)) {
            return;
          }

          try {
            const delRes = await apiRequest(`/api/audio?id=${encodeURIComponent(t.file_name)}`, 'DELETE');
            showToast(delRes.message || 'Fail audio berjaya dipadamkan.');
            if (adminPreviewAudio && currentPreviewButton === playBtn) {
              adminPreviewAudio.pause();
              adminPreviewAudio = null;
              currentPreviewButton = null;
              originalPreviewButtonHtml = '';
            }
            await loadAudioList();
            await loadSettings();
          } catch (err) {
            showToast('Gagal memadam fail: ' + err.message, true);
          }
        });

        container.appendChild(item);
      });
    }

  } catch (err) {
    console.error('Error loading audio tracks:', err);
  }
}

// Hidden replace file input handler
const replaceAudioInput = document.getElementById('replaceAudioInput');
if (replaceAudioInput) {
  replaceAudioInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0 || !replacingTargetFileName) {
      return;
    }

    const file = e.target.files[0];
    const targetFile = replacingTargetFileName;
    const targetLabel = replacingTargetLabel;

    showToast(`Sedang menggantikan fail "${targetFile}" dengan fail baharu...`);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await apiRequest('/api/audio/upload', 'POST', {
          file_name: file.name,
          file_base64: base64,
          target_file: targetFile,
          label: targetLabel
        });

        showToast(res.message || `Fail "${targetFile}" berjaya digantikan!`);
        replacingTargetFileName = '';
        replacingTargetLabel = '';
        await loadAudioList();
        await loadSettings();
      } catch (err) {
        showToast('Gagal menggantikan fail: ' + err.message, true);
      }
    };
    reader.readAsDataURL(file);
  });
}

// Volume slider live display
const inputAzanVol = document.getElementById('inputAzanVolume');
if (inputAzanVol) {
  inputAzanVol.addEventListener('input', (e) => {
    const valBadge = document.getElementById('valAzanVolume');
    if (valBadge) valBadge.textContent = `${e.target.value}%`;
  });
}

// Save Azan Audio Selection & Volume
const btnSaveAzanAudio = document.getElementById('btnSaveAzanAudio');
if (btnSaveAzanAudio) {
  btnSaveAzanAudio.addEventListener('click', async () => {
    const subuhFile = document.getElementById('selectAzanSubuh').value;
    const stdFile = document.getElementById('selectAzanStandard').value;
    const vol = parseInt(document.getElementById('inputAzanVolume').value) || 85;

    try {
      await apiRequest('/api/settings', 'POST', {
        audio_azan_subuh: subuhFile,
        audio_azan_regular: stdFile,
        audio_volume: vol,
        audio_azan_subuh_file: subuhFile,
        audio_azan_standard_file: stdFile,
        audio_azan_volume: vol
      });
      showToast('Pilihan audio Azan dan kelantangan berjaya disimpan!');
      await loadAudioList();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Preview and TV Kiosk test button handlers for dropdowns
const btnPrevSubuh = document.getElementById('btnPreviewSubuh');
if (btnPrevSubuh) {
  btnPrevSubuh.addEventListener('click', () => {
    const val = document.getElementById('selectAzanSubuh').value;
    const url = val.startsWith('/') ? val : `/kiosk/audio/azan/${val}`;
    playAdminPreview(url, btnPrevSubuh);
  });
}

const btnTestKioskSubuh = document.getElementById('btnTestKioskSubuh');
if (btnTestKioskSubuh) {
  btnTestKioskSubuh.addEventListener('click', () => {
    const val = document.getElementById('selectAzanSubuh').value;
    testKioskAudio(val, btnTestKioskSubuh);
  });
}

const btnPrevStd = document.getElementById('btnPreviewStandard');
if (btnPrevStd) {
  btnPrevStd.addEventListener('click', () => {
    const val = document.getElementById('selectAzanStandard').value;
    const url = val.startsWith('/') ? val : `/kiosk/audio/azan/${val}`;
    playAdminPreview(url, btnPrevStd);
  });
}

const btnTestKioskStandard = document.getElementById('btnTestKioskStandard');
if (btnTestKioskStandard) {
  btnTestKioskStandard.addEventListener('click', () => {
    const val = document.getElementById('selectAzanStandard').value;
    testKioskAudio(val, btnTestKioskStandard);
  });
}

const btnRefreshAudio = document.getElementById('btnRefreshAudioList');
if (btnRefreshAudio) {
  btnRefreshAudio.addEventListener('click', async () => {
    await loadAudioList();
    showToast('Senarai audio Azan dikemas kini.');
  });
}

// Drag & drop dropzone text update
const audioFileInput = document.getElementById('audioUploadInput');
if (audioFileInput) {
  audioFileInput.addEventListener('change', (e) => {
    const textEl = document.getElementById('audioDropzoneText');
    if (e.target.files && e.target.files.length > 0) {
      if (textEl) textEl.textContent = `Fail dipilih: ${e.target.files[0].name}`;
    } else {
      if (textEl) textEl.textContent = 'Ketik atau seret fail MP3/WAV/OGG ke sini';
    }
  });
}

// Upload Form Handler
const uploadAudioForm = document.getElementById('uploadAzanAudioForm');
if (uploadAudioForm) {
  uploadAudioForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('audioUploadInput');
    const titleInput = document.getElementById('audioUploadTitle');
    const feedbackEl = document.getElementById('audioUploadFeedback');

    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Sila pilih fail audio untuk dimuat naik!', true);
      return;
    }

    const file = fileInput.files[0];
    const label = titleInput ? titleInput.value.trim() : '';

    if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#fbbf24;">Memuat naik fail audio...</span>';

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await apiRequest('/api/audio/upload', 'POST', {
          file_name: file.name,
          file_base64: base64,
          label: label
        });

        if (feedbackEl) feedbackEl.innerHTML = `<span style="color:#34d399;">✓ ${res.message}</span>`;
        showToast(res.message || 'Fail audio berjaya dimuat naik!');

        fileInput.value = '';
        if (titleInput) titleInput.value = '';
        const textEl = document.getElementById('audioDropzoneText');
        if (textEl) textEl.textContent = 'Ketik atau seret fail MP3/WAV/OGG ke sini';

        // Immediately refresh dropdown options and audio library
        await loadAudioList();
        await loadSettings();
      } catch (err) {
        if (feedbackEl) feedbackEl.innerHTML = `<span style="color:#ef4444;">${err.message}</span>`;
        showToast(err.message, true);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ==================== BACAAN AL-QURAN & TARHIM SEBELUM AZAN ====================
let quranTracksCache = [];

async function loadQuranAudioList() {
  try {
    const res = await apiRequest('/api/quran/list');
    if (!res.success) return;

    quranTracksCache = res.tracks || [];
    const container = document.getElementById('quranTracksContainer');
    const countBadge = document.getElementById('countQuranTracks');
    const selectSpecific = document.getElementById('selectSpecificQuranFile');
    const liveBadge = document.getElementById('quranLivePlayingBadge');

    if (countBadge) countBadge.textContent = quranTracksCache.length;
    if (liveBadge) liveBadge.style.display = res.is_playing ? 'inline-block' : 'none';

    // Populate configuration form if returned
    if (res.config) {
      const cfg = res.config;
      const sw = document.getElementById('switchQuranPreAzan');
      if (sw) sw.checked = (cfg.quran_pre_azan_enabled === '1' || cfg.quran_pre_azan_enabled === true);

      const selLead = document.getElementById('selectQuranLeadMin');
      if (selLead) selLead.value = String(cfg.quran_pre_azan_lead_minutes || 10);

      const selMode = document.getElementById('selectQuranMode');
      if (selMode) {
        selMode.value = cfg.quran_pre_azan_mode || 'random';
        const wrapSpecific = document.getElementById('wrapperSpecificQuranFile');
        if (wrapSpecific) {
          wrapSpecific.style.display = (selMode.value === 'specific') ? 'block' : 'none';
        }
      }

      const inputVol = document.getElementById('inputQuranVolume');
      const valVol = document.getElementById('valQuranVolume');
      if (inputVol) inputVol.value = cfg.quran_pre_azan_volume || 70;
      if (valVol) valVol.textContent = `${cfg.quran_pre_azan_volume || 70}%`;

      // Prayers checkboxes
      let prayers = [];
      try {
        prayers = typeof cfg.quran_pre_azan_prayers === 'string' ? JSON.parse(cfg.quran_pre_azan_prayers) : cfg.quran_pre_azan_prayers;
      } catch (e) {
        prayers = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat'];
      }
      ['subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat'].forEach(p => {
        const chk = document.getElementById(`chkQuran${p.charAt(0).toUpperCase() + p.slice(1)}`);
        if (chk) chk.checked = prayers.includes(p);
      });
    }

    // Populate Specific Surah Dropdown
    if (selectSpecific) {
      selectSpecific.innerHTML = '<option value="">-- Sila Pilih Fail MP3 dari Pustaka --</option>';
      quranTracksCache.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.file_name;
        opt.textContent = `${t.title} (${t.file_name})`;
        if (res.config && res.config.quran_pre_azan_file === t.file_name) {
          opt.selected = true;
        }
        selectSpecific.appendChild(opt);
      });
    }

    // Render Quran Library Cards
    if (container) {
      container.innerHTML = '';
      if (!quranTracksCache || quranTracksCache.length === 0) {
        container.innerHTML = `
          <div style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:1.5rem; background:rgba(15,23,42,0.6); border-radius:10px;">
            Tiada fail MP3 Al-Quran dijumpai. Anda boleh memuat naik fail dari telefon atau salin terus ke folder <code>/var/lib/esolat/media/quran/</code>.
          </div>`;
        return;
      }

      quranTracksCache.forEach(t => {
        const item = document.createElement('div');
        item.className = 'audio-track-item';
        const isCurrent = res.current_track === t.file_name;
        if (isCurrent) item.classList.add('is-active');

        item.innerHTML = `
          <div class="audio-track-info" style="flex:1;">
            <div class="audio-track-name" style="font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:0.5rem;">
              <span>📖</span> <span>${t.title}</span>
              ${isCurrent ? '<span class="track-badge active" style="background:#10b981; color:#022c22; font-weight:bold;">Sedang Main</span>' : ''}
            </div>
            <div class="audio-track-meta" style="font-size:0.75rem; color:#94a3b8; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; margin-top:0.25rem;">
              <span class="track-badge preset">${t.type.toUpperCase()}</span>
              <span>${t.file_name}</span>
              <span>•</span>
              <span>${t.size_formatted}</span>
            </div>
            <div style="margin-top:0.5rem;">
              <audio controls preload="none" style="height:32px; width:100%; max-width:340px;">
                <source src="${t.file_url}" type="audio/mpeg">
                Pelayar anda tidak menyokong audio player.
              </audio>
            </div>
          </div>
          <div class="audio-track-actions" style="display:flex; gap:0.4rem; align-items:center;">
            <button type="button" class="btn btn-sm btn-accent btn-test-quran-tv" data-file="${t.file_name}" title="Uji mainkan fail ini pada pembesar suara TV / PA surau">
              📢 Main di TV/PA
            </button>
            <button type="button" class="btn btn-sm btn-outline btn-del-quran" data-file="${t.file_name}" title="Padam fail ini" style="border-color:#ef4444; color:#ef4444;">
              🗑️ Padam
            </button>
          </div>
        `;

        // Action listeners
        const btnTestTv = item.querySelector('.btn-test-quran-tv');
        if (btnTestTv) {
          btnTestTv.addEventListener('click', async () => {
            const fname = btnTestTv.getAttribute('data-file');
            try {
              btnTestTv.disabled = true;
              btnTestTv.textContent = '⏳ Memainkan...';
              const r = await apiRequest('/api/quran/test_play', 'POST', {
                file_name: fname,
                volume: parseInt(document.getElementById('inputQuranVolume').value) || 70
              });
              showToast(r.message || 'Memainkan ujian audio pada TV/PA');
              await loadQuranAudioList();
            } catch (err) {
              showToast(err.message, true);
            } finally {
              btnTestTv.disabled = false;
              btnTestTv.textContent = '📢 Main di TV/PA';
            }
          });
        }

        const btnDel = item.querySelector('.btn-del-quran');
        if (btnDel) {
          btnDel.addEventListener('click', async () => {
            const fname = btnDel.getAttribute('data-file');
            if (!confirm(`Adakah anda pasti ingin memadamkan fail '${fname}' daripada pustaka Quran?`)) return;
            try {
              const r = await apiRequest('/api/quran/delete', 'POST', { file_name: fname });
              showToast(r.message || 'Fail berjaya dipadam.');
              await loadQuranAudioList();
            } catch (err) {
              showToast(err.message, true);
            }
          });
        }

        container.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Error loading Quran library:', err);
  }
}

function initQuranAudioSystem() {
  // Mode selection change
  const selMode = document.getElementById('selectQuranMode');
  if (selMode) {
    selMode.addEventListener('change', () => {
      const wrapSpecific = document.getElementById('wrapperSpecificQuranFile');
      if (wrapSpecific) {
        wrapSpecific.style.display = (selMode.value === 'specific') ? 'block' : 'none';
      }
    });
  }

  // Volume slider
  const inputVol = document.getElementById('inputQuranVolume');
  const valVol = document.getElementById('valQuranVolume');
  if (inputVol && valVol) {
    inputVol.addEventListener('input', () => {
      valVol.textContent = `${inputVol.value}%`;
    });
  }

  // Save Quran Config Button
  const btnSaveConfig = document.getElementById('btnSaveQuranConfig');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      const sw = document.getElementById('switchQuranPreAzan');
      const selLead = document.getElementById('selectQuranLeadMin');
      const selM = document.getElementById('selectQuranMode');
      const selSpecific = document.getElementById('selectSpecificQuranFile');
      const inVol = document.getElementById('inputQuranVolume');

      const selectedPrayers = [];
      ['subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat'].forEach(p => {
        const chk = document.getElementById(`chkQuran${p.charAt(0).toUpperCase() + p.slice(1)}`);
        if (chk && chk.checked) selectedPrayers.push(p);
      });

      const payload = {
        quran_pre_azan_enabled: sw && sw.checked ? '1' : '0',
        quran_pre_azan_lead_minutes: selLead ? selLead.value : '10',
        quran_pre_azan_mode: selM ? selM.value : 'random',
        quran_pre_azan_file: selSpecific ? selSpecific.value : '',
        quran_pre_azan_prayers: JSON.stringify(selectedPrayers),
        quran_pre_azan_volume: inVol ? inVol.value : '70'
      };

      try {
        btnSaveConfig.disabled = true;
        btnSaveConfig.textContent = '⏳ Menyimpan...';
        const res = await apiRequest('/api/quran/config', 'POST', payload);
        showToast(res.message || 'Tetapan bacaan Al-Quran berjaya disimpan!');
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSaveConfig.disabled = false;
        btnSaveConfig.textContent = '💾 Simpan Tetapan Al-Quran Sebelum Azan';
      }
    });
  }

  // Refresh / Scan buttons
  const btnRefresh = document.getElementById('btnRefreshQuranList');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      await loadQuranAudioList();
      showToast('Pustaka Al-Quran berjaya dikemas kini.');
    });
  }

  const btnScanUsb = document.getElementById('btnScanUsbQuranFolder');
  if (btnScanUsb) {
    btnScanUsb.addEventListener('click', async () => {
      await loadQuranAudioList();
      showToast('Pustaka folder USB / media/quran/ berjaya diimbas!');
    });
  }

  // Upload input text preview
  const quranUploadInput = document.getElementById('quranUploadInput');
  if (quranUploadInput) {
    quranUploadInput.addEventListener('change', (e) => {
      const dropText = document.getElementById('quranDropzoneText');
      if (e.target.files && e.target.files.length > 0) {
        if (dropText) dropText.textContent = `Fail dipilih: ${e.target.files[0].name}`;
      } else {
        if (dropText) dropText.textContent = 'Pilih atau seret fail MP3 Quran';
      }
    });
  }

  // Form Upload Submit
  const formUploadQuran = document.getElementById('formUploadQuranMp3');
  if (formUploadQuran) {
    formUploadQuran.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('quranUploadInput');
      const feedback = document.getElementById('quranUploadFeedback');
      const btnSubmit = document.getElementById('btnSubmitUploadQuran');

      if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Sila pilih fail MP3 untuk dimuat naik!', true);
        return;
      }

      const file = fileInput.files[0];
      if (feedback) feedback.innerHTML = '<span style="color:#fbbf24;">Sedang memuat naik audio Quran...</span>';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Memuat naik...';
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result;
          const res = await apiRequest('/api/quran/upload', 'POST', {
            file_name: file.name,
            file_base64: base64
          });

          if (feedback) feedback.innerHTML = `<span style="color:#34d399;">✓ ${res.message}</span>`;
          showToast(res.message || 'Fail MP3 berjaya disimpan ke pustaka Quran!');

          fileInput.value = '';
          const dropText = document.getElementById('quranDropzoneText');
          if (dropText) dropText.textContent = 'Pilih atau seret fail MP3 Quran';

          await loadQuranAudioList();
        } catch (err) {
          if (feedback) feedback.innerHTML = `<span style="color:#ef4444;">${err.message}</span>`;
          showToast(err.message, true);
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = '📤 Muat Naik ke Pustaka';
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }
}

// ==================== ADHAN & IQAMAH SAVE ====================
document.getElementById('btnSaveAdhanConfig').addEventListener('click', async () => {
  const updates = {};
  ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'].forEach(p => {
    updates[`adhan_mode_${p}`] = document.getElementById(`adhan_mode_${p}`).value;
  });
  ['subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat'].forEach(p => {
    const el = document.getElementById(`iqamah_${p}`);
    if (el) updates[`iqamah_${p}`] = parseInt(el.value) || 0;
  });
  updates['solat_duration'] = parseInt(document.getElementById('solat_duration').value) || 12;

  try {
    await apiRequest('/api/settings', 'POST', updates);
    showToast('Tetapan Azan & Iqamah berjaya disimpan!');
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== FAST ACTION: TERUS IQAMAH SEKARANG ====================
async function triggerImmediateIqamahNow() {
  if (!confirm('Adakah anda pasti mahu membatalkan detik undur dan terus menukar skrin TV ke Mod Solat (Rapatkan Saf) sekarang?')) {
    return;
  }
  try {
    const res = await apiRequest('/api/iqamah/now', 'POST', {});
    showToast('⚡ Skrin TV telah beralih ke Mod Solat (Rapatkan Saf) serta-merta!');
    if (typeof fetchState === 'function') fetchState();
  } catch (err) {
    showToast(`Ralat mencetuskan mod solat: ${err.message}`, true);
  }
}

const btnFastDash = document.getElementById('btnFastIqamahNowDashboard');
if (btnFastDash) btnFastDash.addEventListener('click', triggerImmediateIqamahNow);

const btnFastTab3 = document.getElementById('btnFastIqamahNowTab3');
if (btnFastTab3) btnFastTab3.addEventListener('click', triggerImmediateIqamahNow);

// ==================== MEDIA & SLIDES ====================
async function loadSlides() {
  try {
    const res = await apiRequest('/api/slides');
    const container = document.getElementById('slidesListContainer');
    container.innerHTML = '';

    if (!res.slides || res.slides.length === 0) {
      container.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem; text-align:center;">Tiada slaid poster dijumpai.</div>';
      return;
    }

    res.slides.forEach(slide => {
      const card = document.createElement('div');
      card.className = 'slide-card';
      const dayLabel = (slide.days_active && slide.days_active !== 'all') ? ` | 📅 ${slide.days_active}` : '';
      card.innerHTML = `
        <img class="slide-thumb" src="${slide.file_url}" alt="${slide.title}">
        <div class="slide-info">
          <div class="slide-title-text">${slide.title}</div>
          <div class="slide-meta">Tempoh: ${slide.duration}s | Susunan: ${slide.sort_order}${dayLabel}</div>
        </div>
        <button class="slide-del-btn" onclick="deleteSlide(${slide.id})">🗑️</button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading slides:', err);
  }
}

window.deleteSlide = async function(id) {
  if (!confirm('Padamkan slaid poster ini?')) return;
  try {
    await apiRequest(`/api/slides/${id}`, 'DELETE');
    showToast('Slaid berjaya dipadamkan.');
    loadSlides();
  } catch (err) {
    showToast(err.message, true);
  }
};

document.getElementById('uploadSlideForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('slideTitle').value.trim();
  const duration = parseInt(document.getElementById('slideDuration').value) || 12;
  const sort_order = parseInt(document.getElementById('slideOrder').value) || 1;
  const days_active = document.getElementById('slideDaysActive') ? document.getElementById('slideDaysActive').value : 'all';
  const fileInput = document.getElementById('slideFileInput');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Sila pilih fail untuk dimuat naik!', true);
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  showToast('Memproses dan memuat naik fail...');

  reader.onload = async () => {
    try {
      const base64Data = reader.result;
      const media_type = file.type.startsWith('video') ? 'video' : 'image';

      await apiRequest('/api/slides', 'POST', {
        title,
        duration,
        sort_order,
        days_active,
        media_type,
        file_base64: base64Data,
        file_name: file.name
      });

      showToast('Slaid berjaya dimuat naik!');
      document.getElementById('uploadSlideForm').reset();
      loadSlides();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  reader.readAsDataURL(file);
});

// ==================== MULTI-SOURCE MEDIA & PiP ENGINE ====================
// 1. Volume slider display updater
const rangeVideoVol = document.getElementById('rangeVideoVolume');
if (rangeVideoVol) {
  rangeVideoVol.addEventListener('input', () => {
    const lbl = document.getElementById('videoVolLabel');
    if (lbl) lbl.textContent = `${rangeVideoVol.value}%`;
  });
}

// 2. Preset stream links & Auto Sync
window.setPresetMedia = async function(type) {
  const mediaSourceSelect = document.getElementById('selectMediaSourceType');
  const typeSelect = document.getElementById('selectVideoType');
  const urlInput = document.getElementById('inputVideoUrl');

  let media_source_type = 'stream';
  let video_source_type = 'youtube';
  let media_stream_url = '';
  let toastMsg = '';

  if (type === 'makkah') {
    media_source_type = 'stream';
    video_source_type = 'hls';
    media_stream_url = 'https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8';
    toastMsg = '🕋 Siaran Langsung Makkah Live 24/7 (HLS) diaktifkan di TV Kiosk!';
  } else if (type === 'madinah') {
    media_source_type = 'stream';
    video_source_type = 'hls';
    media_stream_url = 'https://cdn-globecast.akamaized.net/live/eds/saudi_sunnah/hls_roku/index.m3u8';
    toastMsg = '🕌 Siaran Langsung Madinah Live 24/7 (HLS) diaktifkan di TV Kiosk!';
  } else if (type === 'alhijrah') {
    media_source_type = 'stream';
    video_source_type = 'hls';
    media_stream_url = 'https://d25tgymtnqzu8s.cloudfront.net/smil:berita/playlist.m3u8?id=5';
    toastMsg = '📺 Siaran Langsung TV Al-Hijrah / Berita (HLS) diaktifkan di TV Kiosk!';
  } else if (type === 'phone_cam') {
    media_source_type = 'stream';
    video_source_type = 'hls';
    media_stream_url = 'http://192.168.1.50:8080/video';
    toastMsg = '📱 Pautan Kamera Telefon ditetapkan. Sila sahkan alamat IP telefon anda.';
  } else if (type === 'hls_sample') {
    media_source_type = 'stream';
    video_source_type = 'hls';
    media_stream_url = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    toastMsg = '🌊 Strim Ujian HLS Mux dimuatkan!';
  } else if (type === 'clear' || type === 'default' || type === 'slides') {
    media_source_type = 'slides';
    video_source_type = 'mp4';
    media_stream_url = '';
    toastMsg = '📋 Pemain media dikosongkan. Slaid poster dipaparkan sebagai lalai.';
  }

  // Update UI form inputs
  if (mediaSourceSelect) mediaSourceSelect.value = media_source_type;
  if (typeSelect) typeSelect.value = video_source_type;
  if (urlInput) {
    urlInput.value = media_stream_url;
    if (type === 'phone_cam') {
      urlInput.focus();
      urlInput.select();
    }
  }

  // Save to localStorage for instant cross-tab kiosk sync
  const mediaConfig = {
    media_source_type,
    video_source_type,
    media_stream_url,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem('kiosk_media_config', JSON.stringify(mediaConfig));
  } catch (_) {}

  // Broadcast sync signal to TV Kiosk
  broadcastAdminSync('kiosk_media_config', { media_config: mediaConfig });
  broadcastAdminSync('SETTINGS_UPDATED');

  // Persist settings to backend
  try {
    await apiRequest('/api/settings', 'POST', {
      media_source_type,
      video_source_type,
      video_source_url: media_stream_url,
      media_stream_url
    });
    if (toastMsg) showToast(toastMsg);
    // Refresh preview frame if open
    const frame = document.getElementById('adminKioskPreviewFrame');
    if (frame) {
      setTimeout(() => { frame.src = '/kiosk?t=' + Date.now(); }, 500);
    }
  } catch (err) {
    showToast(`Ralat menyimpan praset: ${err.message}`, true);
  }
};

const btnPresetMakkahMedia = document.getElementById('btnPresetMakkah');
if (btnPresetMakkahMedia) btnPresetMakkahMedia.addEventListener('click', () => setPresetMedia('makkah'));
const btnPresetMadinahMedia = document.getElementById('btnPresetMadinah');
if (btnPresetMadinahMedia) btnPresetMadinahMedia.addEventListener('click', () => setPresetMedia('madinah'));
const btnPresetAlhijrahMedia = document.getElementById('btnPresetAlhijrah');
if (btnPresetAlhijrahMedia) btnPresetAlhijrahMedia.addEventListener('click', () => setPresetMedia('alhijrah'));
const btnClearPresetMedia = document.getElementById('btnPresetClear');
if (btnClearPresetMedia) btnClearPresetMedia.addEventListener('click', () => setPresetMedia('clear'));
const btnPhoneCam = document.getElementById('btnPresetPhoneCam');
if (btnPhoneCam) btnPhoneCam.addEventListener('click', () => setPresetMedia('phone_cam'));
const btnSampleHls = document.getElementById('btnPresetSampleHls');
if (btnSampleHls) btnSampleHls.addEventListener('click', () => setPresetMedia('hls_sample'));

// 3. Layout Selector Cards Click Interaction
document.querySelectorAll('#multiLayoutSelectorGrid .layout-option, #dashLayoutSelectorGrid .layout-option').forEach(opt => {
  opt.addEventListener('click', async () => {
    const layoutMode = opt.dataset.layoutMode || (opt.querySelector('input[type="radio"]') && opt.querySelector('input[type="radio"]').value);
    if (!layoutMode) return;

    // Update active classes on both grids
    document.querySelectorAll('#multiLayoutSelectorGrid .layout-option, #dashLayoutSelectorGrid .layout-option').forEach(o => {
      if (o.dataset.layoutMode === layoutMode) {
        o.classList.add('active');
        const r = o.querySelector('input[type="radio"]');
        if (r) r.checked = true;
      } else {
        o.classList.remove('active');
      }
    });

    try {
      await apiRequest('/api/settings', 'POST', { active_layout_mode: layoutMode });
      showToast(`📺 Mod Paparan diubah ke: ${layoutMode.replace(/_/g, ' ').toUpperCase()}`);
      loadSettings();
      // Also refresh live preview frame
      const frame = document.getElementById('adminKioskPreviewFrame');
      if (frame) {
        setTimeout(() => { frame.src = '/kiosk?t=' + Date.now(); }, 500);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

// 4. One-Tap Quick Switch Buttons
const handleQuickSwitch = async (mode, label) => {
  try {
    await apiRequest('/api/settings', 'POST', { active_layout_mode: mode });
    showToast(label);
    loadSettings();
    const frame = document.getElementById('adminKioskPreviewFrame');
    if (frame) {
      setTimeout(() => { frame.src = '/kiosk?t=' + Date.now(); }, 500);
    }
  } catch (err) {
    showToast(err.message, true);
  }
};

const btnQuickSignage = document.getElementById('btnQuickSignage');
if (btnQuickSignage) {
  btnQuickSignage.addEventListener('click', () => handleQuickSwitch('fullscreen_signage', '📺 Mod Paparan: 100% Takwim Aktif'));
}
const btnQuickSignageDash = document.getElementById('btnQuickSignageDash');
if (btnQuickSignageDash) {
  btnQuickSignageDash.addEventListener('click', () => handleQuickSwitch('fullscreen_signage', '📺 Mod Paparan: 100% Takwim Aktif'));
}

const btnQuickVideo = document.getElementById('btnQuickVideo');
if (btnQuickVideo) {
  btnQuickVideo.addEventListener('click', () => handleQuickSwitch('fullscreen_video', '🎥 Mod Paparan: 100% Video Siaran Aktif'));
}
const btnQuickVideoDash = document.getElementById('btnQuickVideoDash');
if (btnQuickVideoDash) {
  btnQuickVideoDash.addEventListener('click', () => handleQuickSwitch('fullscreen_video', '🎥 Mod Paparan: 100% Video Siaran Aktif'));
}

// 4.0. Refresh Admin Live Preview Frame
const btnRefreshPreview = document.getElementById('btnRefreshAdminPreview');
if (btnRefreshPreview) {
  btnRefreshPreview.addEventListener('click', () => {
    const frame = document.getElementById('adminKioskPreviewFrame');
    if (frame) {
      frame.src = '/kiosk?t=' + Date.now();
      showToast('Pratonton Kiosk disegarkan!');
    }
  });
}

// 4.1. Fullscreen Media Mode & Layout Sync
const checkMediaFullscreen = document.getElementById('checkMediaFullscreen');
const selectKioskLayoutModeEl = document.getElementById('selectKioskLayoutMode');

if (checkMediaFullscreen) {
  checkMediaFullscreen.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked ? '1' : '0';
    if (selectKioskLayoutModeEl) {
      selectKioskLayoutModeEl.value = isEnabled === '1' ? 'fullscreen' : 'split';
    }
    try {
      await apiRequest('/api/settings', 'POST', {
        media_fullscreen_enabled: isEnabled,
        kiosk_layout_mode: isEnabled === '1' ? 'fullscreen' : 'split'
      });
      showToast(isEnabled === '1' 
        ? '🖥️ Mod Skrin Penuh Media diaktifkan (100% Lebar)!' 
        : '🖥️ Mod Skrin Penuh Media dimatikan (Paparan 2-Lajur dipulihkan).'
      );
    } catch (err) {
      showToast('Gagal mengubah tetapan: ' + err.message, true);
      e.target.checked = !e.target.checked;
    }
  });
}

if (selectKioskLayoutModeEl) {
  selectKioskLayoutModeEl.addEventListener('change', (e) => {
    if (checkMediaFullscreen) {
      checkMediaFullscreen.checked = (e.target.value === 'fullscreen');
    }
  });
}

// 5. Save Media & Layout Configuration (Display Settings)
async function handleSaveDisplaySettings() {
  const selectLayout = document.getElementById('selectKioskLayoutMode');
  const kiosk_layout_mode = selectLayout ? selectLayout.value : 'split';
  const pip_mode = document.getElementById('selectPipMode') ? document.getElementById('selectPipMode').value : 'none';
  const media_source_type = document.getElementById('selectMediaSourceType') ? document.getElementById('selectMediaSourceType').value : 'slides';
  
  const video_source_type = document.getElementById('selectVideoType') ? document.getElementById('selectVideoType').value : 'mp4';
  const video_source_url = document.getElementById('inputVideoUrl') ? document.getElementById('inputVideoUrl').value.trim() : '';
  const media_stream_url = video_source_url;
  const video_audio_enabled = (document.getElementById('checkVideoAudio') && document.getElementById('checkVideoAudio').checked) ? '1' : '0';
  const video_volume = document.getElementById('rangeVideoVolume') ? document.getElementById('rangeVideoVolume').value : '80';
  const kiosk_layout_preset = document.getElementById('selectKioskLayoutPreset') ? document.getElementById('selectKioskLayoutPreset').value : 'horizontal_glass';
  const kiosk_layout = document.getElementById('selectKioskSubLayout') ? document.getElementById('selectKioskSubLayout').value : 'full';

  const lower_third_enabled = (document.getElementById('switchLowerThird') && document.getElementById('switchLowerThird').checked) ? '1' : '0';
  const lower_third_speaker = document.getElementById('inputLowerThirdSpeaker') ? document.getElementById('inputLowerThirdSpeaker').value.trim() : '';
  const lower_third_topic = document.getElementById('inputLowerThirdTopic') ? document.getElementById('inputLowerThirdTopic').value.trim() : '';
  const lower_third_kitab = document.getElementById('inputLowerThirdKitab') ? document.getElementById('inputLowerThirdKitab').value.trim() : '';

  const kuliah_title = document.getElementById('inputKuliahTitle') ? document.getElementById('inputKuliahTitle').value.trim() : '';
  const kuliah_ustaz = document.getElementById('inputKuliahUstaz') ? document.getElementById('inputKuliahUstaz').value.trim() : '';
  const kuliah_date = document.getElementById('inputKuliahDate') ? document.getElementById('inputKuliahDate').value.trim() : '';

  // Mosque Administration (Duty Roster, Tabung, Hadith)
  const roster_imam = document.getElementById('inputRosterImam') ? document.getElementById('inputRosterImam').value.trim() : '';
  const roster_bilal = document.getElementById('inputRosterBilal') ? document.getElementById('inputRosterBilal').value.trim() : '';
  const roster_siak = document.getElementById('inputRosterSiak') ? document.getElementById('inputRosterSiak').value.trim() : '';

  const tabung_jumaat = document.getElementById('inputTabungJumaat') ? document.getElementById('inputTabungJumaat').value.trim() : '';
  const tabung_infaq_subuh = document.getElementById('inputTabungSubuh') ? document.getElementById('inputTabungSubuh').value.trim() : '';
  const tabung_pembangunan = document.getElementById('inputTabungPembangunan') ? document.getElementById('inputTabungPembangunan').value.trim() : '';
  const tabung_tarikh = document.getElementById('inputTabungTarikh') ? document.getElementById('inputTabungTarikh').value.trim() : '';

  const hadith_text = document.getElementById('inputHadithText') ? document.getElementById('inputHadithText').value.trim() : '';
  const hadith_source = document.getElementById('inputHadithSource') ? document.getElementById('inputHadithSource').value.trim() : '';

  const media_fullscreen_enabled = (kiosk_layout_mode === 'fullscreen' || (document.getElementById('checkMediaFullscreen') && document.getElementById('checkMediaFullscreen').checked)) ? '1' : '0';

  const selectedRadio = document.querySelector('input[name="active_layout_mode"]:checked');
  const active_layout_mode = selectedRadio ? selectedRadio.value : (kiosk_layout_mode === 'fullscreen' ? 'fullscreen_video' : 'fullscreen_signage');

  try {
    await apiRequest('/api/settings', 'POST', {
      kiosk_layout_mode,
      kiosk_layout_preset,
      pip_mode,
      media_source_type,
      media_stream_url,
      active_layout_mode,
      video_source_type,
      video_source_url,
      video_audio_enabled,
      video_volume,
      kiosk_layout,
      lower_third_enabled,
      lower_third_speaker,
      lower_third_topic,
      lower_third_kitab,
      kuliah_title,
      kuliah_ustaz,
      kuliah_date,
      roster_imam,
      roster_bilal,
      roster_siak,
      tabung_jumaat,
      tabung_infaq_subuh,
      tabung_pembangunan,
      tabung_tarikh,
      hadith_text,
      hadith_source,
      media_fullscreen_enabled
    });
    showToast('Tetapan paparan berjaya dikemaskini!');
    loadSettings();
    // Prompt to set 4-digit PIN code for kiosk lock
    setTimeout(promptKioskPinSetup, 600);
  } catch (err) {
    showToast(err.message, true);
  }
}

// 4-Digit Security PIN Prompt Modal Handler
function promptKioskPinSetup() {
  const modal = document.getElementById('pinPromptModal');
  const inputPin = document.getElementById('inputKioskPinCode');
  if (!modal) return;

  if (inputPin) {
    inputPin.value = (currentSettings && currentSettings.kiosk_pin) ? currentSettings.kiosk_pin : '';
  }
  modal.style.display = 'flex';
  if (inputPin) inputPin.focus();
}

const btnSavePinPrompt = document.getElementById('btnSavePinPrompt');
if (btnSavePinPrompt) {
  btnSavePinPrompt.addEventListener('click', async () => {
    const inputPin = document.getElementById('inputKioskPinCode');
    const pinVal = inputPin ? inputPin.value.trim() : '';

    if (!/^\d{4}$/.test(pinVal)) {
      showToast('Sila masukkan 4 digit nombor sah (contoh: 1234)!', true);
      if (inputPin) inputPin.focus();
      return;
    }

    try {
      await apiRequest('/api/settings', 'POST', {
        kiosk_pin: pinVal,
        screen_lock_pin: pinVal
      });
      const modal = document.getElementById('pinPromptModal');
      if (modal) modal.style.display = 'none';
      showToast(`🔒 PIN keselamatan 4-digit (${pinVal}) berjaya ditetapkan!`);
      loadSettings();
    } catch (err) {
      showToast('Gagal menetapkan PIN: ' + err.message, true);
    }
  });
}

const btnSkipPinPrompt = document.getElementById('btnSkipPinPrompt');
if (btnSkipPinPrompt) {
  btnSkipPinPrompt.addEventListener('click', () => {
    const modal = document.getElementById('pinPromptModal');
    if (modal) modal.style.display = 'none';
  });
}

const btnSaveDisplay = document.getElementById('btnSaveDisplaySettings');
if (btnSaveDisplay) {
  btnSaveDisplay.addEventListener('click', handleSaveDisplaySettings);
}

const btnSaveVideo = document.getElementById('btnSaveVideoLayout');
if (btnSaveVideo) {
  btnSaveVideo.addEventListener('click', handleSaveDisplaySettings);
}

// 5.1. Interactive Drag & Resize Canvas Mode Listeners
const checkLayoutEditModeEl = document.getElementById('checkLayoutEditMode');
if (checkLayoutEditModeEl) {
  checkLayoutEditModeEl.addEventListener('change', async (e) => {
    const isEdit = e.target.checked ? '1' : '0';
    try {
      await apiRequest('/api/layout/custom', 'POST', {
        layout_edit_mode: isEdit,
        custom_layout_enabled: isEdit === '1' ? '1' : (currentSettings.custom_layout_enabled || '0')
      });
      showToast(isEdit === '1'
        ? '📐 Mod Susun Bebas Kiosk DIBUKA! Sila buka skrin Kiosk untuk drag & resize.'
        : '🔒 Mod Susun Kiosk DIKUNCI (Read-Only Mode).'
      );
      await loadSettings();
    } catch (err) {
      showToast('Gagal mengubah mod susun: ' + err.message, true);
      e.target.checked = !e.target.checked;
    }
  });
}

const btnResetCustomLayoutEl = document.getElementById('btnResetCustomLayout');
if (btnResetCustomLayoutEl) {
  btnResetCustomLayoutEl.addEventListener('click', async () => {
    if (!confirm('Adakah anda pasti mahu mereset semua zon susun atur ke konfigurasi standard?')) return;
    try {
      const res = await apiRequest('/api/layout/reset', 'POST', {});
      showToast(res.message || 'Layout berjaya direset ke susun atur asal.');
      await loadSettings();
    } catch (err) {
      showToast('Gagal mereset layout: ' + err.message, true);
    }
  });
}

// ==================== AUTO-DISCOVERY PTZ / IP CAMERA ====================
const btnDiscoverCamerasEl = document.getElementById('btnDiscoverCameras');
if (btnDiscoverCamerasEl) {
  btnDiscoverCamerasEl.addEventListener('click', async () => {
    const container = document.getElementById('discoveredCamerasContainer');
    const statusMsg = document.getElementById('discoverStatusMsg');
    const listEl = document.getElementById('discoveredCamerasList');
    if (!container || !statusMsg || !listEl) return;

    container.style.display = 'block';
    statusMsg.innerHTML = '<span class="loading-spinner">⏳</span> Sedang mengimbas kamera ONVIF &amp; RTSP dalam rangkaian...';
    listEl.innerHTML = '';
    btnDiscoverCamerasEl.disabled = true;

    try {
      const res = await apiRequest('/api/ptz/discover');
      const cameras = res.cameras || [];

      if (cameras.length === 0) {
        statusMsg.innerHTML = '❌ Tiada kamera IP / ONVIF ditemui dalam rangkaian semasa.';
        listEl.innerHTML = '<div style="font-size:0.75rem; color:#94a3b8; padding:0.4rem;">Pastikan kamera PTZ/IP dihidupkan dan disambungkan ke Wi-Fi atau port LAN surau yang sama.</div>';
      } else {
        statusMsg.innerHTML = `✅ Ditemui <b>${cameras.length}</b> peranti kamera dalam rangkaian:`;
        listEl.innerHTML = '';

        cameras.forEach(cam => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(15,23,42,0.9); border:1px solid rgba(52,211,153,0.3); border-radius:8px; padding:0.6rem 0.75rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;';

          const infoDiv = document.createElement('div');
          infoDiv.innerHTML = `
            <div style="font-weight:700; color:#f8fafc; font-size:0.85rem;">📹 ${cam.vendor || 'IP Camera'} (${cam.ip})</div>
            <div style="font-size:0.72rem; color:#94a3b8;">Jenis: ${cam.type || 'RTSP'} &bull; Kaedah: ${cam.discovery_method || 'LAN'}</div>
            <div style="font-size:0.72rem; color:#38bdf8; font-family:monospace; word-break:break-all;">${cam.rtsp_url}</div>
          `;

          const btnUse = document.createElement('button');
          btnUse.type = 'button';
          btnUse.className = 'btn btn-sm btn-primary';
          btnUse.style.cssText = 'font-size:0.75rem; padding:0.3rem 0.65rem; white-space:nowrap; font-weight:700;';
          btnUse.textContent = '✔️ Guna Kamera Ini';
          btnUse.onclick = async () => {
            const urlInput = document.getElementById('inputVideoUrl');
            const mediaType = document.getElementById('selectMediaSourceType');
            const videoType = document.getElementById('selectVideoType');

            if (urlInput) urlInput.value = cam.rtsp_url;
            if (mediaType) mediaType.value = 'stream';
            if (videoType) videoType.value = 'hls';

            try {
              await apiRequest('/api/settings', 'POST', {
                media_source_type: 'stream',
                video_source_type: 'hls',
                video_source_url: cam.rtsp_url,
                media_stream_url: cam.rtsp_url,
                camera_rtsp_url: cam.rtsp_url
              });
              showToast(`🎥 Kamera ${cam.vendor || cam.ip} berjaya dipilih & disimpan!`);
              await loadSettings();
            } catch (err) {
              showToast('Gagal menyimpan kamera: ' + err.message, true);
            }
          };

          card.appendChild(infoDiv);
          card.appendChild(btnUse);
          listEl.appendChild(card);
        });
      }
    } catch (err) {
      statusMsg.innerHTML = '⚠️ Ralat semasa mengimbas kamera: ' + err.message;
    } finally {
      btnDiscoverCamerasEl.disabled = false;
    }
  });
}

// ==================== FONT TYPOGRAPHY SAVE ====================
const btnSaveFontEl = document.getElementById('btnSaveFontFamily');
if (btnSaveFontEl) {
  btnSaveFontEl.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="kiosk_font_family"]:checked');
    const fontVal = selected ? selected.value : 'outfit';
    try {
      await apiRequest('/api/settings', 'POST', { kiosk_font_family: fontVal });
      showToast('🎨 Gaya fon TV Kiosk berjaya dikemas kini!');
      await loadSettings();
    } catch (err) {
      showToast('Gagal menyimpan fon: ' + err.message, true);
    }
  });
}

// ==================== THEME SELECTION SAVE ====================
const btnSaveThemeEl = document.getElementById('btnSaveTheme');
if (btnSaveThemeEl) {
  btnSaveThemeEl.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="kiosk_theme"]:checked');
    const themeVal = selected ? selected.value : 'emerald';
    try {
      await apiRequest('/api/settings', 'POST', { 
        selected_theme: themeVal,
        kiosk_theme: themeVal 
      });
      try {
        const ch = new BroadcastChannel('esolat_sync');
        ch.postMessage({ 
          type: 'THEME_CHANGED', 
          theme: themeVal,
          selected_theme: themeVal,
          kiosk_theme: themeVal 
        });
      } catch (_) {}
      showToast('🎭 Tema visual TV Kiosk berjaya dikemas kini!');
      await loadSettings();
    } catch (err) {
      showToast('Gagal menyimpan tema: ' + err.message, true);
    }
  });
}

// ==================== INSTANT JANAZAH & JUMAAT SAVE ====================
const swJanazahEl = document.getElementById('switchJanazahNotice');
if (swJanazahEl) {
  swJanazahEl.addEventListener('change', () => {
    const box = document.getElementById('boxJanazahDetails');
    if (box) box.style.display = swJanazahEl.checked ? 'block' : 'none';
  });
}

const btnSaveJanazahEl = document.getElementById('btnSaveJanazahJumaat');
if (btnSaveJanazahEl) {
  btnSaveJanazahEl.addEventListener('click', async () => {
    const swJanazah = document.getElementById('switchJanazahNotice');
    const janazah_enabled = (swJanazah && swJanazah.checked) ? '1' : '0';
    const janazah_arwah_name = document.getElementById('inputJanazahName') ? document.getElementById('inputJanazahName').value.trim() : '';
    const janazah_solat_time = document.getElementById('inputJanazahSolatTime') ? document.getElementById('inputJanazahSolatTime').value.trim() : '';
    const janazah_solat_loc = document.getElementById('inputJanazahSolatLoc') ? document.getElementById('inputJanazahSolatLoc').value.trim() : '';
    const janazah_kubur_loc = document.getElementById('inputJanazahKuburLoc') ? document.getElementById('inputJanazahKuburLoc').value.trim() : '';
    const jumaat_khutbah_title = document.getElementById('inputJumaatKhutbahTitle') ? document.getElementById('inputJumaatKhutbahTitle').value.trim() : '';

    const payload = {
      janazah_enabled,
      janazah_arwah_name,
      janazah_solat_time,
      janazah_solat_loc,
      janazah_kubur_loc,
      jumaat_khutbah_title
    };

    try {
      await apiRequest('/api/settings', 'POST', payload);
      try {
        const cached = JSON.parse(localStorage.getItem('esolat_admin_settings') || '{}');
        Object.assign(cached, payload);
        localStorage.setItem('esolat_admin_settings', JSON.stringify(cached));
      } catch (_) {}

      broadcastAdminSync('SETTINGS_UPDATED', payload);
      broadcastAdminSync('UPDATE_DEATH_NOTICE', payload);

      showToast(janazah_enabled === '1' ? '🕊️ Papan tanda takziah diaktifkan di skrin TV!' : 'Tetapan takziah & khutbah disimpan.');
      await loadSettings();
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, true);
    }
  });
}

// ==================== TICKER & BRANDING SAVE ====================
document.getElementById('btnSaveBranding').addEventListener('click', async () => {
  const mosque_name = document.getElementById('inputMosqueName').value.trim();
  const mosque_location = document.getElementById('inputMosqueLocation').value.trim();
  const ticker_text = document.getElementById('inputTickerText').value.trim();

  try {
    await apiRequest('/api/settings', 'POST', { mosque_name, mosque_location, ticker_text });
    showToast('Maklumat surau & teks marquee disimpan!');
    loadSettings();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== HIJRI COUNTDOWN TOGGLE HANDLER ====================
async function handleHijriCountdownToggle(enabled) {
  const val = enabled ? '1' : '0';
  const sw1 = document.getElementById('switchHijriCountdown');
  const sw2 = document.getElementById('switchHijriCountdownTicker');
  if (sw1) sw1.checked = enabled;
  if (sw2) sw2.checked = enabled;

  try {
    await apiRequest('/api/settings', 'POST', { hijri_countdown_enabled: val });
    showToast(enabled ? '⏳ Detik undur Hari Kebesaran Islam diaktifkan!' : 'Detik undur Hari Kebesaran Islam dinyahaktifkan.');
  } catch (err) {
    showToast('Gagal menyimpan tetapan: ' + err.message, true);
  }
}

const swCountdownEl = document.getElementById('switchHijriCountdown');
if (swCountdownEl) {
  swCountdownEl.addEventListener('change', (e) => handleHijriCountdownToggle(e.target.checked));
}

const swCountdownTickerEl = document.getElementById('switchHijriCountdownTicker');
if (swCountdownTickerEl) {
  swCountdownTickerEl.addEventListener('change', (e) => handleHijriCountdownToggle(e.target.checked));
}

// Bank QR Code Preview & File Selection
const inputBankQrFile = document.getElementById('inputBankQrFile');
if (inputBankQrFile) {
  inputBankQrFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const qrImg = document.getElementById('bankQrPreviewImg');
        const qrPlaceholder = document.getElementById('bankQrPlaceholder');
        if (qrImg) {
          qrImg.src = reader.result;
          qrImg.style.display = 'block';
        }
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });
}

const btnRemoveBankQr = document.getElementById('btnRemoveBankQr');
if (btnRemoveBankQr) {
  btnRemoveBankQr.addEventListener('click', async () => {
    if (!confirm('Padamkan imej QR Code Bank ini?')) return;
    try {
      await apiRequest('/api/settings', 'POST', { bank_qr_url: '' });
      const fileInp = document.getElementById('inputBankQrFile');
      if (fileInp) fileInp.value = '';
      showToast('QR Code Bank berjaya dipadam.');
      await loadSettings();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

const btnSaveBank = document.getElementById('btnSaveBank');
if (btnSaveBank) {
  btnSaveBank.addEventListener('click', async () => {
    const bank_name = document.getElementById('inputBankName').value.trim();
    const bank_account_no = document.getElementById('inputBankAcc').value.trim();
    const bank_account_holder = document.getElementById('inputBankHolder').value.trim();
    const fileInp = document.getElementById('inputBankQrFile');

    const payload = { bank_name, bank_account_no, bank_account_holder };

    if (fileInp && fileInp.files && fileInp.files.length > 0) {
      const file = fileInp.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          payload.bank_qr_base64 = reader.result;
          await apiRequest('/api/settings', 'POST', payload);
          showToast('Maklumat akaun tabung & QR berjaya disimpan!');
          fileInp.value = '';
          await loadSettings();
        } catch (err) {
          showToast(err.message, true);
        }
      };
      reader.readAsDataURL(file);
    } else {
      try {
        await apiRequest('/api/settings', 'POST', payload);
        showToast('Maklumat akaun tabung disimpan!');
        await loadSettings();
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });
}

// ==================== LICENSE MANAGEMENT ====================
async function loadLicenseStatus() {
  try {
    const lic = await apiRequest('/api/license/status');
    const hwid = lic.hwid || 'ESOLAT-XXXX-XXXX-XXXX';
    document.getElementById('adminHwidDisplay').textContent = hwid;
    const suppHwid = document.getElementById('supportHwidCode');
    if (suppHwid) suppHwid.textContent = hwid;
    document.getElementById('statLicense').textContent = lic.license_state || 'TRIAL';

    const badge = document.getElementById('licenseInfoBadge');
    const topBanner = document.getElementById('topTrialBanner');

    if (lic.license_state === 'LICENSED') {
      badge.innerHTML = `
        <div style="color:#34d399; font-weight:700;">✓ SISTEM AKTIF (${lic.license_type})</div>
        <div style="font-size:0.8rem; color:#a7f3d0;">Dilesenkan kepada: ${lic.licensee}</div>
      `;
      topBanner.style.display = 'none';
    } else if (lic.license_state === 'TRIAL') {
      badge.innerHTML = `
        <div style="color:#fbbf24; font-weight:700;">⚠️ TEMPOH PERCUBAAN AKTIF</div>
        <div style="font-size:0.8rem; color:#fde68a;">Baki: ${lic.days_left} hari lagi (${Math.floor(lic.seconds_left / 3600)} jam)</div>
        <div style="font-size:0.75rem; color:#cbd5e1; margin-top:0.35rem;">Sila hubungi sokongan teknikal Skywalker Consortium (+6011-1871 2388) untuk pengaktifan lesen.</div>
      `;
      topBanner.style.display = 'flex';
      document.getElementById('bannerTrialText').textContent = `Baki ${lic.days_left} hari lagi`;
    } else {
      badge.innerHTML = `
        <div style="color:#ef4444; font-weight:700;">🔒 PERCUBAAN TAMAT (LOCKED)</div>
        <div style="font-size:0.8rem; color:#fca5a5;">Sila masukkan PIN atau muat naik fail lesen untuk membuka sistem.</div>
        <div style="font-size:0.8rem; color:#fbbf24; margin-top:0.35rem; font-weight:600;">Sila hubungi sokongan teknikal Skywalker Consortium (+6011-1871 2388) untuk pengaktifan lesen.</div>
      `;
      topBanner.style.display = 'flex';
      document.getElementById('bannerTrialText').textContent = `PERCUBAAN TELAH TAMAT`;
    }
  } catch (err) {
    console.error('Error loading license status:', err);
  }
}

document.getElementById('btnCopyHwid').addEventListener('click', () => {
  const hwid = document.getElementById('adminHwidDisplay').textContent;
  navigator.clipboard.writeText(hwid).then(() => {
    showToast('Machine ID disalin: ' + hwid);
  });
});

// Activate PIN
document.getElementById('pinActivationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('inputPin').value.trim();

  try {
    const res = await apiRequest('/api/license/activate_pin', 'POST', { pin });
    showToast(res.message);
    document.getElementById('inputPin').value = '';
    loadLicenseStatus();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Upload .lic File
document.getElementById('btnUploadLicFile').addEventListener('click', () => {
  const fileInput = document.getElementById('licFileInput');
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Sila pilih fail esolat.lic terlebih dahulu!', true);
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const content = reader.result;
      const res = await apiRequest('/api/license/upload_lic', 'POST', { license_content: content });
      showToast(res.message);
      loadLicenseStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  reader.readAsText(file);
});

// ==================== AUDIO & KIOSK TESTS ====================
const btnTestAdhanEl = document.getElementById('btnTestAdhan');
if (btnTestAdhanEl) btnTestAdhanEl.addEventListener('click', () => triggerAudioTest('adhan', btnTestAdhanEl));

const btnTestSubuhEl = document.getElementById('btnTestSubuh');
if (btnTestSubuhEl) btnTestSubuhEl.addEventListener('click', () => triggerAudioTest('subuh', btnTestSubuhEl));

const btnTestBeepEl = document.getElementById('btnTestBeep');
if (btnTestBeepEl) btnTestBeepEl.addEventListener('click', () => triggerAudioTest('beep', btnTestBeepEl));

const btnTestPreAdhanEl = document.getElementById('btnTestPreAdhan');
if (btnTestPreAdhanEl) btnTestPreAdhanEl.addEventListener('click', () => triggerAudioTest('pre_adhan', btnTestPreAdhanEl));

const btnStopKioskAudioEl = document.getElementById('btnStopKioskAudio');
if (btnStopKioskAudioEl) btnStopKioskAudioEl.addEventListener('click', () => stopKioskAudio());

async function triggerAudioTest(sound, btnElement = null) {
  try {
    if (btnElement) btnElement.classList.add('testing');
    showToast(`Menguji pembesar suara TV dewan solat: ${sound}...`);
    const res = await apiRequest('/api/audio/test-kiosk', 'POST', { sound });
    showToast(`✓ ${res.message || 'Arahan ujian audio TV dihantar.'}`);
  } catch (err) {
    showToast(`Ralat ujian audio TV: ${err.message}`, true);
  } finally {
    if (btnElement) {
      setTimeout(() => btnElement.classList.remove('testing'), 1500);
    }
  }
}

window.simulateState = async function(state) {
  try {
    const res = await apiRequest('/api/system/test_state', 'POST', { state, prayer: 'Zohor', duration: 30 });
    showToast(res.message);
  } catch (err) {
    showToast(err.message, true);
  }
};

window.clearSimulation = async function() {
  try {
    const res = await apiRequest('/api/system/clear_test_state', 'POST', {});
    showToast(res.message);
  } catch (err) {
    showToast(err.message, true);
  }
};

document.getElementById('btnReloadKiosk').addEventListener('click', async () => {
  try {
    await apiRequest('/api/system/reload_kiosk', 'POST', {});
    showToast('Arahan muat semula TV kiosk dihantar!');
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== LIVE CAMERA & RECORDING ====================
let isCameraLiveOnTV = false;

async function checkCameraStatus() {
  try {
    const res = await apiRequest('/api/camera/status');
    const dot = document.getElementById('camStatusDot');
    const text = document.getElementById('camStatusText');
    const btnRecord = document.getElementById('btnToggleRecord');
    const timerBadge = document.getElementById('recordingTimerBadge');

    if (!dot || !text) return;

    if (res.camera_detected) {
      dot.textContent = '🟢';
      text.textContent = `Kamera Dikesan (${res.video_devices.join(', ')})`;
    } else {
      dot.textContent = '⚪';
      text.textContent = 'Tiada kad HDMI capture dikesan';
    }

    if (res.is_recording) {
      btnRecord.textContent = '⏹️ Hentikan Rakaman';
      btnRecord.classList.remove('btn-danger');
      btnRecord.classList.add('btn-warning');
      timerBadge.style.display = 'block';
      const m = Math.floor(res.duration_seconds / 60);
      const s = res.duration_seconds % 60;
      document.getElementById('recTimerText').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      btnRecord.textContent = '🔴 Mula Rakam MP4';
      btnRecord.classList.remove('btn-warning');
      btnRecord.classList.add('btn-danger');
      timerBadge.style.display = 'none';
    }
  } catch (err) {}
}

async function loadRecordings() {
  try {
    const res = await apiRequest('/api/camera/recordings');
    const list = document.getElementById('recordingsList');
    if (!list) return;
    list.innerHTML = '';
    if (!res.recordings || res.recordings.length === 0) {
      list.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8; text-align:center;">Tiada fail rakaman.</div>';
      return;
    }
    res.recordings.forEach(rec => {
      const row = document.createElement('div');
      row.style = 'background:rgba(15,23,42,0.5); padding:0.5rem 0.75rem; border-radius:8px; display:flex; align-items:center; justify-content:space-between; font-size:0.85rem;';
      row.innerHTML = `
        <div>
          <div style="font-weight:600; color:#fff;">${rec.filename}</div>
          <div style="font-size:0.75rem; color:#94a3b8;">${rec.created_at} | ${rec.size_mb} MB</div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <a href="${rec.download_url}" download class="btn btn-sm btn-outline" style="text-decoration:none;">⬇️</a>
          <button class="btn btn-sm btn-danger" onclick="deleteRecording('${rec.filename}')">🗑️</button>
        </div>
      `;
      list.appendChild(row);
    });
  } catch (err) {}
}

window.deleteRecording = async function(filename) {
  if (!confirm(`Padamkan fail rakaman ${filename}?`)) return;
  try {
    await apiRequest(`/api/camera/recordings/${filename}`, 'DELETE');
    showToast('Fail rakaman dipadamkan.');
    loadRecordings();
  } catch (err) {
    showToast(err.message, true);
  }
};

document.getElementById('btnToggleLiveCam').addEventListener('click', async () => {
  isCameraLiveOnTV = !isCameraLiveOnTV;
  try {
    const res = await apiRequest('/api/camera/toggle_live_display', 'POST', { enable: isCameraLiveOnTV });
    showToast(res.message);
    document.getElementById('btnToggleLiveCam').textContent = isCameraLiveOnTV ? '⏹️ Hentikan Siaran TV' : '📺 Papar Kamera di TV';
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('btnToggleRecord').addEventListener('click', async () => {
  try {
    const status = await apiRequest('/api/camera/status');
    if (status.is_recording) {
      const res = await apiRequest('/api/camera/record/stop', 'POST');
      showToast(res.message);
      checkCameraStatus();
      loadRecordings();
    } else {
      const res = await apiRequest('/api/camera/record/start', 'POST');
      showToast(res.message);
      checkCameraStatus();
    }
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== RECORDING STORAGE LOCATION MANAGEMENT ====================
async function loadStorageInfo() {
  const select = document.getElementById('recStorageSelect');
  const pathDisplay = document.getElementById('storagePathDisplay');
  const freeDisplay = document.getElementById('storageFreeDisplay');
  if (!select) return;

  try {
    const res = await apiRequest('/api/camera/storage');
    if (res.storage_info) {
      if (pathDisplay) pathDisplay.textContent = `📁 ${res.storage_info.path}`;
      if (freeDisplay) {
        freeDisplay.textContent = `${res.storage_info.free_gb} GB bebas (${res.storage_info.total_gb} GB)`;
        freeDisplay.style.color = res.storage_info.free_gb < 2 ? '#ef4444' : '#38bdf8';
      }
    }

    if (res.available_drives && res.available_drives.length > 0) {
      select.innerHTML = '';
      res.available_drives.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.path;
        opt.textContent = d.label;
        if (d.is_current) opt.selected = true;
        select.appendChild(opt);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '__custom__';
      customOpt.textContent = '➕ Tetapkan Laluan Lain (Custom Path)...';
      select.appendChild(customOpt);
    }
  } catch (err) {}
}

const recStorageSelect = document.getElementById('recStorageSelect');
if (recStorageSelect) {
  recStorageSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    const customGroup = document.getElementById('customStorageGroup');
    if (val === '__custom__') {
      if (customGroup) customGroup.style.display = 'block';
      return;
    }
    if (customGroup) customGroup.style.display = 'none';
    try {
      const res = await apiRequest('/api/camera/storage', 'POST', { storage_path: val });
      showToast(res.message);
      await loadStorageInfo();
      await loadRecordings();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

const btnApplyCustomStorage = document.getElementById('btnApplyCustomStorage');
if (btnApplyCustomStorage) {
  btnApplyCustomStorage.addEventListener('click', async () => {
    const input = document.getElementById('customStorageInput');
    const customPath = input ? input.value.trim() : '';
    if (!customPath) {
      showToast('Sila masukkan laluan folder storan yang sah.', true);
      return;
    }
    try {
      const res = await apiRequest('/api/camera/storage', 'POST', { storage_path: customPath });
      showToast(res.message);
      const customGroup = document.getElementById('customStorageGroup');
      if (customGroup) customGroup.style.display = 'none';
      await loadStorageInfo();
      await loadRecordings();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

const btnRescanStorage = document.getElementById('btnRescanStorage');
if (btnRescanStorage) {
  btnRescanStorage.addEventListener('click', async () => {
    showToast('Mengimbas pemacu USB / External HDD...');
    await loadStorageInfo();
    showToast('Senarai pemacu storan dikemaskini!');
  });
}

// ==================== LIVE STATUS POLLER & REAL-TIME ADMIN CLOCK ====================
let adminPrayerTimes = null;
let adminClockInterval = null;

// Initialize cached ribbon times from local storage if available
try {
  const cachedTimes = localStorage.getItem('esolat_admin_ribbon_times');
  if (cachedTimes) {
    adminPrayerTimes = JSON.parse(cachedTimes);
  }
} catch (_) {}

function calculateNextPrayerFromTimes(now, times) {
  if (!times) return null;
  // Fardhu prayers only (Syuruk & Imsak are marker times, not prayer times)
  const prayerOrder = [
    { name: 'Subuh', time: times.Subuh },
    { name: 'Zohor', time: times.Zohor },
    { name: 'Asar', time: times.Asar },
    { name: 'Maghrib', time: times.Maghrib },
    { name: 'Isyak', time: times.Isyak }
  ];

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const p of prayerOrder) {
    if (!p.time || p.time === '--:--') continue;
    const parts = p.time.split(':');
    if (parts.length >= 2) {
      const pMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      if (pMinutes > currentMinutes) {
        return { name: p.name.toUpperCase(), time: p.time };
      }
    }
  }

  // If passed Isyak, next prayer is tomorrow's Subuh
  const subuhTime = times.Subuh || '--:--';
  return { name: 'SUBUH', time: subuhTime };
}

function updateAdminRealTimeStatus() {
  const now = new Date();
  
  // 1. Update Real-Time Clock
  const clockEl = document.getElementById('statClock') || document.getElementById('adminCurrentTime');
  if (clockEl) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  // 2. Update Next Prayer Display
  const nextEl = document.getElementById('statNextPrayer');
  if (nextEl) {
    const next = calculateNextPrayerFromTimes(now, adminPrayerTimes);
    if (next && next.time && next.time !== '--:--') {
      nextEl.textContent = `${next.name} (${next.time})`;
    }
  }
}

function startAdminClock() {
  if (adminClockInterval) clearInterval(adminClockInterval);
  updateAdminRealTimeStatus();
  adminClockInterval = setInterval(updateAdminRealTimeStatus, 1000);
}

async function syncAdminStatePoller() {
  try {
    const s = await fetch('/api/state', { cache: 'no-store' }).then(r => r.json());
    if (s) {
      if (s.ribbon_times) {
        adminPrayerTimes = s.ribbon_times;
        try {
          localStorage.setItem('esolat_admin_ribbon_times', JSON.stringify(s.ribbon_times));
        } catch (_) {}
      }

      const nextEl = document.getElementById('statNextPrayer');
      if (nextEl) {
        if (s.next_prayer && s.ribbon_times && s.ribbon_times[s.next_prayer]) {
          nextEl.textContent = `${s.next_prayer.toUpperCase()} (${s.ribbon_times[s.next_prayer]})`;
        } else if (s.next_prayer) {
          const m = Math.floor((s.time_to_next_seconds || 0) / 60);
          nextEl.textContent = `${s.next_prayer.toUpperCase()} (${m}m)`;
        }
      }

      if (s.settings && s.settings.jakim_zone) {
        const zoneEl = document.getElementById('statZone');
        if (zoneEl && (zoneEl.textContent === '--' || !zoneEl.textContent)) {
          zoneEl.textContent = s.settings.jakim_zone;
        }
      }
    }
  } catch (e) {
    // Silent fail for polling errors
  }
}

function startStatusPoller() {
  startAdminClock();
  syncAdminStatePoller();
  setInterval(syncAdminStatePoller, 2000);
}

// ==================== PWA WEBAPK / SERVICE WORKER REGISTRATION ====================
let deferredInstallPrompt = null;

function setupPWA() {
  if ('serviceWorker' in navigator) {
    // Unregister any legacy root-scoped service workers
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        if (reg.scope.endsWith(':8080/') || reg.scope.endsWith('/')) {
          if (!reg.scope.includes('/admin/')) {
            reg.unregister();
          }
        }
      }
    }).catch(() => {});

    window.addEventListener('load', () => {
      const swUrl = new URL('sw.js', window.location.href).href;
      navigator.serviceWorker.register(swUrl)
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // Handle Chrome / Android WebAPK install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    const btnTopInstall = document.getElementById('btnInstallPwa');
    const pwaBanner = document.getElementById('pwaInstallBanner');
    const loginPwaCard = document.getElementById('loginPwaInstallCard');

    if (btnTopInstall) btnTopInstall.style.display = 'inline-flex';
    if (loginPwaCard) loginPwaCard.style.display = 'block';
    if (pwaBanner && !sessionStorage.getItem('dismissedPwaBanner')) {
      pwaBanner.style.display = 'block';
    }
  });

  const triggerInstall = async () => {
    if (!deferredInstallPrompt) {
      // Fallback advice if already installed or on iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        alert('Untuk memasang di iPhone/iPad:\n1. Tekan butang Share (Kongsi) di bawah pelayar Safari\n2. Pilih "Add to Home Screen" (Tambah ke Skrin Utama)');
      } else {
        alert('Untuk memasang aplikasi:\nTekan menu 3 titik di penjuru kanan atas pelayar Chrome anda dan pilih "Pasang aplikasi" (Install app) atau "Tambah ke Skrin Utama".');
      }
      return;
    }

    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      showToast('Aplikasi e-Solat Admin sedang dipasang ke skrin telefon anda!');
    }
    deferredInstallPrompt = null;
    const btnTopInstall = document.getElementById('btnInstallPwa');
    const pwaBanner = document.getElementById('pwaInstallBanner');
    const loginPwaCard = document.getElementById('loginPwaInstallCard');
    if (btnTopInstall) btnTopInstall.style.display = 'none';
    if (pwaBanner) pwaBanner.style.display = 'none';
    if (loginPwaCard) loginPwaCard.style.display = 'none';
  };

  const btnTopInstall = document.getElementById('btnInstallPwa');
  const btnTrigger = document.getElementById('btnTriggerInstallPwa');
  const btnLoginTrigger = document.getElementById('btnLoginTriggerInstall');
  const btnDismiss = document.getElementById('btnDismissPwaBanner');

  if (btnTopInstall) btnTopInstall.addEventListener('click', triggerInstall);
  if (btnTrigger) btnTrigger.addEventListener('click', triggerInstall);
  if (btnLoginTrigger) btnLoginTrigger.addEventListener('click', triggerInstall);
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      const pwaBanner = document.getElementById('pwaInstallBanner');
      if (pwaBanner) pwaBanner.style.display = 'none';
      sessionStorage.setItem('dismissedPwaBanner', '1');
    });
  }
}

// ==================== NETWORK BROADCAST & PHONE CONNECTIVITY ====================
let cachedNetworkInfo = null;

async function updateNetworkInfo() {
  try {
    let net = null;
    try {
      const res = await fetch('/api/system/network-info', { cache: 'no-store' });
      if (res.ok) net = await res.json();
    } catch (_) {}
    if (!net) {
      net = await fetch('/api/system/network', { cache: 'no-store' }).then(r => r.json());
    }
    cachedNetworkInfo = net;
    renderNetworkInfo(net);

    // Cache paired network settings in localStorage
    if (net) {
      const pIp = net.ip || net.primary_ip;
      const port = net.port || '8080';
      const adminUrl = net.admin_url || `http://${pIp}:${port}/admin/`;
      try {
        if (pIp && pIp !== '127.0.0.1' && pIp !== 'localhost') {
          localStorage.setItem('last_connected_ip', `${pIp}:${port}`);
          localStorage.setItem('esolat_base_url', `http://${pIp}:${port}`);
          localStorage.setItem('esolat_admin_url', adminUrl);
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[NETWORK] Could not fetch network info:', err);
  }
}

function renderNetworkInfo(net) {
  if (!net) return;

  const primaryIp = net.primary_ip || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : '127.0.0.1');
  const port = net.port || window.location.port || '8080';
  const hostname = net.hostname ? `${net.hostname}.local` : `${window.location.hostname}`;
  const mdnsUrl = net.mdns_url || `http://esolat.local:${port}/admin/`;
  const adminUrl = net.admin_url || `http://${primaryIp}:${port}/admin/`;

  // 1. Update Login Modal broadcast
  const loginUrlEl = document.getElementById('loginNetUrl');
  const loginHostEl = document.getElementById('loginNetHostname');
  if (loginUrlEl) loginUrlEl.textContent = mdnsUrl;
  if (loginHostEl) loginHostEl.textContent = `Hostname: ${hostname} (IP: ${primaryIp})`;

  // 2. Update Top Nav bar badge
  const topNavIp = document.getElementById('topNavIpText');
  if (topNavIp) topNavIp.textContent = `${hostname} (${primaryIp})`;

  // 3. Update Dashboard Network Card
  const netHostEl = document.getElementById('netHostname');
  const netIpEl = document.getElementById('netPrimaryIp');
  const netAdminInput = document.getElementById('netAdminUrlInput');
  const netQrLabel = document.getElementById('netQrUrlLabel');

  if (netHostEl) netHostEl.textContent = hostname;
  if (netIpEl) netIpEl.textContent = primaryIp;
  if (netAdminInput) netAdminInput.value = mdnsUrl;
  if (netQrLabel) netQrLabel.textContent = mdnsUrl;

  // Update QR display (Local Canvas Generator with Fallback)
  const netQrCanvas = document.getElementById('netQrCanvasContainer');
  const netQrImg = document.getElementById('netQrImg');
  if (netQrCanvas) {
    netQrCanvas.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(netQrCanvas, {
          text: adminUrl,
          width: 260,
          height: 260,
          colorDark: "#022c22",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        if (netQrImg) netQrImg.style.display = 'none';
      } catch (e) {
        console.warn('Local QRCode error, falling back to API:', e);
        if (netQrImg) {
          netQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(adminUrl)}`;
          netQrImg.style.display = 'block';
        }
      }
    } else if (netQrImg) {
      netQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(adminUrl)}`;
      netQrImg.style.display = 'block';
    }
  }
}

function setupNetworkBroadcastUI() {
  // Copy Admin URL button
  const btnCopy = document.getElementById('btnCopyAdminUrl');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const input = document.getElementById('netAdminUrlInput');
      const urlToCopy = input ? input.value : (cachedNetworkInfo ? cachedNetworkInfo.admin_url : window.location.href);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(urlToCopy);
        } else if (input) {
          input.select();
          document.execCommand('copy');
        }
        showToast('📋 Pautan Admin disalin! Buka pautan ini pada telefon pintar AJK.');
      } catch (err) {
        showToast(`Pautan: ${urlToCopy}`);
      }
    });
  }

  // Direct Copy URL button inside QR modal
  const btnCopyDirect = document.getElementById('btnCopyQrUrlDirect');
  if (btnCopyDirect) {
    btnCopyDirect.addEventListener('click', async () => {
      const label = document.getElementById('netQrUrlLabel');
      const textToCopy = label ? label.textContent : (cachedNetworkInfo ? cachedNetworkInfo.admin_url : window.location.href);
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(textToCopy);
        showToast('📋 Pautan Admin disalin!');
      } catch (e) {
        showToast(`Pautan: ${textToCopy}`);
      }
    });
  }

  // Toggle QR Code Box
  const btnShowQr = document.getElementById('btnShowNetQr');
  const btnCloseQr = document.getElementById('btnCloseNetQr');
  const qrBox = document.getElementById('netQrContainer');

  if (btnShowQr && qrBox) {
    btnShowQr.addEventListener('click', () => {
      const isHidden = qrBox.style.display === 'none';
      qrBox.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        qrBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (btnCloseQr && qrBox) {
    btnCloseQr.addEventListener('click', () => {
      qrBox.style.display = 'none';
    });
  }

  // Top Nav IP button click
  const btnTopNet = document.getElementById('btnTopNetInfo');
  if (btnTopNet) {
    btnTopNet.addEventListener('click', () => {
      const input = document.getElementById('netAdminUrlInput');
      if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.style.boxShadow = '0 0 15px #3b82f6';
        setTimeout(() => { input.style.boxShadow = ''; }, 1500);
      }
      showToast(`📡 IP Sistem: ${cachedNetworkInfo?.primary_ip || window.location.hostname} | Port: ${cachedNetworkInfo?.port || '8080'}`);
    });
  }
}

// ==================== SMART PAIRING & 1-CLICK RECONNECT ====================
function setupSmartPairingUI() {
  const lastConnectedCard = document.getElementById('lastConnectedCard');
  const lastConnectedHostText = document.getElementById('lastConnectedHostText');
  const btnQuickReconnect = document.getElementById('btnQuickReconnectLast');
  const btnToggleManual = document.getElementById('btnToggleManualIp');
  const manualAccordion = document.getElementById('manualIpAccordionContent');
  const manualChevron = document.getElementById('manualIpChevron');
  const manualIpInput = document.getElementById('inputManualKioskIp');
  const btnConnect = document.getElementById('btnConnectManualIp');

  // Auto-cache base URL upon opening link from QR scan for the first time
  const currentHost = window.location.hostname;
  const currentPort = window.location.port || '8080';
  const currentOrigin = window.location.origin;
  if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    try {
      const targetStr = `${currentHost}:${currentPort}`;
      localStorage.setItem('last_connected_ip', targetStr);
      localStorage.setItem('esolat_base_url', currentOrigin);
      localStorage.setItem('esolat_admin_url', window.location.href);
    } catch (_) {}
  }

  // Check localStorage for previous connection
  const lastIp = localStorage.getItem('last_connected_ip');
  if (lastIp) {
    if (lastConnectedCard && lastConnectedHostText) {
      lastConnectedHostText.textContent = lastIp;
      lastConnectedCard.style.display = 'block';
    }
    if (manualIpInput) {
      manualIpInput.value = lastIp;
    }
  }

  // 1-Click Reconnect button
  if (btnQuickReconnect && lastIp) {
    btnQuickReconnect.addEventListener('click', () => {
      connectToKioskTarget(lastIp);
    });
  }

  // Toggle manual IP accordion
  if (btnToggleManual && manualAccordion) {
    btnToggleManual.addEventListener('click', () => {
      const isHidden = manualAccordion.style.display === 'none';
      manualAccordion.style.display = isHidden ? 'block' : 'none';
      if (manualChevron) manualChevron.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Connect manual IP button
  if (btnConnect && manualIpInput) {
    btnConnect.addEventListener('click', () => {
      const rawVal = manualIpInput.value.trim();
      if (!rawVal) {
        showToast('Sila masukkan alamat IP atau Hostname Kiosk.', true);
        return;
      }
      connectToKioskTarget(rawVal);
    });

    manualIpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnConnect.click();
      }
    });
  }
}

// ==================== QUICK ACTION CONTROLS (DASHBOARD) ====================
let isSolatModeActive = false;

function setupQuickControlsUI() {
  const btnForceIqamah = document.getElementById('btnQuickForceIqamah');
  const btnToggleSolat = document.getElementById('btnQuickToggleSolatMode');
  const btnTestAudio = document.getElementById('btnQuickTestAudio');
  const btnSendTicker = document.getElementById('btnQuickSendTicker');
  const inputQuickTicker = document.getElementById('inputQuickTickerMsg');
  const btnPresetMakkah = document.getElementById('btnQuickPresetMakkah');
  const btnPresetMadinah = document.getElementById('btnQuickPresetMadinah');
  const btnPresetAlhijrah = document.getElementById('btnQuickPresetAlhijrah');
  const btnPresetDefault = document.getElementById('btnQuickPresetDefault');

  // 1. Force Iqamah Now (Emergency Trigger for Bilal/Imam)
  if (btnForceIqamah) {
    btnForceIqamah.addEventListener('click', async () => {
      if (!confirm('Langkau kiraan undur dan laksanakan Iqamah / Mod Solat sekarang?')) return;
      try {
        if (navigator.vibrate) navigator.vibrate(200);
        await fetch('/api/iqamah/now', { method: 'POST' });
        showToast('⏱️ Iqamah diaktifkan! Paparan TV beralih ke mod solat serta-merta.');
      } catch (err) {
        showToast(`Ralat mencetuskan Iqamah: ${err.message}`, true);
      }
    });
  }

  // 2. Blackout / Khusyuk Prayer Mode Toggle
  if (btnToggleSolat) {
    btnToggleSolat.addEventListener('click', async () => {
      try {
        if (!isSolatModeActive) {
          await fetch('/api/system/test_state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'SOLAT', duration: 900 })
          });
          isSolatModeActive = true;
          btnToggleSolat.style.background = '#ef4444';
          btnToggleSolat.style.color = '#ffffff';
          btnToggleSolat.style.borderColor = '#ef4444';
          btnToggleSolat.innerHTML = '<span>☀️</span><span>Kembalikan Skrin TV</span>';
          showToast('🌙 Mod Khusyuk / Skrin Gelap diaktifkan pada TV.');
        } else {
          await fetch('/api/system/clear_test_state', { method: 'POST' });
          isSolatModeActive = false;
          btnToggleSolat.style.background = 'rgba(251,191,36,0.08)';
          btnToggleSolat.style.color = '#fbbf24';
          btnToggleSolat.style.borderColor = '#fbbf24';
          btnToggleSolat.innerHTML = '<span>🌙</span><span>Matikan Skrin / Mod Khusyuk</span>';
          showToast('☀️ Skrin TV dikembalikan ke mod biasa.');
        }
      } catch (err) {
        showToast(`Ralat mod khusyuk: ${err.message}`, true);
      }
    });
  }

  // 3. Audio Test Chime
  if (btnTestAudio) {
    btnTestAudio.addEventListener('click', async () => {
      try {
        await fetch('/api/audio/test_kiosk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sound: 'pre_adhan' })
        });
        showToast('🔔 Isyarat audio ujian dimainkan pada pembesar suara TV.');
      } catch (err) {
        showToast(`Ralat ujian audio: ${err.message}`, true);
      }
    });
  }

  // 4. Quick Ticker Sender
  if (btnSendTicker && inputQuickTicker) {
    btnSendTicker.addEventListener('click', async () => {
      const text = inputQuickTicker.value.trim();
      if (!text) {
        showToast('Sila masukkan teks ticker pengumuman.', true);
        return;
      }
      try {
        await apiRequest('/api/settings', 'POST', { ticker_text: text });
        showToast('📢 Ticker berjaya dihantar dan dipaparkan di TV!');
      } catch (err) {
        showToast(`Ralat menghantar ticker: ${err.message}`, true);
      }
    });
  }

  // 5. Quick Stage Presets
  const setPreset = async (presetType, btnActive) => {
    [btnPresetMakkah, btnPresetMadinah, btnPresetAlhijrah, btnPresetDefault].forEach(b => {
      if (b) {
        b.classList.remove('active');
        b.style.borderColor = 'rgba(255,255,255,0.2)';
        b.style.color = '#cbd5e1';
      }
    });
    if (btnActive) {
      btnActive.classList.add('active');
      btnActive.style.borderColor = '#34d399';
      btnActive.style.color = '#34d399';
    }

    if (window.setPresetMedia) {
      await window.setPresetMedia(presetType);
    }
  };

  if (btnPresetMakkah) btnPresetMakkah.addEventListener('click', () => setPreset('makkah', btnPresetMakkah));
  if (btnPresetMadinah) btnPresetMadinah.addEventListener('click', () => setPreset('madinah', btnPresetMadinah));
  if (btnPresetAlhijrah) btnPresetAlhijrah.addEventListener('click', () => setPreset('alhijrah', btnPresetAlhijrah));
  if (btnPresetDefault) btnPresetDefault.addEventListener('click', () => setPreset('clear', btnPresetDefault));

  // 6. Kuliah Live Surau Toggle & Source Selector
  const btnToggleLectureLive = document.getElementById('btnToggleLectureLive');
  const btnToggleLectureText = document.getElementById('btnToggleLectureText');
  const badgeLectureLiveStatus = document.getElementById('badgeLectureLiveStatus');
  const selectLectureSource = document.getElementById('selectLectureSource');
  const customLectureUrlGroup = document.getElementById('customLectureUrlGroup');
  const inputCustomLectureUrl = document.getElementById('inputCustomLectureUrl');

  let isLectureLiveActive = false;

  if (selectLectureSource) {
    selectLectureSource.addEventListener('change', () => {
      if (selectLectureSource.value === 'custom') {
        if (customLectureUrlGroup) customLectureUrlGroup.style.display = 'block';
      } else {
        if (customLectureUrlGroup) customLectureUrlGroup.style.display = 'none';
      }
    });
  }

  if (btnToggleLectureLive) {
    btnToggleLectureLive.addEventListener('click', async () => {
      if (!isLectureLiveActive) {
        // START KULIAH
        let activeLectureUrl = selectLectureSource ? selectLectureSource.value : 'http://10.91.129.177:8888/live.m3u8';
        if (activeLectureUrl === 'custom' && inputCustomLectureUrl) {
          activeLectureUrl = inputCustomLectureUrl.value.trim() || 'http://10.91.129.177:8888/live.m3u8';
        }

        isLectureLiveActive = true;
        btnToggleLectureLive.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        btnToggleLectureLive.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
        if (btnToggleLectureText) btnToggleLectureText.textContent = '⏹ TAMATKAN KULIAH (KEMBALI KE MAKKAH)';
        if (badgeLectureLiveStatus) {
          badgeLectureLiveStatus.textContent = 'SEDANG BERSIARAN';
          badgeLectureLiveStatus.style.background = 'rgba(16, 185, 129, 0.2)';
          badgeLectureLiveStatus.style.color = '#34d399';
          badgeLectureLiveStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }

        const payload = {
          action: 'SWITCH_MEDIA',
          mode: 'KULIAH',
          sourceUrl: activeLectureUrl,
          type: 'hls',
          timestamp: Date.now()
        };

        try {
          localStorage.setItem('kiosk_media_config', JSON.stringify(payload));
        } catch (_) {}

        broadcastAdminSync('SWITCH_MEDIA', payload);
        broadcastAdminSync('kiosk_media_config', { media_config: { media_source_type: 'stream', video_source_type: 'hls', media_stream_url: activeLectureUrl } });

        try {
          await apiRequest('/api/settings', 'POST', {
            media_source_type: 'stream',
            video_source_type: 'hls',
            video_source_url: activeLectureUrl,
            media_stream_url: activeLectureUrl
          });
        } catch (_) {}

        showToast('🔴 Siaran Langsung Kuliah Surau diaktifkan di TV Kiosk!');
      } else {
        // STOP KULIAH -> RETURN TO MAKKAH LIVE
        isLectureLiveActive = false;
        btnToggleLectureLive.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        btnToggleLectureLive.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)';
        if (btnToggleLectureText) btnToggleLectureText.textContent = 'MULAKAN SIARAN KULIAH LIVE SURAU';
        if (badgeLectureLiveStatus) {
          badgeLectureLiveStatus.textContent = 'STANDBY';
          badgeLectureLiveStatus.style.background = 'rgba(239,68,68,0.2)';
          badgeLectureLiveStatus.style.color = '#fca5a5';
          badgeLectureLiveStatus.style.borderColor = 'rgba(239,68,68,0.4)';
        }

        const payload = {
          action: 'SWITCH_MEDIA',
          mode: 'DEFAULT',
          timestamp: Date.now()
        };

        try {
          localStorage.setItem('kiosk_media_config', JSON.stringify(payload));
        } catch (_) {}

        broadcastAdminSync('SWITCH_MEDIA', payload);

        try {
          await apiRequest('/api/settings', 'POST', {
            media_source_type: 'stream',
            video_source_type: 'hls',
            video_source_url: 'https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8',
            media_stream_url: 'https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8'
          });
        } catch (_) {}

        showToast('🕋 Siaran Kuliah ditamatkan. TV Kiosk kembali ke Makkah Live 24/7.');
      }
    });
  }
}

// ==================== INSTANT TEST MODE & SIMULATOR UI ====================
function setupInstantTestModeUI() {
  document.querySelectorAll('.btn-sim-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      if (!action) return;

      if (navigator.vibrate) navigator.vibrate(50);

      const originalOpacity = btn.style.opacity || '1';
      btn.style.opacity = '0.6';

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const res = await fetch('/api/simulate-trigger', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: action, prayer: 'Zohor' })
        });

        const data = await res.json();
        if (data.success) {
          showToast(data.message || `Ujian '${action}' berjaya dihantar ke TV.`);
          // Inter-tab BroadcastChannel and storage sync
          broadcastAdminSync('SIMULATE_TRIGGER', { action });
          try {
            localStorage.setItem('esolat_sim_trigger', JSON.stringify({ action, ts: Date.now() }));
          } catch (_) {}
        } else {
          showToast(data.message || 'Gagal menghantar arahan simulasi.', true);
        }
      } catch (err) {
        showToast(`Ralat komunikasi simulasi: ${err.message}`, true);
      } finally {
        setTimeout(() => {
          btn.style.opacity = originalOpacity;
        }, 350);
      }
    });
  });
}

function normalizeKioskUrl(target) {
  let url = target.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.port && !target.includes(':')) {
      parsed.port = '8080';
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/admin';
    }
    return parsed.toString();
  } catch (err) {
    if (!url.includes(':8080')) {
      url = url.replace(/\/+$/, '') + ':8080/admin';
    }
    return url;
  }
}

function connectToKioskTarget(target) {
  const finalUrl = normalizeKioskUrl(target);
  localStorage.setItem('last_connected_ip', target);
  showToast(`📡 Menyambung ke TV Kiosk: ${finalUrl}`);

  try {
    const targetObj = new URL(finalUrl);
    if (targetObj.host !== window.location.host) {
      setTimeout(() => {
        window.location.href = finalUrl;
      }, 500);
      return;
    }
  } catch (e) {}

  showToast(`✅ Anda sudah berada pada pelayan ${target}!`);
}

// ==================== CAMERA QR SCANNER ENGINE ====================
let html5QrScanner = null;
let currentCameraFacing = 'environment';
let availableCamerasList = [];

function setupQrScannerUI() {
  const btnOpenScanner = document.getElementById('btnOpenQrScanner');
  const btnCloseScanner = document.getElementById('btnCloseQrScanner');
  const scannerModal = document.getElementById('qrScannerModal');
  const btnSwitchFacing = document.getElementById('btnSwitchCameraFacing');
  const cameraSelect = document.getElementById('cameraSelectDropdown');
  const fileScanInput = document.getElementById('inputQrFileScan');

  if (btnOpenScanner && scannerModal) {
    btnOpenScanner.addEventListener('click', async () => {
      scannerModal.style.display = 'flex';
      await startCameraScanner();
    });
  }

  if (btnCloseScanner && scannerModal) {
    btnCloseScanner.addEventListener('click', async () => {
      await stopCameraScanner();
      scannerModal.style.display = 'none';
    });
  }

  if (btnSwitchFacing) {
    btnSwitchFacing.addEventListener('click', async () => {
      currentCameraFacing = (currentCameraFacing === 'environment') ? 'user' : 'environment';
      await startCameraScanner();
    });
  }

  if (cameraSelect) {
    cameraSelect.addEventListener('change', async () => {
      const selectedCamId = cameraSelect.value;
      await startCameraScanner(selectedCamId);
    });
  }

  if (fileScanInput) {
    fileScanInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const imageFile = e.target.files[0];
        await scanQrFromImageFile(imageFile);
      }
    });
  }
}

async function startCameraScanner(specificCameraId = null) {
  const statusMsg = document.getElementById('qrScanStatusMsg');
  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.background = 'rgba(59,130,246,0.15)';
    statusMsg.style.color = '#93c5fd';
    statusMsg.style.border = '1px solid rgba(59,130,246,0.3)';
    statusMsg.innerHTML = 'Memulakan kamera... Sila berikan kebenaran jika diminta.';
  }

  await stopCameraScanner();

  if (typeof Html5Qrcode === 'undefined') {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(239,68,68,0.15)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerHTML = 'Enjin pengimbas QR (Html5Qrcode) tidak dapat dimuatkan.';
    }
    return;
  }

  try {
    html5QrScanner = new Html5Qrcode("qrCameraReader");

    try {
      const devices = await Html5Qrcode.getCameras();
      availableCamerasList = devices || [];
      const camSelect = document.getElementById('cameraSelectDropdown');
      if (camSelect && availableCamerasList.length > 0) {
        camSelect.innerHTML = availableCamerasList.map(c => 
          `<option value="${c.id}" ${c.id === specificCameraId ? 'selected' : ''}>${c.label || 'Kamera ' + c.id}</option>`
        ).join('');
      }
    } catch (e) {
      console.warn('Unable to enumerate cameras:', e);
    }

    const cameraConfig = specificCameraId ? specificCameraId : { facingMode: currentCameraFacing };
    const scanConfig = {
      fps: 15,
      qrbox: { width: 210, height: 210 },
      aspectRatio: 1.0
    };

    await html5QrScanner.start(
      cameraConfig,
      scanConfig,
      onQrCodeSuccess,
      (errorMessage) => { /* Ignore per-frame decode errors */ }
    );

    if (statusMsg) {
      statusMsg.style.display = 'none';
    }
  } catch (err) {
    console.error('Camera Scanner Error:', err);
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'rgba(239,68,68,0.15)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.style.border = '1px solid rgba(239,68,68,0.3)';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        statusMsg.innerHTML = '❌ <b>Izin Kamera Ditolak</b><br>Sila benarkan akses kamera dalam tetapan kebenaran pelayar anda.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        statusMsg.innerHTML = '❌ <b>Tiada Kamera Dikesan</b><br>Peranti anda tidak mempunyai perkakasan kamera yang aktif.';
      } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && !window.location.hostname.endsWith('.local')) {
        statusMsg.innerHTML = '⚠️ <b>Sekatan Keselamatan Pelayar (HTTP)</b><br>Pelayar mudah alih menyekat kamera pada persekitaran HTTP tanpa sijil keselamatan. Sila gunakan <b>🖼️ Pilih Fail Imej</b> atau taip IP secara manual.';
      } else {
        statusMsg.innerHTML = `⚠️ Ralat kamera: ${err.message || err}`;
      }
    }
  }
}

async function onQrCodeSuccess(decodedText, decodedResult) {
  if (!decodedText) return;

  if (navigator.vibrate) {
    try { navigator.vibrate(150); } catch(e){}
  }

  await stopCameraScanner();

  const scannerModal = document.getElementById('qrScannerModal');
  if (scannerModal) scannerModal.style.display = 'none';

  let target = decodedText.trim();
  const manualIpInput = document.getElementById('inputManualKioskIp');
  if (manualIpInput) manualIpInput.value = target;

  showToast(`✅ Kod QR Dikesan: ${target}`);
  connectToKioskTarget(target);
}

async function scanQrFromImageFile(imageFile) {
  const statusMsg = document.getElementById('qrScanStatusMsg');
  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.background = 'rgba(59,130,246,0.15)';
    statusMsg.style.color = '#93c5fd';
    statusMsg.innerHTML = 'Menganalisis gambar QR...';
  }

  try {
    if (!html5QrScanner) {
      html5QrScanner = new Html5Qrcode("qrCameraReader");
    }
    const decodedText = await html5QrScanner.scanFile(imageFile, true);
    await onQrCodeSuccess(decodedText, null);
  } catch (err) {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(239,68,68,0.15)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerHTML = '❌ Kod QR tidak dapat dikesan dalam gambar yang dipilih. Sila pastikan gambar jelas dan tidak kabur.';
    }
  }
}

async function stopCameraScanner() {
  if (html5QrScanner) {
    try {
      if (html5QrScanner.isScanning) {
        await html5QrScanner.stop();
      }
    } catch (e) {
      console.warn('Error stopping scanner:', e);
    }
    try {
      html5QrScanner.clear();
    } catch(e){}
    html5QrScanner = null;
  }
}

// ==================== HARDWARE & NETWORK DIAGNOSTIC SCANNER ====================
let diagnosticsLoaded = false;

async function loadHardwareDiagnostics(fullScan = false) {
  const btnFull = document.getElementById('btnRunFullDiag');
  const btnNet = document.getElementById('btnScanNetOnly');
  const spinner = document.getElementById('diagScanSpinner');
  const netBadge = document.getElementById('diagNetScanningBadge');

  if (btnFull) btnFull.disabled = true;
  if (btnNet) btnNet.disabled = true;
  if (spinner) spinner.style.display = 'inline';
  if (fullScan && netBadge) netBadge.style.display = 'inline';

  try {
    const endpoint = fullScan ? '/api/system/diagnostics/all' : '/api/system/diagnostics/hardware';
    const res = await fetch(endpoint).then(r => r.json());
    renderDiagnostics(res);
    diagnosticsLoaded = true;
    if (fullScan) {
      showToast('✅ Imbasan diagnostik lengkap berjaya diselesaikan!');
    }
  } catch (err) {
    showToast(`Ralat imbasan: ${err.message}`, true);
  } finally {
    if (btnFull) btnFull.disabled = false;
    if (btnNet) btnNet.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (netBadge) netBadge.style.display = 'none';
  }
}

async function scanNetworkOnly() {
  const btnNet = document.getElementById('btnScanNetOnly');
  const netBadge = document.getElementById('diagNetScanningBadge');
  const tableBody = document.getElementById('diagNetTableBody');

  if (btnNet) btnNet.disabled = true;
  if (netBadge) netBadge.style.display = 'inline';
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:#fbbf24;">⚡ Sedang mengimbas semua IP peranti pada subnet surau...</td></tr>`;
  }

  try {
    const res = await fetch('/api/system/diagnostics/network').then(r => r.json());
    renderNetworkScan(res.network_devices || []);
    showToast(`✅ Imbasan selesai: ${res.total_found || 0} peranti dikesan.`);
  } catch (err) {
    showToast(`Ralat imbasan IP: ${err.message}`, true);
  } finally {
    if (btnNet) btnNet.disabled = false;
    if (netBadge) netBadge.style.display = 'none';
  }
}

function renderDiagnostics(data) {
  if (!data) return;

  // 1. Summary Stats
  const summary = data.summary || {};
  const statCams = document.getElementById('diagStatCams');
  const statDisp = document.getElementById('diagStatDisplays');
  const statNet = document.getElementById('diagStatNetDevices');
  const statAud = document.getElementById('diagStatAudio');

  if (statCams) statCams.textContent = summary.cameras_and_capture_cards ?? (data.media_and_usb?.video_devices?.length || 0);
  if (statDisp) statDisp.textContent = summary.connected_screens ?? (data.hdmi_and_displays?.connected_count || 0);
  if (statNet) statNet.textContent = summary.network_devices_found ?? (data.network_scan?.length || 0);
  if (statAud) statAud.textContent = summary.audio_outputs ?? (data.audio_hardware?.playback_devices?.length || 0);

  // 2. Video Capture & USB Media Devices
  const videoList = document.getElementById('diagVideoDevicesList');
  const videoDevs = data.media_and_usb?.video_devices || [];
  if (videoList) {
    if (videoDevs.length === 0) {
      videoList.innerHTML = `<div style="padding:0.75rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#fca5a5; font-size:0.8rem; text-align:center;">⚠️ Tiada peranti HDMI capture / USB camera dikesan di /dev/video*.</div>`;
    } else {
      videoList.innerHTML = videoDevs.map(v => `
        <div style="background:rgba(15,23,42,0.8); border:1px solid ${v.is_capture_card ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}; border-radius:8px; padding:0.6rem 0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-weight:700; color:#ffffff; font-size:0.85rem;">${v.name}</div>
            <div style="font-size:0.75rem; color:#94a3b8; font-family:monospace;">Node: ${v.device} &bull; ${v.type}</div>
          </div>
          <span style="background:${v.is_capture_card ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)'}; color:${v.is_capture_card ? '#34d399' : '#94a3b8'}; padding:0.2rem 0.5rem; border-radius:6px; font-size:0.7rem; font-weight:700;">
            ${v.is_capture_card ? 'HDMI CAPTURE / CAM' : 'V4L2 NODE'}
          </span>
        </div>
      `).join('');
    }
  }

  // USB hardware text
  const usbPre = document.getElementById('diagUsbHardwareList');
  if (usbPre) {
    const usbs = data.media_and_usb?.usb_hardware || [];
    usbPre.textContent = usbs.length > 0 ? usbs.join('\n') : 'Tiada peranti USB dikesan melalui lsusb.';
  }

  // 3. HDMI Displays
  const dispList = document.getElementById('diagDisplaysList');
  const displays = data.hdmi_and_displays?.displays || [];
  if (dispList) {
    if (displays.length === 0) {
      dispList.innerHTML = `<div style="font-size:0.8rem; color:#94a3b8; padding:0.5rem;">Tiada maklumat paparan DRM dikesan.</div>`;
    } else {
      dispList.innerHTML = displays.map(d => `
        <div style="background:rgba(15,23,42,0.8); border:1px solid ${d.connected ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}; border-radius:8px; padding:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <span style="font-weight:700; color:#38bdf8; font-size:0.85rem;">${d.port}</span>
            <span style="font-size:0.7rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:4px; background:${d.connected ? '#059669' : '#475569'}; color:#ffffff;">
              ${d.connected ? 'BERSAMBUNG' : 'TIADA SAMBUNGAN'}
            </span>
          </div>
          <div style="font-size:0.75rem; color:#94a3b8;">Resolusi: <b style="color:#ffffff;">${d.active_mode}</b></div>
          ${d.supported_modes?.length ? `<div style="font-size:0.7rem; color:#64748b; margin-top:0.25rem;">Disokong: ${d.supported_modes.join(', ')}</div>` : ''}
        </div>
      `).join('');
    }
  }

  // 4. Audio Hardware
  const playList = document.getElementById('diagAudioPlaybackList');
  const capList = document.getElementById('diagAudioCaptureList');
  const playCards = data.audio_hardware?.playback_devices || [];
  const capCards = data.audio_hardware?.capture_devices || [];

  if (playList) {
    playList.innerHTML = playCards.length > 0
      ? playCards.map(c => `<li>${c}</li>`).join('')
      : `<li style="color:#94a3b8;">Tiada kad playback dikesan (aplay).</li>`;
  }
  if (capList) {
    capList.innerHTML = capCards.length > 0
      ? capCards.map(c => `<li>${c}</li>`).join('')
      : `<li style="color:#94a3b8;">Tiada kad rakaman dikesan (arecord).</li>`;
  }

  // 5. System Ports
  const portsBody = document.getElementById('diagPortsTableBody');
  const ports = data.listening_ports || [];
  if (portsBody) {
    if (ports.length === 0) {
      portsBody.innerHTML = `<tr><td colspan="3" style="padding:0.5rem; text-align:center; color:#94a3b8;">Tiada rekod port terbuka.</td></tr>`;
    } else {
      portsBody.innerHTML = ports.map(p => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.35rem 0.5rem; color:#34d399;">${p.protocol}</td>
          <td style="padding:0.35rem 0.5rem; color:#38bdf8;">${p.local_address}</td>
          <td style="padding:0.35rem 0.5rem; color:#94a3b8;">${p.process || p.state}</td>
        </tr>
      `).join('');
    }
  }

  // 6. Network devices (if present in full scan)
  if (data.network_scan) {
    renderNetworkScan(data.network_scan);
  }
}

function renderNetworkScan(devices) {
  const tableBody = document.getElementById('diagNetTableBody');
  if (!tableBody) return;

  if (!devices || devices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:#94a3b8;">Tiada peranti IP ditemui pada subnet semasa.</td></tr>`;
    return;
  }

  tableBody.innerHTML = devices.map(d => {
    const portsStr = d.open_ports?.map(p => `<span style="background:#1e293b; color:#38bdf8; padding:0.15rem 0.35rem; border-radius:4px; font-size:0.7rem; margin-right:0.25rem;">${p.port} (${p.service})</span>`).join('') || '<span style="color:#64748b;">-</span>';
    
    let actionBtn = '';
    if (d.is_camera || d.suggested_rtsp) {
      actionBtn = `<button type="button" class="btn btn-sm btn-primary" onclick="applyCameraIp('${d.ip}')" style="font-size:0.75rem; padding:0.25rem 0.6rem;">🎥 Guna Sebagai Kamera</button>`;
    } else {
      actionBtn = `<button type="button" class="btn btn-sm btn-outline" onclick="copyText('${d.ip}')" style="font-size:0.75rem; padding:0.25rem 0.5rem;">📋 Salin IP</button>`;
    }

    return `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.07); ${d.is_camera ? 'background:rgba(16,185,129,0.08);' : ''}">
        <td style="padding:0.6rem 0.75rem; font-family:monospace; font-weight:700; color:${d.is_camera ? '#34d399' : '#ffffff'};">
          ${d.ip} ${d.hostname ? `<div style="font-size:0.7rem; color:#94a3b8;">${d.hostname}</div>` : ''}
        </td>
        <td style="padding:0.6rem 0.75rem;">
          <span style="font-size:0.75rem; font-weight:600; color:${d.is_camera ? '#34d399' : '#cbd5e1'};">
            ${d.device_type}
          </span>
        </td>
        <td style="padding:0.6rem 0.75rem;">${portsStr}</td>
        <td style="padding:0.6rem 0.75rem; font-family:monospace; font-size:0.75rem; color:#94a3b8;">${d.mac}</td>
        <td style="padding:0.6rem 0.75rem; text-align:right;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

window.applyCameraIp = async function(ip) {
  const rtspUrl = `rtsp://admin:password@${ip}:554/live/ch0`;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        camera_source_type: 'rtsp',
        camera_rtsp_url: rtspUrl
      })
    }).then(r => r.json());
    showToast(`🎥 Kamera RTSP (${ip}) berjaya ditetapkan untuk rakaman e-Solat!`);
  } catch (err) {
    showToast(`Ralat menetapkan kamera: ${err.message}`, true);
  }
};

window.copyText = async function(text) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    showToast(`Disalin: ${text}`);
  } catch (e) {
    showToast(`IP: ${text}`);
  }
};

function setupDiagnosticsUI() {
  const btnFull = document.getElementById('btnRunFullDiag');
  const btnNet = document.getElementById('btnScanNetOnly');

  if (btnFull) btnFull.addEventListener('click', () => loadHardwareDiagnostics(true));
  if (btnNet) btnNet.addEventListener('click', () => scanNetworkOnly());

  // Auto load hardware status when switching to tabDiagnostics
  const diagNavBtn = document.querySelector('.nav-item[data-tab="tabDiagnostics"]');
  if (diagNavBtn) {
    diagNavBtn.addEventListener('click', () => {
      if (!diagnosticsLoaded) {
        loadHardwareDiagnostics(false);
      }
    });
  }
}

// ==================== IP PTZ CAMERA & KULIAH LIVE MANAGER ====================
let isKuliahLiveActive = false;
let camPreviewHls = null;

function generateRtspUrl() {
  const ip = document.getElementById('inputCamIp')?.value.trim() || '192.168.1.108';
  const port = document.getElementById('inputCamPort')?.value.trim() || '554';
  const user = document.getElementById('inputCamUser')?.value.trim() || 'admin';
  const pass = document.getElementById('inputCamPass')?.value.trim() || '';
  const subtype = document.getElementById('selectCamSubtype')?.value || '1';
  
  const authPart = pass ? `${user}:${pass}@` : `${user}@`;
  return `rtsp://${authPart}${ip}:${port}/cam/realmonitor?channel=1&subtype=${subtype}`;
}

function updateRtspInputIfDefault() {
  const rtspInput = document.getElementById('inputCamRtspUrl');
  if (rtspInput) {
    rtspInput.value = generateRtspUrl();
  }
}

async function loadKuliahCameraStatus() {
  try {
    const res = await apiRequest('/api/camera/bridge/status');
    if (res) {
      isKuliahLiveActive = Boolean(res.kuliah_live_active);
      updateKuliahLiveUI(isKuliahLiveActive);

      if (res.camera_ip && document.getElementById('inputCamIp')) document.getElementById('inputCamIp').value = res.camera_ip;
      if (res.camera_port && document.getElementById('inputCamPort')) document.getElementById('inputCamPort').value = res.camera_port;
      if (res.camera_user && document.getElementById('inputCamUser')) document.getElementById('inputCamUser').value = res.camera_user;
      if (res.camera_pass && document.getElementById('inputCamPass')) document.getElementById('inputCamPass').value = res.camera_pass;
      if (res.camera_subtype && document.getElementById('selectCamSubtype')) document.getElementById('selectCamSubtype').value = res.camera_subtype;
      if (res.camera_rtsp_url && document.getElementById('inputCamRtspUrl')) document.getElementById('inputCamRtspUrl').value = res.camera_rtsp_url;
      if (res.kuliah_title && document.getElementById('inputCamKuliahTitle')) document.getElementById('inputCamKuliahTitle').value = res.kuliah_title;
      if (res.kuliah_ustaz && document.getElementById('inputCamKuliahUstaz')) document.getElementById('inputCamKuliahUstaz').value = res.kuliah_ustaz;
      if (res.kuliah_kitab && document.getElementById('inputCamKuliahKitab')) document.getElementById('inputCamKuliahKitab').value = res.kuliah_kitab;
      if (res.kuliah_fullscreen !== undefined && document.getElementById('switchKuliahFullscreen')) {
        document.getElementById('switchKuliahFullscreen').checked = Boolean(res.kuliah_fullscreen);
      }

      if (res.engine && document.getElementById('camPreviewEngineText')) {
        document.getElementById('camPreviewEngineText').textContent = `Enjin: ${res.engine} (Latensi < 0.5s)`;
      }
    }
  } catch (_) {}
}

function updateKuliahLiveUI(active) {
  isKuliahLiveActive = active;
  const badge = document.getElementById('kuliahLiveStatusBadge');
  const dot = document.getElementById('kuliahLiveStatusDot');
  const text = document.getElementById('kuliahLiveStatusText');
  const btn = document.getElementById('btnMasterToggleKuliahLive');
  const btnText = document.getElementById('btnMasterToggleKuliahLiveText');

  if (active) {
    if (badge) {
      badge.style.background = 'rgba(239, 68, 68, 0.25)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.6)';
      badge.style.color = '#fca5a5';
    }
    if (dot) dot.textContent = '🔴';
    if (text) text.textContent = 'SEDANG TAYANG LIVE DI TV';

    if (btn) {
      btn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
      btn.style.boxShadow = '0 4px 14px rgba(220,38,38,0.45)';
    }
    if (btnText) btnText.textContent = 'HENTIKAN TAYANGAN LIVE DI TV';
  } else {
    if (badge) {
      badge.style.background = 'rgba(148,163,184,0.2)';
      badge.style.borderColor = 'rgba(255,255,255,0.1)';
      badge.style.color = '#cbd5e1';
    }
    if (dot) dot.textContent = '⚪';
    if (text) text.textContent = 'MOD STANDBY (MAKKAH/SLAID)';

    if (btn) {
      btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
      btn.style.boxShadow = '0 4px 14px rgba(5,150,105,0.4)';
    }
    if (btnText) btnText.textContent = 'TAYANG KULIAH LIVE KE TV (HIDUPKAN)';
  }
}

function setupKuliahCameraLiveUI() {
  const inputsToWatch = ['inputCamIp', 'inputCamPort', 'inputCamUser', 'inputCamPass', 'selectCamSubtype'];
  inputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateRtspInputIfDefault);
  });

  // Presets
  const btnDahua = document.getElementById('btnPresetBrandDahua');
  const btnHik = document.getElementById('btnPresetBrandHikvision');
  const btnOnvif = document.getElementById('btnPresetBrandOnvif');

  if (btnDahua) {
    btnDahua.addEventListener('click', () => {
      const ip = document.getElementById('inputCamIp')?.value.trim() || '192.168.1.108';
      const port = document.getElementById('inputCamPort')?.value.trim() || '554';
      const user = document.getElementById('inputCamUser')?.value.trim() || 'admin';
      const pass = document.getElementById('inputCamPass')?.value.trim() || '';
      const auth = pass ? `${user}:${pass}@` : `${user}@`;
      document.getElementById('inputCamRtspUrl').value = `rtsp://${auth}${ip}:${port}/cam/realmonitor?channel=1&subtype=1`;
      showToast('Praset Dahua PTZ dipilih.');
    });
  }

  if (btnHik) {
    btnHik.addEventListener('click', () => {
      const ip = document.getElementById('inputCamIp')?.value.trim() || '192.168.1.108';
      const port = document.getElementById('inputCamPort')?.value.trim() || '554';
      const user = document.getElementById('inputCamUser')?.value.trim() || 'admin';
      const pass = document.getElementById('inputCamPass')?.value.trim() || '';
      const auth = pass ? `${user}:${pass}@` : `${user}@`;
      document.getElementById('inputCamRtspUrl').value = `rtsp://${auth}${ip}:${port}/Streaming/Channels/102`;
      showToast('Praset Hikvision IP dipilih.');
    });
  }

  if (btnOnvif) {
    btnOnvif.addEventListener('click', () => {
      const ip = document.getElementById('inputCamIp')?.value.trim() || '192.168.1.108';
      const port = document.getElementById('inputCamPort')?.value.trim() || '554';
      const user = document.getElementById('inputCamUser')?.value.trim() || 'admin';
      const pass = document.getElementById('inputCamPass')?.value.trim() || '';
      const auth = pass ? `${user}:${pass}@` : `${user}@`;
      document.getElementById('inputCamRtspUrl').value = `rtsp://${auth}${ip}:${port}/onvif1`;
      showToast('Praset Generic ONVIF dipilih.');
    });
  }

  // Test Camera
  const btnTest = document.getElementById('btnTestCamConn');
  const alertBox = document.getElementById('camTestResultAlert');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const ip = document.getElementById('inputCamIp')?.value.trim();
      const port = document.getElementById('inputCamPort')?.value.trim() || '554';
      if (!ip) {
        showToast('Sila masukkan alamat IP kamera.', true);
        return;
      }
      btnTest.disabled = true;
      btnTest.textContent = '⏳ Menguji port 554...';
      if (alertBox) alertBox.style.display = 'none';

      try {
        const res = await apiRequest('/api/camera/bridge/test', 'POST', { ip, port: parseInt(port, 10) });
        if (alertBox) {
          alertBox.style.display = 'block';
          if (res.success && res.reachable) {
            alertBox.style.background = 'rgba(5, 150, 105, 0.2)';
            alertBox.style.border = '1px solid rgba(52, 211, 153, 0.5)';
            alertBox.style.color = '#6ee7b7';
            alertBox.innerHTML = `✅ <b>Sambungan Berjaya:</b> Port ${port} pada kamera ${ip} sedia dan beroperasi!`;
          } else {
            alertBox.style.background = 'rgba(239, 68, 68, 0.2)';
            alertBox.style.border = '1px solid rgba(239, 68, 68, 0.5)';
            alertBox.style.color = '#fca5a5';
            alertBox.innerHTML = `❌ <b>Gagal Menyambung:</b> ${res.message || 'Kamera tidak membalas.'}`;
          }
        }
      } catch (err) {
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.style.background = 'rgba(239, 68, 68, 0.2)';
          alertBox.style.border = '1px solid rgba(239, 68, 68, 0.5)';
          alertBox.style.color = '#fca5a5';
          alertBox.innerHTML = `❌ <b>Ralat:</b> ${err.message}`;
        }
      } finally {
        btnTest.disabled = false;
        btnTest.textContent = '🔍 Uji Sambungan';
      }
    });
  }

  // Save Camera Config
  const btnSave = document.getElementById('btnSaveCamConfig');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const payload = {
        camera_ip: document.getElementById('inputCamIp')?.value.trim(),
        camera_port: document.getElementById('inputCamPort')?.value.trim(),
        camera_user: document.getElementById('inputCamUser')?.value.trim(),
        camera_pass: document.getElementById('inputCamPass')?.value.trim(),
        camera_subtype: document.getElementById('selectCamSubtype')?.value,
        camera_rtsp_url: document.getElementById('inputCamRtspUrl')?.value.trim(),
        enable: isKuliahLiveActive
      };

      try {
        await apiRequest('/api/camera/toggle_live_display', 'POST', payload);
        showToast('Tetapan kamera IP PTZ berjaya disimpan!');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  // Save Kuliah Info
  const btnSaveKuliah = document.getElementById('btnSaveCamKuliahInfo');
  if (btnSaveKuliah) {
    btnSaveKuliah.addEventListener('click', async () => {
      const payload = {
        kuliah_title: document.getElementById('inputCamKuliahTitle')?.value.trim(),
        kuliah_ustaz: document.getElementById('inputCamKuliahUstaz')?.value.trim(),
        kuliah_kitab: document.getElementById('inputCamKuliahKitab')?.value.trim(),
        enable: isKuliahLiveActive
      };
      try {
        await apiRequest('/api/camera/toggle_live_display', 'POST', payload);
        showToast('Maklumat penceramah & tajuk kuliah dikemas kini!');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  // Master Toggle Button
  const btnMaster = document.getElementById('btnMasterToggleKuliahLive');
  if (btnMaster) {
    btnMaster.addEventListener('click', async () => {
      const nextState = !isKuliahLiveActive;
      btnMaster.disabled = true;

      const payload = {
        enable: nextState,
        camera_ip: document.getElementById('inputCamIp')?.value.trim(),
        camera_port: document.getElementById('inputCamPort')?.value.trim(),
        camera_user: document.getElementById('inputCamUser')?.value.trim(),
        camera_pass: document.getElementById('inputCamPass')?.value.trim(),
        camera_subtype: document.getElementById('selectCamSubtype')?.value,
        camera_rtsp_url: document.getElementById('inputCamRtspUrl')?.value.trim(),
        kuliah_title: document.getElementById('inputCamKuliahTitle')?.value.trim(),
        kuliah_ustaz: document.getElementById('inputCamKuliahUstaz')?.value.trim(),
        kuliah_kitab: document.getElementById('inputCamKuliahKitab')?.value.trim()
      };

      try {
        const res = await apiRequest('/api/kuliah/toggle_live', 'POST', payload);
        updateKuliahLiveUI(nextState);
        showToast(res.message || (nextState ? 'Siaran Kuliah LIVE diaktifkan!' : 'Siaran Kuliah LIVE ditutup.'));

        // Broadcast to all open tabs / TV kiosk
        if (window.BroadcastChannel) {
          const bc = new BroadcastChannel('esolat_media_channel');
          bc.postMessage({
            type: 'kiosk_media_config',
            mode: nextState ? 'KULIAH' : 'DEFAULT',
            sourceUrl: res.stream_url || '/stream/live.m3u8',
            streamType: 'hls',
            speaker: payload.kuliah_ustaz,
            title: payload.kuliah_title,
            kitab: payload.kuliah_kitab
          });
        }
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnMaster.disabled = false;
      }
    });
  }

  // Kuliah Fullscreen Switch Handler
  const swKuliahFs = document.getElementById('switchKuliahFullscreen');
  if (swKuliahFs) {
    swKuliahFs.addEventListener('change', async () => {
      const val = swKuliahFs.checked;
      try {
        await apiRequest('/api/settings', 'POST', { kuliah_fullscreen: val });
        broadcastAdminSync('TOGGLE_KULIAH_FULLSCREEN', { value: val });
        try {
          const ch = new BroadcastChannel('esolat_sync');
          ch.postMessage({ type: 'TOGGLE_KULIAH_FULLSCREEN', value: val });
        } catch (_) {}
        showToast(val ? '🖥️ Mod Kuliah Skrin Penuh diaktifkan di TV' : '📺 Mod Kuliah kembali ke saiz piawai');
      } catch (err) {
        showToast('Gagal menukar mod skrin penuh: ' + err.message, true);
      }
    });
  }

  // Phone Preview Video
  const btnPreview = document.getElementById('btnPreviewCamPhone');
  const previewCard = document.getElementById('camPreviewCard');
  const btnClosePreview = document.getElementById('btnCloseCamPreview');
  const previewVideo = document.getElementById('camPreviewVideo');
  const previewLoading = document.getElementById('camPreviewLoading');

  if (btnPreview) {
    btnPreview.addEventListener('click', async () => {
      if (previewCard) previewCard.style.display = 'block';
      if (previewLoading) previewLoading.style.display = 'flex';

      const rtspUrl = document.getElementById('inputCamRtspUrl')?.value.trim();
      try {
        // Start bridge if not running
        const startRes = await apiRequest('/api/camera/bridge/start', 'POST', { rtsp_url: rtspUrl });
        const streamUrl = (startRes.engine === 'go2rtc')
          ? `http://${window.location.hostname}:1984/stream.html?src=kuliah`
          : '/stream/live.m3u8';

        setTimeout(() => {
          if (previewLoading) previewLoading.style.display = 'none';
          if (previewVideo) {
            if (window.Hls && Hls.isSupported()) {
              if (camPreviewHls) camPreviewHls.destroy();
              camPreviewHls = new Hls({ lowLatencyMode: true });
              camPreviewHls.loadSource(streamUrl);
              camPreviewHls.attachMedia(previewVideo);
              camPreviewHls.on(Hls.Events.MANIFEST_PARSED, () => {
                previewVideo.play().catch(() => {});
              });
            } else {
              previewVideo.src = streamUrl;
              previewVideo.play().catch(() => {});
            }
          }
        }, 1000);
      } catch (err) {
        if (previewLoading) previewLoading.style.display = 'none';
        showToast(`Ralat pra-tonton: ${err.message}`, true);
      }
    });
  }

  if (btnClosePreview) {
    btnClosePreview.addEventListener('click', () => {
      if (previewCard) previewCard.style.display = 'none';
      if (previewVideo) {
        previewVideo.pause();
        previewVideo.src = '';
      }
      if (camPreviewHls) {
        camPreviewHls.destroy();
        camPreviewHls = null;
      }
    });
  }

  // Auto load when tabCameraLive is clicked
  const camNavBtn = document.querySelector('.nav-item[data-tab="tabCameraLive"]');
  if (camNavBtn) {
    camNavBtn.addEventListener('click', () => {
      loadKuliahCameraStatus();
      updatePhoneStreamerQR();
    });
  }
}

// ==================== WEBRTC PHONE STREAMER UI ====================
let phoneStreamerPoller = null;

function updatePhoneStreamerQR() {
  const host = (cachedNetworkInfo && cachedNetworkInfo.primary_ip) ? cachedNetworkInfo.primary_ip : window.location.hostname;
  const port = (cachedNetworkInfo && cachedNetworkInfo.port) ? cachedNetworkInfo.port : (window.location.port || '8080');
  const streamerUrl = `${window.location.protocol}//${host}:${port}/streamer?room=kuliah`;

  const inputEl = document.getElementById('inputPhoneStreamerUrl');
  if (inputEl) inputEl.value = streamerUrl;

  const qrBox = document.getElementById('phoneStreamerQrBox');
  if (qrBox) {
    qrBox.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(qrBox, {
          text: streamerUrl,
          width: 160,
          height: 160,
          colorDark: "#022c22",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(streamerUrl)}" style="width:160px; height:160px; border-radius:8px;">`;
      }
    } else {
      qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(streamerUrl)}" style="width:160px; height:160px; border-radius:8px;">`;
    }
  }
}

function setupPhoneStreamerUI() {
  updatePhoneStreamerQR();

  const btnCopy = document.getElementById('btnCopyStreamerUrl');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const inputEl = document.getElementById('inputPhoneStreamerUrl');
      const textToCopy = inputEl ? inputEl.value : window.location.origin + '/streamer?room=kuliah';
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(textToCopy);
        } else if (inputEl) {
          inputEl.select();
          document.execCommand('copy');
        }
        showToast('Pautan WebRTC Streamer telah disalin!');
      } catch (_) {
        showToast(`Pautan: ${textToCopy}`);
      }
    });
  }

  // Poll phone streamer connection status
  if (!phoneStreamerPoller) {
    phoneStreamerPoller = setInterval(async () => {
      const tabCam = document.getElementById('tabCameraLive');
      if (!tabCam || !tabCam.classList.contains('active')) return;

      try {
        const res = await apiRequest('/api/webrtc/status?room=kuliah');
        const badge = document.getElementById('phoneStreamerStatusBadge');
        const dot = document.getElementById('phoneStreamerStatusDot');
        const text = document.getElementById('phoneStreamerStatusText');

        if (res && res.is_streaming) {
          if (badge) {
            badge.style.background = 'rgba(5, 150, 105, 0.25)';
            badge.style.borderColor = '#10b981';
            badge.style.color = '#34d399';
          }
          if (dot) dot.textContent = '🟢';
          if (text) text.textContent = 'KAMERA TELEFON BERSIARAN (LIVE)';
        } else if (res && res.has_offer) {
          if (badge) {
            badge.style.background = 'rgba(217, 119, 6, 0.25)';
            badge.style.borderColor = '#f59e0b';
            badge.style.color = '#fbbf24';
          }
          if (dot) dot.textContent = '🟡';
          if (text) text.textContent = 'TELEFON BERSEDIA (MENYAMBUNG)';
        } else {
          if (badge) {
            badge.style.background = 'rgba(15, 23, 42, 0.8)';
            badge.style.borderColor = 'rgba(251, 191, 36, 0.4)';
            badge.style.color = '#fbbf24';
          }
          if (dot) dot.textContent = '⚪';
          if (text) text.textContent = 'MENUNGGU IMBASAN TELEFON';
        }
      } catch (_) {}
    }, 2500);
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  startAdminClock();
  syncAdminStatePoller();
  setupPWA();
  initGpsSecurityCheck();
  setupNetworkBroadcastUI();
  setupSmartPairingUI();
  setupQuickControlsUI();
  setupInstantTestModeUI();
  setupQrScannerUI();
  setupDiagnosticsUI();
  setupKuliahCameraLiveUI();
  setupPhoneStreamerUI();
  updateNetworkInfo();
  checkAuth();
});

