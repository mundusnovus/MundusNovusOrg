/* christiansystems.org: the mark that draws itself, a sprite being drawn, the album player and the note roll
   that follows it. Everything waits until it is on screen, and holds still for people who ask for less motion. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var C = { ink: '#140708', night: '#1f0b0d', coal: '#2a1416', wine: '#4a0a0f', red: '#e3261c', deep: '#a8151b', gold: '#f2b33d', light: '#ffd36b', goldDeep: '#b87a14', cream: '#f6ebdd', bright: '#f2492f' };
  function onScreen(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn(true);
    new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting); }); }, { threshold: 0.15 }).observe(el);
  }

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
    var g = cv.getContext('2d'), steps = [];
    var pins = [20, 29, 38];
    pins.forEach(function (p) { steps.push([p, 9, 6, 5, C.gold], [p, 50, 6, 5, C.gold], [9, p, 5, 6, C.gold], [50, p, 5, 6, C.gold]); });
    for (var y = 14; y < 50; y += 2) steps.push([14, y, 36, 2, C.red]);
    for (y = 18; y < 46; y += 2) steps.push([29, y, 6, 2, C.cream]);
    for (var x = 21; x < 43; x += 2) steps.push([x, 25, 2, 6, C.cream]);
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
    function idle() { // one pin at a time catches the light
      var k = 0;
      setInterval(function () {
        draw(steps.length);
        var s = steps[k++ % 12]; g.fillStyle = C.light; g.fillRect(s[0], s[1], s[2], s[3]);
      }, 900);
    }
  })();

  // ---------------------------------------------------------------- a lantern, drawn the way a person would
  (function () {
    var cv = $('spriteCanvas'), pal = $('spritePalette'); if (!cv) return;
    var P = { k: '#3d1c1a', d: C.goldDeep, g: C.gold, l: C.light, c: C.night, a: C.deep, o: C.bright, r: C.red, w: C.cream };
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
  var COLORS = [C.gold, C.red, C.bright, C.cream, C.deep, C.goldDeep];
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
