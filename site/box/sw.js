/* ChristianBox offline cache. Every file the app needs is cached on install, so it opens without a connection.
   The list is written by tools/package.py; bump VERSION when the app changes. */
var VERSION = 'christian-box-4.0.1';
var FILES = ["./apple-touch-icon.png", "./beepbox_editor.min.js", "./beepbox_synth.min.js", "./box/about.js", "./box/app.js", "./box/audio.js", "./box/box.css", "./box/composer.js", "./box/export.js", "./box/presets-band.js", "./box/prompt.js", "./box/rpc.js", "./box/shell.js", "./box/songtools.js", "./box/theme.js", "./box/theory.js", "./box/vendor/LICENSE-lamejs.txt", "./box/vendor/lame.min.js", "./brand/cs-app.css", "./brand/cs-host.js", "./brand/font/Chancel-Regular.ttf", "./brand/font/Chancel-Regular.woff", "./brand/tokens.css", "./favicon-32.png", "./favicon.ico", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./index.html", "./manifest.webmanifest"];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }));
});
