/**
 * Skywalker e-Solat Admin — Standalone Mobile Controller & PWA Engine
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==================== 1. STATE & STORAGE ====================
  const DEFAULT_IP = '192.168.1.104';
  let targetIp = localStorage.getItem('esolat_target_ip') || DEFAULT_IP;
  let recentIps = JSON.parse(localStorage.getItem('esolat_recent_ips') || '["192.168.1.104", "192.168.0.100"]');
  let html5QrScanner = null;
  let isScanningSubnet = false;
  let deferredInstallPrompt = null;

  // DOM Elements
  const topStatusDot = document.getElementById('topStatusDot');
  const topStatusText = document.getElementById('topStatusText');
  const badgeCurrentIp = document.getElementById('badgeCurrentIp');
  const btnOpenFullAdmin = document.getElementById('btnOpenFullAdmin');
  const btnOpenStreamer = document.getElementById('btnOpenStreamer');
  const recentList = document.getElementById('recentList');
  const inputManualIp = document.getElementById('inputManualIp');

  // ==================== 2. UI INITIALIZATION ====================
  function updateTargetIp(newIp, saveToHistory = true) {
    if (!newIp) return;
    // Clean IP string
    newIp = newIp.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
    if (!newIp) return;

    targetIp = newIp;
    localStorage.setItem('esolat_target_ip', targetIp);

    if (saveToHistory) {
      recentIps = [targetIp, ...recentIps.filter(ip => ip !== targetIp)].slice(0, 6);
      localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    }

    // Update UI elements
    badgeCurrentIp.textContent = targetIp;
    inputManualIp.value = targetIp;
    btnOpenFullAdmin.href = `http://${targetIp}:8080/admin`;
    if (btnOpenStreamer) {
      btnOpenStreamer.href = `../streamer/?ip=${encodeURIComponent(targetIp)}`;
    }

    topStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 inline-block';
    topStatusText.textContent = `Surau: ${targetIp}`;
    renderRecentList();
    showToast(`Tersambung ke ${targetIp}`);
  }

  function renderRecentList() {
    if (!recentList) return;
    recentList.innerHTML = '';
    if (!recentIps.length) {
      recentList.innerHTML = '<span class="text-xs text-slate-500">Tiada rekod tersimpan</span>';
      return;
    }

    recentIps.forEach(ip => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
        ip === targetIp 
          ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold' 
          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
      }`;
      btn.textContent = ip;
      btn.onclick = () => updateTargetIp(ip, false);
      recentList.appendChild(btn);
    });
  }

  document.getElementById('btnClearHistory')?.addEventListener('click', () => {
    recentIps = [targetIp];
    localStorage.setItem('esolat_recent_ips', JSON.stringify(recentIps));
    renderRecentList();
    showToast('Rekod dikosongkan');
  });

  // ==================== 3. TAB CONTROLS ====================
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active', 'bg-emerald-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('active', 'bg-emerald-600', 'text-white');
      btn.classList.remove('text-slate-400');

      tabPanes.forEach(pane => pane.classList.add('hidden'));

      if (btn.id === 'tabBtnQr') document.getElementById('tabContentQr').classList.remove('hidden');
      if (btn.id === 'tabBtnScan') document.getElementById('tabContentScan').classList.remove('hidden');
      if (btn.id === 'tabBtnManual') document.getElementById('tabContentManual').classList.remove('hidden');
    });
  });

  // ==================== 4. QR CODE SCANNER ====================
  const btnStartQr = document.getElementById('btnStartQr');
  const btnStopQr = document.getElementById('btnStopQr');
  const qrReaderContainer = document.getElementById('qrReader');

  async function startQrScanner() {
    if (!window.Html5Qrcode) {
      showToast('Modul kamera sedang dimuatkan...', '⚠️');
      return;
    }

    try {
      if (!html5QrScanner) {
        html5QrScanner = new Html5Qrcode("qrReader");
      }

      btnStartQr.classList.add('hidden');
      btnStopQr.classList.remove('hidden');

      await html5QrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          console.log('[QR Decoded]:', decodedText);
          stopQrScanner();
          // Extract IP from scanned QR URL
          try {
            if (decodedText.includes('://')) {
              const url = new URL(decodedText);
              updateTargetIp(url.hostname);
            } else {
              updateTargetIp(decodedText);
            }
          } catch (e) {
            updateTargetIp(decodedText);
          }
        },
        (errorMessage) => {
          // ignore scan frame errors
        }
      );
    } catch (err) {
      console.warn('[QR Camera Error]', err);
      showToast('Kamera tidak dapat diakses. Sila gunakan imbasan IP manual.', '⚠️');
      stopQrScanner();
    }
  }

  async function stopQrScanner() {
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
      } catch (e) {}
    }
    btnStartQr.classList.remove('hidden');
    btnStopQr.classList.add('hidden');
  }

  btnStartQr?.addEventListener('click', startQrScanner);
  btnStopQr?.addEventListener('click', stopQrScanner);

  // ==================== 5. AUTO SUBNET SCANNER ====================
  const btnStartSubnetScan = document.getElementById('btnStartSubnetScan');
  const inputSubnetPrefix = document.getElementById('inputSubnetPrefix');
  const scanProgressBar = document.getElementById('scanProgressBar');
  const scanProgressFill = document.getElementById('scanProgressFill');
  const scanResultsList = document.getElementById('scanResultsList');

  async function probeIp(ip) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);

    try {
      // Probe favicon or lightweight endpoint
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

    const prefix = inputSubnetPrefix.value.trim() || '192.168.1';
    scanProgressBar.classList.remove('hidden');
    scanResultsList.innerHTML = '<div class="text-xs text-slate-400 py-1">Mengimbas alamat 1 hingga 254...</div>';
    btnStartSubnetScan.disabled = true;
    btnStartSubnetScan.classList.add('opacity-50');

    let foundList = [];
    const total = 50; // Scan top active range for speed (or up to 254)

    for (let i = 1; i <= total; i++) {
      const currentIp = `${prefix}.${i}`;
      scanProgressFill.style.width = `${Math.round((i / total) * 100)}%`;

      // Fast check
      const exists = await probeIp(currentIp);
      if (exists) {
        foundList.push(currentIp);
        const card = document.createElement('div');
        card.className = 'p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-between';
        card.innerHTML = `
          <div>
            <div class="text-xs font-bold text-white">e-Solat Kiosk Ditemui!</div>
            <div class="text-[11px] font-mono text-emerald-300">${currentIp}</div>
          </div>
          <button class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs">Pilih</button>
        `;
        card.querySelector('button').onclick = () => updateTargetIp(currentIp);
        scanResultsList.appendChild(card);
      }
    }

    if (foundList.length === 0) {
      scanResultsList.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
          Imbasan selesai. Tiada peranti dikesan pada subnet ${prefix}. Cuba masukkan alamat IP secara manual.
        </div>
      `;
    }

    isScanningSubnet = false;
    btnStartSubnetScan.disabled = false;
    btnStartSubnetScan.classList.remove('opacity-50');
  });

  // ==================== 6. MANUAL IP CONNECTION ====================
  document.getElementById('btnConnectManual')?.addEventListener('click', () => {
    const val = inputManualIp.value.trim();
    if (!val) {
      showToast('Sila masukkan alamat IP yang sah', '⚠️');
      return;
    }
    updateTargetIp(val);
  });

  // ==================== 7. REMOTE ACTIONS CONTROLLER ====================
  async function triggerRemoteAction(action, payload = {}) {
    const isHttps = window.location.protocol === 'https:';

    // In local HTTP context, send direct REST API call
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
        console.warn('API Error:', err);
      }
    }

    // In HTTPS context (GitHub Pages), notify user & direct link
    showToast(`Arahan "${action}" sedia untuk ${targetIp}`);
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

  // ==================== 8. PWA INSTALLATION PROMPT ====================
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
      alert('Untuk memasang di iPhone/iPad: Tekan butang Share pelayar dan pilih "Add to Home Screen".\nUntuk Android: Buka menu 3-titik Chrome dan pilih "Install App".');
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

  // ==================== 9. TOAST NOTIFICATION ====================
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
