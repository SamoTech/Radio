/* =====================================================================
   Radio Atlas — sdr module (KiwiSDR / WebSDR / WSPR / space weather / EIBI panels)
   Split out of js/app.js in P1-2; loaded lazily via loadModule('sdr').
   Reuses the globals of js/app.js (classic script). ES modules run in strict
   mode: every assignment below targets a declared or inherited binding.
   ===================================================================== */


var STR_SDR = {
  ar: {
    sdr_filters: 'فلاتر الاستقبال المتقدمة',
    sdr_tools: 'حالة النطاقات وجداول البث',
    search_sdr_ph: 'ابحث: اسم، بلد، نداء…',
    search_sdr_aria: 'البحث في أجهزة الاستقبال',
    all_bands: 'كل النطاقات',
    sort_snr: 'الأفضل SNR',
    sort_free: 'أكبر مساحة فاضية',
    sort_users: 'الأقل ازدحامًا',
    sort_name: 'الاسم',
    sort_near: 'الأقرب لي',
    online_only: 'أونلاين فقط',
    free_only: 'فيه مكان فاضي',
    snr_min: 'SNR ≥',
    https_only: 'شغال داخل التطبيق',
    sdr_hint: '🎧 شغّل أجهزة KiwiSDR المسموح بها مباشرة من راديو أطلس. أجهزة HTTP تحتاج وسيط WebSocket منشور؛ وضع التشغيل يظهر بوضوح لكل جهاز.',
    no_band: 'غير محدد',
    no_match: 'مفيش نتائج مطابقة — جرب تخفف الفلاتر.',
    results: '{n} نتيجة',
    more_rx: 'عرض المزيد — باقي {n} جهاز',
    geo_fallback: 'موقعك مش متاح — الترتيب حسب المسافة من القاهرة',
    listen_in_app: '🎧 استمع داخل التطبيق',
    open_ext: 'افتح الجهاز ↗',
    wspr_title: 'نشاط الانتشار الفعلي — WSPR (آخر ساعتين)',
    wspr_hint: 'عدد إشارات WSPR المستلمة في كل نطاق مقياس مباشر لانفتاح النطاق — وأطول المسارات أوضح دليل على المسارات المفتوحة الآن.',
    websdr_title: 'أجهزة WebSDR',
    owrx_title: 'أجهزة OpenWebRX',
    satnogs_title: 'محطات SatNOGS الأرضية',
    satnogs_type: 'SatNOGS',
    space_title: 'حالة النطاقات (بيانات NOAA SWPC)',
    updated_at: 'آخر تحديث',
    cond_good: 'الظروف مستقرة — النطاقات العليا (14–28 MHz) غالبًا مفتوحة.',
    cond_unstable: 'اضطراب متوسط — استقبل النطاقات المنخفضة (3–10 MHz).',
    cond_storm: 'عاصفة مغناطيسية — النطاقات العليا مغلقة والمسارات القطبية مشوشة.',
    alert_aria: 'تنبيهات حالة النطاقات',
    alert_unsupported: 'المتصفح ده مش بيدعم الإشعارات',
    alert_on: '🔔 التنبيهات شغالة — هنبلغك لما ظروف الاستقبال تتغير',
    alert_off: '🔕 التنبيهات مقفولة',
    alert_open_title: 'النطاقات العالية اتفتحت 🔥',
    alert_open_body: 'Kp {kp} — ظروف ممتازة للنطاقات العالية (14–28 MHz). فرصتك تسدّق دلوقتي!',
    alert_storm_title: 'عاصفة مغناطيسية ⛈',
    alert_storm_body: 'Kp {kp} — النطاقات العليا اتقفلت؛ استقبل النطاقات المنخفضة (3–10 MHz).',
    alert_toast_open: 'النطاقات اتفتحت (Kp {kp}) — ظروف ممتازة للنطاقات العالية 🔥',
    alert_toast_storm: 'عاصفة مغناطيسية (Kp {kp}) — النطاقات العليا مقفولة ⛈',
    eibi_title: 'بث موجات قصيرة على الهواء الآن',
    eibi_hint: 'من جدول EIBI — ترددات تُبث الآن (UTC). قرّب التردد على أي جهاز استقبال بالأسفل لسماعه.',
    eibi_ph: 'ابحث في البث الحالي: اسم، تردد…',
    onair: 'بث على الهواء',
    eibi_band_aria: 'اختر نطاق البث',
    eibi_search_aria: 'ابحث في بث الموجات القصيرة الجاري',
    more_eibi: 'تُعرض أول 60 نتيجة — دقّق البحث لعرض المزيد.',
    kiwi_audio: '🎧 صوت مباشر (تجريبي)',
    kiwi_connecting: 'جاري الاتصال بالجهاز…',
    kiwi_live: 'يستقبل ✔',
    kiwi_failed: 'تعذر الاتصال الصوتي بالجهاز — يمكن فتح صفحة الجهاز الأصلية عند الحاجة',
    kiwi_freq: 'التردد (kHz)',
    kiwi_mode: 'الوضع'
  },
  en: {
    sdr_filters: 'Advanced receiver filters',
    sdr_tools: 'Band conditions and broadcast schedules',
    search_sdr_ph: 'Search: name, country, callsign…',
    search_sdr_aria: 'Search receivers',
    all_bands: 'All bands',
    sort_snr: 'Best SNR',
    sort_free: 'Most free slots',
    sort_users: 'Least crowded',
    sort_name: 'Name',
    sort_near: 'Nearest to me',
    online_only: 'Online only',
    free_only: 'Has a free slot',
    snr_min: 'SNR ≥',
    https_only: 'Playable in-app',
    sdr_hint: '🎧 Listen to permitted KiwiSDR receivers directly in Radio Atlas. HTTP receivers need a deployed WebSocket relay; each receiver shows its available connection type.',
    no_band: 'Unspecified',
    no_match: 'No matching results — try lighter filters.',
    results: '{n} results',
    more_rx: 'Show more — {n} receivers left',
    geo_fallback: 'Location unavailable — sorted by distance from Cairo',
    listen_in_app: '🎧 Listen in app',
    open_ext: 'Open receiver ↗',
    wspr_title: 'Observed propagation — WSPR (last 2 hours)',
    wspr_hint: 'WSPR spots received per band directly measure how open each band is — the longest heard paths show the clearest open routes right now.',
    websdr_title: 'WebSDR receivers',
    owrx_title: 'OpenWebRX receivers',
    satnogs_title: 'SatNOGS ground stations',
    satnogs_type: 'SatNOGS',
    space_title: 'Band conditions (NOAA SWPC data)',
    updated_at: 'Updated',
    cond_good: 'Conditions are stable — high bands (14–28 MHz) are likely open.',
    cond_unstable: 'Moderate disturbance — favor lower bands (3–10 MHz).',
    cond_storm: 'Geomagnetic storm — high bands closed, polar paths disturbed.',
    alert_aria: 'Band condition alerts',
    alert_unsupported: 'This browser does not support notifications',
    alert_on: '🔔 Alerts on — you will be notified when conditions change',
    alert_off: '🔕 Alerts off',
    alert_open_title: 'High bands are open 🔥',
    alert_open_body: 'Kp {kp} — great conditions for high bands (14–28 MHz). Tune in now!',
    alert_storm_title: 'Geomagnetic storm ⛈',
    alert_storm_body: 'Kp {kp} — high bands are closed; favor lower bands (3–10 MHz).',
    alert_toast_open: 'Bands opened (Kp {kp}) — great high-band conditions 🔥',
    alert_toast_storm: 'Geomagnetic storm (Kp {kp}) — high bands closed ⛈',
    eibi_title: 'Shortwave broadcasts on air now',
    eibi_hint: 'From the EIBI schedule — frequencies broadcasting now (UTC). Tune one on any receiver below to listen.',
    eibi_ph: 'Search the current broadcast: name, frequency…',
    onair: 'on air',
    eibi_band_aria: 'Select broadcast band',
    eibi_search_aria: 'Search the current shortwave broadcast',
    all_bands: 'All bands',
    more_eibi: 'Showing the first 60 — refine your search to see more.',
    kiwi_audio: '🎧 Direct audio (beta)',
    kiwi_connecting: 'Connecting to the receiver…',
    kiwi_live: 'Receiving ✔',
    kiwi_failed: 'Could not connect to receiver audio — the original receiver page remains available',
    kiwi_freq: 'Frequency (kHz)',
    kiwi_mode: 'Mode'
  }
};



