/* ================= P1-2: visitors module (lazy) ================= */
/* الزوار (Abacus، الحرارة، الليدر، الترند، تقارير الأخطاء) — بتتحمل
   بعد الرسم الأولي عبر initVisitorBox/initVisitorGeo/initTrending. */

import { $, t, esc, fmtNum, fetchJSON, state, flagOf, regionName, cardFm, featuredList, play, renderMap } from '../app.js';

var visitorJsonpSequence = 0;
var ABACUS_BASE = 'https://abacus.jasoncameron.dev';
var ABACUS_NAMESPACE = 'radio-atlas';
var ABACUS_KEY = 'views';

function visitorCounterRequest(action, params, key) {
  return new Promise(function (resolve, reject) {
    var callbackName = '__radioAtlasCounter' + (++visitorJsonpSequence);
    var script = document.createElement('script');
    var settled = false;
    var query = Object.assign({}, params || {});
    query.callback = callbackName;
    var queryString = Object.keys(query).map(function (name) {
      return encodeURIComponent(name) + '=' + encodeURIComponent(String(query[name]));
    }).join('&');
    function finish(error, data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (error) reject(error); else resolve(data);
    }
    window[callbackName] = function (data) { finish(null, data); };
    script.onerror = function () { finish(new Error('Abacus request failed')); };
    var timeout = setTimeout(function () {
      finish(new Error('Abacus request timed out'));
    }, 10000);
    script.src = ABACUS_BASE + '/' + action + '/' +
      encodeURIComponent(ABACUS_NAMESPACE) + '/' +
      encodeURIComponent(key || ABACUS_KEY) + (queryString ? '?' + queryString : '');
    script.async = true;
    document.head.appendChild(script);
  });
}

function renderVisitorValue(elementId, value) {
  var el = $(elementId);
  if (!el) return;
  var number = Number(value);
  el.textContent = Number.isFinite(number) && number >= 0 ? fmtNum(number) : '—';
}

var VISITOR_CACHE_KEY = 'ra-views';
var VISITOR_CACHE_TTL = 14 * 24 * 3600 * 1000;

function visitorCachedTotal() {
  try {
    var cached = JSON.parse(localStorage.getItem(VISITOR_CACHE_KEY) || 'null');
    if (cached && Number(cached.v) >= 0 && Date.now() - Number(cached.ts || 0) < VISITOR_CACHE_TTL) {
      return Number(cached.v);
    }
  } catch (e) {}
  return null;
}

function renderVisitorFallbackBadge() {
  // Abacus down and nothing cached: show a live Moe-Counter badge
  // instead of an unavailable label.
  var el = $('visitor-counter');
  if (!el || el.getAttribute('data-fallback-badge')) return;
  el.setAttribute('data-fallback-badge', '1');
  var img = document.createElement('img');
  img.src = 'https://count.getloli.com/get/@samotech-radio-atlas';
  img.alt = 'visitors';
  img.height = 28;
  img.style.verticalAlign = 'middle';
  el.textContent = '';
  el.appendChild(img);
}

function initVisitorBox() {
  // Show the last known total instantly, then count this visit via
  // Abacus (free counting API, jasoncameron.dev) using JSONP.
  var cachedTotal = visitorCachedTotal();
  if (cachedTotal != null) renderVisitorValue('visitor-counter', cachedTotal);
  visitorCounterRequest('hit', {})
    .then(function (data) {
      var value = Number(data && data.value);
      renderVisitorValue('visitor-counter', value);
      if (value >= 0) {
        try { localStorage.setItem(VISITOR_CACHE_KEY, JSON.stringify({ v: value, ts: Date.now() })); } catch (e) {}
      }
    })
    .catch(function (error) {
      console.warn('Radio Atlas total visitor counter:', error);
      if (visitorCachedTotal() == null) renderVisitorFallbackBadge();
    });
}

/* ---- visitor geography: country-level counts on the world map ---- */

