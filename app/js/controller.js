/**
 * Skywalker e-Solat Universal PWA Remote Controller
 * Logic: IP connection management, QR scanning, PWA install prompt, target switching.
 */

let deferredPrompt = null;
let html5QrScanner = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  setupPwaRegistration();
  renderSavedHistory();
  bindEvents();
  checkAutoConnect();
});

// ==================== PWA INSTALLATION ====================
function setupPwaRegistration() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = new URL('sw.js', window.location.href).href;
      navigator.serviceWorker.register(swUrl)
        .then((reg) => console.log('[PWA Controller] SW registered:', reg.scope))
        .catch((err) => console.warn('[PWA Controller] SW failed:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnInstall = document.getElementById('btnInstallApp');
    const heroInstallCard = document.getElementById('cardPwaInstall');
    if (btnInstall) btnInstall.style.display = 'inline-flex';
    if (heroInstallCard) heroInstallCard.style.display = 'block';
  });
}

async function triggerPwaInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA Controller] User choice:', outcome);
    deferredPrompt = null;
    const btnInstall = document.getElementById('btnInstallApp');
    const heroInstallCard = document.getElementById('cardPwaInstall');
    if (btnInstall) btnInstall.style.display = 'none';
    if (heroInstallCard) heroInstallCard.style.display = 'none';
  } else {
    showToast('Aplikasi sudah sedia dipasang atau gunakan menu pelayar (Add to Home Screen)');
  }
}

// ==================== EVENT BINDINGS ====================
function bindEvents() {
  // PWA install buttons
  const btnInstall = document.getElementById('btnInstallApp');
  if (btnInstall) btnInstall.addEventListener('click', triggerPwaInstall);

  const btnHeroInstall = document.getElementById('btnHeroInstall');
  if (btnHeroInstall) btnHeroInstall.addEventListener('click', triggerPwaInstall);

  // Connection form
  const formConnect = document.getElementById('formConnect');
  if (formConnect) {
    formConnect.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawInput = document.getElementById('inputSurauIp').value.trim();
      connectToSurau(rawInput);
    });
  }

  // Quick preset chips
  document.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      const target = chip.dataset.target;
      document.getElementById('inputSurauIp').value = target;
      connectToSurau(target);
    });
  });

  // Camera QR Scanner
  const btnScanQr = document.getElementById('btnScanQr');
  if (btnScanQr) btnScanQr.addEventListener('click', openQrScanner);

  const btnCloseScanner = document.getElementById('btnCloseScanner');
  if (btnCloseScanner) btnCloseScanner.addEventListener('click', closeQrScanner);

  // Switcher / Disconnect
  const btnSwitchSurau = document.getElementById('btnSwitchSurau');
  if (btnSwitchSurau) btnSwitchSurau.addEventListener('click', disconnectSurau);

  const btnOpenExternalTab = document.getElementById('btnOpenExternalTab');
  if (btnOpenExternalTab) {
    btnOpenExternalTab.addEventListener('click', () => {
      const currentIp = localStorage.getItem('surau_target_ip');
      if (currentIp) {
        const fullUrl = buildAdminUrl(currentIp);
        window.open(fullUrl, '_blank');
      }
    });
  }
}

// ==================== URL SANITIZATION ====================
function formatHost(rawInput) {
  if (!rawInput) return '';
  let cleaned = rawInput.trim();
  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Remove trailing slashes and paths
  cleaned = cleaned.replace(/\/admin\/?$/i, '').replace(/\/+$/, '');
  
  // If no port specified, default to 8080
  if (!cleaned.includes(':')) {
    cleaned = cleaned + ':8080';
  }
  return cleaned;
}

function buildAdminUrl(host) {
  const formatted = formatHost(host);
  return `http://${formatted}/admin/`;
}