/* ================= KiwiSDR ================= */

function normalizeRx(r) {
  var url = safeHttpUrl(r.url || '');
  return {
    name: r.name || '—',
    url: url,
    https: /^https:/i.test(url),
    online: !!r.online,
    users: Number(r.users) || 0,
    maxUsers: Number(r.max_users) || 0,
    snr: r.snr == null ? null : Number(r.snr),
    gps: !!r.gps,
    gpsCoords: Array.isArray(r.gps) && r.gps.length === 2 ? [Number(r.gps[0]), Number(r.gps[1])] : null,
    band: r.band || '',
    loc: r.loc || '',
    antenna: r.antenna || '',
    extApi: r.ext_api == null ? 0 : (Number(r.ext_api) || 0),
    type: 'kiwi'
  };
}

function loadKiwi() {
  return fetchJSON('data/kiwisdr.json').then(function (data) {
    if (data && Array.isArray(data.receivers)) {
      state.receivers = data.receivers.map(normalizeRx);
      state.updated = data.updated;
      renderMap();
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
    var b = r.band || t('no_band');
    bands[b] = (bands[b] || 0) + 1;
  });
  var keys = Object.keys(bands).sort(function (a, b) { return bands[b] - bands[a]; });
  sel.innerHTML = '<option value="all">' + esc(t('all_bands')) + '</option>' + keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + ' (' + bands[k] + ')</option>';
  }).join('');
  sel.value = state.filters.band;
}

