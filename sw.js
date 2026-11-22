var CACHE = 'radio-atlas-v96';
var SHELL = ['./', './index.html', './offline.html', './about.html', './contact.html', './terms.html', './privacy.html', './dmca.html', './css/styles.css', './js/app.js', './js/analytics.js', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './js/modules/mobile.mjs', './js/modules/map.mjs', './js/modules/player.mjs', './js/modules/regions.mjs', './js/modules/sdr.mjs', './js/modules/sdr-adapters.mjs', './js/modules/openwebrx-native.mjs', './js/modules/sdr-waterfall.mjs', './js/modules/kiwi-waterfall.mjs', './js/modules/tools.mjs'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (url) { return new Request(url, { cache: 'reload' }); })); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(async function (keys) {
    var current = await caches.open(CACHE);
    for (var key of keys.slice().reverse()) {
      if (key === CACHE || !/^radio-atlas-v\d+$/.test(key)) continue;
      try {
        var previous = await caches.open(key);
        for (var request of await previous.keys()) {
          if (new URL(request.url).pathname.indexOf('/data/') === -1 || await current.match(request)) continue;
          await current.put(request, await previous.match(request));
        }
        await caches.delete(key);
      } catch (error) {
        // Keep the previous data available if migration hits a storage limit.
        console.warn('Radio Atlas cache migration:', error);
      }
    }
  }));
});

function matchShell(request) {
  return caches.open(CACHE).then(function (cache) { return cache.match(request); });
}

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function () {
        return matchShell(e.request).then(function (hit) {
          return hit || matchShell('./index.html');
        }).then(function (hit) {
          return hit || matchShell('./offline.html');
        });
      })
    );
    return;
  }

  if (url.pathname.indexOf('/data/') !== -1) {
    e.respondWith(fetch(e.request).then(function (r) {
      if (r.ok) {
        var cp = r.clone();
        return caches.open(CACHE).then(function (c) { return c.put(e.request, cp); }).catch(function () {}).then(function () { return r; });
      }
      return r;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
      });
    }));
    return;
  }

  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) {
      var cp = r.clone();
      return caches.open(CACHE).then(function (c) { return c.put(e.request, cp); }).catch(function () {}).then(function () { return r; });
    }
    return r;
  }).catch(function () {
    return matchShell(e.request).then(function (hit) {
      return hit || Response.error();
    });
  }));
});

