/* ================= P1-2: catalog module (lazy) ================= */
/* الكتالوج التفاضلي (IndexedDB + دلتات يومية) — بيتحمل مع أول
   loadStations() بعد الرسم الأولي. */

import { $, state, fetchJSON, normalizeFm, buildFMFacets, renderFM, handleShareHash, loadStreamChecks, initResume, initTrending, renderFav, renderEG, renderAR, renderRel } from '../app.js';

/* ===== P1-1: differential catalog via IndexedDB ===== */
/* الزيارة الثانية بتنزل دلتا يومية صغيرة بدل الكتالوج كاملًا كل مرة.
   المصدر: data/stations.manifest.json (version/count/keep) وسلسلة
   data/stations_delta/<version>.json — الـ crawler بيكتبهم مع كل تشغيل
   بيانات ناجح. لو IndexedDB أو الشبكة فشلوا، بنرجع تلقائيًا للمسار
   القديم (head ثم الكتالوج الكامل) من غير أي كسر. */
var CATALOG_DB_NAME = 'radio-atlas-catalog';
var CATALOG_DB_STORE = 'catalog';
var CATALOG_DELTA_FALLBACK_KEEP = 3;

function stationKey(value) {
  /* توأم دالة الـ crawler station_url_key: توحيد شكل الرابط ليطابق
     المفتاح نفسه على الطرفين (سجل اختبار: tests/search.test.cjs). */
  var raw = String(value || '').trim();
  var u;
  try { u = new URL(raw); } catch (e) { return ''; }
  var scheme = u.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return '';
  if (!u.hostname || u.username || u.password) return '';
  var host = u.hostname.toLowerCase();
  if (u.port && !(scheme === 'http' && u.port === '80') && !(scheme === 'https' && u.port === '443')) {
    host += ':' + u.port;
  }
  return scheme + '://' + host + (u.pathname || '/') + (u.search || '');
}

function applyCatalogDelta(rows, delta) {
  /* تطبيق دلتا {added, updated, removed} على الصفوف المحفوظة:
     updated يعدل الصف في مكانه بنفس المفتاح، added يُلحق في النهاية،
     removed يشطب بالمفتاح. الحقول الناقصة تتعامل كفارغة. */
  var source = Array.isArray(rows) ? rows : [];
  var d = delta || {};
  var added = Array.isArray(d.added) ? d.added : [];
  var updated = Array.isArray(d.updated) ? d.updated : [];
  var removed = Array.isArray(d.removed) ? d.removed : [];
  var removedSet = {};
  var i;
  for (i = 0; i < removed.length; i++) removedSet[stationKey(removed[i])] = true;
  var byKey = {};
  for (i = 0; i < source.length; i++) byKey[stationKey(source[i].url)] = source[i];
  for (i = 0; i < updated.length; i++) {
    var upd = updated[i];
    var key = stationKey(upd && upd.url);
    if (!key || !upd) continue;
    if (byKey[key]) byKey[key] = upd;
    else source.push(upd);
  }
  var out = [];
  for (i = 0; i < source.length; i++) {
    var k = stationKey(source[i].url);
    if (removedSet[k]) continue;
    out.push(byKey[k] || source[i]);
  }
  for (i = 0; i < added.length; i++) {
    if (added[i]) out.push(added[i]);
  }
  return out;
}

function catalogDbOpen() {
  return new Promise(function (resolve, reject) {
    var request = window.indexedDB.open(CATALOG_DB_NAME, 1);
    request.onupgradeneeded = function () {
      request.result.createObjectStore(CATALOG_DB_STORE);
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error('idb open failed')); };
  });
}

function catalogDbGet(db, key) {
  return new Promise(function (resolve, reject) {
    var request = db.transaction(CATALOG_DB_STORE, 'readonly').objectStore(CATALOG_DB_STORE).get(key);
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error('idb get failed')); };
  });
}

function catalogDbPut(db, key, value) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(CATALOG_DB_STORE, 'readwrite');
    tx.objectStore(CATALOG_DB_STORE).put(value, key);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error || new Error('idb put failed')); };
  });
}

function catalogIdbWrite(rows, version) {
  return catalogDbOpen().then(function (db) {
    return catalogDbPut(db, 'rows', rows).then(function () {
      return catalogDbPut(db, 'version', version);
    });
  });
}

function catalogIdbStoreFull(rows) {
  return fetchJSON('data/stations.manifest.json').then(function (manifest) {
    return catalogIdbWrite(rows, manifest && Number(manifest.version) || 0);
  }).catch(function () {
    return catalogIdbWrite(rows, 0);
  });
}

function catalogIdbRows() {
  if (!window.indexedDB) return Promise.resolve(null);
  return catalogDbOpen().then(function (db) {
    return catalogDbGet(db, 'rows').then(function (rows) {
      if (!rows || !rows.length) return null;
      return catalogDbGet(db, 'version').then(function (storedVersion) {
        var from = Number(storedVersion) || 0;
        return fetchJSON('data/stations.manifest.json').then(function (manifest) {
          if (!manifest || !manifest.version) return rows;
          var current = Number(manifest.version) || 0;
          if (!from || !current || current <= from) return rows;
          var keep = Number(manifest.keep) || CATALOG_DELTA_FALLBACK_KEEP;
          if (current - from > keep) return null;
          var chain = Promise.resolve(rows);
          for (var v = from + 1; v <= current; v++) {
            (function (version) {
              chain = chain.then(function (acc) {
                return fetchJSON('data/stations_delta/' + version + '.json').then(function (delta) {
                  return applyCatalogDelta(acc, delta);
                }, function () { return acc; });
              });
            })(v);
          }
          return chain.then(function (finalRows) {
            catalogIdbWrite(finalRows, current).catch(function () {});
            return finalRows;
          });
        }, function () { return rows; });
      });
    });
  }).catch(function () { return null; });
}

function finishStations(rows) {
  state.fm = rows.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
  state.featuredCache = null;
  buildFMFacets();
  renderFM();
  renderFav();
  renderEG();
  renderAR();
  renderRel();
  initTrending();
  initResume();
  loadStreamChecks();
  handleShareHash();
}

function loadStations() {
  return catalogIdbRows().then(function (hit) {
    if (hit) return finishStations(hit);
    return legacyLoadStations();
  });
}

function legacyLoadStations() {
  return fetchJSON('data/stations_head.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
      renderFM();
      renderFav();
      renderEG();
      renderAR();
      renderRel();
    }
  }).catch(function (e) {
    console.warn('stations head:', e);
  }).then(function () {
    return fetchJSON('data/stations.json');
  }).then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
      catalogIdbStoreFull(data.stations).catch(function () {});
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(function () {
    renderFM();
    renderFav();
    renderEG();
    renderAR();
    renderRel();
    initTrending();
    initResume();
    loadStreamChecks();
    handleShareHash();
  });
}


export { loadStations, stationKey, applyCatalogDelta };