var CAIRO = { lat: 30.0444, lon: 31.2357 };
function havKm(a, b) {
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLon = (b.lon - a.lon) * rad;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(x)));
}
function ensureGeo(cb) {
  if (state.geo) return cb(state.geo);
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('ra-geo') || 'null'); } catch (e) { saved = null; }
  if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') { state.geo = saved; return cb(state.geo); }
  if (!navigator.geolocation) { state.geo = CAIRO; toast(t('geo_fallback')); return cb(state.geo); }
  navigator.geolocation.getCurrentPosition(function (p) {
    state.geo = { lat: p.coords.latitude, lon: p.coords.longitude };
    try { localStorage.setItem('ra-geo', JSON.stringify(state.geo)); } catch (e) {}
    cb(state.geo);
  }, function () {
    state.geo = CAIRO;
    toast(t('geo_fallback')); // fallback center
    cb(state.geo);
  }, { timeout: 8000 });
}

function applyFilters() {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var list = state.receivers.filter(function (r) {
    if (f.onlineOnly && !r.online) return false;
    if (f.httpsOnly && !r.https) return false;
    if (state.geo && r.gpsCoords) r.dist = havKm(state.geo, { lat: r.gpsCoords[0], lon: r.gpsCoords[1] }); else r.dist = null;
    if (f.band !== 'all' && (r.band || t('no_band')) !== f.band) return false;
    if (f.freeOnly && !(r.maxUsers > 0 && r.users < r.maxUsers)) return false;
    if (f.minSnr > 0 && !(r.snr != null && r.snr >= f.minSnr)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.url + ' ' + r.band + ' ' + r.loc + ' ' + r.antenna).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    var rxType = f.rxType || 'all';
    if (rxType !== 'all') {
      if (rxType === 'kiwi' && r.type !== 'kiwi') return false;
      if (rxType === 'websdr' && r.type !== 'websdr') return false;
      if (rxType === 'owrx' && r.type !== 'owrx') return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (f.sort === 'name') return a.name.localeCompare(b.name, state.lang);
    if (f.sort === 'near') {
      var da = a.dist == null ? Infinity : a.dist;
      var db = b.dist == null ? Infinity : b.dist;
      return da - db;
    }
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
  if (r.dist != null) chips += '<span class="chip">🧭 ' + fmtNum(r.dist) + ' km</span>';
  var action = '';
  if (r.url) {
    action = r.https
      ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('listen_in_app')) + '</button>'
      : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(t('open_ext')) + '</a>';
  }
  if (r.url && r.extApi > 0 && (r.https || KIWI_WS_RELAY)) {
    action = '<button class="open kiwi-ws" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '" title="' + esc(t('kiwi_audio')) + '">' + esc(t('kiwi_audio')) + '</button>' + action;
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
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    $('count-sdr').textContent = '';
    return;
  }
  var list = applyFilters();
  $('count-sdr').textContent = t('results').replace('{n}', fmtNum(list.length));
  grid.innerHTML = list.length ? list.map(cardRx).join('')
    : '<div class="empty">' + esc(t('no_match')) + '</div>';
}

/* ================= WSPR observed propagation ================= */

var WSPR_BAND_LABELS = { '-1': '2200m', 0: '630m', 1: '160m', 3: '80m', 5: '60m', 7: '40m', 10: '30m', 14: '20m', 18: '17m', 21: '15m', 24: '12m', 28: '10m', 27: '11m', 40: '8m', 50: '6m', 70: '4m', 144: '2m', 430: '70cm', 432: '70cm', 1296: '23cm' };

function wsprBandLabel(b) {
  var key = Number(b);
  return WSPR_BAND_LABELS[key] || (key + ' MHz');
}

function renderWspr() {
  var panel = $('wspr-panel');
  if (!panel || !state.wspr) return;
  panel.hidden = false;
  var bands = state.wspr.bands || [];
  $('wspr-bands').innerHTML = bands.slice(0, 12).map(function (b) {
    return '<span class="chip wspr-band"><b>' + esc(wsprBandLabel(b.band)) + '</b> ' + esc(fmtNum(b.c)) + ' 📶 · ↑ ' + esc(fmtNum(b.max_km)) + ' km</span>';
  }).join('');
  var top = state.wspr.top || [];
  $('wspr-top').innerHTML = top.map(function (s) {
    var path = esc(s.tx) + (s.tx_loc ? ' (' + esc(s.tx_loc) + ')' : '') + ' → ' + esc(s.rx) + (s.rx_loc ? ' (' + esc(s.rx_loc) + ')' : '');
    return '<div class="eibi-row"><span>📡 ' + path + '</span><span class="snr">' + esc(fmtNum(s.km)) + ' km · ' + esc(wsprBandLabel(s.band)) + '</span></div>';
  }).join('');
  if (state.wspr.updated) $('wspr-updated').textContent = t('updated_at') + ': ' + fmtDate(state.wspr.updated);
}

function loadWspr() {
  return fetchJSON('data/wspr.json').then(function (data) {
    if (data && Array.isArray(data.bands) && data.bands.length) {
      state.wspr = data;
      renderWspr();
    }
  }).catch(function (e) {
    console.warn('wspr snapshot:', e);
  });
}

/* ================= WebSDR / OpenWebRX directories ================= */

function webSdrCard(r) {
  var action = r.https
    ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('listen_in_app')) + '</button>'
    : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(t('open_ext')) + '</a>';
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(r.name) + '</h3></div>' +
    (r.loc ? '<div class="chips"><span class="chip">📍 ' + esc(r.loc) + '</span></div>' : '') +
    action +
    '</article>';
}

function applyWebFilters(list) {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var rxType = f.rxType || 'all';
  return (list || []).filter(function (r) {
    if (f.httpsOnly && !r.https) return false;
    if (rxType !== 'all' && r.type !== rxType) return false;
    if (q) {
      var hay = (r.name + ' ' + (r.loc || '') + ' ' + r.url).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function (a, b) {
    var ha = a.https ? 1 : 0, hb = b.https ? 1 : 0;
    return hb - ha || a.name.localeCompare(b.name, state.lang);
  });
}

function renderWebSdrGrid(gridId, countId, panelId, list, kind) {
  var grid = $(gridId);
  var panel = $(panelId);
  if (!grid || !panel) return;
  if (!list || !list.length) { panel.hidden = true; return; }
  panel.hidden = false;
  var filtered = applyWebFilters(list);
  var limit = state.webLimits[kind];
  $(countId).textContent = t('results').replace('{n}', fmtNum(filtered.length));
  if (!filtered.length) { grid.innerHTML = '<div class="empty">' + esc(t('no_match')) + '</div>'; return; }
  grid.innerHTML = filtered.slice(0, limit).map(webSdrCard).join('') +
    (filtered.length > limit
      ? '<div class="more-wrap"><button class="btn ghost web-more" type="button" data-more-kind="' + esc(kind) + '">' + esc(t('more_rx').replace('{n}', fmtNum(filtered.length - limit))) + '</button></div>'
      : '');
}

function renderWebSdrs() {
  if (!state.webSdrs) return;
  renderWebSdrGrid('grid-websdr', 'websdr-count', 'websdr-panel', state.webSdrs.websdr, 'websdr');
  renderWebSdrGrid('grid-owrx', 'owrx-count', 'owrx-panel', state.webSdrs.openwebrx, 'owrx');
}

function loadWebSdrs() {
  return fetchJSON('data/web_sdrs.json').then(function (data) {
    if (data && (Array.isArray(data.websdr) || Array.isArray(data.openwebrx))) {
      (data.websdr || []).forEach(function (r) { r.type = 'websdr'; });
      (data.openwebrx || []).forEach(function (r) { r.type = 'owrx'; });
      state.webSdrs = data;
      renderWebSdrs();
      renderMap();
    }
  }).catch(function (e) {
    console.warn('web sdrs snapshot:', e);
  });
}

function renderSatnogs() {
  if (!state.satnogs) return;
  renderWebSdrGrid('grid-satnogs', 'satnogs-count', 'satnogs-panel', state.satnogs.stations, 'satnogs');
}

function loadSatnogs() {
  return fetchJSON('data/satnogs.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      data.stations.forEach(function (r) { r.type = 'satnogs'; });
      state.satnogs = data;
      renderSatnogs();
      renderMap();
    }
  }).catch(function (e) {
    console.warn('satnogs snapshot:', e);
  });
}



/* ================= space weather ================= */

function loadSpace() {
  fetchJSON('data/space_weather.json').then(function (d) {
    if (d && (d.kp != null || d.f107 != null)) { state.space = d; renderSpace(); }
  }).catch(function () {});
  fetchJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json').then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    for (var i = rows.length - 1; i >= 0; i--) {
      var v = rows[i] && (rows[i].kp_index != null ? rows[i].kp_index : rows[i].estimated_kp);
      if (v != null) {
        if (!state.space) state.space = {};
        state.space.kp = Number(v);
        state.space.updated = new Date().toISOString();
        renderSpace();
        return;
      }
    }
  }).catch(function () {});
}

