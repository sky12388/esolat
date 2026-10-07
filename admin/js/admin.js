/**
 * Skywalker e-Solat Admin — Mobile Controller & PWA Engine
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==================== 1. STATE & STORAGE ====================
  const DEFAULT_IP = '192.168.1.104';
  let targetIp = localStorage.getItem('esolat_target_ip') || DEFAULT_IP;
  let recentIps = JSON.parse(localStorage.getItem('esolat_recent_ips') || '["192.168.1.104", "192.168.0.104", "192.168.1.100"]');
  let html5QrScanner = null;
  let isScanningSubnet = false;
  let deferredInstallPrompt = null;

  // DOM Elements
  const topStatusDot = document.getElementById('topStatusDot');
  const topStatusText = document.getElementById('topStatusText');
  const badgeCurrentIp = document.getElementById('badgeCurrentIp');
  const btnOpenStreamer = document.getElementById('btnOpenStreamer');
  const recentList = document.getElementById('recentList');
  const inputManualIp = document.getElementById('inputManualIp');
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

  // ==================== 2. IP NORMALIZATION & SYNC ====================
  function sanitizeIp(raw) {
    if (!raw) return '';
    let ip = raw.trim();
    // Strip protocols and paths
    ip = ip.replace(/^https?:\/\//i, '');
    ip = ip.split('/')[0];
    ip = ip.split(':')[0];
    return ip.trim();
  }

  function updateTargetIp(newIp, saveToHistory = true) {
    const cleanIp = sanitizeIp(newIp);
    if (!cleanIp) return;

    targetIp = cleanIp;
    localStorage.setItem('esolat_target_ip', targetIp);

    if (saveToHistory) {
      recentIps = [targetIp, ...recentIps.filter(ip => ip !== targetIp)].slice(0, 6);
      localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    }

    // Synchronize UI
    if (badgeCurrentIp) badgeCurrentIp.textContent = targetIp;
    if (inputManualIp) inputManualIp.value = targetIp;
    if (btnOpenStreamer) btnOpenStreamer.href = `../streamer/?ip=${encodeURIComponent(targetIp)}`;

    if (topStatusDot) {
      topStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block';
    }
    if (topStatusText) {
      topStatusText.textContent = `Surau: ${targetIp}`;
    }

    renderRecentList();
    showToast(`Alamat IP diset ke ${targetIp}`);
  }

  function renderRecentList() {
    if (!recentList) return;
    recentList.innerHTML = '';

    const defaultPresets = ['192.168.1.104', '192.168.0.104', '192.168.1.100'];
    const mergedList = Array.from(new Set([...recentIps, ...defaultPresets])).slice(0, 6);

    mergedList.forEach(ip => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = ip === targetIp;
      btn.className = `px-3.5 py-2 rounded-xl text-xs sm:text-sm font-mono transition border-2 ${
        isActive 
          ? 'bg-emerald-900 text-amber-300 border-amber-400 font-black shadow-md' 
          : 'bg-slate-950 text-slate-200 border-slate-700 hover:text-white hover:border-emerald-400 font-bold'
      }`;
      btn.textContent = ip;
      btn.onclick = () => updateTargetIp(ip, true);
      recentList.appendChild(btn);
    });
  }

  document.getElementById('btnClearHistory')?.addEventListener('click', () => {
    recentIps = [targetIp];
    localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    renderRecentList();
    showToast('Sejarah IP dikosongkan');
  });

  // Handle Form Submission / Enter Key on Manual Input
  ipForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = inputManualIp?.value.trim();
    if (!val) {
      showToast('Sila masukkan alamat IP', '⚠️');
      return;
    }
    updateTargetIp(val, true);
  });

  document.getElementById('btnConnectManual')?.addEventListener('click', () => {
    const val = inputManualIp?.value.trim();
    if (!val) {
      showToast('Sila masukkan alamat IP', '⚠️');
      return;
    }
    updateTargetIp(val, true);
  });

  // ==================== 3. CAMERA QR SCANNER ====================
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

      // Pick back camera if available, else first
      let backCam = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment'));
      let cameraIdOrConfig = backCam ? backCam.id : { facingMode: "environment" };

      await html5QrScanner.start(
        cameraIdOrConfig,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          console.log('[QR Decoded]:', decodedText);
          stopQrScanner();
          updateTargetIp(decodedText, true);
          showToast(`QR Berjaya: ${targetIp}`, '✅');
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

  // ==================== 4. AUTO SUBNET SCANNER ====================
  btnToggleScan?.addEventListener('click', () => {
    stopQrScanner();
    subnetScannerBox?.classList.toggle('hidden');
  });

  btnCloseScan?.addEventListener('click', () => {
    subnetScannerBox?.classList.add('hidden');
  });

  async function probeIp(ip) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 750);
    try {
      await fetch(`http://${ip}:8080/favicon.ico`, { 
        method: 'GET', 
        mode: 'no-cors',
        signal: controller.signal 
      });
      clearTimeout(timeout);
      return true;
    } catch (e) {
      clearTimeout(timeout);
      return false;
    }
  }

  btnStartSubnetScan?.addEventListener('click', async () => {
    if (isScanningSubnet) return;
    isScanningSubnet = true;

    const prefix = inputSubnetPrefix?.value.trim() || '192.168.1';
    scanProgressBar?.classList.remove('hidden');
    if (scanResultsList) {
      scanResultsList.innerHTML = `<div class="text-xs text-teal-300 py-1 font-mono">Mengimbas rangkaian ${prefix}.1 hingga ${prefix}.50...</div>`;
    }

    btnStartSubnetScan.disabled = true;
    btnStartSubnetScan.classList.add('opacity-50');

    let foundList = [];
    const total = 50;

    for (let i = 1; i <= total; i++) {
      const currentIp = `${prefix}.${i}`;
      if (scanProgressFill) {
        scanProgressFill.style.width = `${Math.round((i / total) * 100)}%`;
      }

      const exists = await probeIp(currentIp);
      if (exists) {
        foundList.push(currentIp);
        const card = document.createElement('div');
        card.className = 'p-3 rounded-xl bg-teal-950/80 border border-teal-500/60 flex items-center justify-between';
        card.innerHTML = `
          <div>
            <div class="text-xs font-bold text-white">e-Solat Kiosk Dikesan!</div>
            <div class="text-[11px] font-mono text-teal-300">${currentIp}</div>
          </div>
          <button type="button" class="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs">Pilih</button>
        `;
        card.querySelector('button').onclick = () => {
          updateTargetIp(currentIp, true);
          subnetScannerBox?.classList.add('hidden');
        };
        scanResultsList?.appendChild(card);
      }
    }

    if (foundList.length === 0) {
      if (scanResultsList) {
        scanResultsList.innerHTML = `
          <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            💡 <b>Nota:</b> Jika menggunakan HTTPS, pelayar menyekat imbasan automatik latar belakang. Sila taip alamat IP terus di kotak atas (cth: <code>192.168.1.104</code>) dan tekan <b>SAMBUNG</b>.
          </div>
        `;
      }
    }

    isScanningSubnet = false;
    btnStartSubnetScan.disabled = false;
    btnStartSubnetScan.classList.remove('opacity-50');
  });

  // ==================== 5. REMOTE ACTIONS CONTROLLER ====================
  async function triggerRemoteAction(action, payload = {}) {
    const isHttps = window.location.protocol === 'https:';

    if (!isHttps) {
      try {
        await fetch(`http://${targetIp}:8080/api/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast(`Aksi "${action}" dihantar ke TV!`);
        return;
      } catch (err) {
        console.warn('API direct error:', err);
      }
    }

    showToast(`Arahan "${action}" dihantar ke ${targetIp}`);
  }

  document.getElementById('btnActionAzan')?.addEventListener('click', () => {
    triggerRemoteAction('test_azan');
  });

  document.getElementById('btnActionKuliah')?.addEventListener('click', () => {
    triggerRemoteAction('set_mode', { mode: 'kuliah' });
  });

  document.getElementById('btnActionSaf')?.addEventListener('click', () => {
    triggerRemoteAction('set_mode', { mode: 'saf' });
  });

  document.getElementById('btnActionNormal')?.addEventListener('click', () => {
    triggerRemoteAction('set_mode', { mode: 'normal' });
  });

  document.getElementById('btnUpdateTicker')?.addEventListener('click', () => {
    const text = document.getElementById('inputQuickTicker')?.value.trim();
    if (!text) {
      showToast('Sila masukkan teks hebahan', '⚠️');
      return;
    }
    triggerRemoteAction('update_ticker', { text });
    showToast('Teks hebahan dikemas kini!');
  });

  // ==================== 6. PWA INSTALL PROMPT ====================
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

  // ==================== 7. TOAST NOTIFICATIONS ====================
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
  updateTargetIp(targetIp, false);
});
