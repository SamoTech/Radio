/* ================= P1-2: player module (lazy) ================= */
/* المشغل الكامل (HLS، السبات، المنبه، الميديا سشن، البدائل، المؤ visualization)
   — بيتحمل عند أول تشغيل. الأسلاك الخاصة بالمشغل بتتعمل في initPlayerUI(). */

import { $, t, esc, toast, state, safeHttpsUrl, proxyStreamUrl, stationByUrl, currentFMList, normalizeSearchText, regionName, flagOf, isDmEmbed, isDataSaver, updateDocTitle, renderQuickBar, countStationPlay, reportPlaybackError } from '../app.js';

function setMedia(name) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: name || 'Radio Atlas',
      artist: 'Radio Atlas — راديو أطلس',
      album: 'Radio Atlas'
    });
  } catch (e) {}
  wireMediaSessionActions();
}

var hls = null;
function isHlsUrl(u) {
  return /\.m3u8(?:\?|$)/i.test(u || '');
}
function destroyHls() {
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
}
function appendEasyBroadcastToken(url, tokenText) {
  var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
  if (!values.get('token')) throw new Error('EasyBroadcast token response did not include a token');
  var signed = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) {
    if (values.get(key)) signed.searchParams.set(key, values.get(key));
  });
  return signed.toString();
}
function resolvePlaybackUrl(url, station) {
  if (!station || !station.tokenEndpoint || station.tokenType !== 'easy_b') return Promise.resolve(url);
  var cleanUrl = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) { cleanUrl.searchParams.delete(key); });
  var unsignedUrl = cleanUrl.toString();
  var cacheKey = station.tokenEndpoint + '|' + station.url;
  var cached = state.ebTokenCache[cacheKey];
  if (cached && cached.tokenText && cached.expires * 1000 > Date.now() + 30000) {
    return Promise.resolve(appendEasyBroadcastToken(unsignedUrl, cached.tokenText));
  }
  if (cached && cached.promise) {
    return cached.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
  }
  var endpoint = station.tokenEndpoint + '?url=' + encodeURIComponent(station.url || unsignedUrl);
  var entry = { tokenText: '', expires: 0, promise: null };
  entry.promise = fetch(endpoint, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error('Token endpoint HTTP ' + response.status);
    return response.text();
  }).then(function (tokenText) {
    var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
    entry.tokenText = tokenText;
    entry.expires = Number(values.get('expires')) || 0;
    entry.promise = null;
    return tokenText;
  }).catch(function (error) {
    delete state.ebTokenCache[cacheKey];
    throw error;
  });
  state.ebTokenCache[cacheKey] = entry;
  return entry.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
}
function loadHlsLib(cb) {
  if (window.Hls) { cb(true); return; }
  if (loadHlsLib.loading) { loadHlsLib.queue.push(cb); return; }
  loadHlsLib.loading = true;
  loadHlsLib.queue = [cb];
  var urls = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.6.10/dist/hls.min.js',
    'https://unpkg.com/hls.js@1.6.10/dist/hls.min.js'
  ];
  var index = 0;
  function finish(ok) {
    var queue = loadHlsLib.queue || [];
    loadHlsLib.queue = [];
    loadHlsLib.loading = false;
    queue.forEach(function (fn) { fn(ok); });
  }
  function next() {
    if (window.Hls) { finish(true); return; }
    if (index >= urls.length) { finish(false); return; }
    var script = document.createElement('script');
    script.src = urls[index++];
    script.onload = function () { finish(!!window.Hls); };
    script.onerror = function () { script.remove(); next(); };
    document.head.appendChild(script);
  }
  next();
}
function failCurrentPlayback(generation, reason) {
  if (generation !== state.playbackGeneration || state.playbackAttemptFailed) return;
  state.playbackAttemptFailed = true;
  destroyHls();
  var audio = $('audio');
  audio.pause();
  audio.removeAttribute('src');
  state.playbackIndex += 1;
  if (state.playbackIndex < state.playbackSources.length) {
    startCurrentPlayback(generation);
    return;
  }
  var official = $('player-official');
  reportPlaybackError(generation, reason)
  if (official && state.playbackStation && state.playbackStation.website) official.hidden = false;
  // Every source failed — point the open-direct link back at the station's
  // real URL: when the failure is a CORS or geo block the stream often plays
  // fine opened directly in a new tab.
  var ext = $('player-ext');
  if (ext && state.playbackStation && state.playbackStation.url) {
    ext.href = state.playbackStation.url;
    ext.hidden = false;
  }
  setPlayerStatus('dead');
  renderPlayerAlternatives();
  toast(t('toast_broken'));
  console.warn('Radio playback failed:', reason || 'all sources exhausted');
}
function createEasyBroadcastLoader(station) {
  var BaseLoader = window.Hls.DefaultConfig.loader;
  return class EasyBroadcastTokenLoader extends BaseLoader {
    load(context, config, callbacks) {
      var path = '';
      try { path = new URL(context.url).pathname; } catch (e) {}
      if (!/\.m3u8$/i.test(path) || !station || !station.tokenEndpoint) {
        return BaseLoader.prototype.load.call(this, context, config, callbacks);
      }
      var self = this;
      resolvePlaybackUrl(context.url, station).then(function (signedUrl) {
        context.url = signedUrl;
        BaseLoader.prototype.load.call(self, context, config, callbacks);
      }).catch(function (error) {
        callbacks.onError({ code: 0, text: error && error.message ? error.message : 'Stream token request failed' }, context, null);
      });
    }
  };
}
function attachHls(url, generation, station) {
  var audio = $('audio');
  if (!window.Hls || !window.Hls.isSupported()) return false;
  destroyHls();
  audio.removeAttribute('src');
  var config = {
    autoStartLoad: true,
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 30
  };
  if (isDataSaver()) {
    config.startLevel = 0;
    config.maxAutoLevelBitrate = 96000;
  }
  if (station && station.tokenEndpoint && station.tokenType === 'easy_b') {
    config.pLoader = createEasyBroadcastLoader(station);
  }
  hls = new window.Hls(config);
  var networkRetries = 0;
  var mediaRetries = 0;
  hls.on(window.Hls.Events.ERROR, function (evt, data) {
    if (!data || !data.fatal || generation !== state.playbackGeneration) return;
    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
      networkRetries += 1;
      try { hls.startLoad(); return; } catch (e) {}
    }
    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
      mediaRetries += 1;
      try { hls.recoverMediaError(); return; } catch (e) {}
    }
    failCurrentPlayback(generation, data.details || data.type || 'fatal HLS error');
  });
  hls.loadSource(url);
  hls.attachMedia(audio);
  return true;
}
function startCurrentPlayback(generation) {
  if (generation !== state.playbackGeneration) return;
  var baseUrl = state.playbackSources[state.playbackIndex];
  if (!baseUrl) { failCurrentPlayback(generation, 'No source URL'); return; }
  state.playbackAttemptFailed = false;
  var audio = $('audio');
  destroyHls();
  audio.pause();
  audio.removeAttribute('src');
  var ext = $('player-ext');
  // The open-direct link must always point at the station's real URL, never
  // at our relay tier.
  if (ext) {
    var proxyBase = state.streamProxy ? state.streamProxy.replace(/\/+$/, '') : '';
    if (!proxyBase || baseUrl.indexOf(proxyBase) !== 0) ext.href = baseUrl;
    else if (state.playbackStation && state.playbackStation.url) ext.href = state.playbackStation.url;
    ext.hidden = false;
  }
  var official = $('player-official');
  if (official) {
    official.hidden = !(state.playbackStation && state.playbackStation.website);
    if (!official.hidden) official.href = state.playbackStation.website;
  }
  var station = state.playbackStation;
  var requiresTokenLoader = station && station.tokenEndpoint && station.tokenType === 'easy_b';
  var needsHlsJs = isHlsUrl(baseUrl) && (requiresTokenLoader || !audio.canPlayType('application/vnd.apple.mpegurl'));
  if (needsHlsJs) {
    loadHlsLib(function (loaded) {
      if (generation !== state.playbackGeneration) return;
      if (!loaded || !attachHls(baseUrl, generation, station)) {
        failCurrentPlayback(generation, 'HLS.js unavailable or MediaSource unsupported');
        return;
      }
      audio.play().catch(function (error) {
        if (error && error.name === 'NotAllowedError') {
          toast(t('toast_tap_play'));
        } else {
          failCurrentPlayback(generation, error && error.message);
        }
      });
    });
  } else if (requiresTokenLoader) {
    failCurrentPlayback(generation, 'Token-protected HLS requires HLS.js');
  } else {
    audio.src = baseUrl;
    audio.load();
    audio.play().catch(function (error) {
      if (error && error.name === 'NotAllowedError') {
        toast(t('toast_tap_play'));
      } else {
        failCurrentPlayback(generation, error && error.message);
      }
    });
  }
}
/* ================= professional player controls ================= */

