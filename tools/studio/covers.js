/* Made to Last: cover art. Each cover is drawn on the 64-pixel grid the Asteria Technology mark uses, scaled up
   with hard edges, with the title set in Asteria Pixel. In soundtrack.html: await FG.covers(). */
(function (root) {
  'use strict';
  var C = { ink: '#0a1518', night: '#12232a', coal: '#1a3038', wine: '#0a3a45', red: '#1c8c9e', deep: '#116674', gold: '#e9b04b', light: '#ffd47e', cream: '#f4ecdb', ember: '#c4432d' };
  function grid() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = C.ink; g.fillRect(0, 0, 64, 64);
    var px = function (x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); };
    var rect = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
    var ring = function (cx, cy, r, c, th) { for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) { var d = Math.hypot(x + .5 - cx, y + .5 - cy); if (d <= r && d > r - (th || 1)) px(x, y, c); } };
    var disc = function (cx, cy, r, c) { for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) if (Math.hypot(x + .5 - cx, y + .5 - cy) <= r) px(x, y, c); };
        var scan = function () { for (var y = 0; y < 64; y += 2) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, 64, 1); } };
    return { cv: cv, g: g, px: px, rect: rect, ring: ring, disc: disc, scan: scan };
  }
  var ART = {
    'first-light': function (d) { // the sun coming up over the ground
      for (var y = 0; y < 40; y++) d.rect(0, y, 64, 1, y < 20 ? C.ink : y < 30 ? C.night : C.wine);
      d.disc(32, 40, 13, C.ember); d.disc(32, 40, 10, C.gold); d.disc(32, 40, 6, C.light);
      for (var a = 0; a < 7; a++) { var t = Math.PI * (0.12 + a * 0.127); for (var r = 16; r < 24; r++) d.px(32 - Math.cos(t) * r, 40 - Math.sin(t) * r, a % 2 ? C.deep : C.gold); }
      d.rect(0, 40, 64, 24, C.ink); for (var k = 0; k < 6; k++) d.rect(0, 42 + k * k, 64, 1, k % 2 ? C.coal : C.wine);
    },
    'clean-build': function (d) { // two fields that share one strip of ground
      d.rect(8, 14, 26, 26, C.wine); d.rect(30, 24, 26, 26, C.deep); d.rect(30, 24, 4, 16, C.gold);
      for (var x = 8; x < 56; x += 2) d.px(x, 52, C.coal);
    },
    'many-hands': function (d) { // many small chips, one lit
      for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++) { var cx = 14 + x * 9, cy = 8 + y * 9, lit = x === 2 && y === 2; d.rect(cx - 3, cy - 3, 6, 6, lit ? C.red : C.coal); if (lit) d.rect(cx - 1, cy - 1, 2, 2, C.gold); for (var p = -2; p <= 2; p += 2) { d.px(cx + p, cy - 4, C.wine); d.px(cx + p, cy + 3, C.wine); } }
    },
    'fair-price': function (d) { // a ring held open, gold falling out of it
      d.ring(32, 22, 14, C.deep, 3); d.rect(30, 6, 4, 6, C.ink);
      for (var k = 0; k < 7; k++) d.rect(31 + (k % 3 - 1) * 2, 38 + k * 2, 2, 1, k < 4 ? C.gold : C.deep);
    },
    'signal': function (d) { // waves from one point
      for (var r = 6; r < 46; r += 6) d.ring(14, 50, r, r < 20 ? C.red : r < 34 ? C.deep : C.wine, 2);
      d.disc(14, 50, 3, C.gold);
    },
    'keystone': function (d) { // a wall, and the stone at its corner
      for (var row = 0; row < 6; row++) for (var col = 0; col < 6 - row; col++) d.rect(8 + col * 8 + (row % 2) * 4, 42 - row * 7, 7, 6, (row + col) % 2 ? C.wine : C.coal);
      d.rect(8, 42, 7, 6, C.gold); d.rect(9, 43, 5, 1, C.light);
    },
    'quiet-screen': function (d) { // six windows, six lights; the last one just switched on
      for (var k = 0; k < 6; k++) { var x = 14 + (k % 3) * 18, y = 20 + Math.floor(k / 3) * 22; d.rect(x - 5, y - 5, 11, 11, C.coal); d.rect(x - 2, y - 2, 5, 5, k === 5 ? C.gold : C.red); if (k === 5) d.rect(x - 1, y - 1, 3, 3, C.light); }
    },
    'made-to-last': function (d) { // a star, and the light it gives
      var sx = 32, sy = 28;
      for (var r = 0; r < 13; r++) { var w = 2 * Math.round(4 * Math.pow(r / 13, 1.6)) + 1; d.rect(sx - (w >> 1), sy - 13 + r, w, 1, C.gold); d.rect(sx - (w >> 1), sy + 13 - r, w, 1, C.gold); d.rect(sx - 13 + r, sy - (w >> 1), 1, w, C.gold); d.rect(sx + 13 - r, sy - (w >> 1), 1, w, C.gold); }  // thin at the points, full in the middle
      d.rect(sx - 2, sy - 2, 5, 5, C.light);
      for (var a = 0; a < 16; a++) { var t = a * Math.PI / 8 + Math.PI / 16; d.px(sx + Math.cos(t) * 20, sy + Math.sin(t) * 20, a % 2 ? C.deep : C.light); }
    },
    album: function (d) { // the Asteria Technology mark: a folded A, with a star in its heart
      for (var y = 4; y < 48; y++) { // the legs, row by row: the fold (right) behind, the front (left) over it
        var t = (y - 4) / 44, w = 9;
        var rx = Math.round(30 + t * 17), lx = Math.round(26 - t * 17);
        d.rect(rx, y, w, 1, y < 26 ? C.red : C.deep);
        d.rect(lx, y, w, 1, y < 26 ? '#3bb3c3' : C.red);
      }
      var sx = 32, sy = 37;
      for (var r = 0; r < 8; r++) { var ww = 2 * Math.round(3 * Math.pow(r / 8, 1.6)) + 1; d.rect(sx - (ww >> 1), sy - 8 + r, ww, 1, C.gold); d.rect(sx - (ww >> 1), sy + 8 - r, ww, 1, C.gold); d.rect(sx - 8 + r, sy - (ww >> 1), 1, ww, C.gold); d.rect(sx + 8 - r, sy - (ww >> 1), 1, ww, C.gold); }
      d.rect(sx - 1, sy - 1, 3, 3, C.light);
    }
  };
  async function font() { var f = new FontFace('Asteria Pixel', 'url(../../brand/font/AsteriaPixel-Regular.woff)'); await f.load(); document.fonts.add(f); }
  function render(slug, title, sub, size) {
    var d = grid(); ART[slug](d); d.scan();
    var cv = document.createElement('canvas'); cv.width = cv.height = size; var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(d.cv, 0, 0, size, size);
    var u = size / 64;
    g.fillStyle = 'rgba(10,21,24,.86)'; g.fillRect(0, size - 13 * u, size, 13 * u);
    g.fillStyle = C.gold; g.fillRect(0, size - 13 * u, size, Math.max(1, u / 2));
    g.textBaseline = 'alphabetic'; g.fillStyle = C.cream;
    var fs = 5 * u; g.font = fs + 'px Asteria Pixel'; while (g.measureText(title.toUpperCase()).width > size - 8 * u) { fs *= .92; g.font = fs + 'px Asteria Pixel'; }
    g.fillText(title.toUpperCase(), 4 * u, size - 6 * u);
    g.fillStyle = C.gold; g.font = 2.4 * u + 'px Asteria Pixel'; g.fillText(sub.toUpperCase(), 4 * u, size - 2.4 * u);
    return cv;
  }
  function png(cv) { return new Promise(function (r) { cv.toBlob(r, 'image/png'); }); }
  async function save(path, blob) { var r = await fetch('/save/' + path, { method: 'POST', body: blob }); if (!r.ok) throw new Error('save ' + path); }
  root.FG.covers = async function () {
    await font();
    var list = root.FG.TRACKS.map(function (t) { return [String(t.n).padStart(2, '0') + '-' + t.slug, t.slug, t.title, String(t.n).padStart(2, '0') + ' · Made to Last']; });
    list.push(['album', 'album', 'Made to Last', 'Asteria Technology']);
    for (var k = 0; k < list.length; k++) for (var s of [1200, 600]) await save('asteria-music/covers/' + list[k][0] + '-' + s + '.png', await png(render(list[k][1], list[k][2], list[k][3], s)));
    return list.length;
  };
  root.FG.coverCanvas = render;
})(window);
