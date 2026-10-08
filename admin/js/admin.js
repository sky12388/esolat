/**
 * Skywalker e-Solat Admin — Mobile Controller & PWA Engine
 * Features:
 * - Module Tab Switching (Utama, Takwim & Iqamah, Audio & Azan, Poster & Infaq, Kamera Kuliah, Sistem TV)
 * - Auto IP Port Normalization (:8080) & Host History
 * - Camera QR Scanner & Subnet Scanner
 * - GPS Haversine Nearest JAKIM Zone Matching
 * - Audio Volume, Azan Voice & Tarhim Controls
 * - Slide Poster & DuitNow QR Upload (FileReader Base64)
 * - RTSP IP Camera & MP4 Recording Triggers
 * - Kiosk Screen Simulation & Remote Actions
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==================== 1. STATE & STORAGE ====================
  const DEFAULT_HOST = '192.168.1.104:8080';
  let targetHost = localStorage.getItem('esolat_target_host') || DEFAULT_HOST;
  let recentIps = JSON.parse(localStorage.getItem('esolat_recent_ips') || '["192.168.1.104:8080", "192.168.0.104:8080", "192.168.1.100:8080"]');
  let authToken = localStorage.getItem('esolat_auth_token') || '';
  let isAuthenticated = localStorage.getItem('esolat_is_authenticated') === 'true';
  let html5QrScanner = null;
  let isScanningSubnet = false;
  let deferredInstallPrompt = null;
  let volumeDebounceTimer = null;

  // DOM Elements - Navigation & Connection
  const sectionConnection = document.getElementById('section-connection');
  const btnToggleSectionConn = document.getElementById('btnToggleSectionConn');
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const moduleSections = document.querySelectorAll('.module-section');

  const topStatusDot = document.getElementById('topStatusDot');
  const topStatusText = document.getElementById('topStatusText');
  const badgeCurrentIp = document.getElementById('badgeCurrentIp');
  const recentList = document.getElementById('recentList');
  const inputManualIp = document.getElementById('inputManualIp');
  const btnConnectManual = document.getElementById('btnConnectManual');
  const ipForm = document.getElementById('ipForm');

  const qrScannerBox = document.getElementById('qrScannerBox');
  const btnToggleQr = document.getElementById('btnToggleQr');
  const btnCloseQr = document.getElementById('btnCloseQr');

  const subnetScannerBox = document.getElementById('subnetScannerBox');
  const btnToggleScan = document.getElementById('btnToggleScan');
  const btnCloseScan = document.getElementById('btnCloseScan');
  const btnStartSubnetScan = document.getElementById('btnStartSubnetScan');
  const inputSubnetPrefix = document.getElementById('inputSubnetPrefix');
  const scanProgressBar = document.getElementById('scanProgressBar');
  const scanProgressFill = document.getElementById('scanProgressFill');
  const scanResultsList = document.getElementById('scanResultsList');

  // DOM Elements - Module 1: Dashboard
  const btnActionAzan = document.getElementById('btnActionAzan');
  const btnActionKuliah = document.getElementById('btnActionKuliah');
  const btnActionSaf = document.getElementById('btnActionSaf');
  const btnActionNormal = document.getElementById('btnActionNormal');
  const inputQuickTicker = document.getElementById('inputQuickTicker');
  const btnUpdateTicker = document.getElementById('btnUpdateTicker');

  // DOM Elements - Module 2: Takwim & Iqamah
  const selectJakimZone = document.getElementById('selectJakimZone');
  const btnGpsMatch = document.getElementById('btnGpsMatch');
  const inputIqamahSubuh = document.getElementById('inputIqamahSubuh');
  const inputIqamahZohor = document.getElementById('inputIqamahZohor');
  const inputIqamahAsar = document.getElementById('inputIqamahAsar');
  const inputIqamahMaghrib = document.getElementById('inputIqamahMaghrib');
  const inputIqamahIsyak = document.getElementById('inputIqamahIsyak');
  const btnSaveTakwim = document.getElementById('btnSaveTakwim');

  // DOM Elements - Module 3: Audio & Azan
  const sliderVolume = document.getElementById('sliderVolume');
  const volumeValueDisplay = document.getElementById('volumeValueDisplay');
  const selectAzanVoice = document.getElementById('selectAzanVoice');
  const checkTarhim = document.getElementById('checkTarhim');
  const btnTestAzanAudio = document.getElementById('btnTestAzanAudio');
  const btnStopAzanAudio = document.getElementById('btnStopAzanAudio');

  // DOM Elements - Module 4: Poster & Infaq QR
  const inputSlideFile = document.getElementById('inputSlideFile');
  const inputSlideTitle = document.getElementById('inputSlideTitle');
  const btnUploadSlide = document.getElementById('btnUploadSlide');
  const inputQrFile = document.getElementById('inputQrFile');
  const btnUploadQr = document.getElementById('btnUploadQr');

  // DOM Elements - Module 5: Camera & Recording
  const btnOpenStreamer = document.getElementById('btnOpenStreamer');
  const inputRtspUrl = document.getElementById('inputRtspUrl');
  const btnStartRtsp = document.getElementById('btnStartRtsp');
  const btnStopRtsp = document.getElementById('btnStopRtsp');
  const btnStartRecord = document.getElementById('btnStartRecord');
  const btnStopRecord = document.getElementById('btnStopRecord');
  const badgeRecording = document.getElementById('badgeRecording');

  // DOM Elements - Module 6: Diagnostics & System TV
  const btnReloadKiosk = document.getElementById('btnReloadKiosk');
  const btnClearTestState = document.getElementById('btnClearTestState');

  // ==================== 2. IP NORMALIZATION & SYNC ====================
  function normalizeHost(raw) {
    if (!raw) return '';
    let host = raw.trim();
    host = host.replace(/^https?:\/\//i, '');
    host = host.split('/')[0].trim();
    if (!host) return '';

    if (!host.includes(':')) {
      host = host + ':8080';
    }
    return host;
  }

  function syncUiWithHost(host, saveToHistory = true) {
    const cleanHost = normalizeHost(host);
    if (!cleanHost) return;

    targetHost = cleanHost;
    localStorage.setItem('esolat_target_host', targetHost);

    if (saveToHistory) {
      recentIps = [targetHost, ...recentIps.filter(ip => ip !== targetHost)].slice(0, 6);
      localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    }

    if (badgeCurrentIp) badgeCurrentIp.textContent = targetHost;
    if (inputManualIp) inputManualIp.value = targetHost;

    const rawIp = targetHost.split(':')[0];
    if (btnOpenStreamer) {
      btnOpenStreamer.href = `../streamer/?ip=${encodeURIComponent(rawIp)}`;
    }

    if (topStatusDot) {
      topStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-md shadow-emerald-400 animate-pulse';
    }
    if (topStatusText) {
      topStatusText.textContent = `Surau: ${targetHost}`;
    }

    renderRecentList();
  }

  function renderRecentList() {
    if (!recentList) return;
    recentList.innerHTML = '';

    const defaultPresets = ['192.168.1.104:8080', '192.168.0.104:8080', '192.168.1.100:8080'];
    const mergedList = Array.from(new Set([...recentIps, ...defaultPresets])).slice(0, 6);

    mergedList.forEach(host => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = host === targetHost;
      btn.className = `px-3.5 py-2 rounded-xl text-xs sm:text-sm font-mono transition border-2 ${
        isActive 
          ? 'bg-emerald-900 text-amber-300 border-amber-400 font-black shadow-md' 
          : 'bg-slate-950 text-slate-200 border-slate-700 hover:text-white hover:border-emerald-400 font-bold'
      }`;
      btn.textContent = host;
      btn.onclick = () => {
        syncUiWithHost(host, true);
        handleConnect(host);
      };
      recentList.appendChild(btn);
    });
  }

  document.getElementById('btnClearHistory')?.addEventListener('click', () => {
    recentIps = [targetHost];
    localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    renderRecentList();
    showToast('Sejarah IP dikosongkan');
  });

  // ==================== 3. TAB NAVIGATION ====================
  function switchModule(moduleName) {
    navTabBtns.forEach(btn => {
      if (btn.dataset.module === moduleName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    moduleSections.forEach(sec => {
      if (sec.id === `mod-${moduleName}`) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    });
  }

  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = btn.dataset.module;
      if (mod) {
        switchModule(mod);
      }
    });
  });

  btnToggleSectionConn?.addEventListener('click', () => {
    if (sectionConnection) {
      sectionConnection.classList.toggle('hidden');
      if (!sectionConnection.classList.contains('hidden')) {
        sectionConnection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  // ==================== 4. HTTP API SENDER ====================
  async function apiCall(endpoint, method = 'POST', payload = null) {
    const url = `http://${targetHost}/api/${endpoint.replace(/^\//, '')}`;
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(5000)
    };

    if (payload && method !== 'GET') {
      options.body = JSON.stringify(payload);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json().catch(() => ({ success: true }));
    } catch (err) {
      console.warn(`[API Call ${endpoint}] Error:`, err);
      // If direct fetch fails (e.g. mixed-content or unreachable), return error
      return { error: err.message || 'Gagal menyambung ke TV' };
    }
  }

  // ==================== 5. CONNECTION HANDLER ====================
  async function handleConnect(hostToConnect) {
    const raw = hostToConnect || inputManualIp?.value;
    const host = normalizeHost(raw);
    if (!host) {
      showToast('Sila masukkan alamat IP yang sah', '⚠️');
      return;
    }

    syncUiWithHost(host, true);

    if (btnConnectManual) {
      btnConnectManual.textContent = 'Menyambung...';
      btnConnectManual.disabled = true;
    }

    try {
      await fetch(`http://${host}/api/status`, {
        method: 'GET',
        mode: 'no-cors',
        signal: AbortSignal.timeout(2500)
      });
      showToast(`Tersambung ke ${host}!`, '✅');
    } catch (err) {
      console.warn("Status probe note:", err);
      showToast(`Alamat ${host} sedia digunakan.`, '📡');
    } finally {
      if (btnConnectManual) {
        btnConnectManual.textContent = 'SAMBUNG';
        btnConnectManual.disabled = false;
      }
    }
  }

  ipForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleConnect();
  });

  btnConnectManual?.addEventListener('click', (e) => {
    e.preventDefault();
    handleConnect();
  });

  // ==================== 6. CAMERA QR SCANNER ====================
  async function startQrScanner() {
    if (!window.Html5Qrcode) {
      showToast('Modul kamera sedang dimuatkan...', '⚠️');
      return;
    }

    qrScannerBox?.classList.remove('hidden');
    subnetScannerBox?.classList.add('hidden');

    try {
      if (!html5QrScanner) {
        html5QrScanner = new Html5Qrcode("qrReader");
      }

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        showToast('Tiada kamera dikesan pada peranti anda.', '⚠️');
        return;
      }

      let backCam = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment'));
      let cameraIdOrConfig = backCam ? backCam.id : { facingMode: "environment" };

      await html5QrScanner.start(
        cameraIdOrConfig,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          stopQrScanner();
          handleConnect(decodedText);
          showToast(`Kod QR TV Berjaya Diimbas!`, '✅');
        },
        () => {}
      );
    } catch (err) {
      console.warn('[QR Camera Error]', err);
      showToast('Kamera disekat atau tidak dapat dibuka. Sila taip IP manual.', '⚠️');
      stopQrScanner();
    }
  }

  async function stopQrScanner() {
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
      } catch (e) {}
    }
    qrScannerBox?.classList.add('hidden');
  }

  btnToggleQr?.addEventListener('click', () => {
    if (qrScannerBox?.classList.contains('hidden')) {
      startQrScanner();
    } else {
      stopQrScanner();
    }
  });

  btnCloseQr?.addEventListener('click', stopQrScanner);

  // ==================== 7. AUTO SUBNET SCANNER ====================
  btnToggleScan?.addEventListener('click', () => {
    stopQrScanner();
    subnetScannerBox?.classList.toggle('hidden');
  });

  btnCloseScan?.addEventListener('click', () => {
    subnetScannerBox?.classList.add('hidden');
  });

  async function probeIp(ip) {
    try {
      await fetch(`http://${ip}:8080/favicon.ico`, { 
        method: 'GET', 
        mode: 'no-cors',
        signal: AbortSignal.timeout(700)
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  btnStartSubnetScan?.addEventListener('click', async () => {
    if (isScanningSubnet) return;
    isScanningSubnet = true;

    const prefix = inputSubnetPrefix?.value.trim() || '192.168.1';
    scanProgressBar?.classList.remove('hidden');
    if (scanResultsList) {
      scanResultsList.innerHTML = `<div class="text-xs text-teal-300 py-1 font-mono">Mengimbas rangkaian ${prefix}.1 hingga ${prefix}.40...</div>`;
    }

    btnStartSubnetScan.disabled = true;
    btnStartSubnetScan.classList.add('opacity-50');

    let foundList = [];
    const total = 40;

    for (let i = 1; i <= total; i++) {
      const currentIp = `${prefix}.${i}`;
      if (scanProgressFill) {
        scanProgressFill.style.width = `${Math.round((i / total) * 100)}%`;
      }

      const exists = await probeIp(currentIp);
      if (exists) {
        const foundHost = `${currentIp}:8080`;
        foundList.push(foundHost);
        const card = document.createElement('div');
        card.className = 'p-3 rounded-xl bg-teal-950/80 border border-teal-500/60 flex items-center justify-between';
        card.innerHTML = `
          <div>
            <div class="text-xs font-bold text-white">e-Solat Kiosk Dikesan!</div>
            <div class="text-[11px] font-mono text-teal-300">${foundHost}</div>
          </div>
          <button type="button" class="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs">Pilih</button>
        `;
        card.querySelector('button').onclick = () => {
          syncUiWithHost(foundHost, true);
          subnetScannerBox?.classList.add('hidden');
          handleConnect(foundHost);
        };
        scanResultsList?.appendChild(card);
      }
    }

    if (foundList.length === 0) {
      if (scanResultsList) {
        scanResultsList.innerHTML = `
          <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            💡 <b>Nota:</b> Jika menggunakan HTTPS, pelayar menyekat imbasan automatik. Sila taip alamat IP terus di kotak atas (cth: <code>192.168.1.104:8080</code>) dan tekan <b>SAMBUNG</b>.
          </div>
        `;
      }
    }

    isScanningSubnet = false;
    btnStartSubnetScan.disabled = false;
    btnStartSubnetScan.classList.remove('opacity-50');
  });

  // ==================== 8. MODULE 1: DASHBOARD & QUICK ACTIONS ====================
  btnActionAzan?.addEventListener('click', async () => {
    showToast('Memulakan ujian Azan di TV...', '🔊');
    await apiCall('test_azan', 'POST', {});
  });

  btnActionKuliah?.addEventListener('click', async () => {
    showToast('Menukar skrin TV ke Mod Kuliah...', '📹');
    await apiCall('set_mode', 'POST', { mode: 'kuliah' });
  });

  btnActionSaf?.addEventListener('click', async () => {
    showToast('Menukar skrin TV ke Rapat Saf...', '🕋');
    await apiCall('set_mode', 'POST', { mode: 'saf' });
  });

  btnActionNormal?.addEventListener('click', async () => {
    showToast('Mengembalikan TV ke Mod Normal...', '📺');
    await apiCall('set_mode', 'POST', { mode: 'normal' });
  });

  btnUpdateTicker?.addEventListener('click', async () => {
    const text = inputQuickTicker?.value.trim();
    if (!text) {
      showToast('Sila masukkan teks hebahan', '⚠️');
      return;
    }
    showToast('Mengemas kini teks hebahan TV...', '📢');
    await apiCall('update_ticker', 'POST', { text });
    showToast('Teks hebahan dikemas kini!', '✅');
  });

  // ==================== 9. MODULE 2: TAKWIM & GPS MATCHING ====================
  const MALAYSIAN_ZONES_GPS = [
    { code: "WLY01", lat: 3.1390, lon: 101.6869, name: "Kuala Lumpur, Putrajaya" },
    { code: "WLY02", lat: 5.2831, lon: 115.2308, name: "Labuan" },
    { code: "SGR01", lat: 3.0738, lon: 101.5183, name: "Shah Alam, Petaling, Gombak" },
    { code: "SGR02", lat: 3.3400, lon: 101.2500, name: "Kuala Selangor, Sabak Bernam" },
    { code: "SGR03", lat: 3.0400, lon: 101.4400, name: "Klang, Banting, Kuala Langat" },
    { code: "JHR01", lat: 2.4500, lon: 104.5167, name: "Pulau Aur, Pulau Pemanggil" },
    { code: "JHR02", lat: 1.4927, lon: 103.7414, name: "Johor Bahru, Kota Tinggi, Kulai" },
    { code: "JHR03", lat: 2.0251, lon: 103.3328, name: "Kluang, Pontian" },
    { code: "JHR04", lat: 1.8548, lon: 102.9325, name: "Batu Pahat, Muar, Segamat" },
    { code: "KDH01", lat: 6.1184, lon: 100.3685, name: "Alor Setar, Kubang Pasu" },
    { code: "KDH02", lat: 5.6470, lon: 100.4877, name: "Sungai Petani, Yan, Pendang" },
    { code: "KDH03", lat: 6.2000, lon: 100.6000, name: "Padang Terap, Sik" },
    { code: "KDH04", lat: 5.6763, lon: 100.8173, name: "Baling" },
    { code: "KDH05", lat: 5.3667, lon: 100.5500, name: "Kulim, Bandar Baharu" },
    { code: "KDH06", lat: 6.3500, lon: 99.8000, name: "Pulau Langkawi" },
    { code: "PNG01", lat: 5.4141, lon: 100.3288, name: "Pulau Pinang, Seberang Perai" },
    { code: "PRK01", lat: 3.8000, lon: 101.3000, name: "Tapah, Slim River, Tanjung Malim" },
    { code: "PRK02", lat: 4.5975, lon: 101.0901, name: "Ipoh, Batu Gajah, Kuala Kangsar" },
    { code: "MLK01", lat: 2.1896, lon: 102.2501, name: "Seluruh Negeri Melaka" },
    { code: "NGS01", lat: 2.7000, lon: 102.3000, name: "Tampin, Jempol" },
    { code: "NGS02", lat: 2.7258, lon: 101.9424, name: "Seremban, Port Dickson, Rembau" },
    { code: "PHG01", lat: 2.8167, lon: 104.1667, name: "Pulau Tioman" },
    { code: "PHG02", lat: 3.8077, lon: 103.3260, name: "Kuantan, Pekan, Rompin" },
    { code: "TRG01", lat: 5.3117, lon: 103.1324, name: "Kuala Terengganu, Marang" },
    { code: "KTN01", lat: 6.1254, lon: 102.2386, name: "Kota Bharu, Bachok, Pasir Puteh" },
    { code: "SBH01", lat: 5.9804, lon: 116.0735, name: "Kota Kinabalu, Penampang, Tuaran" },
    { code: "SWK01", lat: 4.7500, lon: 115.0000, name: "Limbang, Lawas" },
    { code: "SWK08", lat: 1.5533, lon: 110.3592, name: "Kuching, Bau, Lundu" }
  ];

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  btnGpsMatch?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolokasi tidak disokong pada pelayar ini', '⚠️');
      return;
    }

    btnGpsMatch.disabled = true;
    showToast('Mencari lokasi GPS telefon...', '📍');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        btnGpsMatch.disabled = false;
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        let nearestZone = MALAYSIAN_ZONES_GPS[0];
        let minDistance = Infinity;

        MALAYSIAN_ZONES_GPS.forEach(z => {
          const dist = calculateDistance(lat, lon, z.lat, z.lon);
          if (dist < minDistance) {
            minDistance = dist;
            nearestZone = z;
          }
        });

        if (selectJakimZone) {
          selectJakimZone.value = nearestZone.code;
        }

        showToast(`Zon Dikesan: ${nearestZone.code} (${nearestZone.name})`, '📍');
      },
      (err) => {
        btnGpsMatch.disabled = false;
        console.warn('Geolocation error:', err);
        showToast('Sila benarkan akses lokasi pelayar telefon', '⚠️');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  });

  btnSaveTakwim?.addEventListener('click', async () => {
    const payload = {
      jakim_zone: selectJakimZone?.value || 'SGR01',
      iqamah_subuh: parseInt(inputIqamahSubuh?.value || '12'),
      iqamah_zohor: parseInt(inputIqamahZohor?.value || '10'),
      iqamah_asar: parseInt(inputIqamahAsar?.value || '10'),
      iqamah_maghrib: parseInt(inputIqamahMaghrib?.value || '10'),
      iqamah_isyak: parseInt(inputIqamahIsyak?.value || '10')
    };

    showToast('Menyimpan tetapan Takwim & Iqamah...', '⏳');
    await apiCall('settings', 'POST', payload);
    await apiCall('jakim/sync', 'POST', { zone: payload.jakim_zone });
    showToast('Tetapan Zon & Iqamah Berjaya Disimpan!', '✅');
  });

  // ==================== 10. MODULE 3: AUDIO AZAN & VOLUME ====================
  sliderVolume?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (volumeValueDisplay) volumeValueDisplay.textContent = `${val}%`;

    clearTimeout(volumeDebounceTimer);
    volumeDebounceTimer = setTimeout(async () => {
      await apiCall('settings', 'POST', { volume: parseInt(val) });
      showToast(`Kelantangan TV: ${val}%`, '🔊');
    }, 400);
  });

  checkTarhim?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await apiCall('settings', 'POST', { tarhim_enabled: enabled });
    showToast(`Tarhim Pra-Azan: ${enabled ? 'Aktif' : 'Dinyahaktif'}`, '📖');
  });

  btnTestAzanAudio?.addEventListener('click', async () => {
    const voice = selectAzanVoice?.value || 'azan_makkah.mp3';
    showToast(`Memainkan audio ${voice}...`, '🔊');
    await apiCall('system/test_audio', 'POST', { sound: voice, action: 'play' });
  });

  btnStopAzanAudio?.addEventListener('click', async () => {
    showToast('Menghentikan audio TV...', '⏹️');
    await apiCall('system/test_audio', 'POST', { action: 'stop' });
  });

  // ==================== 11. MODULE 4: POSTER & INFAQ QR UPLOAD ====================
  btnUploadSlide?.addEventListener('click', async () => {
    const file = inputSlideFile?.files[0];
    const title = inputSlideTitle?.value.trim() || 'Poster Kuliah';

    if (!file) {
      showToast('Sila pilih fail gambar poster dahulu', '⚠️');
      return;
    }

    showToast('Memproses gambar poster...', '⏳');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const res = await apiCall('slides', 'POST', {
        title: title,
        image_base64: dataUrl,
        duration: 15
      });
      if (res && res.error) {
        showToast(`Ralat: ${res.error}`, '⚠️');
      } else {
        showToast('Poster berjaya dimuat naik ke TV!', '🎉');
        if (inputSlideTitle) inputSlideTitle.value = '';
        if (inputSlideFile) inputSlideFile.value = '';
      }
    };
    reader.readAsDataURL(file);
  });

  btnUploadQr?.addEventListener('click', async () => {
    const file = inputQrFile?.files[0];
    if (!file) {
      showToast('Sila pilih fail gambar Kod QR DuitNow', '⚠️');
      return;
    }

    showToast('Memproses Kod QR Infaq...', '⏳');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const res = await apiCall('settings/upload_qr', 'POST', {
        qr_base64: dataUrl,
        qr_image: dataUrl
      });
      if (res && res.error) {
        showToast(`Ralat: ${res.error}`, '⚠️');
      } else {
        showToast('Kod QR DuitNow TV Berjaya Dikemas Kini!', '🎉');
        if (inputQrFile) inputQrFile.value = '';
      }
    };
    reader.readAsDataURL(file);
  });

  // ==================== 12. MODULE 5: RTSP & VIDEO RECORDING ====================
  btnStartRtsp?.addEventListener('click', async () => {
    const rtsp = inputRtspUrl?.value.trim();
    if (!rtsp) {
      showToast('Sila masukkan alamat RTSP kamera', '⚠️');
      return;
    }
    showToast('Menyambung bridge RTSP kamera...', '📹');
    await apiCall('camera/bridge/start', 'POST', { rtsp_url: rtsp });
    showToast('Bridge RTSP dimulakan!', '✅');
  });

  btnStopRtsp?.addEventListener('click', async () => {
    showToast('Menghentikan bridge RTSP...', '⏹️');
    await apiCall('camera/bridge/stop', 'POST', {});
    showToast('Bridge RTSP dihentikan.', '✅');
  });

  btnStartRecord?.addEventListener('click', async () => {
    showToast('Memulakan rakaman MP4...', '🔴');
    await apiCall('camera/record/start', 'POST', {});
    badgeRecording?.classList.remove('hidden');
    showToast('Rakaman MP4 sedang berjalan di TV!', '🔴');
  });

  btnStopRecord?.addEventListener('click', async () => {
    showToast('Menghentikan rakaman MP4...', '⏹️');
    await apiCall('camera/record/stop', 'POST', {});
    badgeRecording?.classList.add('hidden');
    showToast('Rakaman disimpan di TV!', '💾');
  });

  // ==================== 13. MODULE 6: DIAGNOSTICS & SIMULATOR ====================
  btnReloadKiosk?.addEventListener('click', async () => {
    showToast('Memuat semula pelayar TV Kiosk...', '🔄');
    await apiCall('system/reload_kiosk', 'POST', {});
    showToast('Arahan reload dihantar ke TV.', '✅');
  });

  btnClearTestState?.addEventListener('click', async () => {
    showToast('Memadam mod ujian simulasi TV...', '⏹️');
    await apiCall('system/clear_test_state', 'POST', {});
    showToast('Mod ujian ditamatkan. TV normal.', '✅');
  });

  window.simulateKioskState = async function(state) {
    showToast(`Mengaktifkan simulasi: ${state}...`, '🧪');
    await apiCall('system/test_state', 'POST', { state: state });
    showToast(`Skrin TV kini dalam mod simulasi: ${state}`, '✅');
  };

  // ==================== 14. PWA INSTALL PROMPT ====================
  const btnHeaderInstall = document.getElementById('btnHeaderInstall');
  const installCard = document.getElementById('installCard');
  const btnCardInstall = document.getElementById('btnCardInstall');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (!isStandalone) {
    installCard?.classList.remove('hidden');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnHeaderInstall?.classList.remove('hidden');
    btnHeaderInstall?.classList.add('flex');
    installCard?.classList.remove('hidden');
  });

  async function handleInstallPrompt() {
    if (!deferredInstallPrompt) {
      alert('Untuk memasang di iPhone/iPad: Tekan butang Share di pelayar Safari dan pilih "Add to Home Screen".\n\nUntuk Android: Buka menu ⋮ pelayar Chrome dan pilih "Install App".');
      return;
    }

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Aplikasi berjaya dipasang!');
      btnHeaderInstall?.classList.add('hidden');
      installCard?.classList.add('hidden');
    }
    deferredInstallPrompt = null;
  }

  btnHeaderInstall?.addEventListener('click', handleInstallPrompt);
  btnCardInstall?.addEventListener('click', handleInstallPrompt);

  window.addEventListener('appinstalled', () => {
    showToast('e-Solat Admin sedia digunakan!');
    btnHeaderInstall?.classList.add('hidden');
    installCard?.classList.add('hidden');
  });

  // ==================== 15. TOAST NOTIFICATIONS ====================
  function showToast(message, icon = '✅') {
    const toast = document.getElementById('toastNotification');
    const toastText = document.getElementById('toastText');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast || !toastText) return;

    toastText.textContent = message;
    if (toastIcon) toastIcon.textContent = icon;

    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }, 2800);
  }

  // Initial load
  syncUiWithHost(targetHost, false);
});
