'use strict';

/* راديو أطلس — Radio Atlas frontend (vanilla JS, no deps) */

var RB_API = 'https://de1.api.radio-browser.info/json';
var FM_PAGE = 120;

var state = {
  receivers: [],
  updated: null,
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0 },
  fm: [],
  fmFilters: { q: '', country: '', language: '', tag: '' },
  fmLimit: FM_PAGE,
  fmLive: false,
  fmLiveRows: []
};

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fetchJSON(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch (e) { return String(iso); }
}

function fmtNum(n) {
  try { return Number(n).toLocaleString('ar-EG'); } catch (e) { return String(n); }
}

/* ================= KiwiSDR ================= */

function normalizeRx(r) {
  var url = r.url || '';
  return {
    name: r.name || 'بدون اسم',
    url: url,
    https: /^https:/i.test(url),
    online: !!r.online,
    users: Number(r.users) || 0,
    maxUsers: Number(r.max_users) || 0,
    snr: r.snr == null ? null : Number(r.snr),
    gps: !!r.gps,
    band: r.band || '',
    loc: r.loc || '',
    antenna: r.antenna || ''
  };
}

function loadKiwi() {
  return fetchJSON('data/kiwisdr.json').then(function (data) {
    if (data && Array.isArray(data.receivers)) {
      state.receivers = data.receivers.map(normalizeRx);
      state.updated = data.updated;
    }
  }).catch(function (e) {
    console.warn('kiwisdr snapshot:', e);
  }).then(function () {
    renderStats();
    buildBandFilter();
    renderSDR();
  });
}

function renderStats() {
  var total = state.receivers.length;
  var online = 0, listeners = 0;
  state.receivers.forEach(function (r) {
    if (r.online) { online++; listeners += r.users; }
  });
  $('stat-total').textContent = fmtNum(total);
  $('stat-online').textContent = fmtNum(online);
  $('stat-listeners').textContent = fmtNum(listeners);
  $('stat-updated').textContent = fmtDate(state.updated);
}

function buildBandFilter() {
  var sel = $('band');
  var bands = {};
  state.receivers.forEach(function (r) {
    var b = r.band || 'غير محدد';
    bands[b] = (bands[b] || 0) + 1;
  });
  var keys = Object.keys(bands).sort(function (a, b) { return bands[b] - bands[a]; });
  sel.innerHTML = '<option value="all">كل النطاقات</option>' + keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + ' (' + bands[k] + ')</option>';
  }).join('');
  sel.value = state.filters.band;
}

function applyFilters() {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var list = state.receivers.filter(function (r) {
    if (f.onlineOnly && !r.online) return false;
    if (f.band !== 'all' && (r.band || 'غير محدد') !== f.band) return false;
    if (f.freeOnly && !(r.maxUsers > 0 && r.users < r.maxUsers)) return false;
    if (f.minSnr > 0 && !(r.snr != null && r.snr >= f.minSnr)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.url + ' ' + r.band + ' ' + r.loc + ' ' + r.antenna).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (f.sort === 'name') return a.name.localeCompare(b.name, 'ar');
    if (f.sort === 'free') return (b.maxUsers - b.users) - (a.maxUsers - a.users);
    if (f.sort === 'users') return a.users - b.users;
    var sa = a.snr == null ? -1 : a.snr;
    var sb = b.snr == null ? -1 : b.snr;
    return sb - sa;
  });
  return list;
}

function cardRx(r) {
  var cls = 'card' + (r.online ? '' : ' off');
  var snr = r.snr == null ? '—' : r.snr + ' dB';
  var users = r.users + '/' + (r.maxUsers || '?');
  var chips = '';
  if (r.band) chips += '<span class="chip">' + esc(r.band) + '</span>';
  if (r.loc) chips += '<span class="chip">📍 ' + esc(r.loc) + '</span>';
  if (r.gps) chips += '<span class="chip gps">📡 GPS</span>';
  var action = '';
  if (r.url) {
    action = r.https
      ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">🎧 استمع داخل التطبيق</button>'
      : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">افتح الجهاز ↗</a>';
  }
  return '<article class="' + cls + '">' +
    '<div class="card-head"><span class="dot ' + (r.online ? 'on' : 'off') + '"></span>' +
    '<h3>' + esc(r.name) + '</h3></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    '<div class="meta"><span>👥 ' + users + '</span><span class="snr">📶 SNR ' + snr + '</span></div>' +
    (r.antenna ? '<div class="meta antenna" title="' + esc(r.antenna) + '">🛰 ' + esc(r.antenna) + '</div>' : '') +
    action +
    '</article>';
}

function renderSDR() {
  var grid = $('grid-sdr');
  if (!state.receivers.length) {
    grid.innerHTML = '<div class="empty">لا توجد بيانات بعد.<br>شغّل workflow «Update receiver data» من تبويب Actions، أو استنى أول تشغيل مجدول (كل ٣٠ دقيقة).</div>';
    $('count-sdr').textContent = '';
    return;
  }
  var list = applyFilters();
  $('count-sdr').textContent = fmtNum(list.length) + ' نتيجة';
  grid.innerHTML = list.length ? list.map(cardRx).join('')
    : '<div class="empty">مفيش نتائج مطابقة — جرب تخفف الفلاتر.</div>';
}