function renderSpace() {
  var p = $('space-panel');
  if (!state.space) { p.hidden = true; return; }
  p.hidden = false;
  $('space-upd').textContent = t('updated_at') + ': ' + fmtDate(state.space.updated);
  var vals = '';
  var kpVal = Number(state.space.kp);
  var f107Val = Number(state.space.f107);
  if (state.space.kp != null && isFinite(kpVal)) vals += '<span class="chip">🧲 Kp ' + kpVal + '</span>';
  if (state.space.f107 != null && isFinite(f107Val)) vals += '<span class="chip">☀️ F10.7 ' + f107Val + ' sfu</span>';
  $('space-values').innerHTML = vals;
  var kp = state.space.kp;
  var cond = kp == null ? '' : (kp < 4 ? t('cond_good') : (kp < 6 ? t('cond_unstable') : t('cond_storm')));
  $('space-cond').textContent = cond;
  maybeSpaceAlert();
  renderSpaceAlertBtn();
}

/* ================= band-condition alerts ================= */

var SPACE_ALERT_KEY = 'ra-space-alerts';
var SPACE_LAST_KP = 'ra-space-last-kp';

function spaceAlertsEnabled() {
  try { return localStorage.getItem(SPACE_ALERT_KEY) === '1'; } catch (e) { return false; }
}