// ==================== CONNECTION LOGIC ====================
function connectToSurau(rawInput) {
  const host = formatHost(rawInput);
  if (!host) {
    showToast('Sila masukkan alamat IP atau imbas Kod QR TV', true);
    return;
  }

  // Save to localStorage
  localStorage.setItem('surau_target_ip', host);
  saveToHistory(host);

  const adminUrl = buildAdminUrl(host);
  showToast(`Menyambung ke ${host}...`);

  // Activate connected view
  displayConnectedView(host, adminUrl);
}

function displayConnectedView(host, adminUrl) {
  const viewConnect = document.getElementById('viewConnect');
  const viewConnected = document.getElementById('viewConnected');
  const connectedHostText = document.getElementById('connectedHostText');
  const adminFrame = document.getElementById('adminIframe');

  if (connectedHostText) connectedHostText.textContent = host;
  if (adminFrame) adminFrame.src = adminUrl;

  if (viewConnect) viewConnect.style.display = 'none';
  if (viewConnected) viewConnected.style.display = 'flex';
}

function disconnectSurau() {
  const viewConnect = document.getElementById('viewConnect');
  const viewConnected = document.getElementById('viewConnected');
  const adminFrame = document.getElementById('adminIframe');

  if (adminFrame) adminFrame.src = 'about:blank';
  if (viewConnected) viewConnected.style.display = 'none';
  if (viewConnect) viewConnect.style.display = 'block';

  renderSavedHistory();
  showToast('Sedia untuk menyambung ke TV Kiosk');
}

function checkAutoConnect() {
  const savedIp = localStorage.getItem('surau_target_ip');
  if (savedIp) {
    document.getElementById('inputSurauIp').value = savedIp;
  }
}

// ==================== HISTORY STORAGE ====================
function saveToHistory(host) {
  try {
    let history = JSON.parse(localStorage.getItem('surau_history') || '[]');
    if (!history.includes(host)) {
      history.unshift(host);
      if (history.length > 5) history = history.slice(0, 5);
      localStorage.setItem('surau_history', JSON.stringify(history));
    }
  } catch (_) {}
}

function renderSavedHistory() {
  const container = document.getElementById('savedHistoryList');
  const card = document.getElementById('cardSavedHistory');
  if (!container || !card) return;

  try {
    const history = JSON.parse(localStorage.getItem('surau_history') || '[]');
    if (history.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    container.innerHTML = history.map((host) => `
      <div class="history-item">
        <div class="history-info">
          <span class="history-host">${host}</span>
          <span class="history-label">Surau / PC Kiosk</span>
        </div>
        <button type="button" class="btn-header" onclick="connectToSurau('${host}')">
          ⚡ Sambung
        </button>
      </div>
    `).join('');
  } catch (_) {
    card.style.display = 'none';
  }
}

// ==================== QR CAMERA SCANNER ====================
function openQrScanner() {
  const modal = document.getElementById('scannerModal');
  if (!modal) return;
  modal.style.display = 'flex';

  if (typeof Html5Qrcode !== 'undefined') {
    html5QrScanner = new Html5Qrcode('qrReaderContainer');
    html5QrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        closeQrScanner();
        // Parse QR decoded text
        let extractedHost = decodedText.trim();
        try {
          if (extractedHost.startsWith('http://') || extractedHost.startsWith('https://')) {
            const parsed = new URL(extractedHost);
            extractedHost = parsed.host;
          }
        } catch (_) {}

        document.getElementById('inputSurauIp').value = extractedHost;
        connectToSurau(extractedHost);
      },
      () => {}
    ).catch((err) => {
      showToast('Kamera tidak dapat diakses: ' + err, true);
      closeQrScanner();
    });
  } else {
    showToast('Pustaka pengimbas QR sedang dimuatkan...', true);
  }
}

function closeQrScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) modal.style.display = 'none';

  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      html5QrScanner = null;
    }).catch(() => {});
  }
}

// ==================== TOAST NOTIFICATION ====================
function showToast(msg, isError = false) {
  let toast = document.getElementById('toastBox');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastBox';
    toast.className = 'toast-box';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.borderColor = isError ? '#ef4444' : '#10b981';
  toast.style.color = isError ? '#fca5a5' : '#ffffff';
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}