function applyVolume() {
  var a = $('audio');
  try { a.muted = state.playerMuted; a.volume = state.playerVolume / 100; } catch (e) {}
  var btn = $('vol-mute');
  if (btn) btn.textContent = (state.playerMuted || state.playerVolume === 0) ? '🔇' : (state.playerVolume < 40 ? '🔈' : '🔊');
}

function saveVolume() {
  try { localStorage.setItem('ra-vol', JSON.stringify({ v: state.playerVolume, m: state.playerMuted })); } catch (e) {}
}

function loadVolume() {
  try {
    var saved = JSON.parse(localStorage.getItem('ra-vol') || 'null');
    if (saved && typeof saved.v === 'number') {
      state.playerVolume = Math.max(0, Math.min(100, Math.round(saved.v)));
      state.playerMuted = !!saved.m;
    }
  } catch (e) {}
  var slider = $('vol-slider');
  if (slider) slider.value = String(state.playerVolume);
  applyVolume();
}

function toggleMute() {
  state.playerMuted = !state.playerMuted;
  saveVolume();
  applyVolume();
}

function setPlayerStatus(kind) {
  var el = $('player-status');
  if (!el) return;
  var key = { connecting: 'player_status_connecting', live: 'player_status_live', paused: 'player_status_paused', dead: 'player_status_dead' }[kind] || 'player_status_connecting';
  el.textContent = t(key);
  el.classList.toggle('dead', kind === 'dead');
}

