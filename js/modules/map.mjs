/* =====================================================================
   Radio Atlas — map module (receiver world map + visitor heat layer)
   Split out of js/app.js in P1-2; loaded lazily via loadModule('map').
   Reuses the globals of js/app.js (classic script). ES modules run in strict
   mode: every assignment below targets a declared or inherited binding.
   ===================================================================== */


var STR_MAP = {
  ar: {
    map_title: 'خريطة أجهزة الاستقبال العالمية',
    map_hint: 'توزيع أجهزة الاستقبال حول العالم — دوس على أي نقطة لفتح الجهاز في نافذة جديدة.',
    map_layer_kiwi: 'KiwiSDR',
    map_layer_websdr: 'WebSDR',
    map_layer_owrx: 'OpenWebRX',
    map_layer_satnogs: 'SatNOGS',
    map_layer_gray: 'الخط الرمادي',
    map_layer_aircraft: '✈️ الطائرات',
    map_layer_visitors: '🌍 الزوار',
    visitors_dot: '{n} زائر',
    visitor_lead_title: 'أكثر البلاد زيارةً',
    map_count: '{n} جهاز على الخريطة'
  },
  en: {
    map_title: 'World receiver map',
    map_hint: 'Receiver locations worldwide — click any dot to open it in a new tab.',
    map_layer_kiwi: 'KiwiSDR',
    map_layer_websdr: 'WebSDR',
    map_layer_owrx: 'OpenWebRX',
    map_layer_satnogs: 'SatNOGS',
    map_layer_gray: 'Grayline',
    map_layer_aircraft: '✈️ Aircraft',
    map_layer_visitors: '🌍 Visitors',
    visitors_dot: '{n} visitors',
    visitor_lead_title: 'Top visiting countries',
    map_count: '{n} receivers on the map'
  }
};



/* ================= Receiver world map ================= */

function mapXY(lat, lon) {
  var x = (Number(lon) + 180) / 360;
  var y = (90 - Number(lat)) / 180;
  return [Math.round(x * 7200) / 10, Math.round(y * 3600) / 10];
}

function mapTopoLand(topo) {
  if (!topo || !topo.transform || !Array.isArray(topo.arcs) || !topo.objects) return '';
  var tf = topo.transform;
  var sx = tf.scale[0], sy = tf.scale[1], tx = tf.translate[0], ty = tf.translate[1];
  var arcs = topo.arcs.map(function (arc) {
    var x = 0, y = 0;
    return arc.map(function (pt) {
      x += pt[0]; y += pt[1];
      return [x * sx + tx, y * sy + ty];
    });
  });
  function ringPath(indices) {
    var pts = [];
    indices.forEach(function (idx) {
      var rev = idx < 0;
      var a = arcs[rev ? ~idx : idx] || [];
      var seg = rev ? a.slice().reverse() : a;
      seg.forEach(function (p) {
        if (!pts.length || p[0] !== pts[pts.length - 1][0] || p[1] !== pts[pts.length - 1][1]) pts.push(p);
      });
    });
    if (pts.length < 3) return '';
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    for (var i = 1; i < pts.length; i++) d += 'L' + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2);
    return d + 'Z';
  }
  var dAll = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.type === 'Polygon') {
      (obj.arcs || []).forEach(function (r) { dAll.push(ringPath(r)); });
    } else if (obj.type === 'MultiPolygon') {
      (obj.arcs || []).forEach(function (poly) {
        poly.forEach(function (r) { dAll.push(ringPath(r)); });
      });
    } else if (obj.type === 'GeometryCollection') {
      (obj.geometries || []).forEach(walk);
    }
  }
  walk(topo.objects.land || topo.objects.countries);
  return dAll.join('');
}

function subSolar(d) {
  var start = Date.UTC(d.getUTCFullYear(), 0, 0);
  var day = Math.floor((d.getTime() - start) / 86400000);
  var decl = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10));
  var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  var lon = -15 * (utcH - 12);
  while (lon <= -180) lon += 360;
  while (lon > 180) lon -= 360;
  return [decl, lon];
}

