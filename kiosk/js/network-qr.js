/**
 * Dynamic LAN IP Detection & QR Code Pairing Engine for TV Kiosk
 * Handles /api/system/network-info discovery, offline QRCode generation,
 * and live pairing display for Mosque AJK Mobile Admin.
 */

(function () {
  let cachedNetworkInfo = null;
  let qrInstances = {};

  async function fetchNetworkInfo() {
    const endpoints = ['/api/system/network-info', '/api/system/network'];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && (data.ip || data.primary_ip)) {
            return data;
          }
        }
      } catch (_) {
        // Try next fallback
      }
    }

    // Default fallback from current window location
    const hostIp = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '8080';
    return {
      ip: hostIp,
      primary_ip: hostIp,
      port: parseInt(port, 10) || 8080,
      admin_url: `${window.location.protocol}//${hostIp}:${port}/admin/`,
      mdns_url: `${window.location.protocol}//esolat.local:${port}/admin/`,
      hostname: hostIp
    };
  }

  function renderQrToElement(containerId, url, size = 180) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      try {
        const qr = new QRCode(container, {
          text: url,
          width: size,
          height: size,
          colorDark: '#022c22',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
        qrInstances[containerId] = qr;
        return;
      } catch (err) {
        console.warn(`[NetworkQR] Local QRCode render error for #${containerId}:`, err);
      }
    }

    // Fallback if QRCode lib fails or offline image generator
    const img = document.createElement('img');
    img.alt = 'QR Code Mobile Admin';
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.borderRadius = '8px';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
    img.onerror = () => {
      container.innerHTML = `<div style="padding:10px; color:#ef4444; font-size:0.8rem; text-align:center;">Buka pelayar:<br><strong>${url}</strong></div>`;
    };
    container.appendChild(img);
  }

  async function updateKioskNetworkUI(force = false) {
    const net = await fetchNetworkInfo();
    if (!net) return;
    cachedNetworkInfo = net;

    const primaryIp = net.ip || net.primary_ip || window.location.hostname || '127.0.0.1';
    const port = net.port || window.location.port || '8080';
    const adminUrl = net.admin_url || `http://${primaryIp}:${port}/admin/`;
    const mdnsUrl = net.mdns_url || `http://esolat.local:${port}/admin/`;
    const hostname = net.hostname ? `${net.hostname}.local` : 'esolat.local';

    // 1. Update text placeholders across TV kiosk
    const updateText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    updateText('tvSettingsIpText', primaryIp);
    updateText('tvSettingsAdminUrlText', adminUrl);
    updateText('tvSettingsMdnsText', mdnsUrl);
    updateText('lockedIp', primaryIp);
    updateText('lockedAdminUrl', adminUrl);
    updateText('kioskLanIpDisplay', primaryIp);
    updateText('kioskAdminUrlDisplay', adminUrl);
    updateText('kioskMdnsDisplay', mdnsUrl);

    // 2. Render QR code in TV Settings modal
    renderQrToElement('tvAdminQrBox', adminUrl, 160);

    // 3. Render QR code in Locked / Expired overlay
    renderQrToElement('lockedAdminQrBox', adminUrl, 160);

    // 4. Render QR code in dedicated Network Overlay if present
    renderQrToElement('dedicatedNetworkQrBox', adminUrl, 220);

    // Broadcast event for custom listeners
    window.dispatchEvent(new CustomEvent('esolat:network-updated', { detail: net }));
  }

  // Expose global methods
  window.renderKioskNetworkQr = updateKioskNetworkUI;
  window.getKioskNetworkInfo = () => cachedNetworkInfo;

  // Auto initialize on DOM ready and periodic sync every 30s
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateKioskNetworkUI();
      setInterval(updateKioskNetworkUI, 30000);
    });
  } else {
    updateKioskNetworkUI();
    setInterval(updateKioskNetworkUI, 30000);
  }
})();