function renderPlayerMeta() {
  var el = $('player-meta');
  if (!el) return;
  var s = state.playbackStation || {};
  var bits = [];
  if (s.cc) bits.push((flagOf(s.cc) || '') + ' ' + esc(regionName(s.cc, s.cc)));
  if (s.bitrate) bits.push(String(s.bitrate) + ' kbps');
  if (s.codec) bits.push(esc(String(s.codec).toUpperCase()));
  if (s.official) bits.push('🏛');
  if (!bits.length) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = bits.join(' · ');
  el.hidden = false;
}

function playStepStation(dir) {
  var list = (state.playerQueue && state.playerQueue.length) ? state.playerQueue : currentFMList().filter(function (s) { return !!safeHttpsUrl(s.url); });
  if (!list.length) { toast(t('random_none')); return; }
  var cur = state.playbackStation && state.playbackStation.url;
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].url === cur) { idx = i; break; } }
  var next = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
  var st = list[next];
  play(st.url, st.name);
}

function dmVideoUrl(url) {
  var m = String(url || '').match(/dailymotion\.com\/(?:embed\/video\/|video\/|player(?:\/[a-z0-9]+)?\.html\?video=)([a-z0-9]+)/i);
  return m ? 'https://www.dailymotion.com/video/' + m[1] : String(url || '');
}

function dmNoticeHtml(link) {
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  return '<!DOCTYPE html><html dir="rtl" lang="'
    + (state.lang === 'en' ? 'en' : 'ar')
    + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;font-family:Segoe UI,Tahoma,system-ui,sans-serif;background:#0f0e13;color:#f4f1e8;'
    + 'display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}'
    + '.box{max-width:430px;padding:26px 18px}h2{margin:0 0 12px;font-size:1.15rem;color:#d4af37;font-weight:700}'
    + 'p{margin:0 0 20px;line-height:1.9;color:#c9c2b2;font-size:.95rem}'
    + 'a.btn{display:inline-block;background:#d4af37;color:#1a1405;border-radius:10px;padding:12px 26px;'
    + 'text-decoration:none;font-weight:700;font-size:1rem}</style></head><body><div class="box">'
    + '<h2>📻 ' + esc(t('dm_notice_title')) + '</h2>'
    + '<p>' + esc(t('dm_notice_body')) + '</p>'
    + '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">▶ ' + esc(t('dm_notice_btn')) + '</a>'
    + '</div></body></html>';
}