/* ================= FM / Broadcast ================= */

function flagOf(cc) {
  if (!cc || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  var a = cc.toUpperCase();
  try {
    return String.fromCodePoint(0x1F1E6 + a.charCodeAt(0) - 65, 0x1F1E6 + a.charCodeAt(1) - 65);
  } catch (e) { return ''; }
}

function regionNameAr(cc, fallback) {
  if (!cc) return fallback;
  try {
    var dn = new Intl.DisplayNames(['ar'], { type: 'region' });
    var n = dn.of(cc.toUpperCase());
    return n && n !== cc.toUpperCase() ? n : fallback;
  } catch (e) { return fallback; }
}

function fillSelect(sel, placeholder, items) {
  sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + items.map(function (it) {
    return '<option value="' + esc(it.value) + '">' + esc(it.label) + '</option>';
  }).join('');
}

function splitList(v) {
  return String(v || '').split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
}

function buildFMFacets() {
  var countries = {}, langs = {}, tags = {};
  state.fm.forEach(function (s) {
    if (s.cc) countries[s.cc] = (countries[s.cc] || 0) + 1;
    splitList(s.language).forEach(function (l) { langs[l] = (langs[l] || 0) + 1; });
    splitList(s.tags).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
  });

  // الدول: ترتيب أبجدي بالاسم العربي
  var countryItems = Object.keys(countries)
    .filter(function (k) { return countries[k] >= 5; })
    .map(function (k) {
      var name = regionNameAr(k, k);
      return { value: k, name: name, label: flagOf(k) + ' ' + name + ' (' + countries[k] + ')' };
    })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });

  // اللغات: ترتيب أبجدي
  var langItems = Object.keys(langs)
    .filter(function (k) { return langs[k] >= 10; })
    .sort(function (a, b) { return a.localeCompare(b, 'ar'); })
    .map(function (k) { return { value: k, label: k + ' (' + langs[k] + ')' }; });

  // الفئات: الأكثر شيوعًا
  var tagItems = Object.keys(tags)
    .filter(function (k) { return tags[k] >= 25; })
    .sort(function (a, b) { return tags[b] - tags[a]; })
    .slice(0, 120)
    .map(function (k) { return { value: k, label: k + ' (' + tags[k] + ')' }; });

  fillSelect($('fm-country'), '🌍 كل الدول', countryItems);
  fillSelect($('fm-language'), '🗣 كل اللغات', langItems);
  fillSelect($('fm-tag'), '🏷 كل الفئات', tagItems);
}

function normalizeFm(s) {
  return {
    name: s.name || 'محطة',
    url: s.url_resolved || s.url || '',
    cc: s.countrycode || s.cc || '',
    language: s.language || '',
    tags: s.tags || '',
    codec: s.codec || '',
    bitrate: s.bitrate || 0
  };
}

