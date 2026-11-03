/* =====================================================================
   Radio Atlas — tools module (command palette, sharing, random station, report)
   Split out of js/app.js in P1-2; loaded lazily via loadModule('tools').
   Reuses the globals of js/app.js (classic script). ES modules run in strict
   mode: every assignment below targets a declared or inherited binding.
   ===================================================================== */


var STR_TOOLS = {
  ar: {
    share_copied: 'رابط المحطة اتنسخ ✔ — شاركه في أي مكان',
    random_toast: '🎲 محطة عشوائية: {name}',
    report_title: 'محطة مش شغالة: {name}',
    report_body: 'رابط البث:\n{url}\n\nالمشكلة (وصف موجز):\n',
    report_toast: 'فتحنا صفحة البلاغ على GitHub — كمّل الوصف وابعت 🙏',
    palette_title: 'بحث سريع',
    palette_ph: 'ابحث: محطة، دولة، جهاز…',
    palette_none: 'مفيش نتائج مطابقة.',
    palette_hint: 'Enter يشغّل أول نتيجة · Esc للإغلاق',
    palette_kind_fm: 'بث',
    palette_kind_rx: 'استقبال'
  },
  en: {
    share_copied: 'Station link copied ✔ — share it anywhere',
    random_toast: '🎲 Random station: {name}',
    report_title: 'Broken station: {name}',
    report_body: 'Stream URL:\n{url}\n\nWhat happened (short description):\n',
    report_toast: 'Opening a GitHub report — finish the description and submit 🙏',
    palette_title: 'Quick search',
    palette_ph: 'Search: station, country, receiver…',
    palette_none: 'No matching results.',
    palette_hint: 'Enter plays the first result · Esc to close',
    palette_kind_fm: 'Broadcast',
    palette_kind_rx: 'Receiver'
  }
};



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



/* ================= station sharing / deep links ================= */

var shareHashHandled = false;

function stationShareLink(url) {
  try {
    return location.origin + location.pathname + '#play=' + encodeURIComponent(url);
  } catch (e) { return ''; }
}

function shareStation(url, name) {
  url = safeHttpUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  var link = stationShareLink(url);
  if (!link) { toast(t('toast_broken')); return; }
  if (navigator.share) {
    try {
      navigator.share({ title: name || t('doc_title'), text: name || '', url: link }).catch(function () {});
      return;
    } catch (e) {}
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function () {
      toast(t('share_copied'));
    }).catch(function () {
      toast(link);
    });
    return;
  }
  toast(link);
}

function handleShareHash() {
  if (shareHashHandled) return;
  shareHashHandled = true;
  try {
    var h = location.hash || '';
    if (h.indexOf('#play=') !== 0) return;
    var url = decodeURIComponent(h.slice(6));
    if (!safeHttpsUrl(url)) return;
    var station = stationByUrl(url);
    play(url, station ? station.name : '');
  } catch (e) {}
}



/* ================= random station + broken-station report ================= */

var ISSUE_URL = 'https://github.com/SamoTech/Radio/issues/new';

function playRandomStation() {
  var list = currentFMList().filter(function (s) { return !!safeHttpsUrl(s.url); });
  if (!list.length) { toast(t('random_none')); return; }
  var s = list[Math.floor(Math.random() * list.length)];
  play(s.url, s.name);
  toast(t('random_toast').replace('{name}', s.name));
}

function reportStation(url, name) {
  url = safeHttpUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  var title = t('report_title').replace('{name}', name || '');
  var body = t('report_body').replace('{url}', url);
  var link = ISSUE_URL + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  try { window.open(link, '_blank', 'noopener'); } catch (e) { location.href = link; }
  toast(t('report_toast'));
}



var API = { paletteOpen: paletteOpen, paletteClose: paletteClose, shareStation: shareStation, reportStation: reportStation, playRandomStation: playRandomStation, handleShareHash: handleShareHash };
var booted = false;
export function boot() {
  if (booted) return API;
  booted = true;
  RA_MODULES.tools = API;
  raMergeStr(STR_TOOLS);
  applyI18n();

  $('palette-btn').addEventListener('click', paletteOpen);
  $('palette-close').addEventListener('click', paletteClose);
  $('palette-q').addEventListener('input', function () { paletteRender(); });
  $('palette-q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); palettePlayFirst(); }
  });
  $('palette-list').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.pal-item') : null;
    if (!b) return;
    var idx = Number(b.getAttribute('data-pal-idx'));
    var r = (state.palette.results || [])[idx];
    if (!r) return;
    if (r.kind === 'rx') openSDR(r.url, r.name); else play(r.url, r.name);
    paletteClose();
  });


  return API;
}