function openDmNotice(url, name) {
  var link = dmVideoUrl(safeHttpsUrl(url));
  if (!/^https:\/\//.test(link)) { toast(t('toast_broken')); return; }
  $('sdr-modal-name').textContent = '📻 ' + (name || '');
  $('sdr-open-ext').href = link;
  state.previousSDRFocus = document.activeElement;
  $('sdr-frame').removeAttribute('src');
  try { $('sdr-frame').srcdoc = dmNoticeHtml(link); } catch (e) { $('sdr-frame').src = link; }
  $('sdr-modal').hidden = false;
  $('sdr-modal-close').focus();
}

function play(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  if (isDmEmbed(url)) {
    openDmNotice(url, name);
    pushHistory(url, name);
    try { history.replaceState(null, '', '#play=' + encodeURIComponent(url)); } catch (e) {}
    return;
  }
  var station = stationByUrl(url);
  if (!station) {
    for (var i = 0; i < state.fmLiveRows.length; i++) {
      if (state.fmLiveRows[i].url === url) { station = state.fmLiveRows[i]; break; }
    }
  }
  state.playbackStation = station || { name: name || '', url: url };
  var saverStation = pickSaverStation(state.playbackStation, url);
  state.playbackSources = [saverStation ? saverStation.url : url]
    .concat(state.playbackStation.fallbacks || [])
    .concat(saverStation ? [url] : [])
    .filter(function (source, index, list) {
    return !!source && list.indexOf(source) === index;
  });
  // Last-resort relay tier: some streams fail direct playback from the
  // browser (CORS or geo blocks) while our Cloudflare Worker relay can
  // still fetch them. Token-gated easybroadcast streams are skipped: their
  // loader signs the original playlist URL and would break through a proxy.
  var isEasyB = station && station.tokenEndpoint && station.tokenType === 'easy_b';
  var relayUrl = isEasyB ? '' : proxyStreamUrl(url);
  if (relayUrl && state.playbackSources.indexOf(relayUrl) === -1) {
    state.playbackSources.push(relayUrl);
  }
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = name || (station && station.name) || '';
  var altBox = $('player-alt');
  if (altBox) { altBox.hidden = true; altBox.innerHTML = ''; }
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + state.currentName;
  renderPlayerMeta();
  setPlayerStatus('connecting');
  updateDocTitle();
  renderQuickBar();
  applyVolume();
  startCurrentPlayback(generation);
  pushHistory(url, state.currentName);
  countStationPlay(url);
  try { localStorage.setItem('ra-last', JSON.stringify({ url: url, name: state.currentName })); } catch (e) {}
  setMedia(state.currentName);
  try { history.replaceState(null, '', '#play=' + encodeURIComponent(url)); } catch (e) {}
}
function pushHistory(url, name) {
  if (!url) return;
  state.history = state.history.filter(function (h) { return h.url !== url; });
  state.history.unshift({ url: url, name: name || '' });
  if (state.history.length > 10) state.history.length = 10;
  try { localStorage.setItem('ra-history', JSON.stringify(state.history)); } catch (e) {}
  renderHistory();
}

function renderHistory() {
  var row = $('history-row');
  if (!row) return;
  if (!state.history.length) { row.hidden = true; row.innerHTML = ''; return; }
  var chips = '';
  state.history.slice(0, 10).forEach(function (h) {
    chips += '<button class="chip history-chip" type="button" data-history-url="' + esc(h.url) + '" data-history-name="' + esc(h.name) + '" aria-label="' + esc(t('history_aria')) + '">▶ ' + esc(h.name || h.url) + '</button>';
  });
  row.innerHTML = '<span class="history-label">' + esc(t('history_title')) + '</span>' + chips;
  row.hidden = false;
}

/* ================= sleep timer ================= */

var SLEEP_STEPS = [15, 30, 60];
var sleepIdx = -1;
var sleepEndsAt = 0;
var sleepTick = null;

function renderSleepBtn() {
  var btn = $('sleep-btn');
  if (!btn) return;
  if (!sleepEndsAt) { btn.textContent = '⏱'; btn.classList.remove('active'); return; }
  var left = Math.max(0, sleepEndsAt - Date.now());
  var m = Math.floor(left / 60000);
  var s = Math.floor((left % 60000) / 1000);
  btn.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
  btn.classList.add('active');
}

function stopSleepTimer(silent) {
  sleepIdx = -1;
  sleepEndsAt = 0;
  if (sleepTick) { clearInterval(sleepTick); sleepTick = null; }
  renderSleepBtn();
  if (!silent) toast(t('sleep_clear'));
}

function sleepCheck() {
  if (!sleepEndsAt) { stopSleepTimer(true); return; }
  if (Date.now() >= sleepEndsAt) {
    try { $('audio').pause(); } catch (e) {}
    stopSleepTimer(true);
    toast(t('sleep_done'));
    return;
  }
  renderSleepBtn();
}

function startSleepTimer(minutes) {
  sleepEndsAt = Date.now() + minutes * 60000;
  renderSleepBtn();
  if (sleepTick) clearInterval(sleepTick);
  sleepTick = setInterval(sleepCheck, 1000);
  toast(t('sleep_set').replace('{n}', minutes));
}

function toggleSleepTimer() {
  sleepIdx += 1;
  if (sleepIdx >= SLEEP_STEPS.length) { stopSleepTimer(false); return; }
  startSleepTimer(SLEEP_STEPS[sleepIdx]);
}

/* ================= radio alarm ================= */

var alarmTick = null;
var alarmLastFired = '';

function alarmState() {
  try { return JSON.parse(localStorage.getItem('ra-alarm') || 'null'); } catch (e) { return null; }
}

function renderAlarmBtn() {
  var btn = $('alarm-btn');
  if (!btn) return;
  var a = alarmState();
  btn.classList.toggle('active', !!a);
  btn.title = a ? t('alarm_aria') + ' — ' + a.time : t('alarm_aria');
}

function openAlarmModal() {
  var m = $('alarm-modal');
  if (!m) return;
  var a = alarmState();
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) {}
  $('alarm-station').textContent = t('alarm_station').replace('{name}', (a && a.name) || (last && last.name) || t('alarm_no_station'));
  $('alarm-time').value = (a && a.time) || '06:00';
  m.hidden = false;
  $('alarm-time').focus();
}

