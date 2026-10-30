/* MNSprite offline cache. Every file the app needs is cached on install, so it opens without a connection.
   The list is written by tools/package.py; bump VERSION when the app changes. */
var VERSION = 'mn-sprite-2.0.1';
var FILES = ["./apple-touch-icon.png", "./brand/mn-app.css", "./brand/mn-host.js", "./brand/font/Chancel-Regular.ttf", "./brand/font/Chancel-Regular.woff", "./brand/tokens.css", "./favicon-32.png", "./favicon.ico", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.png", "./icon.svg", "./index.html", "./js/ai.js", "./js/app.js", "./js/aseprite.js", "./js/color.js", "./js/draw.js", "./js/editor.js", "./js/export.js", "./js/gif.js", "./js/model.js", "./js/panels.js", "./js/png.js", "./js/rpc.js", "./js/session.js", "./js/tools.js", "./js/ui-base.js", "./js/zlib.js", "./manifest.webmanifest", "./style.css"];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }));
});
