/**
 * Skywalker e-Solat Kiosk — Interactive Landing Page Script
 * Powers: Live Clock, TV Simulator, Sound Tester, FAQ Accordion, Mobile Menu
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==================== 1. LIVE MALAYSIAN CLOCK ====================
  function updateLiveClock() {
    const now = new Date();
    
    // Malaysian Time format (HH:mm:ss)
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    // Target elements
    const clockElements = document.querySelectorAll('.live-clock-display');
    clockElements.forEach(el => el.textContent = timeStr);

    // Gregorian & Hijri Date formatting
    const daysMalay = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const monthsMalay = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
    
    const dayName = daysMalay[now.getDay()];
    const dateNum = now.getDate();
    const monthName = monthsMalay[now.getMonth()];
    const yearNum = now.getFullYear();

    const dateStr = `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
    const dateElements = document.querySelectorAll('.live-date-display');
    dateElements.forEach(el => el.textContent = dateStr);
  }

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // ==================== 2. MOBILE MENU TOGGLE ====================
  const btnMobileMenu = document.getElementById('btnMobileMenu');
  const mobileNavMenu = document.getElementById('mobileNavMenu');

  if (btnMobileMenu && mobileNavMenu) {
    btnMobileMenu.addEventListener('click', () => {
      mobileNavMenu.classList.toggle('hidden');
    });

    // Close when clicking nav links
    mobileNavMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileNavMenu.classList.add('hidden');
      });
    });
  }

  // ==================== 3. FAQ ACCORDION ====================
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close all
        faqItems.forEach(i => i.classList.remove('active'));
        // Toggle current
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // ==================== 4. LIVE INTERACTIVE TV SIMULATOR ====================
  const simStateButtons = document.querySelectorAll('[data-sim-state]');
  const simViewports = {
    NORMAL: document.getElementById('simViewNormal'),
    PRE_ADHAN: document.getElementById('simOverlayPreAdhan'),
    ADHAN: document.getElementById('simOverlayAdhan'),
    IQAMAH: document.getElementById('simOverlayIqamah'),
    SOLAT: document.getElementById('simOverlaySolat'),
    STAGE: document.getElementById('simViewStage')
  };

  let activeSimState = 'NORMAL';
  let simCountdownSec = 354; // Sample countdown seconds
  let simCountdownInterval = null;

  function switchSimState(stateName) {
    activeSimState = stateName;

    // Update button styling
    simStateButtons.forEach(btn => {
      if (btn.getAttribute('data-sim-state') === stateName) {
        btn.classList.add('bg-emerald-600', 'text-white', 'border-emerald-500');
        btn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
      } else {
        btn.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-500');
        btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
      }
    });

    // Hide all overlays first
    ['PRE_ADHAN', 'ADHAN', 'IQAMAH', 'SOLAT'].forEach(key => {
      if (simViewports[key]) {
        simViewports[key].classList.remove('active');
      }
    });

    const normalView = simViewports.NORMAL;
    const stageView = simViewports.STAGE;

    if (stateName === 'STAGE') {
      if (normalView) normalView.classList.add('hidden');
      if (stageView) stageView.classList.remove('hidden');
    } else {
      if (stageView) stageView.classList.add('hidden');
      if (normalView) normalView.classList.remove('hidden');

      if (stateName !== 'NORMAL' && simViewports[stateName]) {
        simViewports[stateName].classList.add('active');
      }
    }
  }

  simStateButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const state = btn.getAttribute('data-sim-state');
      switchSimState(state);
    });
  });

  // Ticking Simulator Countdown
  function updateSimCountdown() {
    if (simCountdownSec > 0) {
      simCountdownSec--;
    } else {
      simCountdownSec = 600; // Reset
    }

    const h = String(Math.floor(simCountdownSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((simCountdownSec % 3600) / 60)).padStart(2, '0');
    const s = String(simCountdownSec % 60).padStart(2, '0');

    const cdEl = document.getElementById('simGiantCountdown');
    if (cdEl) cdEl.textContent = `- ${h}:${m}:${s}`;

    const iqamahTimer = document.getElementById('simIqamahTimer');
    if (iqamahTimer) {
      const im = String(Math.floor((simCountdownSec % 600) / 60)).padStart(2, '0');
      const is = String(simCountdownSec % 60).padStart(2, '0');
      iqamahTimer.textContent = `${im}:${is}`;
    }
  }

  simCountdownInterval = setInterval(updateSimCountdown, 1000);

  // Simulator Slide Cycling
  const simSlides = document.querySelectorAll('.sim-slide-item');
  let currentSimSlide = 0;

  if (simSlides.length > 0) {
    setInterval(() => {
      simSlides[currentSimSlide].classList.remove('opacity-100');
      simSlides[currentSimSlide].classList.add('opacity-0');
      currentSimSlide = (currentSimSlide + 1) % simSlides.length;
      simSlides[currentSimSlide].classList.remove('opacity-0');
      simSlides[currentSimSlide].classList.add('opacity-100');
    }, 4500);
  }

  // ==================== 5. SIMULATOR AUDIO DEMO ====================
  const audioElements = {
    chime: document.getElementById('demoAudioChime'),
    beep: document.getElementById('demoAudioBeep'),
    adhan: document.getElementById('demoAudioAdhan')
  };

  window.playDemoSound = function(type) {
    // Stop all audio first
    Object.values(audioElements).forEach(a => {
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    });

    const targetAudio = audioElements[type];
    if (targetAudio) {
      targetAudio.play().catch(err => {
        console.warn('Playback prevented:', err.message);
      });
    }
  };

  // ==================== 6. WHATSAPP QUOTATION GENERATOR ====================
  window.requestQuotation = function(packageName) {
    const phoneNumber = "601118712388";
    const message = encodeURIComponent(
      `Assalamualaikum & Salam Hormat Skywalker Consortium,\n\n` +
      `Saya mewakili pihak pengurusan surau/masjid kami, berminat untuk mendapatkan sebut harga rasmi (Quotation) bagi:\n\n` +
      `*Pakej*: ${packageName}\n\n` +
      `Mohon pihak tuan kongsikan maklumat lanjut, sebut harga pdf, dan cadangan tarikh demonstrasi di lokasi.\n\n` +
      `Terima kasih.`
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

});