function cardFm(s) {
  var chips = '';
  if (s.cc) chips += '<span class="chip">' + flagOf(s.cc) + ' ' + esc(regionNameAr(s.cc, s.cc)) + '</span>';
  if (s.language) chips += '<span class="chip">🗣 ' + esc(s.language) + '</span>';
  var allTags = String(s.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  var isOfficial = allTags.indexOf('رسمي') !== -1 || allTags.indexOf('official') !== -1;
  if (isOfficial) chips += '<span class="chip official">🏛 رسمي</span>';
  var tags = allTags.filter(function (t) { return t !== 'رسمي' && t !== 'official'; }).slice(0, 3);
  tags.forEach(function (t) { chips += '<span class="chip tag">🏷 ' + esc(t) + '</span>'; });
  var meta = [s.codec, s.bitrate ? s.bitrate + 'kbps' : ''].filter(Boolean).join(' · ');
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(s.name) + '</h3></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
    '<button class="open play" type="button" data-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">▶ استمع</button>' +
    '</article>';
}

function filterFM() {
  var f = state.fmFilters;
  var q = f.q.trim().toLowerCase();
  return state.fm.filter(function (s) {
    if (f.country && s.cc !== f.country) return false;
    if (f.language && splitList(s.language).indexOf(f.language) === -1) return false;
    if (f.tag && splitList(s.tags).indexOf(f.tag) === -1) return false;
    if (q) {
      if ((s.name + ' ' + s.language + ' ' + s.tags).toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });
}

function currentFMList() {
  return state.fmLive ? state.fmLiveRows : filterFM();
}

function renderFM() {
  var grid = $('grid-fm');
  var list = currentFMList();
  if (!list.length) {
    grid.innerHTML = '<div class="empty">مفيش محطات مطابقة — جرب فلتر أخف أو كلمة تانية.</div>';
    $('count-fm').textContent = '';
    return;
  }
  var shown = list.slice(0, state.fmLimit);
  var html = shown.map(cardFm).join('');
  if (list.length > state.fmLimit) {
    html += '<div class="more-wrap"><button id="fm-more" class="btn ghost" type="button">عرض المزيد — باقي ' + fmtNum(list.length - state.fmLimit) + ' محطة</button></div>';
  }
  grid.innerHTML = html;
  $('count-fm').textContent = fmtNum(list.length) + ' محطة';
}

function loadStations() {
  return fetchJSON('data/stations.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      buildFMFacets();
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(renderFM);
}

function fmClientRender() {
  state.fmLive = false;
  state.fmLiveRows = [];
  state.fmLimit = FM_PAGE;
  renderFM();
}

function searchFM() {
  var f = state.fmFilters;
  if (!(f.q || f.country || f.language || f.tag)) { fmClientRender(); return; }
  $('grid-fm').innerHTML = '<div class="empty">جاري البحث المباشر من المصدر…</div>';
  var params = ['limit=200', 'hidebroken=true', 'order=clickcount', 'reverse=true'];
  if (f.q) params.push('name=' + encodeURIComponent(f.q));
  if (f.country) params.push('countrycode=' + encodeURIComponent(f.country));
  if (f.language) params.push('language=' + encodeURIComponent(f.language));
  if (f.tag) params.push('tagList=' + encodeURIComponent(f.tag));
  fetch(RB_API + '/stations/search?' + params.join('&'))
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      state.fmLive = true;
      state.fmLiveRows = rows.filter(function (s) { return s.url_resolved || s.url; }).map(normalizeFm);
      state.fmLimit = FM_PAGE;
      renderFM();
    })
    .catch(function () {
      $('grid-fm').innerHTML = '<div class="empty">البحث المباشر فشل — استنى شوية أو استخدم الفلترة المحلية الفورية.</div>';
    });
}

function clearFMFilters() {
  state.fmFilters = { q: '', country: '', language: '', tag: '' };
  $('qfm').value = '';
  $('fm-country').value = '';
  $('fm-language').value = '';
  $('fm-tag').value = '';
  fmClientRender();
}

/* ================= Players ================= */

function play(url, name) {
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + (name || '');
  var a = $('audio');
  a.src = url;
  a.play().catch(function () {});
}

function openSDR(url, name) {
  $('sdr-modal-name').textContent = '🎧 ' + (name || '');
  $('sdr-open-ext').href = url;
  $('sdr-frame').src = url;
  $('sdr-modal').hidden = false;
}

function closeSDR() {
  $('sdr-frame').src = 'about:blank';
  $('sdr-modal').hidden = true;
}

function initPlayers() {
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var p = t.closest('button.play');
    if (p) {
      play(p.getAttribute('data-url'), p.getAttribute('data-name'));
      return;
    }
    var sdr = t.closest('button.play-sdr');
    if (sdr) {
      openSDR(sdr.getAttribute('data-url'), sdr.getAttribute('data-name'));
    }
  });
  $('player-close').addEventListener('click', function () {
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    $('player').hidden = true;
  });
  $('sdr-modal-close').addEventListener('click', closeSDR);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('sdr-modal').hidden) closeSDR();
    }
  });
}

/* ================= UI ================= */

function switchTab(t) {
  var fm = t === 'fm';
  $('tab-fm').classList.toggle('active', fm);
  $('tab-sdr').classList.toggle('active', !fm);
  $('panel-fm').hidden = !fm;
  $('panel-sdr').hidden = fm;
}

function initUI() {
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });

  var fmTimer = null;
  $('qfm').addEventListener('input', function () {
    clearTimeout(fmTimer);
    var v = this.value;
    fmTimer = setTimeout(function () { state.fmFilters.q = v; fmClientRender(); }, 200);
  });
  $('fm-search-btn').addEventListener('click', searchFM);
  $('fm-clear-btn').addEventListener('click', clearFMFilters);
  $('fm-country').addEventListener('change', function () { state.fmFilters.country = this.value; fmClientRender(); });
  $('fm-language').addEventListener('change', function () { state.fmFilters.language = this.value; fmClientRender(); });
  $('fm-tag').addEventListener('change', function () { state.fmFilters.tag = this.value; fmClientRender(); });
  $('grid-fm').addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('#fm-more')) {
      state.fmLimit += FM_PAGE;
      renderFM();
    }
  });

  var qTimer = null;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    var v = this.value;
    qTimer = setTimeout(function () { state.filters.q = v; renderSDR(); }, 150);
  });
  $('band').addEventListener('change', function () { state.filters.band = this.value; renderSDR(); });
  $('sort').addEventListener('change', function () { state.filters.sort = this.value; renderSDR(); });
  $('online-only').addEventListener('change', function () { state.filters.onlineOnly = this.checked; renderSDR(); });
  $('free-only').addEventListener('change', function () { state.filters.freeOnly = this.checked; renderSDR(); });
  $('minsnr').addEventListener('change', function () { state.filters.minSnr = Number(this.value) || 0; renderSDR(); });
}

function init() {
  initUI();
  initPlayers();
  loadKiwi();
  loadStations();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);