var VISITOR_CC_POINTS = [
  { cc: 'EG', lat: 26.8, lon: 30.8 }, { cc: 'SA', lat: 24, lon: 45 },
  { cc: 'AE', lat: 24, lon: 54 }, { cc: 'KW', lat: 29.3, lon: 47.6 },
  { cc: 'QA', lat: 25.3, lon: 51.2 }, { cc: 'BH', lat: 26, lon: 50.55 },
  { cc: 'OM', lat: 21, lon: 57 }, { cc: 'JO', lat: 31.3, lon: 36.8 },
  { cc: 'LB', lat: 33.9, lon: 35.9 }, { cc: 'SY', lat: 35, lon: 38.5 },
  { cc: 'IQ', lat: 33, lon: 43.8 }, { cc: 'YE', lat: 15.5, lon: 48 },
  { cc: 'SD', lat: 15, lon: 30 }, { cc: 'LY', lat: 27, lon: 17 },
  { cc: 'DZ', lat: 28, lon: 2.7 }, { cc: 'TN', lat: 34, lon: 9.5 },
  { cc: 'MA', lat: 31.9, lon: -7 }, { cc: 'PS', lat: 31.9, lon: 35.2 },
  { cc: 'MR', lat: 20, lon: -10.5 }, { cc: 'SO', lat: 5, lon: 46 },
  { cc: 'DJ', lat: 11.5, lon: 43 }, { cc: 'KM', lat: -11.7, lon: 43.3 },
  { cc: 'US', lat: 39.8, lon: -98.6 }, { cc: 'CA', lat: 56, lon: -106 },
  { cc: 'GB', lat: 54, lon: -2 }, { cc: 'FR', lat: 46.6, lon: 2.4 },
  { cc: 'DE', lat: 51, lon: 10.4 }, { cc: 'NL', lat: 52.2, lon: 5.3 },
  { cc: 'ES', lat: 40.2, lon: -3.7 }, { cc: 'IT', lat: 42.8, lon: 12.6 },
  { cc: 'TR', lat: 39, lon: 35 }, { cc: 'RU', lat: 61, lon: 90 },
  { cc: 'SE', lat: 62, lon: 15 }, { cc: 'PL', lat: 52.2, lon: 19.1 },
  { cc: 'IN', lat: 21, lon: 78 }, { cc: 'PK', lat: 30, lon: 70 },
  { cc: 'ID', lat: -2, lon: 118 }, { cc: 'MY', lat: 4, lon: 102 },
  { cc: 'PH', lat: 12, lon: 122 }, { cc: 'JP', lat: 36.5, lon: 138 },
  { cc: 'CN', lat: 35, lon: 104 }, { cc: 'BR', lat: -10, lon: -52 },
  { cc: 'AU', lat: -25, lon: 134 }, { cc: 'ZA', lat: -29, lon: 25 },
  { cc: 'NG', lat: 9.5, lon: 8 }, { cc: 'KE', lat: 0.3, lon: 37.9 }
];
var VISITOR_GEO_CACHE_KEY = 'ra-visitor-geo';
var VISITOR_GEO_TTL = 30 * 24 * 3600 * 1000;
var VISITOR_HEAT_CACHE_KEY = 'ra-visitor-heat';
var VISITOR_HEAT_TTL = 24 * 3600 * 1000;
var visitorHeatBusy = false;
var visitorHeatLastTry = 0;

function visitorHeatDot(count, maxCount) {
  // Gold dot radius for the visitors map layer (0 = do not draw).
  var n = Number(count) || 0;
  var m = Number(maxCount) || 0;
  if (n <= 0 || m <= 0) return 0;
  return (2 + 6 * Math.sqrt(n / m)).toFixed(2);
}

function visitorLeadRows(vheat, limit) {
  // Top countries by visit count for the map leaderboard (pure helper).
  var rows = [];
  var src = vheat || {};
  for (var cc in src) {
    var n = Number(src[cc]) || 0;
    if (n > 0) rows.push({ cc: cc, n: n });
  }
  rows.sort(function (a, b) { return b.n - a.n; });
  return rows.slice(0, limit || 10);
}

function renderVisitorYou(cc, name, flag) {
  var el = $('visitor-you');
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode(t('you_from') + ' '));
  var b = document.createElement('b');
  b.textContent = (flag ? flag + ' ' : '') + (name || String(cc || '').toUpperCase());
  el.appendChild(b);
  el.hidden = false;
}

function countVisitorCountry(cc) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return;
  visitorCounterRequest('hit', {}, 'views-' + cc)
    .catch(function (error) { console.warn('Radio Atlas visitor country counter:', error); });
}

