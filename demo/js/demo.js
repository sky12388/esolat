/**
 * demo.js — runtime for the interactive e-Solat signage demo.
 *
 * Everything runs client-side: the clock and Hijri date from Intl, the prayer
 * times from the bundled JAKIM-parameter calculator, and the content from the
 * shared demo store that /admin/ writes to.
 */
(function () {
  'use strict';

  var Store = window.EsolatDemoStore;
  var Prayer = window.EsolatPrayerTimes;
  var Hijri = window.HijriCountdown;

  var el = {};
  var state = {};
  var slideIndex = 0;
  var slideTimer = null;
  var cycleIndex = 0;
  var cycleTimer = null;
  var currentSchedule = null;

  var CYCLE_IDS = ['cycleSlideInfaq', 'cycleSlideKuliah', 'cycleSlideHijriEvent', 'cycleSlideHadith', 'cycleSlideRoster', 'cycleSlideTabung'];

  var SLIDES = [
    { eyebrowKey: 'slideEyebrow1', titleKey: 'slideTitle1', subKey: 'slideSub1' },
    { eyebrowKey: 'slideEyebrow2', titleKey: 'slideTitle2', subKey: 'slideSub2' },
    { eyebrowKey: 'slideEyebrow3', titleKey: 'slideTitle3', subKey: 'slideSub3' }
  ];

  function cache() {
    ['digitalClock', 'gregorianDate', 'hijriDate', 'hijri-countdown-badge', 'mosqueName', 'mosqueLocation',
     'kioskLanIpDisplay', 'tickerContent', 'giantNextPrayer', 'giantCountdown', 'cdTargetTime', 'cdZoneLine',
     'slidesContainer', 'slideIndicators', 'cycleDots', 'sideBankName', 'sideBankAcc', 'sideBankHolder',
     'sideKuliahDate', 'sideKuliahTitle', 'sideKuliahUstaz', 'cycleAnnouncementHint', 'sideHijriEventName',
     'sideHijriEventDays', 'sideHadithText', 'sideHadithSource', 'sideRosterImam', 'sideRosterBilal',
     'sideRosterSiak', 'sideTabungDate', 'sideTabungJumaat', 'sideTabungSubuh', 'sideTabungPembangunan',
      'timeImsak', 'timeSubuh', 'timeSyuruk', 'timeZohor', 'timeAsar', 'timeMaghrib', 'timeIsyak',
      'clockPrayerStatus'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
    CYCLE_IDS.forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function text(node, value) {
    if (node && value != null) node.textContent = value;
  }

  /* ---------------------------------------------------------------- prayer --- */

  function renderSchedule() {
    var now = Date.now();
    currentSchedule = Prayer.forToday(now, state.zone);

    currentSchedule.order.forEach(function (name) {
      text(el['time' + name], Prayer.formatHM(currentSchedule.times[name]));
    });

    document.querySelectorAll('.prayer-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.prayer === currentSchedule.activePrayer);
    });

    text(el.giantNextPrayer, currentSchedule.nextPrayer);
    text(el.cdTargetTime, 'AZAN ' + Prayer.formatHM(currentSchedule.nextPrayerAt));
    text(el.cdZoneLine, currentSchedule.zoneName);

    // Keep the ribbon honest across midnight: recompute once per minute.
    scheduleRecompute();
  }

  function renderCountdown() {
    if (!currentSchedule) return;
    var ms = currentSchedule.nextPrayerAtMs - Date.now();
    if (ms < 0) {
      // The azan moment passed between ticks — roll the schedule forward.
      renderSchedule();
      return;
    }
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    text(el.giantCountdown, '- ' + pad(h) + ':' + pad(m) + ':' + pad(s));
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function scheduleRecompute() {
    // Re-derive the prayer schedule on every minute boundary so the active
    // card flips the moment an azan time passes.
    var msToNextMinute = 60000 - (Date.now() % 60000) + 250;
    setTimeout(function () {
      renderSchedule();
    }, msToNextMinute);
  }

  /* ----------------------------------------------------------------- clock --- */

  var WEEKDAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  var MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai',
                'Ogos', 'September', 'Oktober', 'November', 'Disember'];

  function renderClock() {
    // The signage always shows Malaysian time, no matter where the visitor is.
    var myt = new Date(Date.now() + 8 * 3600000);
    text(el.digitalClock, pad(myt.getUTCHours()) + ':' + pad(myt.getUTCMinutes()) + ':' + pad(myt.getUTCSeconds()));
    text(el.gregorianDate, WEEKDAYS[myt.getUTCDay()] + ', ' + myt.getUTCDate() + ' ' + MONTHS[myt.getUTCMonth()] + ' ' + myt.getUTCFullYear());

    if (!Hijri) return;
    var hijri = Hijri.getFallbackHijriDate(myt);
    text(el.hijriDate, hijri.formatted);
  }

  function renderHijriEvent() {
    if (!Hijri) return;
    var res = Hijri.getUpcomingEvent();
    if (!res) return;
    text(el.sideHijriEventName, res.name);
    text(el.sideHijriEventDays, String(res.daysLeft));
    if (el['hijri-countdown-badge']) {
      el['hijri-countdown-badge'].textContent = res.countdownText;
      el['hijri-countdown-badge'].style.display = 'inline-flex';
    }
  }

  /* ------------------------------------------------------------- content ----- */

  function renderContent() {
    text(el.mosqueName, state.mosqueName);
    text(el.mosqueLocation, state.mosqueLocation);
    text(el.kioskLanIpDisplay, state.ipDisplay);

    var ticker = [state.announcement, 'Waktu solat zon ' + (state.zone || 'SGR03')].filter(Boolean).join('   ✦   ');
    applyTicker(ticker);

    text(el.sideBankName, state.bankName);
    text(el.sideBankAcc, state.bankAcc);
    text(el.sideBankHolder, state.bankHolder);

    text(el.sideKuliahDate, state.kuliahDate);
    text(el.sideKuliahTitle, state.kuliahTitle);
    text(el.sideKuliahUstaz, state.kuliahUstaz);
    text(el.cycleAnnouncementHint, state.kuliahHint);

    text(el.sideHadithText, state.hadithText);
    text(el.sideHadithSource, state.hadithSource);

    text(el.sideRosterImam, state.rosterImam);
    text(el.sideRosterBilal, state.rosterBilal);
    text(el.sideRosterSiak, state.rosterSiak);

    text(el.sideTabungDate, state.tabungDate);
    text(el.sideTabungJumaat, state.tabungJumaat);
    text(el.sideTabungSubuh, state.tabungSubuh);
    text(el.sideTabungPembangunan, state.tabungPembangunan);

    renderSlides();
  }

  /* -------------------------------------------------------------- ticker ----- */

  /**
   * Mirrors the production marquee: measure the wrapper and the text, then drive
   * the --marquee-start / --marquee-end custom properties at a constant speed so
   * the announcement scrolls in from the right and loops seamlessly.
   */
  var TICKER_SPEED = 65; // px per second, same as the real kiosk build

  function applyTicker(message) {
    var node = el.tickerContent;
    if (!node || !message) return;

    node.textContent = message;

    var wrapper = node.parentElement;
    var wrapperWidth = wrapper ? wrapper.offsetWidth : window.innerWidth;
    var textWidth = node.scrollWidth || message.length * 18;

    node.style.setProperty('--marquee-start', wrapperWidth + 'px');
    node.style.setProperty('--marquee-end', -(textWidth + 60) + 'px');

    var duration = Math.max(12, (wrapperWidth + textWidth + 60) / TICKER_SPEED);
    node.style.animation = 'none';
    void node.offsetWidth; // force reflow so the new animation restarts
    node.style.animation = 'marqueeLinear ' + duration + 's linear infinite';
  }

  /* -------------------------------------------------------------- slides ----- */

  function renderSlides() {
    if (!el.slidesContainer) return;
    el.slidesContainer.innerHTML = '';
    el.slideIndicators.innerHTML = '';

    SLIDES.forEach(function (slide, idx) {
      var item = document.createElement('div');
      item.className = 'slide-item demo-poster' + (idx === 0 ? ' active' : '');

      var inner = document.createElement('div');
      inner.className = 'demo-poster-inner';

      var eyebrow = document.createElement('div');
      eyebrow.className = 'demo-poster-eyebrow';
      eyebrow.textContent = state[slide.eyebrowKey] || state.mosqueName;

      var title = document.createElement('div');
      title.className = 'demo-poster-title';
      title.textContent = state[slide.titleKey];

      var rule = document.createElement('div');
      rule.className = 'demo-poster-rule';

      var sub = document.createElement('div');
      sub.className = 'demo-poster-sub';
      sub.textContent = state[slide.subKey];

      inner.appendChild(eyebrow);
      inner.appendChild(title);
      inner.appendChild(rule);
      inner.appendChild(sub);
      item.appendChild(inner);
      el.slidesContainer.appendChild(item);

      var dot = document.createElement('div');
      dot.className = 'dot' + (idx === 0 ? ' active' : '');
      el.slideIndicators.appendChild(dot);
    });

    slideIndex = 0;
    startSlideTimer();
  }

  function startSlideTimer() {
    clearInterval(slideTimer);
    slideTimer = setInterval(nextSlide, 9000);
  }

  function nextSlide() {
    var items = document.querySelectorAll('.slide-item');
    var dots = document.querySelectorAll('#slideIndicators .dot');
    if (items.length < 2) return;
    items[slideIndex].classList.remove('active');
    if (dots[slideIndex]) dots[slideIndex].classList.remove('active');
    slideIndex = (slideIndex + 1) % items.length;
    items[slideIndex].classList.add('active');
    if (dots[slideIndex]) dots[slideIndex].classList.add('active');
  }

  /* -------------------------------------------------------- widget cycling --- */

  function showCycle(index) {
    cycleIndex = index % CYCLE_IDS.length;
    CYCLE_IDS.forEach(function (id, i) {
      if (el[id]) el[id].classList.toggle('active', i === cycleIndex);
    });
    if (el.cycleDots) {
      el.cycleDots.querySelectorAll('.cycle-dot').forEach(function (dot, i) {
        dot.classList.toggle('active', i === cycleIndex);
      });
    }
  }

  function startCycleTimer() {
    clearInterval(cycleTimer);
    var seconds = Math.max(5, Number(state.cycleSeconds) || 12);
    cycleTimer = setInterval(function () { showCycle(cycleIndex + 1); }, seconds * 1000);
  }

  /* ----------------------------------------------------------------- misc ---- */

  function applyTheme(theme) {
    var value = theme || 'emerald';
    document.documentElement.setAttribute('data-theme', value);
    document.body.setAttribute('data-theme', value);
  }

  function syncFromStore() {
    state = Store.all();
    applyTheme(state.theme);
    renderContent();
    renderSchedule();
    startCycleTimer();
  }

  function initChrome() {
    // Keyboard shortcuts: ← next slide, ↓ next widget. The demo chrome (chip,
    // hint, note) lives in the wrapper page, so H is handled there — we only
    // relay it upward when the signage iframe has focus.
    document.addEventListener('keydown', function (event) {
      handleKey(event.key);
    });

    window.addEventListener('message', function (event) {
      var data = event.data;
      if (data && data.type === 'esolat-demo-key') handleKey(data.key);
    });
  }

  function handleKey(key) {
    if (key === 'h' || key === 'H') {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'esolat-demo-key', key: key }, '*');
      }
    } else if (key === 'ArrowRight') {
      nextSlide();
    } else if (key === 'ArrowDown') {
      showCycle(cycleIndex + 1);
    }
  }

  function start() {
    cache();
    syncFromStore();
    renderClock();
    renderHijriEvent();
    initChrome();
    fitPrayerCardText();

    Store.subscribe(function () { syncFromStore(); });
    window.addEventListener('storage', function (event) {
      if (event.key === Store.KEY) syncFromStore();
    });

    setInterval(renderClock, 1000);
    setInterval(renderCountdown, 1000);
    setInterval(renderHijriEvent, 60000);
    window.addEventListener('resize', fitPrayerCardText);
  }

  /** FittedBox-style guard so long prayer names never overflow their card. */
  function fitPrayerCardText() {
    document.querySelectorAll('.prayer-card').forEach(function (card) {
      ['.p-name', '.p-time'].forEach(function (sel) {
        var node = card.querySelector(sel);
        if (!node) return;
        node.style.fontSize = '';
        var maxWidth = card.clientWidth - 8;
        if (maxWidth <= 0) return;
        var size = parseFloat(getComputedStyle(node).fontSize);
        var guard = 0;
        while (node.scrollWidth > maxWidth && size > 8 && guard++ < 40) {
          size -= Math.max(1, size * 0.06);
          node.style.fontSize = size + 'px';
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();