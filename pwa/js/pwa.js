/**
 * Skywalker e-Solat Remote Controller - Application Logic
 */

let deferredInstallPrompt = null;
let html5QrScanner = null;

const STORAGE_KEY_LAST_IP = 'esolat_remote_last_ip';
const STORAGE_KEY_HISTORY = 'esolat_remote_ip_history';

document.addEventListener('DOMContentLoaded', () => {
  setupPWAInstallation();
  initConnectionUI();
  renderConnectionHistory();
});

// ==================== 1. PWA INSTALLATION LOGIC ====================
function setupPWAInstallation() {
  const installCard = document.getElementById('pwaInstallCard');
  const btnInstall = document.getElementById('btnTriggerInstall');
  const btnIosGuide = document.getElementById('btnIosGuide');

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
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
        console.log('[PWA Remote] Install prompt outcome:', outcome);
        if (outcome === 'accepted') {
          showToast('Aplikasi e-Solat Remote sedang dipasang!');
          if (installCard) installCard.style.display = 'none';
        }
        deferredInstallPrompt = null;
      } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          alert('Panduan Pasang iPhone/iPad:\n1. Tekan butang Share (Kongsi) di bawah pelayar Safari\n2. Pilih "Add to Home Screen" (Tambah ke Skrin Utama)');
        } else {
          alert('Untuk memasang:\nTekan menu 3 titik di bahagian atas pelayar Chrome anda dan pilih "Pasang aplikasi" (Install app) atau "Tambah ke Skrin Utama".');
        }
      }
    });
  }
}

// ==================== 2. CONNECTION & ROUTING LOGIC ====================
function initConnectionUI() {
  const inputIp = document.getElementById('inputSurauIp');
  const btnConnect = document.getElementById('btnConnectSurau');
  const btnScanQr = document.getElementById('btnScanQr');
  const btnCloseScanner = document.getElementById('btnCloseScanner');

  // Load last saved IP
  const lastIp = localStorage.getItem(STORAGE_KEY_LAST_IP);
  if (lastIp && inputIp) {
    inputIp.value = lastIp;
    showQuickReconnectCard(lastIp);
  }

  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      const rawIp = inputIp.value.trim();
      connectToSurau(rawIp);
    });
  }

  if (inputIp) {
    inputIp.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        connectToSurau(inputIp.value.trim());
      }
    });
  }

  if (btnScanQr) {
    btnScanQr.addEventListener('click', openQrScanner);
  }

  if (btnCloseScanner) {
    btnCloseScanner.addEventListener('click', closeQrScanner);
  }
}

function normalizeSurauUrl(rawInput) {
  if (!rawInput) return null;
  let target = rawInput.trim();

  // If already full http(s) URL
  if (target.startsWith('http://') || target.startsWith('https://')) {
    if (!target.includes('/admin')) {
      target = target.replace(/\/+$/, '') + '/admin/';
    }
    return target;
  }

  // Remove trailing slashes
  target = target.replace(/\/+$/, '');

  // If user typed ip without port, check if colon exists
  if (!target.includes(':')) {
    target = `${target}:8080`;
  }

  return `http://${target}/admin/`;
}

function connectToSurau(rawInput) {
  if (!rawInput) {
    showToast('Sila masukkan alamat IP TV Surau anda!');
    return;
  }

  const targetUrl = normalizeSurauUrl(rawInput);
  if (!targetUrl) {
    showToast('Format IP tidak sah!');
    return;
  }

  // Save to localStorage
  localStorage.setItem(STORAGE_KEY_LAST_IP, rawInput);
  saveToHistory(rawInput);

  showToast('Menyambung ke TV Surau...');
  setTimeout(() => {
    window.location.href = targetUrl;
  }, 300);
}

function showQuickReconnectCard(savedHost) {
  const quickCard = document.getElementById('quickReconnectCard');
  const textHost = document.getElementById('quickSavedHost');
  const btnQuickConnect = document.getElementById('btnQuickReconnect');

  if (quickCard && textHost && btnQuickConnect) {
    textHost.textContent = savedHost;
    quickCard.style.display = 'block';

    btnQuickConnect.onclick = () => {
      connectToSurau(savedHost);
    };
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
        <button class="btn btn-sm btn-primary" style="width: auto; padding: 0.35rem 0.75rem;">
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

// ==================== 3. CAMERA QR SCANNER ====================
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
    (errorMessage) => {
      // scanning frames...
    }
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
  let host = scannedText.trim();

  // If scanned URL contains /admin, extract host
  try {
    if (host.startsWith('http')) {
      const u = new URL(host);
      host = u.host;
    }
  } catch (e) {}

  const input = document.getElementById('inputSurauIp');
  if (input) input.value = host;

  connectToSurau(host);
}

// ==================== 4. UTILITIES ====================
function showToast(text) {
  let toast = document.getElementById('toastMsg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastMsg';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
