/**
 * admin-demo.js — mock control panel that drives the interactive demo signage.
 *
 * Everything is a plain form over the shared demo store: change a field, the
 * store broadcasts, and any open /demo/ tab repaints. No server, no auth —
 * this page exists so visitors can see how the real admin app maps onto the TV.
 */
(function () {
  'use strict';

  var Store = window.EsolatDemoStore;
  var Prayer = window.EsolatPrayerTimes;

  var THEMES = [
    { value: 'emerald', label: 'Emerald Nabawi (lalai)' },
    { value: 'navy-gold', label: 'Navy Gold / Royal Sapphire' },
    { value: 'clean-ivory', label: 'Clean Ivory' },
    { value: 'onyx-dark', label: 'Onyx / Midnight OLED' },
    { value: 'ottoman-cyan', label: 'Ottoman Cyan / Al-Aqsa' }
  ];

  var fields = {};

  var GROUPS = [
    {
      title: 'Identiti Surau',
      icon: '🕌',
      hint: 'Nama, lokasi dan zon waktu solat JAKIM yang dipaparkan di penjuru kiri.',
      fields: [
        { key: 'mosqueName', label: 'Nama Surau', type: 'text' },
        { key: 'mosqueLocation', label: 'Lokasi', type: 'text' },
        { key: 'ipDisplay', label: 'Alamat IP kiosk', type: 'text' },
        { key: 'zone', label: 'Zon waktu solat (JAKIM)', type: 'select', options: 'zones' }
      ]
    },
    {
      title: 'Pengumuman Berjalan',
      icon: '📢',
      hint: 'Teks besar kuning yang bergerak di bar paling bawah TV.',
      fields: [{ key: 'announcement', label: 'Teks pengumuman', type: 'textarea', rows: 3 }]
    },
    {
      title: 'Slaid Panggung',
      icon: '🖼️',
      hint: 'Tiga poster yang berganti di panggung utama.',
      fields: [
        { key: 'slideEyebrow1', label: 'Slaid 1 — label atas', type: 'text' },
        { key: 'slideTitle1', label: 'Slaid 1 — tajuk', type: 'text' },
        { key: 'slideSub1', label: 'Slaid 1 — teks kecil', type: 'text' },
        { key: 'slideEyebrow2', label: 'Slaid 2 — label atas', type: 'text' },
        { key: 'slideTitle2', label: 'Slaid 2 — tajuk', type: 'text' },
        { key: 'slideSub2', label: 'Slaid 2 — teks kecil', type: 'text' },
        { key: 'slideEyebrow3', label: 'Slaid 3 — label atas', type: 'text' },
        { key: 'slideTitle3', label: 'Slaid 3 — tajuk', type: 'text' },
        { key: 'slideSub3', label: 'Slaid 3 — teks kecil', type: 'text' }
      ]
    },
    {
      title: 'Infaq & Bank',
      icon: '💳',
      hint: 'Kad pertama dalam bar sisi bawah, dipapar sebagai kod QR DuitNow.',
      fields: [
        { key: 'bankName', label: 'Nama bank', type: 'text' },
        { key: 'bankAcc', label: 'Nombor akaun', type: 'text' },
        { key: 'bankHolder', label: 'Nama pemohon akaun', type: 'text' }
      ]
    },
    {
      title: 'Kuliah & Hadis',
      icon: '🎙️',
      hint: 'Dua kad yang muncul bergantian dalam bar sisi.',
      fields: [
        { key: 'kuliahDate', label: 'Tarikh kuliah', type: 'text' },
        { key: 'kuliahTitle', label: 'Tajuk kuliah', type: 'text' },
        { key: 'kuliahUstaz', label: 'Ustaz /penceramah', type: 'text' },
        { key: 'kuliahHint', label: 'Undangan', type: 'text' },
        { key: 'hadithText', label: 'Teks hadis', type: 'textarea', rows: 2 },
        { key: 'hadithSource', label: 'Rujukan hadis', type: 'text' }
      ]
    },
    {
      title: 'Jadual Petugas',
      icon: '📋',
      hint: 'Imam, bilal dan siak untuk hari ini.',
      fields: [
        { key: 'rosterImam', label: 'Imam', type: 'text' },
        { key: 'rosterBilal', label: 'Bilal', type: 'text' },
        { key: 'rosterSiak', label: 'Siak', type: 'text' }
      ]
    },
    {
      title: 'Tabung & Kewangan',
      icon: '📊',
      hint: 'Ringkasan kutipan yang dipaparkan pada kad kewangan.',
      fields: [
        { key: 'tabungDate', label: 'Tarikh penyata', type: 'text' },
        { key: 'tabungJumaat', label: 'Kutipan Jumaat', type: 'text' },
        { key: 'tabungSubuh', label: 'Infaq Subuh', type: 'text' },
        { key: 'tabungPembangunan', label: 'Tabung pembangunan', type: 'text' }
      ]
    },
    {
      title: 'Paparan TV',
      icon: '🎨',
      hint: 'Tema warna dan kadar kelajuan kad sisi.',
      fields: [
        { key: 'theme', label: 'Tema paparan', type: 'select', options: 'themes' },
        { key: 'cycleSeconds', label: 'Saat setiap kad sisi (5–40s)', type: 'range', min: 5, max: 40 }
      ]
    }
  ];


  function el(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  }

  function buildField(field, state) {
    var fieldId = 'f_' + field.key;
    var wrap = el('div', 'mb-3');
    var labelRow = el('div', 'mb-1 flex items-baseline justify-between gap-2');
    var label = el('label', 'text-[11px] font-bold uppercase tracking-wider text-slate-400', field.label);
    label.setAttribute('for', fieldId);
    labelRow.appendChild(label);

    var control;
    if (field.type === 'textarea') {
      control = el('textarea');
      control.rows = field.rows || 3;
      control.className = 'w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400';
      control.value = state[field.key] != null ? state[field.key] : '';
    } else if (field.type === 'select') {
      control = el('select', 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400');
      var options = field.options === 'themes' ? THEMES : zoneOptions();
      options.forEach(function (opt) {
        var o = el('option', null, opt.label);
        o.value = opt.value;
        control.appendChild(o);
      });
      control.value = state[field.key];
    } else if (field.type === 'range') {
      control = el('input');
      control.type = 'range';
      control.min = field.min;
      control.max = field.max;
      control.step = 1;
      control.className = 'admin-range w-full';
      control.value = state[field.key];

      var readout = el('span', 'text-xs font-bold text-emerald-300', state[field.key] + ' saat');
      labelRow.appendChild(readout);
      control.addEventListener('input', function () { readout.textContent = control.value + ' saat'; });
    } else {
      control = el('input');
      control.type = 'text';
      control.className = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400';
      control.value = state[field.key] != null ? state[field.key] : '';
    }

    control.id = fieldId;
    control.addEventListener('input', function () {
      var value = control.value;
      if (field.type === 'range') value = Number(value);
      var patch = {};
      patch[field.key] = value;
      Store.set(patch, 'admin-demo');
      flashSaved();
    });

    wrap.appendChild(labelRow);
    wrap.appendChild(control);
    return wrap;
  }

  function zoneOptions() {
    var zones = (Prayer && Prayer.ZONES) ? Prayer.ZONES : {};
    return Object.keys(zones).map(function (key) {
      return { value: key, label: zones[key].name };
    });
  }

  function build() {
    var state = Store.all();
    var host = document.getElementById('groups');

    GROUPS.forEach(function (group, index) {
      var details = el('details', 'admin-group rounded-2xl border border-slate-800 bg-slate-900');
      details.open = index < 2;

      var summary = el('summary', 'flex cursor-pointer select-none items-center gap-3 px-4 py-3');
      summary.appendChild(el('span', 'text-lg', group.icon));
      var titleWrap = el('span', 'flex-1');
      titleWrap.appendChild(el('span', 'block text-sm font-bold', group.title));
      titleWrap.appendChild(el('span', 'block text-[11px] text-slate-400', group.hint));
      summary.appendChild(titleWrap);
      summary.appendChild(el('span', 'admin-chevron text-slate-500', '›'));

      var body = el('div', 'border-t border-slate-800 px-4 py-3');
      group.fields.forEach(function (field) {
        body.appendChild(buildField(field, state));
        fields[field.key] = field;
      });

      details.appendChild(summary);
      details.appendChild(body);
      host.appendChild(details);
    });
  }

  function refreshInputs() {
    var state = Store.all();
    Object.keys(fields).forEach(function (key) {
      var control = document.getElementById('f_' + key);
      if (control && state[key] != null) control.value = state[key];
    });
  }

  var statusTimer = null;
  function flashSaved() {
    var status = document.getElementById('syncStatus');
    if (!status) return;
    status.textContent = 'Disimpan ✓ Sistem TV akan berubah serta-merta';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      status.textContent = 'Menyimpan pada pelayar ini sahaja';
    }, 2200);
  }

  function initPreview() {
    var toggle = document.getElementById('previewToggle');
    var wrap = document.getElementById('previewWrap');
    var hint = document.getElementById('previewHint');
    if (!toggle || !wrap) return;
    toggle.addEventListener('click', function () {
      var open = wrap.classList.toggle('hidden') === false;
      hint.textContent = open ? 'Sembunyi' : 'Papar';
    });
  }

  function initActions() {
    var reset = document.getElementById('btnReset');
    if (reset) {
      reset.addEventListener('click', function () {
        if (!window.confirm('Set semula semua maklumat demo kepada nilai asal?')) return;
        Store.reset('admin-demo');
        window.location.reload();
      });
    }
    var copy = document.getElementById('btnCopy');
    if (copy) {
      copy.addEventListener('click', function () {
        var url = new URL('../demo/', window.location.href).href;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            copy.textContent = 'Pautan disalin ✓';
            setTimeout(function () { copy.textContent = 'Salin pautan demo'; }, 1800);
          }).catch(function () { window.prompt('Pautan demo:', url); });
        } else {
          window.prompt('Pautan demo:', url);
        }
      });
    }
  }

  function init() {
    build();
    initPreview();
    initActions();
    Store.subscribe(function () { refreshInputs(); flashSaved(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();