function renderSpaceAlertBtn() {
  var btn = $('space-alert-btn');
  if (!btn) return;
  var supported = 'Notification' in window;
  btn.hidden = !supported;
  if (!supported) return;
  var enabled = spaceAlertsEnabled();
  btn.textContent = enabled ? '🔔' : '🔕';
  btn.classList.toggle('active', enabled);
}

function notifySpace(title, body, fallbackToast) {
  var ok = false;
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      var n = new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'ra-space', lang: state.lang });
      n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
      ok = true;
    } catch (e) {}
  }
  if (!ok) toast(fallbackToast);
}

function maybeSpaceAlert() {
  var kp = state.space && state.space.kp;
  if (kp == null) return;
  var last = null;
  try { last = Number(localStorage.getItem(SPACE_LAST_KP)); } catch (e) {}
  try { localStorage.setItem(SPACE_LAST_KP, String(kp)); } catch (e) {}
  if (!spaceAlertsEnabled() || last == null || !isFinite(last) || last === kp) return;
  var opened = last >= 4 && kp < 4;
  var storm = last < 5 && kp >= 5;
  if (!opened && !storm) return;
  if (opened) {
    notifySpace(t('alert_open_title'), t('alert_open_body').replace('{kp}', kp), t('alert_toast_open').replace('{kp}', kp));
  } else {
    notifySpace(t('alert_storm_title'), t('alert_storm_body').replace('{kp}', kp), t('alert_toast_storm').replace('{kp}', kp));
  }
}

function toggleSpaceAlerts() {
  if (!('Notification' in window)) { toast(t('alert_unsupported')); return; }
  var enabling = !spaceAlertsEnabled();
  if (!enabling) {
    try { localStorage.setItem(SPACE_ALERT_KEY, '0'); } catch (e) {}
    renderSpaceAlertBtn();
    toast(t('alert_off'));
    return;
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(function () {
      try { localStorage.setItem(SPACE_ALERT_KEY, '1'); } catch (e) {}
      renderSpaceAlertBtn();
      toast(t('alert_on'));
    }).catch(function () {});
    return;
  }
  try { localStorage.setItem(SPACE_ALERT_KEY, '1'); } catch (e) {}
  renderSpaceAlertBtn();
  toast(t('alert_on'));
}

/* ================= EIBI on-air ================= */

function loadEibi() {
  fetchJSON('data/eibi.json').then(function (d) {
    if (d && Array.isArray(d.rows) && d.rows.length) { state.eibi = d.rows; renderEibi(); }
  }).catch(function () {});
}

function eibiRow(x) {
  var freq = (x.f / 1000).toFixed(3) + ' MHz';
  return '<div class="eibi-row"><span class="eibi-time">' + esc(x.s + '–' + x.e + ' UTC') + '</span><strong>' + freq + '</strong><span class="eibi-name">' + esc(x.n || '') + '</span></div>';
}

