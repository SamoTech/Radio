/* ================= P1-2: Kiwi WebAudio module (lazy) ================= */
/* استماع KiwiSDR الصوتي عبر WebSocket — بيتحمل عند أول ضغطة kiwi-ws. */

import { $, t, toast, state, openSDR } from '../app.js';

var kiwiWs = null;
var kiwiAudioCtx = null;
var kiwiGain = null;
var kiwiNextTime = 0;
var kiwiKeepAlive = null;

function kiwiSetStatus(text) {
  var el = $('kiwi-status');
  if (el) el.textContent = text;
}

function closeKiwiAudio() {
  if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
  if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
  var audio = $('kiwi-audio');
  if (audio) { try { audio.pause(); audio.srcObject = null; } catch (e) {} }
  kiwiGain = null;
  var modal = $('kiwi-modal');
  if (modal) modal.hidden = true;
}

function kiwiFeedAudio(samples) {
  // samples: Int16Array PCM at 11.025 kHz mono (KiwiSDR 'SET ar o-f s11').
  if (!kiwiAudioCtx || !kiwiGain || !samples.length) return;
  try {
    var buffer = kiwiAudioCtx.createBuffer(1, samples.length, 11025);
    var channel = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    var source = kiwiAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(kiwiGain);
    var now = kiwiAudioCtx.currentTime;
    if (kiwiNextTime < now + 0.05) kiwiNextTime = now + 0.05;
    source.start(kiwiNextTime);
    kiwiNextTime += buffer.duration;
  } catch (e) {}
}

function openKiwiAudio(url, name) {
  // Experimental direct audio over the KiwiSDR WebSocket protocol for
  // HTTPS receivers whose operator allows API connections (ext_api > 0).
  // Any failure falls back to the embedded receiver web UI (openSDR).
  var parsed = null;
  try { parsed = new URL(url); } catch (e) {}
  if (!parsed || parsed.protocol !== 'https:') { openSDR(url, name); return; }
  closeKiwiAudio();
  kiwiNextTime = 0;
  $('kiwi-modal-name').textContent = '🎧 ' + (name || '');
  $('kiwi-open-ext').href = url;
  $('kiwi-modal').hidden = false;
  kiwiSetStatus(t('kiwi_connecting'));
  var audio = $('kiwi-audio');
  var failed = false;
  var failTimer = null;
  function fail() {
    if (failed) return;
    failed = true;
    if (failTimer) { clearTimeout(failTimer); failTimer = null; }
    closeKiwiAudio();
    toast(t('kiwi_failed'));
    openSDR(url, name);
  }
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { fail(); return; }
  try {
    kiwiAudioCtx = new Ctx();
    kiwiGain = kiwiAudioCtx.createGain();
    var dest = kiwiAudioCtx.createMediaStreamDestination();
    kiwiGain.connect(dest);
    audio.srcObject = dest.stream;
    audio.play().catch(function () {});
  } catch (e) { fail(); return; }
  failTimer = setTimeout(fail, 8000);
  var ws = new WebSocket('wss://' + parsed.host + '/0');
  ws.binaryType = 'arraybuffer';
  kiwiWs = ws;
  ws.onopen = function () { ws.send('SET auth t=1'); };
  ws.onmessage = function (ev) {
    if (typeof ev.data === 'string') {
      var msg = ev.data;
      if (msg.indexOf('BAD_AUTH') !== -1 || msg.indexOf('MSG fault') !== -1) { fail(); return; }
      if (msg.indexOf('MSG auth') !== -1) {
        var freqEl = $('kiwi-freq');
        var modeEl = $('kiwi-mode');
        ws.send('SET freq ' + (Number(freqEl && freqEl.value) || 7100));
        ws.send('SET mod ' + ((modeEl && modeEl.value) || 'am'));
        ws.send('SET ar o-f s11');
        ws.send('SET sound out buf_size=512');
      }
      return;
    }
    if (!(ev.data instanceof ArrayBuffer)) return;
    var bytes = new Uint8Array(ev.data);
    if (bytes.length < 10) return;
    var type = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
    if (type !== 3) return;
    if (failTimer) { clearTimeout(failTimer); failTimer = null; }
    kiwiSetStatus(t('kiwi_live'));
    var sampleLen = (bytes.length - 9) >> 1;
    if (sampleLen <= 0) return;
    var samples = new Int16Array(sampleLen);
    for (var i = 0; i < sampleLen; i++) {
      samples[i] = bytes[9 + i * 2] | (bytes[10 + i * 2] << 8);
    }
    kiwiFeedAudio(samples);
  };
  ws.onerror = function () { fail(); };
  ws.onclose = function () { if (!failed) fail(); };
  kiwiKeepAlive = setInterval(function () {
    if (ws && ws.readyState === 1) ws.send('SET keepalive');
  }, 30000);
}

/* ================= UI ================= */


var kiwiUiBound = false;
function initKiwiUI() {
  if (kiwiUiBound) return;
  kiwiUiBound = true;
  $('kiwi-modal-close').addEventListener('click', closeKiwiAudio);
  $('kiwi-freq').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET freq ' + (Number(this.value) || 7100));
  });
  $('kiwi-mode').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET mod ' + this.value);
  });
}

export { openKiwiAudio, closeKiwiAudio, initKiwiUI };
