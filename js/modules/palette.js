/* ================= P1-2: search palette module (lazy) ================= */
/* لوحة البحث السريع (Ctrl+K) — بتتحمل عند أول فتح لها. */

import { $, t, esc, state, normalizeSearchText, languageLabel, regionName, safeHttpsUrl, openSDR, play } from '../app.js';

/* ================= quick search palette (Ctrl+K) ================= */

var palettePrevFocus = null;

function paletteRows(q) {
  var nq = normalizeSearchText(q);
  var rows = [];
  var fm = state.fm;
  for (var i = 0; i < fm.length && rows.length < 12; i++) {
    var s = fm[i];
    if (!safeHttpsUrl(s.url)) continue;
    var hay = normalizeSearchText([s.name, s.language, s.tags, s.cc, regionName(s.cc, s.cc)].join(' '));
    if (!nq || hay.indexOf(nq) !== -1) rows.push({ kind: 'fm', name: s.name, url: s.url, sub: regionName(s.cc, s.cc) + (s.language ? ' · ' + s.language.split(', ').filter(Boolean).map(languageLabel).join('، ') : '') });
  }
  var rx = state.receivers;
  for (var j = 0; j < rx.length && rows.length < 12; j++) {
    var r = rx[j];
    if (!r.https) continue;
    var hayR = normalizeSearchText([r.name, r.loc, r.url].join(' '));
    if (!nq || hayR.indexOf(nq) !== -1) rows.push({ kind: 'rx', name: r.name, url: r.url, sub: r.loc || '' });
  }
  return rows;
}

function paletteRender() {
  var q = $('palette-q').value;
  var rows;
  if (!q.trim()) {
    rows = state.history.map(function (h) { return { kind: 'fm', name: h.name || h.url, url: h.url, sub: '' }; });
  } else {
    rows = paletteRows(q);
  }
  state.palette.results = rows;
  var list = $('palette-list');
  if (!rows.length) {
    list.innerHTML = '<div class="hint" style="text-align:center">' + esc(t('palette_none')) + '</div>';
    return;
  }
  var html = '';
  rows.forEach(function (r, i) {
    var kind = r.kind === 'fm' ? '📻 ' + t('palette_kind_fm') : '🛰 ' + t('palette_kind_rx');
    html += '<button class="pal-item" type="button" data-pal-idx="' + i + '">' +
      '<span class="pal-kind">' + esc(kind) + '</span>' +
      '<span class="pal-name">' + esc(r.name) + '</span>' +
      (r.sub ? '<span class="pal-sub">' + esc(r.sub) + '</span>' : '') +
      '</button>';
  });
  list.innerHTML = html;
}

function paletteOpen() {
  var m = $('palette-modal');
  if (!m) return;
  palettePrevFocus = document.activeElement;
  $('palette-q').value = '';
  state.palette.results = [];
  m.hidden = false;
  paletteRender();
  $('palette-q').focus();
}

function paletteClose() {
  var m = $('palette-modal');
  if (m) m.hidden = true;
  if (palettePrevFocus && typeof palettePrevFocus.focus === 'function') { try { palettePrevFocus.focus(); } catch (e) {} }
  palettePrevFocus = null;
}

function palettePlayFirst() {
  var r = (state.palette.results || [])[0];
  if (!r) return;
  if (r.kind === 'rx') openSDR(r.url, r.name); else play(r.url, r.name);
  paletteClose();
}

/* ================= player EQ animation (decorative) ================= */


export { paletteOpen, paletteClose, paletteRender, palettePlayFirst };