function mapNightPath() {
  var s = subSolar(new Date());
  var dec = s[0], lonSun = s[1];
  var rad = Math.PI / 180;
  var tanDec = Math.tan(dec * rad);
  var pts = [];
  for (var lon = -180; lon <= 180; lon += 3) {
    var t = -Math.cos((lon - lonSun) * rad) / tanDec;
    if (isNaN(t)) t = 0;
    pts.push(mapXY(Math.atan(t) / rad, lon));
  }
  var d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (var i = 1; i < pts.length; i++) d += 'L' + pts[i][0] + ' ' + pts[i][1];
  var edgeY = mapXY(dec >= 0 ? -90 : 90, 0)[1];
  d += 'L720 ' + edgeY + 'L0 ' + edgeY + 'Z';
  return { night: d, sun: mapXY(dec, lonSun) };
}

function mapItems() {
  var items = [];
  function push(layer, r, lat, lon) {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
    items.push({ layer: layer, name: r.name, loc: r.loc || '', url: r.url, lat: Number(lat), lon: Number(lon) });
  }
  if (state.mapLayers.kiwi) {
    (state.receivers || []).forEach(function (r) {
      if (r.gpsCoords) push('kiwi', r, r.gpsCoords[0], r.gpsCoords[1]);
    });
  }
  if (state.webSdrs && state.mapLayers.websdr) {
(state.webSdrs.websdr || []).forEach(function (r) { push('websdr', r, r.lat, r.lon); });
  }
  if (state.webSdrs && state.mapLayers.owrx) {
(state.webSdrs.openwebrx || []).forEach(function (r) { push('owrx', r, r.lat, r.lon); });
  }
  if (state.satnogs && state.mapLayers.satnogs) {
(state.satnogs.stations || []).forEach(function (r) { push('satnogs', r, r.lat, r.lng); });
  }
  return items;
}

var AIRCRAFT_APIS = ['https://api.adsb.lol', 'https://api.airplanes.live'];
var AIRCRAFT_RADIUS_NM = 250;
var lastAircraftFetch = 0;
/* Live ADS-B aircraft near the map center — community aggregators, no key, 1 req/min max */
function fetchAircraft() {
  var nowMs = Date.now();
  if (nowMs - lastAircraftFetch < 55000) return;
  lastAircraftFetch = nowMs;
  var g = state.geo || CAIRO;
  var i = 0;
  function attempt() {
    if (i >= AIRCRAFT_APIS.length) return;
    var base = AIRCRAFT_APIS[i++];
    fetch(base + '/v2/point/' + Number(g.lat).toFixed(2) + '/' + Number(g.lon).toFixed(2) + '/' + AIRCRAFT_RADIUS_NM, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.ac)) { attempt(); return; }
        state.aircraft = j.ac.filter(function (a) {
          return a && typeof a.lat === 'number' && typeof a.lon === 'number';
        }).map(function (a) {
          var nm = (a.flight || a.r || a.hex || '').toString().trim();
          var det = [];
          if (a.alt_baro != null) det.push(fmtNum(a.alt_baro) + ' ft');
          if (a.gs != null) det.push(Math.round(a.gs) + ' kt');
          if (a.t) det.push(a.t);
          return { name: '✈️ ' + (nm || '?'), loc: det.join(' · '), lat: a.lat, lon: a.lon };
        });
        var ac = $('map-aircraft-count');
        if (ac) { ac.textContent = '✈️ ' + fmtNum(state.aircraft.length); ac.hidden = false; }
        if (state.activeTab === 'map') renderMap();
      })
      .catch(function () { attempt(); });
  }
  attempt();
}

