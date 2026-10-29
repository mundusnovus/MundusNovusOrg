/* Freely Given, the Christian Systems soundtrack: the engine. Every track is written with ChristianBox's own song
   tools (power-chord riffs, pulse bass, band presets, auto mix) and rendered with its BeepBox synth, so the album is
   also a test of the app. Tracks are in album.js. In soundtrack.html: await FG.make(1), or await FG.make('all'). */
(function (root) {
  'use strict';
  var NS = root.CBox, B = root.beepbox;
  var ALBUM = 'Freely Given', ARTIST = 'Christian Systems', YEAR = '2026', RATE = 44100, LOUDNESS = -14;

  function makeHost() {
    return { song: new B.Song(), silent: true, getSong: function () { return this.song; }, commit: function (s) { this.song = s; }, play: function () {}, stop: function () {}, undo: function () {} };
  }
  async function save(path, data) { // retries, since a big upload now and then fails to connect
    for (var k = 0; ; k++) {
      try { var r = await fetch('/save/' + path, { method: 'POST', body: data }); if (r.ok) return; throw new Error('save failed ' + path); }
      catch (e) { if (k >= 3) throw e; await new Promise(function (res) { setTimeout(res, 1000 * (k + 1)); }); }
    }
  }
  function log(s) { var el = document.getElementById('log'); if (el) el.textContent += s + '\n'; }

  // "E5:1 G5:1.5 r:0.5 | ..." (pitch:beats, r = rest, '|' = barline, checked) -> ChristianBox note text "E5@0+1 ..."
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function shift(name, semis) { var m = /^([A-G][#b]?)(-?\d)$/.exec(name), midi = PC[m[1]] + 12 * (+m[2] + 1) + semis; return NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }
  function seq(str, bpb, transpose, vol) {
    var out = [], t = 0, barStart = 0, bar = 1;
    str.split(/\s+/).filter(Boolean).forEach(function (tok) {
      if (tok === '|') { if (Math.abs(t - barStart - bpb) > 1e-6) throw new Error('bar ' + bar + ' of "' + str.slice(0, 40) + '…" has ' + (t - barStart) + ' beats'); barStart = t; bar++; return; }
      var m = /^([^:]+):([\d.]+)$/.exec(tok); if (!m) throw new Error('bad token ' + tok);
      if (m[1] !== 'r') out.push(m[1].split('/').map(function (p) { return transpose ? shift(p, transpose) : p; }).join('/') + '@' + +t.toFixed(4) + '+' + m[2] + (vol ? 'v' + vol : ''));
      t += +m[2];
    });
    return out.join(' ');
  }
  // metal hits on the off-beats, on each bar's chord root
  function hits(chords, bars) {
    var list = chords.split(/\s+/), out = [];
    for (var b = 0; b < bars; b++) { var r = 60 + PC[/^([A-G][#b]?)/.exec(list[b % list.length])[1]]; [1.5, 3.5].forEach(function (x) { out.push(NAMES[r % 12] + '5@' + (b * 4 + x) + '+0.5'); }); }
    return out.join(' ');
  }

  // Channels: 1 lead, 2 rhythm guitar, 3 bass, 4 keys, 5 layer, 6 extra (pulse bass or an arpeggio), 7 drums.
  var CH = { lead: 1, rhythm: 2, bass: 3, keys: 4, layer: 5, extra: 6 }, DRUMS = 7;
  async function compose(def) {
    var host = makeHost(), tools = NS.songtools.create(B, host), run = function (n, a) { return tools.run(n, a); };
    var total = def.sections.reduce(function (n, s) { return n + s.bars; }, 0) + 1; // one more bar for the tail
    await run('new_song', { layout: 'standard', key: def.key, scale: 'expert', tempo: def.tempo, bars: total });
    for (var k = 0; k < 3; k++) await run('add_channel', { type: 'pitch', octave: 3 });
    for (var part in CH) await run('set_instrument', { channel: CH[part], preset: def.instruments[part], settings: part === 'rhythm' ? { chord: 'simultaneous' } : undefined });
    await run('set_instrument', { channel: DRUMS, preset: def.kit || 'rock kit' });
    var bar = 1, warnings = [];
    for (k = 0; k < def.sections.length; k++) {
      var s = def.sections[k];
      var gen = function (ch, o) { return run('generate_part', Object.assign({ channel: ch, progression: s.chords, bars: s.bars, start_bar: bar }, o)); };
      var write = async function (ch, notes) { var r = await run('write_track', { channel: ch, start_bar: bar, bars: s.bars, notes: notes }); if (r.warnings) warnings = warnings.concat(r.warnings); };
      if (s.lead) await write(1, seq(s.lead, 4, s.leadShift || 0));
      if (s.riff) await gen(2, { kind: 'power', style: s.riff });
      if (s.bass) await gen(3, { kind: 'bass', style: s.bass, octave: 2 });
      if (s.keys === 'hits') await write(4, hits(s.chords, s.bars));
      else if (s.keys === 'melody') await write(4, seq(s.lead || s.melody, 4, -12, 67));
      else if (s.keys) await gen(4, { kind: 'pad', octave: 4, vol: 67 });
      if (s.layer) await gen(5, { kind: 'pad', octave: s.layer === 'high' ? 5 : 4 });
      if (s.pulse) await gen(6, { kind: 'pulse', style: s.pulse, octaves: 2 });
      else if (s.arp) await gen(6, { kind: 'arpeggio', style: s.arp, step: 0.25, octave: 4, vol: 67 });
      if (s.drums) await gen(DRUMS, Object.assign({ kind: 'drums', template: s.drums }, s.fill ? { fill_every: s.fill, fill_template: s.fillWith || 'tom fill' } : {}));
      bar += s.bars;
    }
    var mix = await run('auto_mix', { reference: 1, targets: Object.assign({ 2: -3, 3: -5, 4: -8, 5: -9, 6: -8, drums: -2 }, def.mix || {}), passes: 8, max_seconds: 240 });
    return { host: host, tools: tools, warnings: warnings, mix: mix.message };
  }

  // ---------------------------------------------------------------- mastering and files
  function master(L, R) {
    var sum = 0, n = L.length;
    for (var i = 0; i < n; i++) sum += L[i] * L[i] + R[i] * R[i];
    var gain = Math.pow(10, LOUDNESS / 20) / Math.max(Math.sqrt(sum / (2 * n)), 1e-9), ceil = Math.pow(10, -1 / 20), knee = 0.7, fade = Math.floor(RATE * 0.4), peak = 0;
    function soft(x) { x *= gain; var a = Math.abs(x); return a <= knee ? x : Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))); }
    for (i = 0; i < n; i++) { var f = i > n - fade ? (n - i) / fade : 1; L[i] = soft(L[i]) * f; R[i] = soft(R[i]) * f; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
    return { gainDb: +(20 * Math.log10(gain)).toFixed(1), peakDbfs: +(20 * Math.log10(peak)).toFixed(2) };
  }
  function toInt16(F) { var o = new Int16Array(F.length); for (var i = 0; i < F.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(F[i] * 32767))); return o; }
  async function mp3(L, R) {
    var enc = new lamejs.Mp3Encoder(2, RATE, 256), l = toInt16(L), r = toInt16(R), parts = [], blk = 1152;
    for (var i = 0; i < l.length; i += blk) { var b = enc.encodeBuffer(l.subarray(i, i + blk), r.subarray(i, i + blk)); if (b.length) parts.push(b); if (i % (blk * 400) === 0) await NS.audio.yieldNow(); }
    parts.push(enc.flush());
    return parts;
  }
  function id3(meta, cover) {
    function frame(id, body) { var h = new Uint8Array(10); for (var i = 0; i < 4; i++) h[i] = id.charCodeAt(i); var n = body.length; h[4] = n >>> 24; h[5] = n >>> 16 & 255; h[6] = n >>> 8 & 255; h[7] = n & 255; return [h, body]; }
    function text(id, s) { var u = new Uint8Array(3 + s.length * 2); u[0] = 1; u[1] = 0xFF; u[2] = 0xFE; for (var i = 0; i < s.length; i++) { u[3 + 2 * i] = s.charCodeAt(i) & 255; u[4 + 2 * i] = s.charCodeAt(i) >>> 8; } return frame(id, u); }
    var parts = [].concat(text('TIT2', meta.title), text('TPE1', ARTIST), text('TALB', ALBUM), text('TRCK', meta.n + '/' + root.FG.TRACKS.length), text('TYER', YEAR), text('TCON', 'Rock'),
      text('TCOP', '2026 Christian Systems, Christian Systems License 1.0 (GPL-3.0-only)'));
    if (cover) { var head = new TextEncoder().encode('\0image/png\0\x03Cover\0'), body = new Uint8Array(head.length + cover.length); body.set(head); body.set(cover, head.length); parts = parts.concat(frame('APIC', body)); }
    var size = parts.reduce(function (n, p) { return n + p.length; }, 0), h = new Uint8Array(10);
    h.set([73, 68, 51, 3, 0, 0, size >>> 21 & 127, size >>> 14 & 127, size >>> 7 & 127, size & 127]);
    return [h].concat(parts);
  }

  async function check(n) {
    var t = root.FG.TRACKS[n - 1], c = await compose(t), a = await c.tools.run('analyze_audio', { per_channel: true, max_seconds: 240 });
    return t.title + ' | ' + c.mix + ' | ' + a.channels.map(function (ch) { return ch.channel + '=' + ch.rmsDbfs; }).join(' ') + ' | ' + a.advice.join(' ') + (c.warnings.length ? ' | ' + c.warnings.slice(0, 4).join('; ') : '');
  }
  async function make(which) {
    var T = root.FG.TRACKS, list = which === 'all' ? T : T.filter(function (t) { return t.n === which || t.slug === which; }), out = [];
    for (var k = 0; k < list.length; k++) {
      var t = list[k], t0 = Date.now(), name = String(t.n).padStart(2, '0') + '-' + t.slug;
      var cr = await fetch('../../site/media/music/covers/' + name + '-600.png'), cover = cr.ok ? new Uint8Array(await cr.arrayBuffer()) : null;
      var c = await compose(t), song = c.host.getSong();
      var r = await NS.audio.renderSong(B, song, { sampleRate: RATE, loops: 1, yieldEvery: 50 });
      var m = master(r.L, r.R);
      await save('cs-music/src/' + name + '.song.json', JSON.stringify(song.toJsonObject(), null, 1));
      await save('cs-music/mp3/' + name + '.mp3', new Blob(id3(t, cover).concat(await mp3(r.L, r.R))));
      var info = { n: t.n, slug: t.slug, title: t.title, about: t.about, key: t.key + ' ' + t.mode, tempo: t.tempo, seconds: +r.seconds.toFixed(1), gainDb: m.gainDb, peakDbfs: m.peakDbfs };
      out.push(info); log(name + ' ' + info.seconds + 's ' + Math.round((Date.now() - t0) / 1000) + 's work | ' + c.mix.slice(0, 120));
    }
    if (which === 'all') await save('cs-music/album.json', JSON.stringify({ album: ALBUM, artist: ARTIST, year: YEAR, tracks: out }, null, 1));
    return out;
  }
  root.FG = { make: make, check: check, compose: compose, seq: seq, ALBUM: ALBUM, ARTIST: ARTIST };
})(window);