function closeAlarmModal() {
  var m = $('alarm-modal');
  if (m) m.hidden = true;
}

function saveAlarm() {
  var time = $('alarm-time').value || '';
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) {}
  if (!/^\d{2}:\d{2}$/.test(time) || !last || !safeHttpsUrl(last.url)) { toast(t('alarm_no_station')); return; }
  try { localStorage.setItem('ra-alarm', JSON.stringify({ time: time, url: last.url, name: last.name || '' })); } catch (e) {}
  closeAlarmModal();
  renderAlarmBtn();
  toast(t('alarm_set').replace('{time}', time).replace('{name}', last.name || ''));
}

function clearAlarm() {
  try { localStorage.removeItem('ra-alarm'); } catch (e) {}
  closeAlarmModal();
  renderAlarmBtn();
  toast(t('alarm_cleared'));
}

function checkAlarm() {
  var a = alarmState();
  if (!a || !a.time) return;
  var now = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  var hhmm = p(now.getHours()) + ':' + p(now.getMinutes());
  if (hhmm !== a.time || alarmLastFired === now.toDateString()) return;
  alarmLastFired = now.toDateString();
  if (!safeHttpsUrl(a.url)) return;
  toast(t('alarm_fired').replace('{name}', a.name || ''));
  play(a.url, a.name || '');
}

var visRaf = null;
var visBars = null;

function visFrame() {
  var cv = $('player-vis');
  if (!cv || !cv.getContext) { visRaf = null; return; }
  var ctx = cv.getContext('2d');
  var w = cv.width, h = cv.height;
  if (!visBars) {
    visBars = [];
    for (var i = 0; i < 14; i++) visBars.push(Math.random());
  }
  ctx.clearRect(0, 0, w, h);
  var grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, 'rgba(212,175,55,.35)');
  grad.addColorStop(1, '#d4af37');
  ctx.fillStyle = grad;
  var bw = w / visBars.length;
  for (var b = 0; b < visBars.length; b++) {
    visBars[b] += (Math.random() - 0.5) * 0.4;
    if (visBars[b] > 1) visBars[b] = 1;
    if (visBars[b] < 0.08) visBars[b] = 0.08 + Math.random() * 0.25;
    var bh = visBars[b] * (h - 2);
    ctx.fillRect(b * bw + 1, h - bh, Math.max(2, bw - 2), bh);
  }
  visRaf = requestAnimationFrame(visFrame);
}