function renderMap() {
  var wrap = $('map-wrap');
  if (!wrap) return;
  $('map-count').textContent = t('map_count').replace('{n}', fmtNum(mapItems().length));
  var items = mapItems();
  var land = mapTopoLand(state.landMap);
  var svg = '<svg id="map-svg" viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(t('map_title')) + '">';
  svg += '<rect class="map-sea" x="0" y="0" width="720" height="360"></rect>';
  if (land) svg += '<path class="map-land" d="' + land + '"></path>';
  if (state.grayline) {
    var g = mapNightPath();
    svg += '<path class="map-night" d="' + g.night + '"></path>';
    svg += '<circle class="map-sun" cx="' + g.sun[0] + '" cy="' + g.sun[1] + '" r="3"></circle>';
  }
  if (state.mapLayers.aircraft && state.activeTab === 'map') fetchAircraft();
  var nowD = new Date();
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var ck = $('map-clock');
  if (ck) ck.textContent = p2(nowD.getUTCHours()) + ':' + p2(nowD.getUTCMinutes()) + ' UTC';
  items.forEach(function (it, i) {
    var xy = mapXY(it.lat, it.lon);
    svg += '<circle class="map-dot map-dot-' + it.layer + '" data-map-idx="' + i + '" cx="' + xy[0] + '" cy="' + xy[1] + '" r="1.8"><title>' + esc(it.name + (it.loc ? ' — ' + it.loc : '')) + '</title></circle>';
  });
  if (state.aircraft && state.mapLayers.aircraft) {
    state.aircraft.forEach(function (a) {
      var axy = mapXY(a.lat, a.lon);
      svg += '<circle class="map-dot-aircraft" cx="' + axy[0] + '" cy="' + axy[1] + '" r="1.6"><title>' + esc(a.name + (a.loc ? ' — ' + a.loc : '')) + '</title></circle>';
    });
  }
  if (state.mapLayers.visitors) {
    var vheat = state.visitorHeat || visitorHeatCached() || {};
    state.visitorHeat = vheat;
    if (state.activeTab === 'map') fetchVisitorHeat();
    var vMax = 0;
    VISITOR_CC_POINTS.forEach(function (p) { if (Number(vheat[p.cc]) > vMax) vMax = Number(vheat[p.cc]); });
    if (vMax > 0) {
      VISITOR_CC_POINTS.forEach(function (p) {
        var vn = Number(vheat[p.cc]) || 0;
        var vr = visitorHeatDot(vn, vMax);
        if (!vr) return;
        var vxy = mapXY(p.lat, p.lon);
        svg += '<circle class="map-dot-visitors" cx="' + vxy[0] + '" cy="' + vxy[1] + '" r="' + vr + '"><title>' + esc(flagOf(p.cc) + ' ' + p.cc + ' — ' + t('visitors_dot').replace('{n}', fmtNum(vn))) + '</title></circle>';
      });
    }
  }
  svg += '</svg>';
  wrap.innerHTML = svg;
  renderVisitorLead();
}

function loadLand() {
  return fetchJSON('data/land_map.json').then(function (data) {
    if (data && data.topo) {
      state.landMap = data.topo;
      renderMap();
    }
  }).catch(function (e) {
    console.warn('land map snapshot:', e);
  });
}



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


var VISITOR_HEAT_CACHE_KEY = 'ra-visitor-heat';
var VISITOR_HEAT_TTL = 24 * 3600 * 1000;
var visitorHeatBusy = false;
var visitorHeatLastTry = 0;



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



var API = { renderMap: renderMap };
var booted = false;
export function boot() {
  if (booted) return API;
  booted = true;
  RA_MODULES.map = API;
  raMergeStr(STR_MAP);
  applyI18n();
  loadLand();
  fetchVisitorHeat();
  renderMap();
  loadModule('sdr').then(function () { renderMap(); });

  var mapWrap = $('map-wrap');
  if (mapWrap) mapWrap.addEventListener('click', function (e) {
    var dot = e.target && e.target.closest ? e.target.closest('.map-dot') : null;
    if (!dot) return;
    var it = mapItems()[Number(dot.getAttribute('data-map-idx'))];
    if (it && it.url && /^https?:/i.test(it.url)) window.open(it.url, '_blank', 'noopener');
  });
  var mapLayersBox = $('map-layers');
  if (mapLayersBox) mapLayersBox.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button.map-layer') : null;
    if (!btn) return;
    var k = btn.getAttribute('data-layer');
    if (k === 'gray') { state.grayline = !state.grayline; }
    else { state.mapLayers[k] = !state.mapLayers[k]; }
    if (k === 'aircraft' && state.mapLayers[k]) fetchAircraft();
    btn.classList.toggle('active', k === 'gray' ? state.grayline : state.mapLayers[k]);
    renderMap();
  });


  return API;
}
