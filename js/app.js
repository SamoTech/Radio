'use strict';

/* راديو أطلس — Radio Atlas frontend (vanilla JS, no deps) */

var state = {
  receivers: [],
  updated: null,
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0 },
  fm: []
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

/* ================= KiwiSDR ================= */

function normalizeRx(r) {
  return {
    name: r.name || 'بدون اسم',
    url: r.url || '',
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
  $('stat-total').textContent = total;
  $('stat-online').textContent = online;
  $('stat-listeners').textContent = listeners;
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
  return '<article class="' + cls + '">' +
    '<div class="card-head"><span class="dot ' + (r.online ? 'on' : 'off') + '"></span>' +
    '<h3>' + esc(r.name) + '</h3></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    '<div class="meta"><span>👥 ' + users + '</span><span class="snr">📶 SNR ' + snr + '</span></div>' +
    (r.antenna ? '<div class="meta antenna" title="' + esc(r.antenna) + '">🛰 ' + esc(r.antenna) + '</div>' : '') +
    (r.url ? '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">افتح الجهاز ↗</a>' : '') +
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
  $('count-sdr').textContent = list.length + ' نتيجة';
  grid.innerHTML = list.length ? list.map(cardRx).join('')
    : '<div class="empty">مفيش نتائج مطابقة — جرب تخفف الفلاتر.</div>';
}

/* ================= FM / Broadcast ================= */

function cardFm(s) {
  var meta = [s.country, s.language, (s.codec ? s.codec + (s.bitrate ? ' ' + s.bitrate + 'kbps' : '') : '')]
    .filter(Boolean).join(' · ');
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(s.name || 'محطة') + '</h3></div>' +
    (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
    '<button class="open play" type="button" data-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">▶ استمع</button>' +
    '</article>';
}

function renderFM() {
  $('grid-fm').innerHTML = state.fm.length ? state.fm.map(cardFm).join('')
    : '<div class="empty">مفيش محطات — جرب كلمة تانية.</div>';
}

function loadStations() {
  return fetchJSON('data/stations.json').then(function (data) {
    if (data && Array.isArray(data.stations)) state.fm = data.stations;
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(renderFM);
}

function searchFM(q) {
  if (!q || !q.trim()) { loadStations(); return; }
  $('grid-fm').innerHTML = '<div class="empty">جاري البحث…</div>';
  var url = 'https://de1.api.radio-browser.info/json/stations/search?limit=60&hidebroken=true&name=' + encodeURIComponent(q.trim());
  fetch(url).then(function (r) { return r.json(); }).then(function (rows) {
    state.fm = rows.filter(function (s) { return s.url_resolved; }).map(function (s) {
      return { name: s.name, url: s.url_resolved, country: s.country, language: s.language, codec: s.codec, bitrate: s.bitrate };
    });
    renderFM();
  }).catch(function () {
    $('grid-fm').innerHTML = '<div class="empty">البحث الحي فشل — رجعنا للقائمة المخزنة.</div>';
    loadStations();
  });
}

/* ================= Player ================= */

function play(url, name) {
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + (name || '');
  var a = $('audio');
  a.src = url;
  a.play().catch(function () {});
}

function initPlayer() {
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.play') : null;
    if (!b) return;
    play(b.getAttribute('data-url'), b.getAttribute('data-name'));
  });
  $('player-close').addEventListener('click', function () {
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    $('player').hidden = true;
  });
}

/* ================= UI ================= */

function switchTab(t) {
  var sdr = t === 'sdr';
  $('tab-sdr').classList.toggle('active', sdr);
  $('tab-fm').classList.toggle('active', !sdr);
  $('panel-sdr').hidden = !sdr;
  $('panel-fm').hidden = sdr;
}

function initUI() {
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });

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

  var fmTimer = null;
  $('qfm').addEventListener('input', function () {
    clearTimeout(fmTimer);
    var v = this.value;
    fmTimer = setTimeout(function () { searchFM(v); }, 450);
  });
  $('fm-search-btn').addEventListener('click', function () { searchFM($('qfm').value); });
}

function init() {
  initUI();
  initPlayer();
  loadKiwi();
  loadStations();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);