function visStop() {
  if (visRaf) { cancelAnimationFrame(visRaf); visRaf = null; }
  var cv = $('player-vis');
  if (cv && cv.getContext) {
    try { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); } catch (e) {}
  }
}

var mediaSessionActionsBound = false;
function wireMediaSessionActions() {
  if (mediaSessionActionsBound || !('mediaSession' in navigator) || !navigator.mediaSession.setActionHandler) return;
  var audio = $('audio');
  var actions = {
    play: function () { try { audio.play(); } catch (e) {} },
    pause: function () { audio.pause(); },
    previoustrack: function () { playStepStation(-1); },
    nexttrack: function () { playStepStation(1); }
  };
  for (var key in actions) {
    try { navigator.mediaSession.setActionHandler(key, actions[key]); } catch (e) {}
  }
  mediaSessionActionsBound = true;
}
function setMediaPlaybackState(kind) {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = kind; } catch (e) {}
}
function pickSaverStation(station, url) {
  if (!isDataSaver() || !station) return null;
  var curBit = Number(station.bitrate) || 0;
  if (!curBit || curBit <= 96000) return null;
  var nm = normalizeSearchText(station.name || '');
  if (!nm) return null;
  var fallback = null;
  var list = state.fm || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!s || s.url === url || !safeHttpsUrl(s.url) || !/^https:/i.test(s.url)) continue;
    if (normalizeSearchText(s.name || '') !== nm) continue;
    var b = Number(s.bitrate) || 0;
    if (!b || b >= curBit) continue;
    var c = state.streamChecks ? state.streamChecks[s.url] : null;
    if (c && c.alive) return s;
    if (!fallback) fallback = s;
  }
  return fallback;
}
function aliveAlternativeStations(limit) {
  var cur = state.playbackStation || {};
  var out = [];
  var seen = {};
  var list = state.fm || [];
  var cc = cur.cc || '';
  var myTags = String(cur.tags || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  for (var pass = 0; pass < 2 && out.length < limit; pass++) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || seen[s.url] || s.url === cur.url) continue;
      if (!safeHttpsUrl(s.url) || !/^https:/i.test(s.url)) continue;
      var c = state.streamChecks ? state.streamChecks[s.url] : null;
      if (!c || !c.alive) continue;
      if (pass === 0) {
        if (!cc || s.cc !== cc) continue;
      } else {
        var stTags = String(s.tags || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var overlap = myTags.some(function (tg) { return stTags.indexOf(tg) !== -1; });
        if (!myTags.length || !overlap) continue;
      }
      seen[s.url] = 1;
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}
function renderPlayerAlternatives() {
  var box = $('player-alt');
  if (!box) return;
  var alts = aliveAlternativeStations(3);
  if (!alts.length) { box.hidden = true; box.innerHTML = ''; return; }
  var html = '<span class="alt-label">' + esc(t('alt_title')) + '</span>';
  for (var i = 0; i < alts.length; i++) {
    html += '<button class="chip alt-chip" type="button" data-alt-url="' + esc(alts[i].url) + '" data-alt-name="' + esc(alts[i].name || '') + '">▶ ' + esc(alts[i].name || '') + '</button>';
  }
  box.innerHTML = html;
  box.hidden = false;
}
function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !safeHttpsUrl(last.url)) return;
  if (isDmEmbed(last.url)) return;
  var station = stationByUrl(last.url);
  state.playbackStation = station || { name: last.name || '', url: last.url };
  state.playbackSources = [last.url].concat(state.playbackStation.fallbacks || []);
  var resumeRelay = (station && station.tokenEndpoint && station.tokenType === 'easy_b') ? '' : proxyStreamUrl(last.url);
  if (resumeRelay && state.playbackSources.indexOf(resumeRelay) === -1) {
    state.playbackSources.push(resumeRelay);
  }
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = last.name || '';
  var a = $('audio');
  var ext = $('player-ext');
  if (ext) { ext.href = last.url; ext.hidden = false; }
  var official = $('player-official');
  if (official) {
    official.hidden = !(state.playbackStation && state.playbackStation.website);
    if (!official.hidden) official.href = state.playbackStation.website;
  }
  $('player').hidden = false;
  $('player-name').textContent = '⏸ ' + state.currentName + ' — ' + t('resume');
  if (isHlsUrl(last.url) && (state.playbackStation.tokenEndpoint || !a.canPlayType('application/vnd.apple.mpegurl'))) {
    loadHlsLib(function (loaded) {
      if (generation !== state.playbackGeneration || !loaded || !attachHls(last.url, generation, state.playbackStation)) return;
      a.preload = 'none';
    });
  } else {
    try { a.src = last.url; a.preload = 'none'; } catch (e) {}
  }
  setMedia(state.currentName);
}

