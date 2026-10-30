/* ==========================================================================
   e-Solat v5 — marketing site behaviour
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const header = $('#siteHeader');
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');
  const yearEl = $('#year');
  const toast = $('#toast');
  const heroFrame = $('#heroFrame');
  const heroCaption = $('#heroCaption');

  let demoReady = false;
  let toastTimer;

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* -------------------------------------------------- toast */
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  /* -------------------------------------------------- header + mobile nav */
  function onScroll() {
    header?.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function closeNav() {
    header?.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    const icon = $('#navToggleIcon use');
    icon?.setAttribute('href', '#i-menu');
  }

  navToggle?.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
    const icon = $('#navToggleIcon use');
    icon?.setAttribute('href', open ? '#i-close' : '#i-menu');
  });

  navLinks?.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeNav();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });

  /* -------------------------------------------------- reveal on scroll */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  /* -------------------------------------------------- active nav link */
  const sections = $$('main section[id]');
  const navAnchors = $$('#navLinks a');
  if ('IntersectionObserver' in window && sections.length && navAnchors.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          navAnchors.forEach((a) => {
            a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );
    sections.forEach((s) => navObserver.observe(s));
  }

  /* -------------------------------------------------- scale 1920x1080 previews */
  const screens = $$('[data-screen]');

  function scaleScreen(screen) {
    const inner = $('.screen-inner', screen);
    if (!inner) return;
    const width = screen.clientWidth;
    if (!width) return;
    screen.style.setProperty('--s', String(width / 1920));
  }

  function scaleAllScreens() {
    screens.forEach(scaleScreen);
  }

  scaleAllScreens();
  window.addEventListener('resize', scaleAllScreens, { passive: true });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => scaleScreen(entry.target));
    });
    screens.forEach((s) => ro.observe(s));
  }

  /* -------------------------------------------------- demo availability + lazy frames */
  const demoFrames = $$('iframe[data-src]');

  function loadFrame(frame) {
    if (!frame || frame.dataset.loaded === '1') return;
    const src = frame.dataset.src;
    if (!src) return;
    frame.src = src;
    frame.dataset.loaded = '1';
  }

  async function checkDemo() {
    try {
      const res = await fetch('./v5/index.html', { cache: 'no-store' });
      demoReady = res.ok;
    } catch {
      demoReady = false;
    }

    if (!demoReady) {
      document.body.classList.add('no-demo');
      return;
    }

    // load the initially visible demo view
    const stage = $('.demo-stage');
    const active = stage?.dataset.active || 'v';
    loadView(active);
  }

  /* -------------------------------------------------- demo tabs */
  const demoStage = $('.demo-stage');
  const demoTabs = $$('.demo-tab');
  const openLinks = $$('[data-open-link]');

  const demoHref = {
    v: './v5/?mode=v1',
    h: './v5/?mode=v3',
    compare: './v5/?mode=v1',
  };

  function loadView(view) {
    if (!demoReady) return;
    const scope = $(`.demo-view[data-view="${view}"]`);
    if (!scope) return;
    $$('iframe[data-src]', scope).forEach(loadFrame);
  }

  function setDemoTab(tab) {
    if (!demoStage) return;
    demoStage.dataset.active = tab;
    demoTabs.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    if (openLinks.length) {
      const href = demoHref[tab] || demoHref.v;
      openLinks.forEach((link) => {
        link.href = href;
      });
    }
    loadView(tab);
    scaleAllScreens();
  }

  demoTabs.forEach((btn) => {
    btn.addEventListener('click', () => setDemoTab(btn.dataset.tab));
  });

  /* persona links jump to demo and open the matching tab */
  $$('[data-open-demo]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.openDemo === 'h' ? 'h' : 'v';
      setDemoTab(tab);
      $('#demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* -------------------------------------------------- hero preview switch */
  const heroButtons = $$('[data-hero-mode]');
  const heroCopy = {
    v: 'UX V — Waktu solat menegak, jam flip 3D & takwim.',
    h: 'UX H — Carousel media & reben solat mendatar.',
  };

  function setHeroMode(mode) {
    heroButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.heroMode === mode));
    if (heroCaption) heroCaption.textContent = heroCopy[mode] || heroCopy.v;

    const href = mode === 'h' ? './v5/?mode=v3' : './v5/?mode=v1';
    const full = $('.tv-caption a');
    if (full) full.href = href;

    if (!demoReady || !heroFrame) return;
    const next = `${href}&embed=1`;
    if (heroFrame.getAttribute('src') !== next) heroFrame.src = next;
  }

  heroButtons.forEach((btn) => {
    btn.addEventListener('click', () => setHeroMode(btn.dataset.heroMode));
  });

  /* -------------------------------------------------- quotation via WhatsApp */
  const WA_NUMBER = '601118712388';

  $$('[data-quote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pkg = btn.dataset.quote || 'Pakej e-Solat v5';
      const message =
        'Assalamualaikum & Salam Hormat Skywalker Consortium,\n\n' +
        'Saya mewakili pihak pengurusan surau/masjid kami, berminat untuk mendapatkan sebut harga rasmi (Quotation) bagi:\n\n' +
        `*Pakej*: ${pkg}\n\n` +
        'Mohon pihak tuan kongsikan maklumat lanjut, sebut harga PDF, dan cadangan tarikh demonstrasi di lokasi.\n\n' +
        'Terima kasih.';
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    });
  });

  /* -------------------------------------------------- boot */
  checkDemo();
})();
