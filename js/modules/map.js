/* ================= P1-2: map module (lazy) ================= */
/* الخريطة (الإسقاط، التضاريس، الطائرات، نقاط الزوار) — بتتحمل عند أول
   فتح لتبويب الخريطة عبر mapTabOpened(). */

import { $, t, esc, fmtNum, fetchJSON, state, flagOf, CAIRO } from '../app.js';
import { fetchVisitorHeat, visitorHeatCached, visitorHeatDot, renderVisitorLead, VISITOR_CC_POINTS } from './visitors.js';

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


var mapOpened = false;
function mapTabOpened() {
  if (mapOpened) return;
  mapOpened = true;
  loadLand();
  renderMap();
}

export { renderMap, mapItems, fetchAircraft, loadLand, mapTabOpened };