function initVisitorGeo() {
  // Detect the visitor country (ipwho.is, CORS-open) and count the visit
  // under a per-country Abacus key for the map visitors layer.
  var cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(VISITOR_GEO_CACHE_KEY) || 'null');
  } catch (e) {}
  if (cached && cached.cc && Date.now() - Number(cached.ts || 0) < VISITOR_GEO_TTL) {
    renderVisitorYou(cached.cc, cached.name, cached.flag);
    countVisitorCountry(cached.cc);
    return;
  }
  fetchJSON('https://ipwho.is/')
    .then(function (j) {
      if (!j || !j.success || !j.country_code) throw new Error('geo lookup failed');
      var cc = String(j.country_code).toUpperCase().slice(0, 2);
      var name = String(j.country || cc);
      var flag = j.flag && j.flag.emoji ? String(j.flag.emoji) : flagOf(cc);
      try { localStorage.setItem(VISITOR_GEO_CACHE_KEY, JSON.stringify({ cc: cc, name: name, flag: flag, ts: Date.now() })); } catch (e) {}
      renderVisitorYou(cc, name, flag);
      countVisitorCountry(cc);
    })
    .catch(function (error) { console.warn('Radio Atlas visitor geo:', error); });
}

function visitorHeatCached() {
  try {
    var cached = JSON.parse(localStorage.getItem(VISITOR_HEAT_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - Number(cached.ts || 0) < VISITOR_HEAT_TTL) return cached.data;
  } catch (e) {}
  return null;
}

function fetchVisitorHeat() {
  // Per-country visit counts for the map layer. One JSONP request every
  // 400ms respects the free Abacus rate limit; cached 24h in localStorage.
  var cached = visitorHeatCached();
  if (cached) { state.visitorHeat = cached; return; }
  if (visitorHeatBusy || Date.now() - visitorHeatLastTry < 600000) return;
  visitorHeatBusy = true;
  visitorHeatLastTry = Date.now();
  var merged = {};
  var chain = Promise.resolve();
  VISITOR_CC_POINTS.forEach(function (p, i) {
    chain = chain.then(function () {
      return visitorCounterRequest('get', {}, 'views-' + p.cc)
        .then(function (data) {
          var v = Number(data && data.value);
          if (Number.isFinite(v) && v > 0) merged[p.cc] = v;
        })
        .catch(function () {});
    });
    if (i < VISITOR_CC_POINTS.length - 1) {
      chain = chain.then(function () { return new Promise(function (r) { setTimeout(r, 400); }); });
    }
  });
  chain.then(function () {
    visitorHeatBusy = false;
    state.visitorHeat = merged;
    try { localStorage.setItem(VISITOR_HEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged })); } catch (e) {}
    if (state.activeTab === 'map' && state.mapLayers.visitors) renderMap();
  });
}

function renderVisitorLead() {
  // Ranked "top visiting countries" box under the map (visitors layer).
  var el = $('visitor-lead');
  if (!el) return;
  var vheat = state.visitorHeat || visitorHeatCached() || {};
  var rows = visitorLeadRows(vheat, 10);
  if (!rows.length || !state.mapLayers.visitors) { el.hidden = true; el.innerHTML = ''; return; }
  var max = rows[0].n;
  var html = '<h3 class="vlead-title">' + esc(t('visitor_lead_title')) + '</h3>';
  rows.forEach(function (r, i) {
    var w = Math.max(8, Math.round(100 * r.n / max));
    html += '<div class="vlead-row"><span class="vlead-rank">' + (i + 1) + '</span><span class="vlead-flag">' + flagOf(r.cc) + '</span><span class="vlead-name">' + esc(regionName(r.cc, r.cc)) + '</span><span class="vlead-bar"><span class="vlead-fill" style="width:' + w + '%"></span></span><b class="vlead-count">' + fmtNum(r.n) + '</b></div>';
  });
  el.innerHTML = html;
  el.hidden = false;
}

/* ---- trending: per-station play counts (Abacus play-<host/path>) ---- */

var PLAY_HEAT_CACHE_KEY = 'ra-play-heat';
var PLAY_HEAT_TTL = 24 * 3600 * 1000;
var playHeatBusy = false;
var playHeatLastTry = 0;

function playCountKey(url) {
  // Stable short key for per-station play counting (host + path, no query).
  try {
    var u = new URL(url);
    return 'play-' + u.hostname.replace(/^www\./, '') + u.pathname;
  } catch (e) { return ''; }
}

