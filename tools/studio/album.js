/* Freely Given: eight tracks, fast rock with an industrial edge. Every track has the same plan: an intro, the
   theme twice, the chorus, a quiet industrial break, the theme on double kick, the chorus again and a short outro.
   The middle repeats until the track reaches its length. Melodies: "pitch:beats", '|' between bars. */
(function (root) {
  'use strict';
  function S(bars, chords, o) { return Object.assign({ bars: bars, chords: chords }, o || {}); }
  function form(t) {
    var p = t.pulse, k = t.keys || 'pad';
    var parts = [
      S(4, t.cA.split(' ').slice(0, 4).join(' '), { riff: 'whole', bass: 'whole', pulse: p, layer: 'low', drums: 'half time' }),
      S(8, t.cA, { keys: k === 'hits' ? 'hits' : 'melody', melody: t.A, riff: t.riffA || 'chug', bass: 'eighths', pulse: p, arp: t.arp, drums: 'rock backbeat', fill: 8 }),
      S(8, t.cA, { lead: t.A, riff: t.riffA || 'chug', bass: 'octaves', keys: k, pulse: p, arp: t.arp, drums: t.drumsA || 'rock backbeat', fill: 8 }),
      S(8, t.cB, { lead: t.B, riff: t.riffB || 'push', bass: 'octaves', keys: k, layer: 'high', pulse: p, arp: t.arp, drums: 'boss double kick', fill: 4, fillWith: 'snare roll fill' }),
      S(8, t.cA, { keys: k === 'hits' ? 'hits' : 'pad', layer: 'low', pulse: p || 'eighths', bass: 'whole', drums: t.breakDrums || 'breakbeat' }),
      S(8, t.cA, { lead: t.A, riff: t.riffC || 'gallop', bass: 'octaves', keys: k, layer: 'high', pulse: p, arp: t.arp, drums: 'boss double kick', fill: 8 }),
      S(8, t.cB, { lead: t.B, riff: t.riffB || 'push', bass: 'octaves', keys: k, layer: 'high', pulse: p, arp: t.arp, drums: 'boss double kick', fill: 4, fillWith: 'snare roll fill' })
    ];
    var target = Math.round(t.seconds * t.tempo / 60 / 4), outro = S(4, t.cEnd, { lead: t.end, riff: 'whole', bass: 'whole', keys: 'pad', layer: 'high', drums: 'half time' });
    var n = function () { return parts.reduce(function (a, s) { return a + s.bars; }, 0) + 4; };
    for (var i = 1; n() + 8 <= Math.min(target, 123); i++) parts.push(parts[1 + ((i - 1) % 6)]);
    return parts.concat([outro]);
  }
  var T = [
    { n: 1, slug: 'first-light', title: 'First Light', key: 'E', mode: 'minor', tempo: 160, seconds: 150,
      about: 'Morning, before anyone else is up. A pulse, an organ, then the whole band at once.',
      instruments: { lead: 'distortion guitar', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'rock organ', layer: 'strings', extra: 'pulse bass' }, pulse: 'eighths',
      cA: 'Em C G D Em C D B', cB: 'C D Em Em C D B B', cEnd: 'C D Em Em',
      A: 'E5:1 G5:1 B5:1.5 A5:0.5 | G5:2 E5:2 | D5:1 G5:1 B5:1 D6:1 | A5:3 r:1 | E5:1 G5:1 B5:1.5 A5:0.5 | G5:1 E6:2 D6:1 | C6:1 B5:1 A5:1 F#5:1 | B5:4',
      B: 'E5:1 G5:1 C6:2 | D6:1 C6:1 B5:1 A5:1 | B5:2 G5:1 E5:1 | B5:3 r:1 | C6:1 E6:1 G6:1 E6:1 | F#6:1 E6:1 D6:1 A5:1 | B5:1 D#6:1 F#6:1 D#6:1 | B5:4',
      end: 'C6:2 B5:2 | A5:2 F#5:2 | E5:8' },
    { n: 2, slug: 'common-ground', title: 'Common Ground', key: 'A', mode: 'minor', tempo: 168, seconds: 150,
      about: 'Two guitars that disagree for a while, and a piano that keeps them in the same room.',
      instruments: { lead: 'overdrive guitar', rhythm: 'distortion guitar', bass: 'fingered bass', keys: 'grand piano', layer: 'slow strings', extra: 'guitar harmonics' }, arp: 'updown',
      cA: 'Am F C G Am F G E', cB: 'F G Am Am F G E E', cEnd: 'F G Am Am', riffA: 'stab', riffC: 'chug',
      A: 'A4:0.5 C5:0.5 E5:1 A5:1 G5:1 | F5:1.5 E5:0.5 C5:2 | E5:1 G5:1 C6:1 B5:1 | D5:2 G5:2 | A4:0.5 C5:0.5 E5:1 A5:1 C6:1 | A5:1 F5:1 C6:1.5 A5:0.5 | G5:1 B5:1 D6:1 B5:1 | G#5:4',
      B: 'A5:1 C6:1 F6:2 | G6:1 F6:1 E6:1 D6:1 | E6:2 C6:1 A5:1 | E6:3 r:1 | F6:1 E6:1 C6:1 A5:1 | D6:1.5 C6:0.5 B5:1 G5:1 | G#5:1 B5:1 E6:1 D6:1 | E6:4',
      end: 'F5:2 A5:2 | G5:2 B5:2 | A5:8' },
    { n: 3, slug: 'many-hands', title: 'Many Hands', key: 'D', mode: 'minor', tempo: 172, seconds: 155,
      about: 'Brass and a synth lead trading the tune, with a sixteenth-note pulse under everyone.',
      instruments: { lead: 'fifth saw lead', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'rock organ', layer: 'brass section', extra: 'pulse bass' }, kit: 'industrial kit', pulse: 'sixteenths',
      cA: 'Dm Bb F C Dm Bb C A', cB: 'Gm Bb F C Gm Bb A A', cEnd: 'Bb A Dm Dm', riffA: 'gallop', riffC: 'chug',
      A: 'D5:1 F5:1 A5:1 D6:1 | C6:1 Bb5:1 F5:2 | A5:1 C6:1 F6:1 C6:1 | E6:2 G5:2 | F5:1 A5:1 D6:1.5 C6:0.5 | Bb5:1 D6:1 F6:1 D6:1 | E6:1 C6:1 G5:1 E5:1 | C#5:2 E5:1 A5:1',
      B: 'G5:1 Bb5:1 D6:2 | F6:1.5 E6:0.5 D6:1 Bb5:1 | A5:1 C6:1 F6:2 | E6:1 D6:1 C6:1 G5:1 | Bb5:1 D6:1 G6:2 | F6:1 D6:1 Bb5:2 | A5:1 C#6:1 E6:1 G6:1 | A6:4',
      end: 'Bb5:2 D6:2 | C#6:2 E6:2 | D6:8' },
    { n: 4, slug: 'open-hand', title: 'Open Hand', key: 'G', mode: 'minor', tempo: 150, seconds: 160,
      about: 'Heavy and slow to anger. Metal hits on the off-beat, a choir above the noise.',
      instruments: { lead: 'distortion guitar', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'metal hit', layer: 'choir soprano', extra: 'pulse bass' }, kit: 'industrial kit', pulse: 'sixteenths', keys: 'hits',
      cA: 'Gm Gm Eb D Gm Gm Eb D', cB: 'Cm Eb Bb D Cm Eb D D', cEnd: 'Eb D Gm Gm', riffA: 'chug', riffB: 'half', riffC: 'gallop', drumsA: 'half time', breakDrums: 'sparse',
      A: 'G4:1.5 Bb4:0.5 D5:2 | C5:1 Bb4:1 A4:2 | Bb4:1.5 G4:0.5 Eb5:2 | D5:4 | G5:1.5 F5:0.5 D5:2 | Eb5:1 D5:1 Bb4:2 | C5:1 Bb4:1 G4:1 Eb5:1 | D5:4',
      B: 'C5:1 Eb5:1 G5:2 | Bb5:1.5 G5:0.5 Eb5:2 | D5:1 F5:1 Bb5:2 | A5:2 F#5:2 | G5:1 C6:1 Eb6:2 | D6:1 C6:1 Bb5:2 | A5:1 F#5:1 D5:1 A5:1 | F#5:4',
      end: 'Eb5:2 C5:2 | D5:2 F#5:2 | G5:8' },
    { n: 5, slug: 'signal', title: 'Signal', key: 'E', mode: 'minor', tempo: 176, seconds: 150,
      about: 'A message tapped out again and again until somebody answers.',
      instruments: { lead: 'fifth saw lead', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'metal hit', layer: 'tremolo strings', extra: 'pulse bass' }, kit: 'industrial kit', pulse: 'sixteenths', keys: 'hits',
      cA: 'Em Em G A Em Em C B', cB: 'C D Em Em C D B B', cEnd: 'C B Em Em', riffA: 'stab', riffC: 'chug',
      A: 'E5:0.5 E5:0.5 r:0.5 E5:0.5 G5:0.5 E5:0.5 D5:1 | E5:0.5 E5:0.5 r:0.5 B4:0.5 D5:1 E5:1 | G5:0.5 G5:0.5 r:0.5 G5:0.5 B5:0.5 G5:0.5 D5:1 | A5:0.5 A5:0.5 r:0.5 C#6:0.5 E6:2 | ' +
        'E5:0.5 E5:0.5 r:0.5 E5:0.5 G5:0.5 E5:0.5 D5:1 | B5:0.5 B5:0.5 r:0.5 A5:0.5 G5:1 E5:1 | G5:1 E5:1 C5:1 E5:1 | D#5:2 F#5:1 B5:1',
      B: 'E6:2 G6:2 | F#6:1 E6:1 D6:2 | B5:1 E6:1 G6:1 B6:1 | B6:3 r:1 | C6:1 E6:1 G6:1 E6:1 | D6:1 F#6:1 A6:1 F#6:1 | D#6:1 F#6:1 B6:1 A6:1 | B6:4',
      end: 'C6:2 E6:2 | B5:2 D#6:2 | E6:8' },
    { n: 6, slug: 'cornerstone', title: 'Cornerstone', key: 'B', mode: 'minor', tempo: 164, seconds: 160,
      about: 'The stone the builders rejected. A pipe organ and a choir under the loudest guitars on the record.',
      instruments: { lead: 'overdrive guitar', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'pipe organ', layer: 'choir soprano', extra: 'pulse bass' }, pulse: 'eighths',
      cA: 'Bm G D A Bm G A F#', cB: 'G A Bm Bm G A F# F#', cEnd: 'G F# Bm Bm', riffA: 'push', riffB: 'chug', riffC: 'gallop',
      A: 'B4:1 D5:1 F#5:1.5 E5:0.5 | D5:1 B4:1 G5:2 | F#5:1 A5:1 D6:1.5 C#6:0.5 | C#6:2 A5:2 | B5:1 D6:1 F#6:1.5 E6:0.5 | D6:1 B5:1 G5:2 | A5:1 C#6:1 E6:1 C#6:1 | A#5:2 F#5:2',
      B: 'G5:1 B5:1 D6:2 | E6:1.5 D6:0.5 C#6:2 | D6:1 F#6:1 B6:2 | A6:2 F#6:2 | G6:1 F#6:1 E6:1 D6:1 | E6:1 C#6:1 A5:2 | A#5:1 C#6:1 F#6:1 E6:1 | F#6:4',
      end: 'G5:2 B5:2 | A#5:2 C#6:2 | B5:8' },
    { n: 7, slug: 'works-of-mercy', title: 'Works of Mercy', key: 'C', mode: 'minor', tempo: 156, seconds: 155,
      about: 'Feed, give drink, clothe, shelter, visit, bury. A piano keeps count; the strings do the work.',
      instruments: { lead: 'overdrive guitar', rhythm: 'distortion guitar', bass: 'fingered bass', keys: 'grand piano', layer: 'strings', extra: 'pizzicato strings' }, arp: 'up',
      cA: 'Cm Ab Eb Bb Cm Ab Bb G', cB: 'Fm Ab Eb Bb Fm Ab G G', cEnd: 'Ab G Cm Cm', riffA: 'chug', riffB: 'push', riffC: 'stab',
      A: 'C5:1 Eb5:1 G5:2 | Ab5:1 G5:1 Eb5:2 | G5:1 Bb5:1 Eb6:1.5 D6:0.5 | D6:2 Bb5:2 | C6:1 Bb5:1 G5:1 Eb5:1 | F5:1 Ab5:1 C6:2 | Bb5:1 D6:1 F6:1 D6:1 | B5:4',
      B: 'F5:1 Ab5:1 C6:2 | Eb6:1.5 D6:0.5 C6:2 | Bb5:1 G5:1 Eb6:2 | D6:2 F6:2 | F6:1 Eb6:1 C6:1 Ab5:1 | Eb6:1 C6:1 Ab5:2 | G5:1 B5:1 D6:1 F6:1 | G6:4',
      end: 'Ab5:2 C6:2 | B5:2 D6:2 | C6:8' },
    { n: 8, slug: 'freely-given', title: 'Freely Given', key: 'D', mode: 'major', tempo: 160, seconds: 165,
      about: 'Freely you have received; freely give. The last track turns to the major key and keeps going.',
      instruments: { lead: 'distortion guitar', rhythm: 'distortion guitar', bass: 'picked bass', keys: 'pipe organ', layer: 'brass section', extra: 'tubular bell' }, arp: 'up',
      cA: 'D A Bm G D G A D', cB: 'G A F#m Bm G A D D', cEnd: 'G A D D', riffA: 'chug', riffB: 'push', riffC: 'gallop',
      A: 'F#5:1 A5:1 D6:1.5 C#6:0.5 | C#6:2 A5:2 | B5:1 D6:1 F#6:1.5 E6:0.5 | D6:2 B5:2 | A5:1 F#5:1 D6:2 | B5:1 D6:1 G6:2 | E6:1 C#6:1 A5:1 C#6:1 | D6:4',
      B: 'G5:1 B5:1 D6:2 | E6:1.5 D6:0.5 C#6:2 | C#6:1 F#6:1 A6:2 | F#6:2 D6:2 | B5:1 D6:1 G6:2 | A6:1 G6:1 E6:2 | F#6:1 E6:1 D6:1 A5:1 | D6:4',
      end: 'G5:2 B5:2 | A5:2 C#6:2 | D6:8' }
  ];
  T.forEach(function (t) { t.sections = form(t); });
  root.FG.TRACKS = T;
})(window);