function renderEibi() {
  var p = $('eibi-panel');
  if (!p) return;
  if (!state.eibi.length) { p.hidden = true; return; }
  p.hidden = false;
  var q = state.eibiQ.trim().toLowerCase();
  var band = state.eibiBand;
  var rows = state.eibi.filter(function (x) {
    if (band !== 'all') {
      var freq = x.f / 1000;
      if (band === '120' && (freq < 2300 || freq >= 2495)) return false;
      if (band === '90' && (freq < 3200 || freq >= 3400)) return false;
      if (band === '75' && (freq < 3900 || freq >= 4000)) return false;
      if (band === '60' && (freq < 4750 || freq >= 5060)) return false;
      if (band === '49' && (freq < 5900 || freq >= 6200)) return false;
      if (band === '41' && (freq < 7200 || freq >= 7600)) return false;
      if (band === '31' && (freq < 9400 || freq >= 9900)) return false;
      if (band === '25' && (freq < 11600 || freq >= 12100)) return false;
      if (band === '22' && (freq < 13570 || freq >= 13870)) return false;
      if (band === '19' && (freq < 15100 || freq >= 15800)) return false;
      if (band === '16' && (freq < 17480 || freq >= 17900)) return false;
      if (band === '15' && (freq < 18900 || freq >= 19020)) return false;
      if (band === '13' && (freq < 21450 || freq >= 21850)) return false;
      if (band === '11' && (freq < 25600 || freq >= 26100)) return false;
    }
    if (!q) return true;
    return ((x.n || '') + ' ' + x.f).toLowerCase().indexOf(q) !== -1;
  });
  $('eibi-count').textContent = fmtNum(rows.length) + ' ' + t('onair');
  var html = rows.slice(0, 60).map(eibiRow).join('');
  if (rows.length > 60) html += '<div class="hint" style="text-align:center">' + esc(t('more_eibi')) + '</div>';
  $('eibi-list').innerHTML = html || ('<div class="hint">' + esc(t('no_match')) + '</div>');
}




function openSDR(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  $('sdr-modal-name').textContent = '🎧 ' + (name || '');
  $('sdr-open-ext').href = url;
  previousSDRFocus = document.activeElement;
  $('sdr-frame').src = url;
  $('sdr-modal').hidden = false;
  $('sdr-modal-close').focus();
}

function closeSDR() {
  $('sdr-frame').src = 'about:blank';
  try { $('sdr-frame').removeAttribute('srcdoc'); } catch (e) {}
  $('sdr-modal').hidden = true;
  if (previousSDRFocus && typeof previousSDRFocus.focus === 'function') previousSDRFocus.focus();
  previousSDRFocus = null;
}



/* ================= KiwiSDR native WebSocket audio ================= */
// Separate Cloudflare Worker public hostname supplied by site owner on 2026-11-20.
// Worker deployment and /healthz are reported live; actual WebSocket audio
// remains subject to separate per-receiver verification and permission.
// A failed relay must not cause a cross-site navigation or disrupt FM playback.
var KIWI_WS_RELAY = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';
var kiwiWs = null;
var kiwiAudioCtx = null;
var kiwiGain = null;
var kiwiNextTime = 0;
var kiwiKeepAlive = null;
var kiwiFailTimer = null;
var kiwiSession = 0;
var kiwiReady = false;
var kiwiStats = {frames:0, samples:0, nonZeroSamples:0, sampleRate:0};

function kiwiSetStatus(text) {
  var el = $('kiwi-status');
  if (el) el.textContent = text;
}

function kiwiSocketAddress(raw) {
  var url;
  try { url = new URL(raw); } catch (e) { return ''; }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return '';
  if (url.protocol === 'https:') {
    return 'wss://' + url.host + '/' + Date.now() + '/SND';
  }
  if (!KIWI_WS_RELAY) return '';
  try {
    var relay = new URL(KIWI_WS_RELAY);
    if (relay.protocol !== 'https:' || relay.username || relay.password) return '';
    return 'wss://' + relay.host + '/kiwi/ws?receiver=' + encodeURIComponent(url.origin + '/');
  } catch (e) { return ''; }
}

function kiwiTuneCommand() {
  var freq = Number($('kiwi-freq').value);
  if (!Number.isFinite(freq) || freq < 10 || freq > 30000) return '';
  var mode = $('kiwi-mode').value.toLowerCase();
  var cuts = {am:[-4900,4900],usb:[300,2900],lsb:[-2900,-300],cw:[-350,350]};
  if (!cuts[mode]) return '';
  return 'SET mod=' + mode + ' low_cut=' + cuts[mode][0] +
    ' high_cut=' + cuts[mode][1] + ' freq=' + freq.toFixed(3);
}

function kiwiSendTune() {
  var command = kiwiTuneCommand();
  if (command && kiwiWs && kiwiWs.readyState === WebSocket.OPEN && kiwiReady) {
    kiwiWs.send(command);
  }
}

function closeKiwiAudio() {
  kiwiSession++;
  kiwiReady = false;
  if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
  if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
  if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
  var audio = $('kiwi-audio');
  if (audio) { try { audio.pause(); audio.srcObject = null; } catch (e) {} }
  if (kiwiAudioCtx) { try { kiwiAudioCtx.close(); } catch (e) {} kiwiAudioCtx = null; }
  kiwiGain = null;
  kiwiNextTime = 0;
  var modal = $('kiwi-modal');
  if (modal) modal.hidden = true;
}

