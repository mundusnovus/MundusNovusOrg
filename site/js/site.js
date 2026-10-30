/* mundusnovus.org: the mark that draws itself, a sprite being drawn, the album player and the note roll
   that follows it. Everything waits until it is on screen, and holds still for people who ask for less motion. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var C = { ink: '#0c1222', night: '#131c31', coal: '#1c2742', abyss: '#0c2558', sea: '#2a62c9', deep: '#17449a', gold: '#e9b04b', light: '#ffd47e', goldDeep: '#a8761a', cream: '#f4ecdb', bright: '#4a82e6', ember: '#c4432d' };
  function onScreen(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn(true);
    new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting); }); }, { threshold: 0.15 }).observe(el);
  }

  // ---------------------------------------------------------------- addresses and the account
  // Links to the other Mundus Novus addresses carry data-sub (and data-path); they are rewritten from this page's
  // own address, so they also work on a test machine. One Mundus Novus account is shared by every address.
  var ROOT = location.host.replace(/^(www|sprite|box|social|cloud|office)\./, ''), SUB = function (s, p) { return location.protocol + '//' + (s ? s + '.' : '') + ROOT + (p || '/'); };
  document.querySelectorAll('a[data-sub]').forEach(function (a) { a.href = SUB(a.dataset.sub === 'main' ? '' : a.dataset.sub, a.dataset.path); });
  (function () {
    var slot = $('account'); if (!slot) return;
    fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (r) {
      var a = document.createElement('a'); a.className = 'account';
      if (r.user) {
        a.href = SUB('social', '/@' + r.user.name); a.title = 'Your Mundus Novus account';
        if (r.user.avatar) { var i = document.createElement('img'); i.src = r.user.avatar; i.alt = ''; a.appendChild(i); }
        else { var b = document.createElement('span'); b.className = 'initial'; b.textContent = (r.user.display || r.user.name)[0]; a.appendChild(b); }
        var n = document.createElement('span'); n.className = 'account-name'; n.textContent = r.user.display; a.appendChild(n);
      } else { a.href = SUB('social', '/signin?return=' + encodeURIComponent(location.href)); a.textContent = 'Sign in'; }
      slot.appendChild(a);
    }).catch(function () {});
  })();

  // ---------------------------------------------------------------- downloads
  // <div data-downloads data-app="box"> shows one app (or, without data-app, every app) for one platform at a time,
  // starting with this computer's. <div data-download-table> lists every file with its size and checksum.
  var PLATFORMS = [['macos', 'macOS'], ['windows', 'Windows'], ['linux', 'Linux'], ['browser', 'In your browser']];
  function thisComputer() {
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase(), ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|android/.test(ua)) return 'browser';
    return /mac/.test(p) ? 'macos' : /win/.test(p) ? 'windows' : /linux|x11/.test(p) ? 'linux' : 'browser';
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var ICONS = { sprite: '/brand/logo/products/sprite/sprite-128.png', box: '/brand/logo/products/box/box-128.png' };
  var HOW = { macos: 'Open the disk image and drag the app to Applications. The first time, right-click it and choose Open.', windows: 'Unzip the folder and double-click the .cmd file inside. It opens in Microsoft Edge as its own window.',
    linux: 'Install the .deb, or unpack the .tar.gz and run the launcher inside. It opens as its own window in Chromium, Chrome, Edge or Brave.', browser: 'Nothing to install. Open it, and choose Install in your browser to keep it like an app. It works offline.' };
  var manifest = null;
  function getManifest() { return manifest || (manifest = fetch('/downloads/files/downloads.json').then(function (r) { return r.json(); })); }
  document.querySelectorAll('[data-downloads]').forEach(function (box) {
    var only = box.dataset.app, current = thisComputer();
    var tabs = el('div', 'platforms'), cards = el('div', 'dl-cards'), how = el('p', 'quiet dl-how');
    tabs.setAttribute('role', 'tablist');
    box.append(tabs, cards, how);
    getManifest().then(function (m) {
      var apps = m.apps.filter(function (a) { return !only || a.key === only; });
      function show(k) {
        current = k;
        tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.k === k)); });
        cards.textContent = '';
        apps.forEach(function (a) {
          var files = a.files.filter(function (f) { return f.platform === k; }), card = el('article', 'dl-card');
          var top = el('div', 'dl-top'), img = el('img'); img.src = ICONS[a.key]; img.alt = ''; img.width = img.height = 48;
          top.append(img, el('div', null)); top.lastChild.append(el('b', null, a.name), el('small', null, 'Version ' + a.version));
          card.appendChild(top);
          if (k === 'browser') { var o = el('a', 'btn primary', 'Open ' + a.name); o.href = SUB(a.key, '/app/'); card.appendChild(o); }
          files.forEach(function (f) {
            var x = el('a', 'btn' + (files.indexOf(f) ? '' : ' primary')); x.href = '/downloads/files/' + f.file; x.setAttribute('download', '');
            x.textContent = (k === 'linux' ? (/\.deb$/.test(f.file) ? '.deb' : '.tar.gz') + ' · ' : 'Download · ') + (f.bytes / 1048576).toFixed(1) + ' MB';
            card.appendChild(x);
          });
          if (k !== 'browser' && files[0]) card.appendChild(el('small', 'dl-for', files[0].label.replace(/ \(\.deb\)$/, '')));
          cards.appendChild(card);
        });
        how.textContent = HOW[k];
      }
      PLATFORMS.forEach(function (p) {
        var b = el('button', null, p[1] + (p[0] === thisComputer() ? ' (this computer)' : '')); b.type = 'button'; b.dataset.k = p[0]; b.setAttribute('role', 'tab');
        b.addEventListener('click', function () { show(p[0]); }); tabs.appendChild(b);
      });
      show(current);
    }).catch(function () { cards.appendChild(el('p', null, 'The download list is not available right now.')); });
  });
  document.querySelectorAll('[data-download-table]').forEach(function (box) {
    getManifest().then(function (m) {
      var t = el('table', 'dl-table'), head = el('tr'); ['File', 'For', 'Size', 'SHA-256'].forEach(function (h) { head.appendChild(el('th', null, h)); });
      t.appendChild(el('thead')).appendChild(head);
      var body = t.appendChild(el('tbody'));
      m.apps.forEach(function (a) { a.files.forEach(function (f) {
        var tr = el('tr'), td = el('td'), x = el('a', null, f.file); x.href = '/downloads/files/' + f.file; x.setAttribute('download', ''); td.appendChild(x);
        var sum = el('td', 'sum'); sum.appendChild(el('code', null, f.sha256)); tr.append(td, el('td', null, f.label), el('td', null, (f.bytes / 1048576).toFixed(1) + ' MB'), sum); body.appendChild(tr);
      }); });
      box.appendChild(t);
      box.appendChild(el('p', 'quiet', 'Made ' + m.made + '. To check a file on macOS or Linux: shasum -a 256 <file>. On Windows: certutil -hashfile <file> SHA256.'));
    }).catch(function () {});
  });

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $(b.dataset.copy).textContent, done = function () { var was = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = was; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {}); else { var r = document.createRange(); r.selectNodeContents($(b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); }
    });
  });

  // ---------------------------------------------------------------- the bar and arrivals
  var bar = $('bar');
  if (bar) addEventListener('scroll', function () { bar.classList.toggle('scrolled', scrollY > 8); }, { passive: true });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el, i) { el.style.transitionDelay = (el.closest('.hero') ? i * 90 : 0) + 'ms'; io.observe(el); });
  } else document.documentElement.classList.add('no-js');

  // ---------------------------------------------------------------- the mark draws itself
  (function () {
    var cv = $('heroMark'); if (!cv) return;
    // the world fills in row by row, the new world rises on it, the gold band goes round, and the cross is raised last
    var g = cv.getContext('2d'), steps = [], CX = 32, CY = 39, R = 21;
    function span(y) { var dy = y + .5 - CY, hw = Math.sqrt(Math.max(0, R * R - dy * dy)); return [Math.round(CX - hw), Math.round(CX + hw)]; }
    function onWorld(x, y, w, h, c) { for (var yy = y; yy < y + h; yy++) { var s = span(yy), a = Math.max(x, s[0]), b = Math.min(x + w, s[1]); if (b > a && Math.abs(yy + .5 - CY) < R) steps.push([a, yy, b - a, 1, c]); } }
    for (var y = CY - R; y < CY + R; y++) { var sp = span(y); if (sp[1] > sp[0]) steps.push([sp[0], y, sp[1] - sp[0], 1, C.sea]); }
    [[14, 44, 16, 3], [16, 47, 13, 2], [19, 49, 8, 2], [23, 51, 4, 2], [24, 53, 9, 2], [25, 55, 8, 2], [26, 57, 6, 1], [27, 58, 4, 1],
     [41, 44, 9, 2], [42, 46, 7, 3], [44, 49, 3, 2]].forEach(function (l) { onWorld(l[0], l[1], l[2], l[3], C.cream); });
    var band = steps.length;
    for (var x = CX - R; x < CX + R; x += 3) onWorld(x, 37, 3, 4, C.gold);
    for (y = CY - R; y < 37; y += 2) onWorld(30, y, 4, 2, C.gold);
    for (y = 17; y >= 1; y -= 2) steps.push([29, y, 6, 2, C.gold]);
    steps.push([22, 6, 20, 5, C.gold]);
    function draw(n) { g.clearRect(0, 0, 64, 64); for (var i = 0; i < n; i++) { var s = steps[i]; g.fillStyle = s[4]; g.fillRect(s[0], s[1], s[2], s[3]); } }
    if (reduce) return draw(steps.length);
    var n = 0, t0 = 0;
    (function tick(t) {
      if (!t0) t0 = t;
      var want = Math.min(steps.length, Math.floor((t - t0) / 28));
      if (want !== n) { n = want; draw(n); }
      if (n < steps.length) requestAnimationFrame(tick);
      else idle();
    })(performance.now());
    function idle() { // light runs round the gold band
      var k = 0, w = 2 * R;
      setInterval(function () {
        draw(steps.length);
        var x = CX - R + (k++ % (w / 2)) * 2, s = span(37);
        if (x >= s[0] && x + 2 <= s[1]) { g.fillStyle = C.light; g.fillRect(x, 37, 2, 4); }
      }, 120);
    }
  })();

  // ---------------------------------------------------------------- a lantern, drawn the way a person would
  (function () {
    var cv = $('spriteCanvas'), pal = $('spritePalette'); if (!cv) return;
    var P = { k: '#3d1c1a', d: C.goldDeep, g: C.gold, l: C.light, c: C.night, a: C.goldDeep, o: C.gold, r: C.ember, w: C.cream };
    var ART = ['......kkkk......', '.....k....k.....', '......kkkk......', '.....kggggk.....', '....kggllggk....', '...kddddddddk...', '...kdccccccdk...', '...kdcaooacdk...',
      '...kdaolloadk...', '...kdcarracdk...', '...kdccwwccdk...', '...kdccwwccdk...', '...kdcrwwrcdk...', '...kddddddddk...', '....kggllggk....', '.....kkkkkk.....'];
    var FLAMES = [['caooac', 'aolloa', 'carrac'], ['ccaoac', 'caoloa', 'carrac'], ['caoacc', 'aoloac', 'carrac']];
    var order = 'kdgclawro'.split(''), g = cv.getContext('2d'), sw = {};
    order.forEach(function (ch) { var li = document.createElement('li'); li.style.background = P[ch]; pal.appendChild(li); sw[ch] = li; });
    var pixels = [];
    order.forEach(function (ch) { ART.forEach(function (row, y) { for (var x = 0; x < 16; x++) if (row[x] === ch) pixels.push([x, y, ch]); }); });
    function px(x, y, ch) { g.fillStyle = P[ch]; g.fillRect(x, y, 1, 1); }
    function flame(f) { for (var r = 0; r < 3; r++) for (var i = 0; i < 6; i++) px(5 + i, 7 + r, FLAMES[f][r][i]); }
    function whole() { g.clearRect(0, 0, 16, 16); pixels.forEach(function (p) { px(p[0], p[1], p[2]); }); }
    if (reduce) return whole();
    var visible = false, timer = null, i = 0, phase = 'draw', flick = 0, last = null;
    function step() {
      if (!visible) { timer = null; return; }
      if (phase === 'draw') {
        var p = pixels[i++]; px(p[0], p[1], p[2]);
        if (last !== p[2]) { if (last) sw[last].classList.remove('on'); sw[p[2]].classList.add('on'); last = p[2]; }
        if (i >= pixels.length) { phase = 'glow'; flick = 0; sw[last].classList.remove('on'); last = null; }
        timer = setTimeout(step, 22);
      } else if (phase === 'glow') {
        flame(flick % 3); flick++;
        if (flick > 30) { phase = 'rest'; timer = setTimeout(step, 1600); } else timer = setTimeout(step, 140);
      } else { g.clearRect(0, 0, 16, 16); i = 0; phase = 'draw'; timer = setTimeout(step, 400); }
    }
    onScreen(cv, function (v) { visible = v; if (v && !timer) step(); });
  })();

  // ---------------------------------------------------------------- the album
  var audio = new Audio(), album = null, cur = 0, rolls = {};
  audio.preload = 'none';
  var playBtn = $('playBtn'), rollPlay = $('rollPlay');
  function fmt(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function name(t) { return String(t.n).padStart(2, '0') + '-' + t.slug; }
  function select(k, play) {
    cur = k; var t = album.tracks[k];
    audio.src = '/media/music/mp3/' + name(t) + '.mp3';
    $('nowTitle').textContent = t.title; $('nowAbout').textContent = t.about;
    $('albumCover').src = '/media/music/covers/' + name(t) + '-600.png'; $('albumCover').alt = t.title + ', cover';
    var rt = $('rollTitle'); if (rt) rt.textContent = t.slug + '.beepbox';
    document.querySelectorAll('#tracks button').forEach(function (b, i) { b.setAttribute('aria-current', i === k ? 'true' : 'false'); });
    loadRoll(t);
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: album.artist, album: album.album, artwork: [{ src: '/media/music/covers/' + name(t) + '-600.png', sizes: '600x600', type: 'image/png' }] });
    if (play) audio.play().catch(function () {});
  }
  function toggle() { if (!album) return; if (audio.paused) { if (!audio.src) select(cur, false); audio.play().catch(function () {}); } else audio.pause(); }
  function sync() {
    var on = !audio.paused;
    [playBtn, rollPlay].forEach(function (b) { if (b) { b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', on ? 'Pause' : 'Play'); } });
  }
  audio.addEventListener('play', sync); audio.addEventListener('pause', sync);
  audio.addEventListener('ended', function () { if (cur + 1 < album.tracks.length) select(cur + 1, true); });
  audio.addEventListener('timeupdate', function () {
    var f = audio.duration ? audio.currentTime / audio.duration : 0;
    $('progressFill').style.width = (f * 100).toFixed(2) + '%'; $('progress').setAttribute('aria-valuenow', Math.round(f * 100));
  });
  function seek(f) { if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, f)) * audio.duration; }
  var prog = $('progress');
  if (prog) {
    prog.addEventListener('click', function (e) { var r = prog.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); });
    prog.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') seek(audio.currentTime / audio.duration + 0.05); if (e.key === 'ArrowLeft') seek(audio.currentTime / audio.duration - 0.05); });
  }
  if (playBtn) playBtn.addEventListener('click', toggle);
  if (rollPlay) rollPlay.addEventListener('click', toggle);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('nexttrack', function () { if (cur + 1 < album.tracks.length) select(cur + 1, true); });
    navigator.mediaSession.setActionHandler('previoustrack', function () { if (cur > 0) select(cur - 1, true); });
  }
  if ($('tracks')) fetch('/media/music/album.json').then(function (r) { return r.json(); }).then(function (a) {
    album = a;
    var ol = $('tracks');
    a.tracks.forEach(function (t, k) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img alt="" loading="lazy" width="48" height="48"><span><b></b><small></small></span><small></small>';
      b.querySelector('img').src = '/media/music/covers/' + name(t) + '-600.png';
      b.querySelector('b').textContent = t.title; b.querySelector('span small').textContent = t.key + ' · ' + t.tempo + ' bpm';
      b.lastChild.textContent = fmt(t.seconds);
      b.addEventListener('click', function () { if (k === cur && !audio.paused) audio.pause(); else select(k, true); });
      li.appendChild(b); ol.appendChild(li);
    });
    $('albumMeta').textContent = a.tracks.length + ' tracks · ' + a.artist + ' · ' + a.year;
    select(0, false);
  }).catch(function () {});

  // ---------------------------------------------------------------- the note roll
  var roll = $('roll'), rg = roll && roll.getContext('2d'), rollData = null, rollVisible = false, rollRaf = 0;
  var COLORS = [C.gold, C.sea, C.bright, C.cream, C.deep, C.goldDeep];
  function loadRoll(t) {
    if (!roll) return;
    if (rolls[t.slug]) { rollData = rolls[t.slug]; drawRoll(); return; }
    fetch('/media/music/roll/' + name(t) + '.json').then(function (r) { return r.json(); }).then(function (d) { rolls[t.slug] = d; if (album.tracks[cur].slug === t.slug) { rollData = d; drawRoll(); } }).catch(function () {});
  }
  function drawRoll() {
    if (!rg || !rollData) return;
    var W = roll.width, H = roll.height, d = rollData, tpb = d.ticksPerBeat, bpb = d.beatsPerBar;
    var now = (audio.currentTime || 0) * d.tempo / 60 * tpb;
    var span = bpb * tpb * 4, x0 = now - span * 0.3, sx = W / span, lo = d.low, hi = d.high, sy = (H - 40) / (hi - lo + 1);
    rg.fillStyle = C.ink; rg.fillRect(0, 0, W, H);
    for (var b = Math.floor(x0 / (bpb * tpb)); b * bpb * tpb < x0 + span; b++) { var bx = (b * bpb * tpb - x0) * sx; rg.fillStyle = 'rgba(246,235,221,.06)'; rg.fillRect(Math.round(bx), 0, 1, H); }
    var n = d.notes;
    for (var i = 0; i < n.length; i += 4) {
      var ch = n[i], s = n[i + 1], e = n[i + 2], p = n[i + 3];
      if (e < x0 || s > x0 + span) continue;
      var on = now >= s && now < e, x = (s - x0) * sx, w = Math.max(2, (e - s) * sx - 1);
      if (ch < 0) { rg.fillStyle = on ? C.cream : 'rgba(246,235,221,.28)'; rg.fillRect(x, H - 30 + (p % 6) * 4, Math.max(2, w), 3); continue; }
      rg.globalAlpha = on ? 1 : s < now ? 0.45 : 0.8;
      rg.fillStyle = COLORS[ch % COLORS.length];
      rg.fillRect(x, H - 40 - (p - lo + 1) * sy, w, Math.max(2, sy - 1));
    }
    rg.globalAlpha = 1;
    rg.fillStyle = C.gold; rg.fillRect(Math.round(W * 0.3), 0, 2, H);
  }
  function rollLoop() { drawRoll(); rollRaf = rollVisible && !audio.paused ? requestAnimationFrame(rollLoop) : 0; }
  if (roll) {
    onScreen(roll, function (v) { rollVisible = v; if (v && !rollRaf) rollLoop(); });
    audio.addEventListener('play', function () { if (rollVisible && !rollRaf) rollLoop(); });
    audio.addEventListener('seeked', drawRoll);
  }
})();
