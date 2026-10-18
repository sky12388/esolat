/**
 * frame.js — the demo wrapper runtime.
 *
 * Scales the 1920x1080 signage iframe to fit the visitor's screen, manages the
 * demo chrome, and forwards keyboard shortcuts into the iframe.
 */
(function () {
  'use strict';

  var DESIGN_W = 1920;
  var DESIGN_H = 1080;

  var viewport = document.getElementById('frameViewport');
  var stage = document.getElementById('frameStage');
  var frame = document.getElementById('signageFrame');
  var note = document.getElementById('demoNote');
  var noteClose = document.getElementById('demoNoteClose');
  var hideBtn = document.getElementById('demoHideBtn');
  var fullscreenBtn = document.getElementById('demoFullscreenBtn');

  /* ---------------------------------------------------------------- fit ---- */

  // Read from the viewport element, not <html>: body.chrome-hidden overrides
  // --frame-bar, and a custom property set on <body> does not flow upward.
  function cssPx(name, fallback) {
    var raw = getComputedStyle(viewport || document.body).getPropertyValue(name);
    var parsed = parseFloat(raw);
    return isNaN(parsed) ? fallback : parsed;
  }

  function fit() {
    if (!stage || !viewport) return;
    var bar = cssPx('--frame-bar', 60);
    var availableW = viewport.clientWidth;
    var availableH = viewport.clientHeight;

    if (availableW <= 0 || availableH <= 0) {
      availableW = window.innerWidth;
      availableH = window.innerHeight - bar;
    }

    var scale = Math.min(availableW / DESIGN_W, availableH / DESIGN_H);
    if (!isFinite(scale) || scale <= 0) scale = 0.1;

    stage.style.width = Math.round(DESIGN_W * scale) + 'px';
    stage.style.height = Math.round(DESIGN_H * scale) + 'px';
    stage.style.setProperty('--frame-scale', String(scale));
  }

  /* ------------------------------------------------------------- chrome ---- */

  function toggleChrome() {
    document.body.classList.toggle('chrome-hidden');
    // The bar height changes with the chrome, so the frame has to re-fit.
    // fit() runs synchronously (clientHeight forces layout) plus on the next
    // frame so the resize is picked up even if layout settles late.
    fit();
    requestAnimationFrame(fit);
  }

  if (noteClose && note) {
    noteClose.addEventListener('click', function () { note.remove(); });
  }

  if (hideBtn) hideBtn.addEventListener('click', toggleChrome);

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', function () {
      var root = document.documentElement;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (root.requestFullscreen) {
        root.requestFullscreen();
      }
    });
  }

  document.addEventListener('fullscreenchange', function () {
    fit();
    requestAnimationFrame(fit);
    if (fullscreenBtn) {
      fullscreenBtn.textContent = document.fullscreenElement ? '✕ Keluar' : '⛶ Penuh';
    }
  });

  /* ----------------------------------------------------------- keyboard ---- */

  function forwardKey(event) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: 'esolat-demo-key', key: event.key },
      '*'
    );
  }

  // Keys pressed while the iframe has focus arrive as messages from it.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'esolat-demo-key') return;
    if (data.key === 'h' || data.key === 'H') toggleChrome();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'h' || event.key === 'H') {
      toggleChrome();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      forwardKey(event);
    }
  });

  /* ---------------------------------------------------------------- boot --- */

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 60);
    fit();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  } else {
    fit();
  }

  window.addEventListener('load', fit);
})();