function kiwiFeedAudio(samples, sampleRate) {
  if (!kiwiAudioCtx || !kiwiGain || !samples.length) return;
  try {
    var buffer = kiwiAudioCtx.createBuffer(1, samples.length, sampleRate);
    var channel = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    var source = kiwiAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(kiwiGain);
    var now = kiwiAudioCtx.currentTime;
    if (kiwiNextTime < now + 0.04 || kiwiNextTime > now + 0.75) kiwiNextTime = now + 0.06;
    source.start(kiwiNextTime);
    kiwiNextTime += buffer.duration;
  } catch (e) { console.warn('KiwiSDR audio:', e); }
}

// KiwiSDR sends SND frames: ASCII "SND", flags (1), sequence (4),
// S-meter (2), then big-endian 16-bit PCM when compression is disabled.
// Decoder explicitly rejects compressed frames and invalid packet tags.
function kiwiDecodeSnd(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return null;
  var bytes = new Uint8Array(buffer);
  if (bytes.length <= 10 || bytes[0] !== 83 || bytes[1] !== 78 || bytes[2] !== 68) return null;
  // IQ uses a different header; ADPCM must never be interpreted as PCM.
  if (bytes[3] & 0x18) return null;
  if ((bytes.length - 10) % 2 !== 0) return null;
  var samples = new Int16Array((bytes.length - 10) / 2);
  var view = new DataView(buffer);
  for (var i = 0; i < samples.length; i++) samples[i] = view.getInt16(10 + i * 2, !!(bytes[3] & 0x80));
  return samples;
}

// Control messages are commonly binary frames, just like SND packets.
function kiwiControlMessage(data) {
  if (typeof data === 'string') return data.indexOf('MSG ') === 0 ? data : '';
  if (!(data instanceof ArrayBuffer) || data.byteLength < 4 || data.byteLength > 65536) return '';
  var bytes = new Uint8Array(data);
  if (bytes[0] !== 77 || bytes[1] !== 83 || bytes[2] !== 71 || bytes[3] !== 32) return '';
  var message = '';
  for (var i = 0; i < bytes.length; i++) message += String.fromCharCode(bytes[i]);
  return message;
}

function openKiwiAudio(url, name) {
  var socketUrl = kiwiSocketAddress(url);
  if (!socketUrl) {
    toast(t('kiwi_failed'));
    return;
  }
  var tune = kiwiTuneCommand();
  if (!tune) { kiwiSetStatus(t('kiwi_failed')); return; }
  closeKiwiAudio();
  var session = kiwiSession;
  var sampleRate = 12000;
  var authenticated = false;
  var haveRate = false;
  kiwiStats = {frames:0, samples:0, nonZeroSamples:0, sampleRate:0};
  var gotSamples = false;
  var failed = false;
  $('kiwi-modal-name').textContent = '🎧 ' + (name || '');
  $('kiwi-open-ext').href = safeHttpUrl(url) || '#';
  $('kiwi-modal').hidden = false;
  kiwiSetStatus(t('kiwi_connecting'));
  var audio = $('kiwi-audio');
  function fail() {
    if (session !== kiwiSession || failed) return;
    failed = true;
    kiwiSetStatus(t('kiwi_failed'));
    toast(t('kiwi_failed'));
    kiwiReady = false;
    if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
    if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
    if (kiwiAudioCtx) { kiwiAudioCtx.close().catch(function () {}); kiwiAudioCtx = null; }
    kiwiGain = null;
    if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
  }
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !window.WebSocket) { fail(); return; }
  try {
    kiwiAudioCtx = new Ctx();
    kiwiGain = kiwiAudioCtx.createGain();
    var dest = kiwiAudioCtx.createMediaStreamDestination();
    kiwiGain.connect(dest);
    audio.srcObject = dest.stream;
    kiwiAudioCtx.resume().catch(fail);
    audio.play().catch(fail);
  } catch (e) { fail(); return; }
  var ws;
  try { ws = new WebSocket(socketUrl); } catch (e) { fail(); return; }
  ws.binaryType = 'arraybuffer';
  kiwiWs = ws;
  kiwiFailTimer = setTimeout(fail, 12000);
  ws.onopen = function () {
    if (session !== kiwiSession) return;
    ws.send('SET auth t=kiwi p=');
  };
  ws.onmessage = function (ev) {
    if (session !== kiwiSession || failed) return;
    var msg = kiwiControlMessage(ev.data);
    if (msg) {
      if (/(?:^|\s)(?:badp=[1-9][0-9]*|too_busy(?:=|\s|$)|down=|fault(?:=|\s|$)|no_channels(?:=|\s|$))/i.test(msg)) { fail(); return; }
      if (/(?:^|\s)badp=0(?:\s|$)/.test(msg)) authenticated = true;
      // audio_rate is the negotiated PCM rate; sample_rate may describe SDR processing.
      var rate = /(?:^|\s)audio_rate=([0-9.]+)/.exec(msg);
      if (rate && Number(rate[1]) > 1000 && Number(rate[1]) < 96000) {
        sampleRate = Number(rate[1]);
        haveRate = true;
        if (kiwiReady) ws.send('SET AR OK in=' + sampleRate + ' out=' + kiwiAudioCtx.sampleRate);
      }
      if (!kiwiReady && authenticated && haveRate) {
        kiwiReady = true;
        ws.send('SET compression=0');
        ws.send('SET AR OK in=' + sampleRate + ' out=' + kiwiAudioCtx.sampleRate);
        ws.send('SET squelch=0 max=0');
        ws.send('SET ident_user=Radio%20Atlas');
        ws.send('SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50');
        ws.send(tune);
        ws.send('SET keepalive');
      }
      return;
    }
    if (!kiwiReady) return;
    var samples = kiwiDecodeSnd(ev.data);
    if (!samples || !samples.length) return;
    kiwiStats.frames++;
    kiwiStats.samples += samples.length;
    kiwiStats.sampleRate = sampleRate;
    for (var i = 0; i < samples.length; i++) if (samples[i] !== 0) kiwiStats.nonZeroSamples++;
    if (!gotSamples) {
      gotSamples = true;
      if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
      kiwiSetStatus(t('kiwi_live'));
    }
    kiwiFeedAudio(samples, sampleRate);
  };
  ws.onerror = fail;
  ws.onclose = function () { if (session === kiwiSession) fail(); };
  kiwiKeepAlive = setInterval(function () {
    if (session === kiwiSession && ws.readyState === WebSocket.OPEN) ws.send('SET keepalive');
  }, 10000);
}