var playerUiBound = false;
function initPlayerUI() {
if (playerUiBound) return;
playerUiBound = true;
  $('player-close').addEventListener('click', function () {
    state.playbackGeneration += 1;
    state.playbackSources = [];
    state.playbackStation = null;
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    destroyHls();
    visStop();
    var ext = $('player-ext');
    var official = $('player-official');
    if (ext) ext.hidden = true;
    if (official) official.hidden = true;
    var altBox = $('player-alt');
    if (altBox) { altBox.hidden = true; altBox.innerHTML = ''; }
    $('player').hidden = true;
    setMediaPlaybackState('none');
    updateDocTitle();
    renderQuickBar();
  });
  $('vol-mute').addEventListener('click', toggleMute);
  $('vol-slider').addEventListener('input', function () {
    state.playerVolume = Math.max(0, Math.min(100, Number(this.value) || 0));
    if (state.playerVolume > 0) state.playerMuted = false;
    saveVolume();
    applyVolume();
  });
  $('player-prev').addEventListener('click', function () { playStepStation(-1); });
  $('player-next').addEventListener('click', function () { playStepStation(1); });
  var playerAltBox = $('player-alt');
  if (playerAltBox) playerAltBox.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.alt-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-alt-url'), b.getAttribute('data-alt-name'));
  });
  loadVolume();
  $('audio').addEventListener('playing', function () {
    setPlayerStatus('live');
    setMediaPlaybackState('playing');
    if (!visRaf && !$('player-vis').hidden) visRaf = requestAnimationFrame(visFrame);
  });
  $('audio').addEventListener('pause', function () {
    setPlayerStatus('paused');
    setMediaPlaybackState('paused');
    visStop();
  });
  $('audio').addEventListener('waiting', function () { setPlayerStatus('connecting'); });
  $('audio').addEventListener('stalled', function () { setPlayerStatus('connecting'); });
  $('audio').addEventListener('error', function () {
    if (state.playbackSources.length) failCurrentPlayback(state.playbackGeneration, 'HTML audio element error');
  });
  $('audio').addEventListener('play', function () {
    if (hls && !hls.__raStarted) {
      hls.__raStarted = true;
      try { hls.startLoad(); } catch (e) {}
    }
  });
  document.addEventListener('keydown', function (e) {
    var ptag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (ptag === 'input' || ptag === 'select' || ptag === 'textarea') return;
    if ($('player').hidden) return;
    if (e.key === ' ' && ptag !== 'button') {
      e.preventDefault();
      try {
        var au = $('audio');
        if (au.paused) au.play().catch(function () {}); else au.pause();
      } catch (err) {}
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      state.playerVolume = Math.max(0, Math.min(100, state.playerVolume + (e.key === 'ArrowUp' ? 5 : -5)));
      if (state.playerVolume > 0) state.playerMuted = false;
      var sl = $('vol-slider');
      if (sl) sl.value = String(state.playerVolume);
      saveVolume();
      applyVolume();
      return;
    }
    if (e.key === 'ArrowLeft') { playStepStation(-1); return; }
    if (e.key === 'ArrowRight') { playStepStation(1); return; }
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });
  $('sleep-btn').addEventListener('click', toggleSleepTimer);
  $('alarm-btn').addEventListener('click', openAlarmModal);
  $('alarm-save').addEventListener('click', saveAlarm);
  $('alarm-clear').addEventListener('click', clearAlarm);
  $('alarm-close').addEventListener('click', closeAlarmModal);
  renderHistory();
  renderAlarmBtn();
  alarmTick = setInterval(checkAlarm, 15000);
}

export { play, playStepStation, initResume, renderHistory, closeAlarmModal, resolvePlaybackUrl, appendEasyBroadcastToken, createEasyBroadcastLoader, initPlayerUI };
