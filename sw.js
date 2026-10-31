var CACHE = 'radio-atlas-v26';
var SHELL = ['./', './index.html', './offline.html', './css/styles.css', './js/app.js', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match('./index.html');
        }).then(function (hit) {
          return hit || caches.match('./offline.html');
        });
      })
    );
    return;
  }

  if (url.pathname.indexOf('/data/') !== -1) {
    e.respondWith(fetch(e.request).then(function (r) {
      if (r.ok) {
        var cp = r.clone();
        return caches.open(CACHE).then(function (c) { return c.put(e.request, cp); }).then(function () { return r; });
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
      return caches.open(CACHE).then(function (c) { return c.put(e.request, cp); }).then(function () { return r; });
    }
    return r;
  }).catch(function () {
    return caches.match(e.request).then(function (hit) {
      return hit || caches.match('./offline.html');
    });
  }));
});