function trendingList(candidates, counts, limit) {
  // Candidate stations ranked by play count (pure helper; zeros masked).
  var out = [];
  var list = candidates || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var k = playCountKey(s && s.url);
    var n = k ? Number(counts && counts[k]) || 0 : 0;
    if (n > 0) out.push({ station: s, n: n });
  }
  out.sort(function (a, b) { return b.n - a.n; });
  return out.slice(0, limit || 10);
}

var playbackErrorReportedGen = -1;
function coarsePlaybackError(reason) {
  /* P1-4 basic error monitoring: classify a playback failure into one
     coarse kind so the daily report stays a small fixed set of counters. */
  var text = String(reason || '').toLowerCase();
  if (text.indexOf('token') !== -1) return 'token';
  if (text.indexOf('hls') !== -1) return 'hls';
  if (text === 'html audio element error') {
    try {
      var mediaError = $('audio') && $('audio').error;
      var code = mediaError && mediaError.code;
      if (code === 1) return 'abort';
      if (code === 2) return 'network';
      if (code === 3) return 'decode';
      if (code === 4) return 'src';
    } catch (e) {}
  }
  return 'other';
}
function reportPlaybackError(generation, reason) {
  /* Fire-and-forget like the play counter: +1 on err-total and the coarse
     failure kind key. One report per playback generation so automatic
     retries through alternative sources do not inflate the counts. */
  if (generation === playbackErrorReportedGen) return;
  playbackErrorReportedGen = generation;
  visitorCounterRequest('hit', {}, 'err-total').catch(function () {});
  visitorCounterRequest('hit', {}, 'err-' + coarsePlaybackError(reason)).catch(function () {});
}

function countStationPlay(url) {
  // Fire-and-forget: +1 on this station's Abacus play key.
  var key = playCountKey(url);
  if (!key) return;
  state.playHeat = state.playHeat || {};
  state.playHeat[key] = (Number(state.playHeat[key]) || 0) + 1;
  renderTrending();
  visitorCounterRequest('hit', {}, key)
    .catch(function (error) { console.warn('Radio Atlas play counter:', error); });
}

function playHeatCached() {
  try {
    var cached = JSON.parse(localStorage.getItem(PLAY_HEAT_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - Number(cached.ts || 0) < PLAY_HEAT_TTL) return cached.data;
  } catch (e) {}
  return null;
}

function fetchPlayHeat() {
  // Play counts for the trending shelf candidates (the featured list).
  // One JSONP get every 400ms respects the free Abacus rate limit; cached 24h.
  var cached = playHeatCached();
  if (cached) { state.playHeat = cached; renderTrending(); return; }
  if (playHeatBusy || Date.now() - playHeatLastTry < 600000) return;
  var candidates = featuredList();
  if (!candidates.length) return;
  playHeatBusy = true;
  playHeatLastTry = Date.now();
  var merged = {};
  var chain = Promise.resolve();
  candidates.forEach(function (s, i) {
    var key = playCountKey(s.url);
    if (!key) return;
    chain = chain.then(function () {
      return visitorCounterRequest('get', {}, key)
        .then(function (data) {
          var v = Number(data && data.value);
          if (Number.isFinite(v) && v > 0) merged[key] = v;
        })
        .catch(function () {});
    });
    if (i < candidates.length - 1) {
      chain = chain.then(function () { return new Promise(function (r) { setTimeout(r, 400); }); });
    }
  });
  chain.then(function () {
    playHeatBusy = false;
    state.playHeat = merged;
    try { localStorage.setItem(PLAY_HEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged })); } catch (e) {}
    renderTrending();
  });
}

function renderTrending() {
  var wrap = $('trending-wrap');
  if (!wrap) return;
  var counts = state.playHeat || playHeatCached() || {};
  var rows = trendingList(featuredList(), counts, 10);
  if (!rows.length) { wrap.hidden = true; return; }
  var html = '';
  for (var i = 0; i < rows.length; i++) html += cardFm(rows[i].station);
  $('trending-row').innerHTML = html;
  wrap.hidden = false;
}

function initTrending() {
  // Called once the catalog is loaded: paint cached counts, refresh if stale.
  renderTrending();
  fetchPlayHeat();
}

/* ================= KiwiSDR WebSocket audio (experimental) ================= */


export { initVisitorBox, initVisitorGeo, initTrending, countStationPlay, reportPlaybackError, coarsePlaybackError, visitorHeatDot, visitorLeadRows, trendingList, playCountKey, fetchVisitorHeat, visitorHeatCached, renderVisitorLead, VISITOR_CC_POINTS };