var API = { kiwiDiagnostics: function () { return Object.assign({contextState:kiwiAudioCtx ? kiwiAudioCtx.state : 'closed'}, kiwiStats); }, renderSDR: renderSDR, renderWspr: renderWspr, renderWebSdrs: renderWebSdrs, renderSatnogs: renderSatnogs, renderSpace: renderSpace, renderEibi: renderEibi, buildBandFilter: buildBandFilter, openSDR: openSDR, closeSDR: closeSDR, openKiwiAudio: openKiwiAudio, closeKiwiAudio: closeKiwiAudio };
var booted = false;
export function boot() {
  if (booted) return API;
  booted = true;
  RA_MODULES.sdr = API;
  raMergeStr(STR_SDR);
  applyI18n();
  loadKiwi();
  loadSpace();
  loadEibi();
  loadWspr();
  loadWebSdrs();
  loadSatnogs();

  var qTimer = null;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    var v = this.value;
    qTimer = setTimeout(function () { state.filters.q = v; renderSDR(); renderWebSdrs(); renderSatnogs(); }, 150);
  });
  $('band').addEventListener('change', function () { state.filters.band = this.value; renderSDR(); });
  $('sort').addEventListener('change', function () {
    state.filters.sort = this.value;
    if (this.value === 'near' && !state.geo) ensureGeo(function () { renderSDR(); });
    renderSDR();
  });
  $('online-only').addEventListener('change', function () { state.filters.onlineOnly = this.checked; renderSDR(); });
  $('free-only').addEventListener('change', function () { state.filters.freeOnly = this.checked; renderSDR(); });
  $('minsnr').addEventListener('change', function () { state.filters.minSnr = Number(this.value) || 0; renderSDR(); });
  $('https-only').addEventListener('change', function () { state.filters.httpsOnly = this.checked; renderSDR(); renderWebSdrs(); renderSatnogs(); });
  $('rx-type').addEventListener('change', function () { state.filters.rxType = this.value; renderSDR(); renderWebSdrs(); renderSatnogs(); });
  ['websdr', 'owrx', 'satnogs'].forEach(function (kind) {
    var g = $('grid-' + kind);
    if (g) g.addEventListener('click', function (e) {
      var el = e.target;
      if (el && el.closest && el.closest('.web-more')) { state.webLimits[kind] += 150; renderWebSdrs(); renderSatnogs(); }
    });
  });
  var alertBtn = $('space-alert-btn');
  if (alertBtn) alertBtn.addEventListener('click', toggleSpaceAlerts);
  var eibiSearch = $('eibi-q');
  if (eibiSearch) eibiSearch.addEventListener('input', function () { state.eibiQ = this.value; renderEibi(); });


  $('sdr-modal-close').addEventListener('click', closeSDR);
  $('kiwi-modal-close').addEventListener('click', closeKiwiAudio);
  $('kiwi-freq').addEventListener('change', function () {
    kiwiSendTune();
  });
  $('kiwi-mode').addEventListener('change', function () {
    kiwiSendTune();
  });


  return API;
}
