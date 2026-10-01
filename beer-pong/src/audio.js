/* BP.Audio — SUPER BEER PONG sound engine.
 * A small Ricoh 2A03 (NES APU) emulation on Web Audio:
 *   pulse 1 + pulse 2 : band-limited PeriodicWaves built from the Fourier series of the 12.5/25/50% pulses
 *                       (75% = phase-inverted 25%, exactly like the hardware), 11-bit timer pitch quantisation,
 *                       per-frame (60 Hz) 4-bit volume envelopes, duty sequences, frame arpeggios, vibrato.
 *   triangle          : 32-step 4-bit stepped triangle (PeriodicWave), linear-counter style gate (no volume).
 *   noise             : real 15-bit LFSR, long (32767) + short "metallic" (93) modes, the 16 NTSC period rates
 *                       pre-generated as buffers, per-frame period changes via playbackRate.
 *   DMC (DPCM)        : 1-bit delta samples (7-bit counter +-2 per bit, NTSC DMC rate table), synthesised
 *                       procedurally then DPCM-encoded: kick, snare, crowd "OHH!" / "YEAH!" voice stingers.
 *   mixer             : 2A03-ish channel weights -> master -> 90 Hz 1st-order HP -> ~13 kHz LP -> out.
 * SFX steal a music channel (usually pulse 2 / noise) and hand it back afterwards, like NES drivers.
 * Music: tracker-style note strings, lookahead scheduler (25 ms tick, 120 ms horizon) on AudioContext time.
 * All compositions are original. Every public method is no-throw. */
(function () {
  'use strict'
  var BP = (window.BP = window.BP || {})
  var CPU = 1789773
  var NPER = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]
  var CHS = ['p1', 'p2', 'tr', 'no', 'dm']
  var K = 2.3 // overall headroom factor on top of the 2A03 linear DAC weights
  var LEVEL = { p1: 0.113 * K, p2: 0.113 * K, tr: 0.128 * K, no: 0.074 * K, dm: 0.42 * K }
  var LOOK = 0.12
  var MUSIC_BUS = 0.72 // music sits a little under the SFX so event sounds always read clearly
  var VIB = [0, 0.59, 0.95, 0.95, 0.59, 0, -0.59, -0.95, -0.95, -0.59]

  // ------------------------------------------------------------------ pitch helpers
  var NI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  function midiOf(s) {
    var m = /^([A-G])([#b]?)(\d)$/.exec(s)
    return m ? 12 * (+m[3] + 1) + NI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null
  }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12) }
  function nf(s) { return mf(midiOf(s)) }
  function qP(f) { var t = Math.round(CPU / (16 * f)) - 1; t = t < 8 ? 8 : t > 2047 ? 2047 : t; return CPU / (16 * (t + 1)) }
  function qT(f) { var t = Math.round(CPU / (32 * f)) - 1; t = t < 2 ? 2 : t > 2047 ? 2047 : t; return CPU / (32 * (t + 1)) }
  function hx(s) { return s.split('').map(function (c) { return parseInt(c, 16) }) }

  // ------------------------------------------------------------------ waveforms
  function stepWave(ctx, vals, H) {
    var N = vals.length, re = new Float32Array(H + 1), im = new Float32Array(H + 1)
    for (var n = 1; n <= H; n++) {
      var a = 0, b = 0, w = 2 * Math.PI * n
      for (var k = 0; k < N; k++) {
        var v = vals[k]
        if (!v) continue
        var t0 = k / N, t1 = (k + 1) / N
        a += v * (Math.sin(w * t1) - Math.sin(w * t0)) / w
        b += v * (Math.cos(w * t0) - Math.cos(w * t1)) / w
      }
      re[n] = 2 * a; im[n] = 2 * b
    }
    return ctx.createPeriodicWave(re, im, { disableNormalization: true })
  }
  var LFSR = {}
  function lfsr(mode) {
    if (LFSR[mode]) return LFSR[mode]
    var r = 1, b = [], tap = mode ? 6 : 1
    do {
      b.push((r & 1) ^ 1)
      var fb = (r & 1) ^ ((r >> tap) & 1)
      r = (r >> 1) | (fb << 14)
    } while (r !== 1 && b.length < 32767)
    var P = b.length, c = new Float64Array(P + 1)
    for (var i = 0; i < P; i++) c[i + 1] = c[i] + b[i]
    return (LFSR[mode] = { b: b, c: c, P: P })
  }

  // ------------------------------------------------------------------ DMC / DPCM
  var DMC_RATE = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54] // CPU cycles per bit (NTSC)
  // r: rate index, d: seconds. Sources are synthesised at the DMC bit rate, encoded to 1-bit deltas, then decoded.
  var DMS = { K: { r: 15, d: 0.17 }, S: { r: 15, d: 0.16 }, oh: { r: 14, d: 0.56 }, yeah: { r: 14, d: 0.64 } }
  var DMCL = {}
  function dpcmEncode(x) { // x: -1..1 at bit rate -> sample bytes (LSB first), like a .dmc file
    var c = 64, bytes = new Uint8Array(Math.ceil(x.length / 8))
    for (var i = 0; i < x.length; i++) {
      var bit = 64 + x[i] * 63 > c ? 1 : 0
      if (bit) { if (c <= 125) c += 2 } else if (c >= 2) c -= 2
      if (bit) bytes[i >> 3] |= 1 << (i & 7)
    }
    return bytes
  }
  function dpcmDecode(bytes, n) { // the 2A03 DMC output unit: 7-bit counter, +2 / -2 per bit, clamped
    var c = 64, lv = new Uint8Array(n)
    for (var i = 0; i < n; i++) {
      if ((bytes[i >> 3] >> (i & 7)) & 1) { if (c <= 125) c += 2 } else if (c >= 2) c -= 2
      lv[i] = c
    }
    return lv
  }
  function dmcSample(name) {
    if (DMCL[name]) return DMCL[name]
    var D = DMS[name], fs = CPU / DMC_RATE[D.r], n = Math.round(D.d * fs), tail = Math.round(0.03 * fs), x = new Float32Array(n + tail)
    var s = 0x1234567, rnd = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1 }
    var i, t, ph = 0
    if (name === 'K') for (i = 0; i < n; i++) { // pitch-dropping sine thump + click
      t = i / fs; ph += (2 * Math.PI * (48 + 120 * Math.exp(-t / 0.028))) / fs
      x[i] = Math.sin(ph) * Math.exp(-t / 0.07) * 0.95 + (t < 0.003 ? rnd() * 0.6 : 0)
    }
    else if (name === 'S') for (i = 0; i < n; i++) { // body tone + noise burst (slope overload makes it crunchy)
      t = i / fs; ph += (2 * Math.PI * (185 - 40 * t)) / fs
      x[i] = Math.sin(ph) * 0.85 * Math.exp(-t / 0.05) + rnd() * 0.9 * Math.exp(-t / 0.06)
    }
    else { // crowd vowel: 4 detuned glottal saws -> 3 time-varying formant resonators
      var yeah = name === 'yeah', mul = [1, 1.13, 0.88, 1.27], vph = [0, 0.3, 0.6, 0.15], st = [0, 0.012, 0.025, 0.006]
      var y = new Float32Array(n), F = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], peak = 1e-6, j
      for (i = 0; i < n; i++) {
        t = i / fs
        var u = t / D.d, f0 = yeah ? 150 + 60 * Math.sin(Math.PI * Math.min(1, u * 1.6)) : 170 - 55 * u, src = 0
        for (j = 0; j < 4; j++) {
          vph[j] = (vph[j] + (f0 * mul[j] * (1 + 0.01 * Math.sin(t * 37 + j))) / fs) % 1
          if (t >= st[j]) src += vph[j] * 2 - 1
        }
        src = src / 4 + rnd() * 0.12
        var fm = yeah ? (u < 0.2 ? [300, 2200, 2900] : u < 0.38 ? [540, 1800, 2500] : [760, 1220, 2500]) : [520, 880, 2450]
        var out = 0
        for (j = 0; j < 3; j++) {
          var bw = [90, 110, 160][j], r = Math.exp((-Math.PI * bw) / fs), a1 = 2 * r * Math.cos((2 * Math.PI * fm[j]) / fs), a2 = -r * r
          var o = (1 - r) * src + a1 * F[j][0] + a2 * F[j][1]
          F[j][1] = F[j][0]; F[j][0] = o; out += o * [1, 0.45, 0.2][j]
        }
        var env = Math.min(1, t / 0.03) * (u < 0.55 ? 1 : Math.max(0, (1 - u) / 0.45))
        y[i] = out * env; if (Math.abs(y[i]) > peak) peak = Math.abs(y[i])
      }
      for (i = 0; i < n; i++) x[i] = Math.tanh((y[i] / peak) * 2.2) * 0.95 // hot, soft-clipped: loud & crunchy once 1-bit encoded
    }
    var bytes = dpcmEncode(x)
    return (DMCL[name] = { lv: dpcmDecode(bytes, x.length), fs: fs, bytes: bytes })
  }

  // ------------------------------------------------------------------ instruments & drums
  // e: 4-bit volume per frame (hex, last value held)  d: duty per frame (0=12.5 1=25 2=50 3=75)
  // v: [vibrato delay frames, depth cents]  g: gate (fraction of note length before key-off)
  var INS = {
    lead: { d: '2111', e: 'cddcbba9', v: [14, 20], g: 0.94 },
    harm: { d: '1', e: '899887766', g: 0.92 },
    stab: { d: '0', e: 'b97543210', g: 1 },
    chug: { d: '0', e: 'c98765', g: 0.85 },
    clav: { d: '0', e: 'd963100', g: 1 },
    synth: { d: '2221111', e: '79bcccbbbaaa99', v: [18, 25], g: 0.96 },
    steel: { d: '2', e: 'fdb987766554433221', g: 1 },
    brass: { d: '2', e: 'acdddcccbbba', v: [16, 18], g: 0.92 },
    brass2: { d: '1', e: '789998887', g: 0.92 },
    buzz: { d: '0', e: 'a87654', g: 0.9 },
    soft: { d: '2', e: '56789998887777', v: [22, 16], g: 0.96 },
    harp: { d: '1', e: 'a8654332211', g: 1 },
    funk: { d: '1', e: 'dba98', v: [20, 15], g: 0.85 },
    bass: { g: 0.92 },
    bpl: { g: 0.7 },
  }
  for (var ik in INS) { INS[ik].E = INS[ik].e ? hx(INS[ik].e) : [15]; INS[ik].D = INS[ik].d ? hx(INS[ik].d) : [2] }
  // noise drums: n = period index per frame (hex), e = volume per frame, m = 1 for short/metallic mode
  var DR = {
    k: { n: '79bd', e: 'fdb9753100' },
    s: { n: '5', e: 'ecba9877654433221100' },
    h: { n: '2', e: '9630' },
    H: { n: '2', e: 'c840' },
    o: { n: '2', e: 'b9887766554433221100' },
    c: { n: '13', e: 'eddccbbaa99887766554433221100' },
    m: { n: '3', e: 'c96420', m: 1 },
    T: { n: 'ab', e: 'ec97530' },
  }
  for (var dk in DR) { DR[dk].N = hx(DR[dk].n); DR[dk].E = hx(DR[dk].e); DR[dk].m = DR[dk].m || 0 }

  // ------------------------------------------------------------------ songs (original compositions)
  // Rows are 16th notes. Tokens: C#5:3 (note:len)  r (rest)  ^ (tie)  2 (sticky default length)
  // t-5 (transpose)  v9 (volume)  @ins  %047 (frame arpeggio, hex semitones)  [ .. ]n repeat  $mac.
  // Noise: k kick, s snare, h/H hat, o open hat, c crash, m cowbell (short-mode), T tom.
  // p2 '<e3 v6' = Capcom-style echo of pulse 1 delayed 3 rows; '<h-2' = diatonic 3rd-below harmony.
  var SONGS = {
    title: {
      bpm: 150, k: 'C', sc: 'maj', ins: ['lead', 'harm', 'bass'], loop: 1, ord: 'I A B',
      pat: {
        I: ['C6:2 r:2 C6:2 r:2 C6:1 r:1 C6:2 D6:2 E6:2 D6:2 r:2 D6:2 r:2 D6:1 r:1 G6:6',
          'E5:2 r:2 E5:2 r:2 E5:1 r:1 E5:2 F5:2 G5:2 B5:2 r:2 B5:2 r:2 B5:1 r:1 D6:6',
          'C3:2 r:2 C3:2 r:2 C3:1 r:1 C3:2 D3:2 E3:2 G2:2 r:2 G2:2 r:2 G2:1 r:1 G2:2 A2:2 B2:2',
          's:2 r:2 s:2 r:2 s:1 r:1 k:2 k:2 k:2 s:2 r:2 s:2 r:2 s:1 r:1 s:1 s:1 s:1 s:1 s:1 s:1',
          'S:4 S:4 S:2 K:2 K:2 K:2 S:4 S:4 S:2 S:1 S:1 S:1 S:1 S:1 S:1'],
        A: ['E5:2 G5:2 C6:3 B5:1 C6:2 G5:2 E5:4 A5:2 C6:2 E6:3 D6:1 C6:2 A5:2 E5:4 F5:2 A5:2 C6:2 F6:4 E6:2 D6:2 C6:2 D6:6 B5:2 G5:4 r:2 G5:1 B5:1 C6:2 G5:2 E6:3 D6:1 C6:2 E6:2 G6:4 A6:4 G6:2 E6:2 C6:4 A5:4 F6:2 E6:2 D6:2 C6:2 D6:2 E6:2 F6:2 B5:2 C6:12 r:4',
          '@stab %047 [C5:3 C5:3 C5:2]2 %037 [A4:3 A4:3 A4:2]2 %047 [F4:3 F4:3 F4:2]2 [G4:3 G4:3 G4:2]2 [C5:3 C5:3 C5:2]2 %037 [A4:3 A4:3 A4:2]2 %047 F4:3 F4:3 F4:2 G4:3 G4:3 G4:2 C5:3 C5:3 C5:2 C5:8',
          '2 [C3 C4]4 [A2 A3]4 [F2 F3]4 [G2 G3]4 [C3 C4]4 [A2 A3]4 [F2 F3]2 [G2 G3]2 C3 C4 C3 G2 C3:8',
          '2 c h s h k k s h [k h s h k k s h]6 k h s h s:1 s:1 s:1 s:1 s s', '[K:4 S:4 K:2 K:2 S:4]7 K:4 S:4 S:1 S:1 S:1 S:1 S:2 S:2'],
        B: ['r:2 A5:2 B5:2 C6:2 E6:4 D6:2 C6:2 B5:4 G5:2 B5:2 E6:6 r:2 r:2 F5:2 A5:2 C6:2 F6:4 E6:2 C6:2 E6:6 D6:2 C6:2 G5:2 E5:4 F5:2 A5:2 D6:3 C6:1 D6:2 F6:2 A6:4 G6:4 F6:2 D6:2 B5:4 G5:4 E6:4 G6:4 A6:4 E6:4 F6:4 E6:2 D6:2 D6:2 B5:2 G5:2 B5:2',
          '<h-2 @harm',
          '2 [A2 A3]4 [E2 E3]4 [F2 F3]4 [C3 C4]4 [D3 D4]4 [G2 G3]4 [E2 E3]2 [A2 A3]2 [D3 D4]2 G2 G3 G2 B2',
          '2 c o s o k k s o [k o s o k k s o]6 k k s s s:1 s:1 s:1 s:1 s s', '[K:4 S:4 K:2 K:2 S:4]7 K:2 K:2 S:2 S:2 S:1 S:1 S:1 S:1 S:2 S:2'],
      },
    },
    stage0: { // BACKYARD BASH — party rock, G (mixolydian b7 flavour)
      bpm: 160, k: 'G', sc: 'maj', x: 'F', ins: ['lead', 'chug', 'bass'], loop: 0, ord: 'A A2 B C',
      mac: { h: 'G4:3 G4:3 G4:2 G4:2 G4:2 G4:2 G4:2', q: 'G2:2 G2:2 G3:2 G2:2 G2:2 G3:2 D3:2 G2:2',
        d: 'k:2 h:2 s:2 h:2 k:2 k:2 s:2 h:2', f: 'k:2 h:2 s:2 h:2 s:1 s:1 s:1 s:1 s:2 s:2',
        D: '[K:4 S:4 K:2 K:2 S:4]3 K:4 S:4 S:1 S:1 S:1 S:1 S:2 S:2' },
      pat: {
        A: ['G5:2 G5:1 G5:1 B5:2 D6:2 r:2 D6:2 B5:2 G5:2 A5:2 B5:2 A5:2 G5:2 F5:2 G5:6 E5:2 G5:2 C6:2 E6:4 D6:2 C6:2 A5:2 B5:4 A5:2 G5:2 D5:4 r:4',
          '%07c $h $h t-7 $h t0 $h', '$q $q t5 $q t0 $q', 'c:2 h:2 s:2 h:2 k:2 k:2 s:2 h:2 $d $d $f', '$D'],
        A2: ['A5:2 A5:1 A5:1 D6:2 F#6:2 r:2 F#6:2 E6:2 D6:2 E6:2 D6:2 C6:2 B5:2 A5:2 G5:2 E5:4 D5:2 G5:2 B5:2 D6:2 G6:4 F6:2 D6:2 E6:2 D6:2 C6:2 A5:2 F#5:4 D5:4',
          '%07c t-5 $h t-7 $h t0 $h t-5 $h', 't7 $q t5 $q t0 $q t7 $q', '$d $d $d $f', '$D'],
        B: ['E6:3 E6:3 E6:2 D6:2 B5:2 G5:4 C6:3 C6:3 C6:2 D6:2 E6:2 G6:4 G6:2 F6:2 D6:2 B5:2 D6:2 B5:2 G5:4 A5:4 B5:2 C6:2 D6:8',
          '%07c t-3 $h t-7 $h t0 $h t-5 $h', 't-3 $q t5 $q t0 $q t7 $q', '[k:2 o:2 s:2 o:2 k:2 k:2 s:2 o:2]3 $f', '$D'],
        C: ['C6:2 r:2 C6:2 r:2 E6:2 D6:2 C6:4 D6:2 r:2 D6:2 r:2 F#6:2 E6:2 D6:4 G6:6 D6:2 B5:4 G5:4 A5:2 B5:2 D6:2 B5:2 A5:2 G5:2 F5:2 D5:2',
          '%07c t-7 $h t-5 $h t0 $h G4:2 r:6 G4:2 G4:2 r:4', 't5 $q t7 $q t0 $q G2:2 A2:2 B2:2 D3:2 F3:2 E3:2 D3:2 B2:2', '$d $d $d $f', '$D'],
      },
    },
    stage1: { // FRAT BASEMENT — funk, E dorian, triangle slap-bass riff
      bpm: 108, k: 'E', sc: 'min', x: 'C# D#', ins: ['funk', 'clav', 'bpl'], loop: 0, ord: 'A A2 B B2',
      mac: { cl: 'r:2 E5:1 r:1 E5:1 r:1 E5:2 r:2 E5:1 r:1 E5:1 E5:1 r:2',
        e: 'E2:2 r:1 E2:1 r:2 E3:1 r:1 D3:2 B2:2 G2:1 A2:1 B2:2', a: 'A2:2 r:1 A2:1 r:2 A3:1 r:1 G3:2 E3:2 C#3:1 D3:1 E3:2',
        c: 'C3:2 r:1 C3:1 r:2 C4:1 r:1 B3:2 G3:2 E3:1 F#3:1 G3:2', b: 'B2:2 r:1 B2:1 r:2 B3:1 r:1 A3:2 F#3:2 D3:1 E3:1 F#3:2',
        m: 'A2:2 r:1 A2:1 r:2 A3:1 r:1 G3:2 E3:2 C3:1 D3:1 E3:2', s: 'B2:2 r:1 B2:1 r:2 B3:1 r:1 A3:2 F#3:2 D#3:1 E3:1 F#3:2',
        d: 'k:2 h:1 h:1 s:2 h:1 k:1 h:1 k:1 s:2 h:1 h:1 h:2', v: 'k:2 h:1 H:1 s:2 h:1 k:1 r:1 k:1 s:2 o:2 s:1 s:1',
        P: '%037a $cl $cl t5 %047a $cl $cl', Q: 't-4 %047b $cl t-5 %037a $cl t-7 $cl t-5 %047a $cl' },
      pat: {
        A: ['r:4 B5:1 r:1 D6:2 E6:2 r:2 D6:1 E6:1 G6:2 E6:3 D6:1 B5:2 A5:2 B5:4 r:4 r:4 C#6:1 r:1 E6:2 F#6:2 r:2 E6:1 F#6:1 A6:2 G6:3 F#6:1 E6:2 D6:2 E6:6 r:2',
          '$P', '$e $e $a $a', '$d $d $d $v'],
        A2: ['B6:2 r:2 B6:1 A6:1 G6:2 E6:2 r:2 G6:2 A6:2 B6:3 A6:1 G6:2 E6:2 D6:2 E6:6 A5:1 B5:1 C#6:1 E6:1 F#6:2 E6:2 C#6:2 B5:2 A5:4 r:2 E6:2 G6:2 F#6:1 E6:1 D6:2 B5:2 r:4',
          '$P', '$e $e $a $a', '$d $d $d $v'],
        B: ['G6:6 E6:2 B5:4 G5:4 F#6:6 D6:2 A5:4 F#5:4 E6:4 G6:4 C6:2 B5:2 A5:4 D#6:4 F#6:4 A6:4 B6:4',
          '$Q', '$c $b $m $s', '$d $d $d $v'],
        B2: ['r:2 G5:2 B5:2 E6:2 G6:4 E6:4 r:2 F#5:2 A5:2 D6:2 F#6:4 D6:4 C6:2 E6:2 A6:2 G6:2 E6:2 C6:2 A5:4 B5:2 r:2 B5:2 r:2 D#6:4 F#6:4',
          '$Q', '$c $b $m $s', '$d $v $d [s:1]8 [s:2]4'],
      },
    },
    stage2: { // ROOFTOP — night synth, A minor, echo lead
      bpm: 124, k: 'A', sc: 'min', x: 'G#', ins: ['synth', 'synth', 'bass'], loop: 0, ord: 'A B',
      mac: { d: 'k:2 h:1 h:1 s:2 h:1 h:1 k:2 h:1 h:1 s:2 h:2', f: 'k:2 h:1 h:1 s:2 h:1 h:1 k:1 k:1 s:1 s:1 s:1 s:1 s:2' },
      pat: {
        A: ['E5:4 A5:4 B5:2 C6:4 B5:2 A5:12 G5:2 F5:2 G5:4 C6:4 D6:2 E6:4 D6:2 D6:8 B5:4 G5:4 F5:4 A5:4 D6:2 F6:4 E6:2 E6:8 C6:4 A5:4 C6:4 A5:2 C6:2 F6:4 E6:2 D6:2 B5:8 G#5:4 E5:4',
          '<e3 v6', '2 [A2 A3]4 [F2 F3]4 [C3 C4]4 [G2 G3]4 [D3 D4]4 [A2 A3]4 [F2 F3]4 [E2 E3]4', '[$d]7 $f'],
        B: ['A6:6 G6:2 F6:4 E6:4 D6:6 E6:2 G6:4 B6:4 G6:6 E6:2 B5:4 E6:4 C7:8 B6:4 A6:4 F6:4 E6:2 D6:2 A5:4 D6:4 B5:4 C6:2 D6:2 G6:8 E6:4 G6:4 F6:4 A6:4 G#6:8 B6:4 E6:4',
          '<e3 v6', '2 [F2 F3]4 [G2 G3]4 [E2 E3]4 [A2 A3]4 [D3 D4]4 [G2 G3]4 [C3 C4]2 [F2 F3]2 [E2 E3]2 E2 E3 G#2 B2', '[$d]7 $f'],
      },
    },
    stage3: { // BEACH BONFIRE — calypso, F major, steel-pan pulse
      bpm: 132, k: 'F', sc: 'maj', ins: ['steel', 'stab', 'bass'], loop: 0, ord: 'A B',
      mac: { cp: 'r:2 F4:1 r:1 F4:2 F4:2 r:2 F4:1 r:1 F4:2 F4:2', cb: 'F2:3 F2:3 C3:2 F3:3 C3:3 F2:2',
        d: 'k:3 m:1 r:2 m:2 k:2 m:1 m:1 s:2 m:2', f: 'k:3 m:1 r:2 m:2 s:1 s:1 s:1 s:1 s:2 s:2' },
      pat: {
        A: ['C6:2 A5:2 C6:2 F6:3 E6:1 r:2 D6:2 C6:2 D6:3 D6:3 F6:2 Bb5:2 D6:2 C6:2 Bb5:2 C6:3 E6:3 G6:2 E6:2 C6:2 Bb5:2 G5:2 A5:3 C6:3 F6:2 r:8 C6:2 A5:2 C6:2 F6:3 G6:1 r:2 A6:2 G6:2 F6:3 D6:3 Bb5:2 D6:2 F6:2 G6:2 F6:2 E6:3 G6:3 E6:2 C6:2 D6:2 E6:2 G6:2 F6:6 C6:2 A5:4 r:4',
          '%047 $cp t5 $cp t7 $cp t0 $cp $cp t5 $cp t7 $cp t0 $cp', '$cb t5 $cb t7 $cb t0 $cb $cb t5 $cb t7 $cb t0 $cb', '[$d]3 $f [$d]3 $f'],
        B: ['A5:2 D6:2 F6:2 A6:3 G6:1 F6:2 E6:2 D6:2 Bb5:2 D6:2 G6:2 Bb6:3 A6:1 G6:2 F6:2 D6:2 E6:3 C6:3 G5:2 C6:3 E6:3 G6:2 A6:6 G6:2 F6:4 C6:4 D6:3 F6:3 Bb6:2 A6:2 G6:2 F6:2 D6:2 E6:3 G6:3 C7:2 Bb6:2 A6:2 G6:2 E6:2 F6:3 A6:3 F6:2 C6:3 A5:3 F5:2 G5:2 A5:2 Bb5:2 C6:2 E6:4 G6:4',
          't-3 %037 $cp t2 $cp t7 %047 $cp t0 $cp t5 $cp t7 $cp t0 $cp t7 $cp', 't-3 $cb t2 $cb t7 $cb t0 $cb t5 $cb t7 $cb t0 $cb t7 $cb', '[$d]3 $f [$d]3 $f'],
      },
    },
    stage4: { // CHAMPIONSHIP — heroic march, D major, brass in 3rds
      bpm: 116, k: 'D', sc: 'maj', ins: ['brass', 'brass2', 'bass'], loop: 0, ord: 'A B',
      mac: { mb: 'D3:4 A2:4 D3:4 A2:4', d: 'k:2 s:1 s:1 s:2 s:2 k:2 s:1 s:1 s:2 s:2', r: 's:1 s:1 s:1 s:1 s:1 s:1 s:1 s:1 k:2 s:2 k:2 c:2',
        n: 'c:2 s:1 s:1 s:2 s:2 k:2 s:1 s:1 s:2 s:2 [$d]2 $r [$d]3 $r',
        D: '[K:4 S:4 K:4 S:4]3 S:1 S:1 S:1 S:1 S:1 S:1 S:1 S:1 K:2 S:2 K:2 S:2 [K:4 S:4 K:4 S:4]3 S:2 S:2 S:2 S:2 K:2 S:2 K:2 S:2' },
      pat: {
        A: ['A5:3 A5:1 D6:4 F#6:3 E6:1 D6:4 B5:3 B5:1 D6:4 G6:6 F#6:2 F#6:3 E6:1 D6:2 A5:2 F#5:4 A5:4 E6:3 F#6:1 E6:2 C#6:2 A5:8 A5:3 A5:1 D6:4 F#6:3 G6:1 A6:4 B6:6 A6:2 G6:4 B5:4 G6:4 E6:4 E6:2 F#6:2 G6:2 C#6:2 D6:12 r:4',
          '<h-2 @brass2', '$mb t5 $mb t0 $mb t-5 $mb t0 $mb t5 $mb t0 E3:4 B2:4 A2:4 E2:4 D3:4 A2:4 D3:8', '$n', '$D'],
        B: ['F#6:3 F#6:1 D6:2 B5:2 F#5:4 B5:4 C#6:3 C#6:1 A5:2 F#5:2 C#5:4 F#5:4 D6:3 D6:1 B5:2 G5:2 D6:3 E6:1 G6:4 F#6:6 E6:2 D6:4 A5:4 B5:3 C#6:1 D6:4 B5:3 D6:1 G6:4 C#6:3 D6:1 E6:4 C#6:3 E6:1 A6:4 B6:4 A6:2 F#6:2 G6:4 F#6:2 E6:2 E6:4 F#6:2 G6:2 A6:8',
          '<h-2 @brass2', 't-3 $mb t4 $mb t5 $mb t0 $mb t5 $mb t-5 $mb t0 B2:4 F#2:4 G2:4 D3:4 t-5 $mb', '$n', '$D'],
      },
    },
    fire: { // ON FIRE — hype loop, D harmonic minor, 172 bpm
      bpm: 172, k: 'D', sc: 'min', x: 'C#', ins: ['lead', 'buzz', 'bass'], loop: 0, ord: 'A A2 B B2',
      mac: { d: 'k:2 h:1 h:1 s:2 h:1 h:1 k:1 h:1 k:1 h:1 s:2 h:1 h:1', f: 'k:2 h:1 h:1 s:2 h:1 h:1 s:1 s:1 s:1 s:1 s:1 s:1 c:2',
        x: 'D6:2 D6:1 D6:1 F6:2 A6:2 G6:2 F6:2 E6:2 F6:2 D6:2 D6:1 D6:1 F6:2 Bb6:2 A6:2 G6:2 F6:2 D6:2 E6:2 E6:1 E6:1 G6:2 C7:2 Bb6:2 G6:2 E6:2 C6:2',
        p: '%037 [D5:2]8 %047 [Bb4:2]8 [C5:2]8 [A4:2]8', q: '%037 [G4:2]8 [D5:2]8 %047 [Bb4:2]4 [C5:2]4 [A4:2]8',
        D: '[K:4 S:4 K:2 K:2 S:4]3 K:4 S:4 S:1 S:1 S:1 S:1 S:1 S:1 S:2',
        b: '2 [D2 D3]4 [Bb1 Bb2]4 [C2 C3]4 [A1 A2]4', c: '2 [G2 G3]4 [D2 D3]4 [Bb1 Bb2]2 [C2 C3]2 [A1 A2]4' },
      pat: {
        A: ['$x C#6:4 E6:4 A6:6 r:2', '$p', '$b', '[$d]3 $f', '$D'],
        A2: ['$x A6:2 G6:2 F6:2 E6:2 C#6:2 E6:2 A5:4', '$p', '$b', '[$d]3 $f', '$D'],
        B: ['Bb6:6 A6:2 G6:4 D6:4 F6:6 E6:2 D6:4 A5:4 Bb5:2 D6:2 F6:4 C6:2 E6:2 G6:4 A6:2 r:2 A6:2 r:2 C#7:2 r:2 E7:4', '$q', '$c', '[$d]3 $f', '$D'],
        B2: ['Bb6:2 A6:2 G6:2 F6:2 G6:2 F6:2 E6:2 D6:2 F6:2 E6:2 D6:2 C#6:2 D6:2 E6:2 F6:2 A6:2 Bb6:4 A6:4 G6:4 E6:4 C#6:4 E6:4 A6:8', '$q', '$c', '[$d]3 $f', '$D'],
      },
    },
    vs: {
      bpm: 150, k: 'D', sc: 'min', x: 'C#', ins: ['brass', 'brass2', 'bass'], loop: -1, ord: 'A',
      pat: { A: ['D6:2 r:1 D6:1 r:2 D6:2 F6:4 E6:4 A6:8', 'A5:2 r:1 A5:1 r:2 A5:2 D6:4 C#6:4 E6:8',
        'D3:2 r:1 D3:1 r:2 D3:2 Bb2:4 A2:4 A2:8', 'k:2 r:1 k:1 r:2 k:2 s:1 s:1 s:1 s:1 s:1 s:1 s:1 s:1 c:8'] },
    },
    clear: {
      bpm: 180, k: 'C', sc: 'maj', ins: ['lead', 'harm', 'bass'], loop: -1, ord: 'A',
      pat: { A: ['G5:2 C6:2 E6:2 G6:4 E6:2 G6:4 F6:2 A6:2 C7:4 G6:2 B6:2 D7:4 C7:12 r:4',
        'E5:2 G5:2 C6:2 E6:4 C6:2 E6:4 C6:2 F6:2 A6:4 D6:2 G6:2 B6:4 E6:12 r:4',
        'C3:2 r:2 C3:2 r:2 C3:2 r:2 E3:2 G3:2 F3:4 F2:4 G3:4 G2:4 C3:12 r:4',
        'k:2 h:2 s:2 h:2 k:2 h:2 s:2 s:1 s:1 k:4 s:4 k:4 s:1 s:1 s:1 s:1 c:12 r:4'] },
    },
    gameover: {
      bpm: 90, k: 'A', sc: 'min', x: 'G#', ins: ['soft', 'harm', 'bass'], loop: -1, ord: 'A',
      pat: { A: ['C6:4 B5:4 A5:4 G#5:4 A5:8', 'E5:4 F5:4 E5:4 D5:4 C5:8', 'A2:4 D3:4 E3:4 E2:4 A2:8', 'r:24'] },
    },
    entry: { // name entry — calm, F major
      bpm: 100, k: 'F', sc: 'maj', ins: ['soft', 'harp', 'bass'], loop: 0, ord: 'A B',
      mac: { M: '2 F4 A4 C5 A4 F4 A4 C5 A4', m: '2 D4 F4 A4 F4 D4 F4 A4 F4', Mh: '2 F4 A4 C5 A4', mh: '2 D4 F4 A4 F4', h: 'v6 [r:4 h:4 r:4 h:4]8' },
      pat: {
        A: ['A5:6 G5:2 F5:4 C5:4 D5:6 E5:2 F5:4 A5:4 Bb5:6 A5:2 G5:4 F5:4 G5:12 r:4 A5:6 Bb5:2 C6:4 A5:4 E5:6 F5:2 G5:4 E5:4 D5:4 F5:4 E5:4 G5:4 F5:12 r:4',
          '$M $m t-7 $M t-5 $M t0 $M t-5 $m t-7 $Mh t-5 $Mh t0 $M',
          'F2:8 C3:8 D3:8 A2:8 Bb2:8 F2:8 C3:8 G2:8 F2:8 C3:8 A2:8 E2:8 Bb2:8 C3:8 F2:8 C3:8', '$h'],
        B: ['F6:6 E6:2 D6:4 A5:4 D6:6 C6:2 Bb5:4 F5:4 G5:4 Bb5:4 D6:4 C6:4 E6:12 r:4 C6:4 A5:4 F5:4 A5:4 Bb5:4 D6:4 F6:4 D6:4 G5:4 Bb5:4 C6:4 E6:4 F6:12 r:4',
          '$m t-7 $M t-7 $m t-5 $M t0 $M t-7 $M t-7 $mh t-5 $Mh t0 $M',
          'D3:8 A2:8 Bb2:8 F2:8 G2:8 D3:8 C3:8 G2:8 F2:8 C3:8 Bb2:8 F2:8 G2:8 C3:8 F2:16', '$h'],
      },
    },
    scores: { // high-score table — bouncy I-vi-ii-V, C major
      bpm: 132, k: 'C', sc: 'maj', ins: ['lead', 'stab', 'bass'], loop: 0, ord: 'A B',
      mac: { os: 'r:2 C5:2 r:2 C5:2 r:2 C5:2 r:2 C5:2', o2: 'r:2 C5:2 r:2 C5:2', d: '[k:4 h:2 h:2 s:4 h:2 h:2]7 k:4 h:2 h:2 s:2 s:1 s:1 s:2 s:2' },
      pat: {
        A: ['E6:3 D6:1 C6:2 G5:2 A5:2 G5:2 E5:4 A5:3 B5:1 C6:2 E6:2 D6:4 C6:4 F6:3 E6:1 D6:2 A5:2 C6:2 A5:2 F5:4 G5:2 A5:2 B5:2 D6:2 F6:4 E6:2 D6:2 E6:3 D6:1 C6:2 G5:2 C6:2 E6:2 G6:4 A6:4 G6:2 E6:2 C6:4 E6:4 D6:4 F6:4 E6:2 D6:2 B5:4 C6:8 r:2 G5:2 A5:2 B5:2',
          '%047b $os %037a t-3 $os t2 $os %047a t-5 $os t0 %047b $os %037a t-3 $os t2 $o2 %047a t-5 $o2 t0 %047b $os',
          'C3:4 E3:4 G3:4 A3:4 A2:4 C3:4 E3:4 G3:4 D3:4 E3:4 F3:4 A3:4 G2:4 B2:4 D3:4 F3:4 C3:4 E3:4 G3:4 A3:4 A2:4 C3:4 E3:4 G3:4 D3:4 F3:4 G2:4 B2:4 C3:4 G2:4 C3:8', '$d'],
        B: ['A5:2 C6:2 F6:4 E6:2 C6:2 A5:4 G5:2 B5:2 E6:4 D6:2 B5:2 G5:4 F5:2 A5:2 D6:4 C6:2 A5:2 F5:4 G5:4 B5:4 D6:4 F6:4 A5:2 C6:2 F6:4 E6:2 C6:2 A5:4 G5:2 B5:2 E6:4 D6:2 B5:2 G5:4 D6:4 F6:4 G6:4 B6:4 C7:12 r:4',
          't-7 %047b $os t4 %037a $os t2 $os t-5 %047a $os t-7 %047b $os t4 %037a $os t2 $o2 t-5 %047a $o2 t0 %047b $os',
          'F2:4 A2:4 C3:4 E3:4 E2:4 G2:4 B2:4 D3:4 D3:4 E3:4 F3:4 A3:4 G2:4 B2:4 D3:4 F3:4 F2:4 A2:4 C3:4 E3:4 E2:4 G2:4 B2:4 D3:4 D3:4 F3:4 G2:4 B2:4 C3:4 G2:4 C3:8', '$d'],
      },
    },
  }

  // ------------------------------------------------------------------ song compiler
  var SCALE = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] }
  function pcOf(n) { return (midiOf(n + '4') % 12 + 12) % 12 }
  function harm(m, deg, S) {
    var root = pcOf(S.k), sc = SCALE[S.sc], rel = m - root, oct = Math.floor(rel / 12), i = sc.indexOf(rel - oct * 12)
    if (i < 0) return m - 4
    var ni = i + deg, oo = Math.floor(ni / 7)
    return root + 12 * (oct + oo) + sc[ni - oo * 7]
  }
  function expand(s, mac) {
    var g = 0, RX = /\[([^\[\]]*)\](\d+)/g
    while (/\$\w/.test(s) && g++ < 20) s = s.replace(/\$(\w+)/g, function (_, k) { return ' ' + ((mac && mac[k]) || '') + ' ' })
    g = 0
    while (/\[[^\[\]]*\]\d+/.test(s) && g++ < 50) s = s.replace(RX, function (_, b, n) { return new Array(+n + 1).join(' ' + b + ' ') })
    return s.split(/\s+/).filter(Boolean)
  }
  function parseLine(s, S, ch, ins) {
    var st = { l: 2, t: 0, v: 15, i: ins, a: null }, r = 0, out = [], last = null, m
    expand(s, S.mac).forEach(function (tk) {
      if (/^\d+$/.test(tk)) { st.l = +tk; return }
      if ((m = /^t(-?\d+)$/.exec(tk))) { st.t = +m[1]; return }
      if ((m = /^v(\d+)$/.exec(tk))) { st.v = +m[1]; return }
      if (tk[0] === '@') { st.i = tk.slice(1); return }
      if (tk[0] === '%') { st.a = tk.length > 1 ? hx(tk.slice(1)) : null; return }
      m = /^([^:]+)(?::(\d+))?$/.exec(tk)
      if (!m) return
      var n = m[2] ? +m[2] : st.l, x = m[1], mi
      if (x === '^') { if (last) last.n += n } else if (x === 'r') {
        if (ch !== 'no' && ch !== 'dm') out.push((last = { r: r, n: n, m: -1 })); else last = null
      } else if ((mi = midiOf(x)) != null) out.push((last = { r: r, n: n, m: mi + st.t, i: st.i, v: st.v, a: st.a }))
      else if (ch === 'no' || ch === 'dm') out.push((last = { r: r, n: n, m: x, v: st.v }))
      r += n
    })
    return { ev: out, len: r }
  }
  function compile(S) {
    var ev = { p1: [], p2: [], tr: [], no: [], dm: [] }, row = 0, loopRow = 0, dirs = [], warn = [], ins = S.ins || []
    S.ord.split(' ').forEach(function (pn, oi) {
      if (oi === S.loop) loopRow = row
      var P = S.pat[pn], res = {}, len = 0
      CHS.forEach(function (ch, ci) {
        var s = P[ci] || ''
        if (s[0] === '<') { res[ch] = s; return }
        var o = (res[ch] = parseLine(s, S, ch, ins[ci]))
        if (o.len > len) len = o.len
      })
      CHS.forEach(function (ch) {
        var o = res[ch]
        if (typeof o === 'string') { dirs.push([row, row + len, o]); return }
        if (o.len && o.len !== len) warn.push(pn + '.' + ch + ' ' + o.len + '/' + len)
        o.ev.forEach(function (e) { e.r += row; ev[ch].push(e) })
      })
      row += len
    })
    var loop = S.loop >= 0
    dirs.forEach(function (D) {
      var tk = D[2].slice(1).trim().split(/\s+/), m = /^([eh])(-?\d+)$/.exec(tk[0]), vv = 15, ii = null
      tk.slice(1).forEach(function (x) { if (x[0] === 'v') vv = +x.slice(1); if (x[0] === '@') ii = x.slice(1) })
      ev.p1.forEach(function (e) {
        if (e.m < 0) return
        var r = e.r, mm = e.m
        if (m[1] === 'e') { r += +m[2]; if (r >= row) { if (!loop) return; r = loopRow + r - row } } else mm = harm(mm, +m[2], S)
        if (r >= D[0] && r < D[1]) ev.p2.push({ r: r, n: e.n, m: mm, i: ii || e.i, v: Math.round((e.v * vv) / 15), a: e.a })
      })
    })
    ev.p2.sort(function (a, b) { return a.r - b.r })
    var loopIdx = {}
    CHS.forEach(function (ch) {
      var L = ev[ch]
      for (var i = 0; i < L.length; i++) {
        if (i < L.length - 1 && L[i].r + L[i].n > L[i + 1].r) L[i].n = L[i + 1].r - L[i].r
        if (L[i].r + L[i].n > row) L[i].n = row - L[i].r
      }
      loopIdx[ch] = firstIdx(L, loopRow)
    })
    return { ev: ev, rows: row, loopRow: loopRow, loop: loop, loopIdx: loopIdx, bpm: S.bpm, warn: warn, S: S }
  }
  function firstIdx(L, r) { var i = 0; while (i < L.length && L[i].r < r) i++; return i }
  var CMP = {}
  function song(name) { return CMP[name] || (SONGS[name] ? (CMP[name] = compile(SONGS[name])) : null) }

  // ------------------------------------------------------------------ engine (one per AudioContext)
  function Engine(ctx, seed) {
    var E = this, c = (this.ctx = ctx), s = seed >>> 0 || 1
    this.tempo = 1; this.busy = {}; this.nb = {}
    this.live = !(window.OfflineAudioContext && ctx instanceof window.OfflineAudioContext)
    this.rnd = function () {
      s = (s + 0x6d2b79f5) | 0
      var t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    this.master = c.createGain()
    var hp, lp = c.createBiquadFilter()
    try { var a = 1 / (1 + (2 * Math.PI * 90) / c.sampleRate); hp = c.createIIRFilter([a, -a], [1, -a]) } catch (e) {
      hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = -3
    }
    lp.type = 'lowpass'; lp.frequency.value = 13000; lp.Q.value = -3
    this.master.connect(hp); hp.connect(lp); lp.connect(c.destination)
    this.lvl = {}; this.gate = {}
    CHS.forEach(function (ch) {
      var l = (E.lvl[ch] = c.createGain()), g = (E.gate[ch] = c.createGain())
      l.gain.value = LEVEL[ch]; g.connect(l); l.connect(E.master)
    })
    this.pw = [[1, 0, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0]].map(function (v) { return stepWave(c, v, 160) })
    var tri = []
    for (var i = 0; i < 32; i++) tri.push((i < 16 ? 15 - i : i - 16) / 15)
    this.tw = stepWave(c, tri, 160)
  }
  // LFSR noise rendered at the NES clock rate for period index `idx`, box-filtered down to the sample rate.
  Engine.prototype.noise = function (mode, idx) {
    var key = mode * 16 + idx
    if (this.nb[key]) return this.nb[key]
    var L = lfsr(mode), sr = this.ctx.sampleRate, s = CPU / NPER[idx] / sr, n = Math.round(sr * (mode ? 0.5 : 1))
    if (mode) { var cyc = L.P / s; n = Math.max(1, Math.round(Math.ceil(n / cyc) * cyc)) }
    var buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), P = L.P
    function C(x) {
      var q = Math.floor(x / P), y = x - q * P, xi = Math.min(P - 1, Math.floor(y))
      return q * L.c[P] + L.c[xi] + (y - xi) * L.b[xi]
    }
    for (var i = 0, prev = 0; i < n; i++) { var nx = C((i + 1) * s); d[i] = (nx - prev) / s - 0.5; prev = nx }
    return (this.nb[key] = buf)
  }

  // decoded DMC levels -> AudioBuffer (sample-and-hold at the DMC bit rate, like the DAC)
  Engine.prototype.dmc = function (name) {
    var key = 'd' + name
    if (this.nb[key]) return this.nb[key]
    var S = dmcSample(name), sr = this.ctx.sampleRate, n = Math.ceil((S.lv.length * sr) / S.fs), buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0)
    for (var i = 0; i < n; i++) d[i] = (S.lv[Math.min(S.lv.length - 1, Math.floor((i * S.fs) / sr))] - 64) / 127
    return (this.nb[key] = buf)
  }
  function dmcHit(E, out, t, name) {
    if (!DMS[name]) return null
    var c = E.ctx, src = c.createBufferSource(), g = c.createGain(), buf = E.dmc(name)
    src.buffer = buf; src.connect(g); g.connect(out); src.start(t); src.stop(t + buf.duration + 0.01)
    drop(E, g, t + buf.duration)
    return [g]
  }

  // pulse voice: three phase-locked oscillators (12.5/25/50%), duty select gains, 4-bit volume gain
  function PV(E, out) {
    var c = E.ctx, me = this
    this.env = c.createGain(); this.env.gain.value = 0; this.env.connect(out)
    this.o = []; this.g = []; this.f = -1; this.v = -1; this.d = -1
    for (var i = 0; i < 3; i++) {
      var o = c.createOscillator(), g = c.createGain()
      o.setPeriodicWave(E.pw[i]); g.gain.value = 0; o.connect(g); g.connect(me.env)
      this.o.push(o); this.g.push(g)
    }
  }
  PV.prototype.start = function (t) { this.o.forEach(function (o) { o.start(t) }) }
  PV.prototype.stop = function (t) { try { this.o.forEach(function (o) { o.stop(t) }) } catch (e) {} }
  PV.prototype.set = function (t, f, v, d) {
    if (v > 0 && f > 0) {
      if (d !== this.d) {
        var j = d === 3 ? 1 : d
        for (var i = 0; i < 3; i++) this.g[i].gain.setValueAtTime(i === j ? (d === 3 ? -1 : 1) : 0, t)
        this.d = d
      }
      f = qP(f)
      if (f !== this.f) { for (var k = 0; k < 3; k++) this.o[k].frequency.setValueAtTime(f, t); this.f = f }
    } else v = 0
    if (v !== this.v) { this.env.gain.setValueAtTime(v / 15, t); this.v = v }
  }
  // triangle voice: no volume control on the 2A03 — only on/off (tiny ramp to avoid DC clicks)
  function TV(E, out) {
    var c = E.ctx
    this.env = c.createGain(); this.env.gain.value = 0; this.env.connect(out)
    this.o = c.createOscillator(); this.o.setPeriodicWave(E.tw); this.o.connect(this.env); this.f = -1; this.on = 0
  }
  TV.prototype.start = function (t) { this.o.start(t) }
  TV.prototype.stop = function (t) { try { this.o.stop(t) } catch (e) {} }
  TV.prototype.set = function (t, f, on) {
    if (on && f > 0) { f = qT(f); if (f !== this.f) { this.o.frequency.setValueAtTime(f, t); this.f = f } } else on = 0
    if (on !== this.on) { this.env.gain.setTargetAtTime(on, t, 0.0015); this.on = on }
  }
  // noise: frames [[periodIdx, vol, mode], ...] at 60 Hz -> one looping LFSR buffer per mode
  function noiseHit(E, out, t, fr) {
    var c = E.ctx, S = {}, res = [], k, m, end = t + fr.length / 60
    for (k = 0; k < fr.length; k++) {
      m = fr[k][2] | 0
      if (!S[m]) S[m] = { b: 99 }
      if (fr[k][1] > 0 && fr[k][0] < S[m].b) S[m].b = fr[k][0]
    }
    for (m in S) {
      var o = S[m]
      if (o.b === 99) { delete S[m]; continue }
      var buf = E.noise(+m, o.b), src = c.createBufferSource(), g = c.createGain()
      src.buffer = buf; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(out)
      src.start(t, E.rnd() * buf.duration * 0.9); src.stop(end + 0.02)
      o.s = src; o.g = g; o.v = -1; o.r = 1; res.push(g)
    }
    for (k = 0; k < fr.length; k++) {
      var tk = t + k / 60, f = fr[k]
      for (m in S) {
        var q = S[m], v = (f[2] | 0) === +m ? f[1] : 0
        if (v !== q.v) { q.g.gain.setValueAtTime(v / 15, tk); q.v = v }
        if (v > 0) { var rate = NPER[q.b] / NPER[f[0]]; if (rate !== q.r) { q.s.playbackRate.setValueAtTime(rate, tk); q.r = rate } }
      }
    }
    res.forEach(function (g) { g.gain.setValueAtTime(0, end); drop(E, g, end) })
    return res
  }
  function drop(E, node, t) { // disconnect a finished node so long sessions don't accumulate dead nodes
    if (E.live) setTimeout(function () { try { node.disconnect() } catch (e) {} }, Math.max(0, t - E.ctx.currentTime) * 1000 + 500)
  }
  function cut(gs, t) { if (gs) gs.forEach(function (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t) }) }

  // SFX: steal channels from the music (gate it off), with priorities; low-priority 'queueable' sfx wait.
  Engine.prototype.sfx = function (name, arg, at) {
    var fn = SFX[name]
    if (!fn) return false
    var d = typeof fn === 'function' ? fn(arg == null ? null : +arg, this.rnd) : fn, c = this.ctx, E = this
    var now = at != null ? at : c.currentTime + 0.01, st = now, chs = [], i, ch, b
    for (i = 0; i < CHS.length; i++) {
      ch = CHS[i]
      if (!d[ch] || !d[ch].length) continue
      chs.push(ch); b = this.busy[ch]
      if (b && b.until > now && b.pri > d.p) { if (!d.q) return false; if (b.until > st) st = b.until }
    }
    if (st - now > 1.2) return false
    chs.forEach(function (ch) {
      var fr = d[ch], end = st + fr.length / 60, b = E.busy[ch], k, gg = E.gate[ch].gain
      if (b && b.until > st) { b.out.gain.cancelScheduledValues(st); b.out.gain.setValueAtTime(0, st) }
      gg.cancelScheduledValues(st); gg.setValueAtTime(0, st); gg.setValueAtTime(1, end)
      var out = c.createGain(); out.connect(E.lvl[ch])
      if (ch === 'no') noiseHit(E, out, st, fr)
      else if (ch === 'dm') { var dh = null; for (k = 0; k < fr.length; k++) if (typeof fr[k] === 'string') { cut(dh, st + k / 60); dh = dmcHit(E, out, st + k / 60, fr[k]) } }
      else if (ch === 'tr') {
        var tv = new TV(E, out); tv.start(st)
        for (k = 0; k < fr.length; k++) tv.set(st + k / 60, fr[k][0], fr[k][1] > 0 ? 1 : 0)
        tv.set(end, 0, 0); tv.stop(end + 0.05)
      } else {
        var pv = new PV(E, out); pv.start(st)
        for (k = 0; k < fr.length; k++) pv.set(st + k / 60, fr[k][0], fr[k][1], fr[k][2])
        pv.set(end, 0, 0, 0); pv.stop(end + 0.05)
      }
      E.busy[ch] = { until: end, pri: d.p, out: out }
      drop(E, out, end + 0.1)
    })
    return true
  }

  // ------------------------------------------------------------------ music player (lookahead scheduler)
  function Player(E, name, startRow, t0) {
    var C = song(name), c = E.ctx, me = this
    this.E = E; this.C = C; this.name = name; this.row = startRow || 0; this.t = t0; this.done = false; this.hist = []; this.out = {}
    CHS.forEach(function (ch) { var g = c.createGain(); g.gain.value = MUSIC_BUS; g.connect(E.gate[ch]); me.out[ch] = g })
    this.vp = { p1: new PV(E, this.out.p1), p2: new PV(E, this.out.p2) }
    this.vt = new TV(E, this.out.tr)
    this.vp.p1.start(t0); this.vp.p2.start(t0); this.vt.start(t0)
    this.idx = {}
    CHS.forEach(function (ch) { me.idx[ch] = firstIdx(C.ev[ch], me.row) })
    this.nh = null
  }
  Player.prototype.rowSec = function () { return 15 / this.C.bpm / this.E.tempo }
  Player.prototype.pump = function (until) {
    var C = this.C, me = this
    while (!this.done && this.t < until) {
      var r = this.row, t = this.t, rs = this.rowSec()
      CHS.forEach(function (ch) {
        var L = C.ev[ch]
        while (me.idx[ch] < L.length && L[me.idx[ch]].r <= r) { var e = L[me.idx[ch]++]; if (e.r === r && e.n > 0) me.play(ch, e, t, rs) }
      })
      this.hist.push([r, t]); if (this.hist.length > 48) this.hist.shift()
      this.t += rs; this.row++
      if (this.row >= C.rows) {
        if (C.loop) { this.row = C.loopRow; CHS.forEach(function (ch) { me.idx[ch] = C.loopIdx[ch] }) } else {
          this.done = true; this.end = this.t
          this.vp.p1.set(this.t, 0, 0, 0); this.vp.p2.set(this.t, 0, 0, 0); this.vt.set(this.t, 0, 0)
          this.stopAll(this.t + 0.3)
        }
      }
    }
  }
  Player.prototype.play = function (ch, e, t, rs) {
    // snap to the sample grid so a key-off and the next key-on land on the *same* time value
    // (otherwise float drift can order the key-off after the next note's first frame)
    var sr = this.E.ctx.sampleRate, Q = function (x) { return Math.round(x * sr) / sr }, dur = e.n * rs, I, k, t0 = t
    t = Q(t)
    if (ch === 'no') {
      var D = DR[e.m]
      if (!D) return
      var fr = []
      for (k = 0; k < D.E.length; k++) fr.push([D.N[Math.min(k, D.N.length - 1)], Math.round((D.E[k] * e.v) / 15), D.m])
      cut(this.nh, t); this.nh = noiseHit(this.E, this.out.no, t, fr)
    } else if (ch === 'dm') {
      if (DMS[e.m]) { cut(this.dh, t); this.dh = dmcHit(this.E, this.out.dm, t, e.m) } // DMC has no volume control
    } else if (ch === 'tr') {
      if (e.m < 0) return this.vt.set(t, 0, 0)
      I = INS[e.i] || INS.bass
      this.vt.set(t, mf(e.m), 1); this.vt.set(Q(t0 + dur * (I.g || 1)), 0, 0)
    } else {
      var v = this.vp[ch]
      if (e.m < 0) return v.set(t, 0, 0, 0)
      I = INS[e.i] || INS.lead
      var A = e.a, tOff = Q(t0 + dur * (I.g || 0.94)), f0 = mf(e.m)
      // vibrato is applied per 60 Hz frame from a 10-step sine table (~6 Hz), like NES sound drivers
      var V = I.v && dur * 60 > I.v[0] + 6 ? I.v : null
      for (k = 0; ; k++) {
        var tk = t + k / 60
        if (k > 0 && tk >= tOff - 1e-4) break
        var f = A ? mf(e.m + A[k % A.length]) : f0
        if (V && k >= V[0]) f *= Math.pow(2, (V[1] / 1200) * VIB[(k - V[0]) % 10])
        v.set(tk, f, Math.round((I.E[Math.min(k, I.E.length - 1)] * e.v) / 15), I.D[Math.min(k, I.D.length - 1)])
        if (!A && !V && k >= I.E.length && k >= I.D.length) break
      }
      v.set(tOff, 0, 0, 0)
    }
  }
  Player.prototype.stopAll = function (t) {
    if (this.stopped) return
    this.stopped = true; this.vp.p1.stop(t); this.vp.p2.stop(t); this.vt.stop(t)
  }
  Player.prototype.kill = function (t) {
    var me = this
    CHS.forEach(function (ch) { var g = me.out[ch].gain; g.cancelScheduledValues(t); g.setValueAtTime(0, t) })
    cut(this.nh, t); cut(this.dh, t); this.stopAll(t + 0.05)
    setTimeout(function () { try { CHS.forEach(function (ch) { me.out[ch].disconnect() }) } catch (e) {} }, 400)
  }
  Player.prototype.rowAt = function (now) {
    var r = this.row
    for (var i = this.hist.length - 1; i >= 0; i--) if (this.hist[i][1] <= now) { r = this.hist[i][0]; break }
    return r
  }

  // ------------------------------------------------------------------ SFX library (frames at 60 Hz)
  // pulse frame [freqHz, vol 0-15, duty]  triangle [freqHz, on]  noise [periodIdx 0-15, vol, mode]
  function P(n, f0, f1, v0, v1, d) { var a = []; for (var i = 0; i < n; i++) { var u = n > 1 ? i / (n - 1) : 0; a.push([f0 * Math.pow(f1 / f0, u), Math.round(v0 + (v1 - v0) * u), d]) } return a }
  function T(f, env, d) { return hx(env).map(function (v) { return [f, v, d] }) }
  function Z(n) { var a = []; while (n-- > 0) a.push([0, 0, 0]); return a }
  function NS(n, i0, i1, v0, v1, m) { var a = []; for (var i = 0; i < n; i++) { var u = n > 1 ? i / (n - 1) : 0; a.push([Math.round(i0 + (i1 - i0) * u), Math.round(v0 + (v1 - v0) * u), m || 0]) } return a }
  function NE(i, env, m) { return hx(env).map(function (v) { return [i, v, m || 0] }) }
  function J() { return [].concat.apply([], arguments) }
  function VB(a, cents, per) { return a.map(function (x, k) { return [x[0] * Math.pow(2, (cents / 1200) * Math.sin((2 * Math.PI * k) / per)), x[1], x[2]] }) }
  function M(s, env, d, vib) {
    var a = [], E = hx(env)
    s.split(' ').forEach(function (t) {
      var p = t.split(':'), n = +p[1], f = p[0] === 'r' ? 0 : nf(p[0])
      for (var k = 0; k < n; k++) a.push([f, f ? E[Math.min(k, E.length - 1)] : 0, d])
    })
    return vib ? VB(a, vib, 5) : a
  }
  function splash(R, v0, n) { var a = []; n = n || 28; v0 = v0 || 13; for (var k = 0; k < n; k++) a.push([4 + Math.round((k * 4) / n) + (R() < 0.3 ? 1 : 0), Math.max(0, Math.round(v0 - (k * v0) / n + R() * 3 - 1.5)), 0]); return a }
  // DMC channel frames: the sample name on its trigger frame, padding so the channel stays reserved while it plays
  function DM(name, at) { var a = []; for (var k = 0; k < (at || 0) + Math.ceil(DMS[name].d * 60) + 3; k++) a.push(k === (at || 0) ? name : 0); return a }
  var CRASH = 'edccbbaa99887766554433221100'
  var SFX = {
    select: { p: 1, p2: J(T(nf('A6'), 'aa', 2), T(nf('E7'), 'a8642', 2)) },
    confirm: { p: 3, p2: J(M('G5:2 C6:2 E6:2 G6:2', 'dc', 1), T(nf('C7'), 'dccbba9988776655443322110', 1)) },
    cancel: { p: 2, p2: J(T(nf('E5'), 'bbba', 2), T(nf('A4'), 'bba9876543210', 2)) },
    aimLock: { p: 2, p2: J(T(nf('B6'), 'ee', 0), T(nf('E6'), 'ca86420', 0)), no: NE(2, 'c840', 1) },
    powerLock: { p: 2, p2: J(P(8, 300, 1400, 13, 9, 1), T(1400, '87654321', 1)), no: NE(5, 'eb8530') },
    throw: { p: 3, no: J(NS(6, 9, 3, 8, 15), NS(18, 3, 8, 15, 0)), p2: J(P(12, 200, 1050, 15, 11, 2), P(8, 1050, 1250, 11, 0, 1)) },
    bounce: function (i) {
      i = i == null || isNaN(i) ? 0.6 : Math.max(0, Math.min(1, i))
      var f = 900 + 800 * i, v = Math.round(5 + 9 * i)
      return { p: 1, p2: [[f, v, 2], [f * 0.8, v - 2, 2], [f * 0.8, Math.max(1, v - 5), 2]], no: [[1, Math.round(3 + 8 * i), 1], [1, 2, 1]] }
    },
    rim: { p: 3, no: NE(2, 'fdca98765443322110', 1), p2: VB(T(nf('E7'), 'ffeedcba98877665544332211', 1), 25, 4), p1: T(nf('B6') * 1.01, 'ffdb975310', 0) },
    sink: function (_, R) { // plink+plunk on pulse 1 (steals the lead ~12 frames), bubbles on pulse 2, splash on noise, crowd on DMC
      var b = []
      for (var j = 0; j < 6; j++) { var f = 520 + j * 170 + R() * 120; b = b.concat([[f, 14 - j, 2], [f * 1.25, 13 - j, 2]], Z(2)) }
      return { p: 5, p1: J(P(3, 1900, 1400, 15, 15, 1), P(9, 640, 105, 15, 11, 2)), p2: J(Z(8), b), no: J(Z(2), splash(R, 15, 34)), dm: DM('oh', 12) }
    },
    crowdOh: { p: 3, dm: DM('oh', 0) },
    crowdYeah: { p: 3, dm: DM('yeah', 0) },
    splash: function (_, R) { var b = []; for (var j = 0; j < 5; j++) b = b.concat([[700 + R() * 900, 13 - 2 * j, 2], [0, 0, 0], [0, 0, 0]], Z(j)); return { p: 3, no: splash(R, 15, 30), p2: J(Z(3), b) } },
    miss: { p: 2, p2: VB(J(P(12, 440, 392, 12, 10, 2), P(26, 392, 175, 10, 0, 2)), 35, 6) },
    floor: { p: 2, p2: J(T(240, 'b6', 2), Z(10), T(220, '85', 2), Z(7), T(210, '53', 2), Z(4), T(200, '31', 2)),
      no: J(NE(10, 'b6'), Z(10), NE(10, '84'), Z(7), NE(10, '52'), Z(4), NE(10, '31')) },
    cheer: function (_, R) {
      var no = [], n = 96
      for (var k = 0; k < n; k++) { var e = k < 16 ? 4 + k * 0.6 : k < 60 ? 13.5 : (13.5 * (n - k)) / (n - 60); no.push([R() < 0.5 ? 5 : 6, Math.max(0, Math.round(e + R() * 2 - 1)), 0]) }
      return { p: 2, q: 1, no: no, p2: J(Z(18), P(10, 1400, 2600, 3, 7, 2), Z(5), P(7, 1500, 2700, 6, 7, 2), P(18, 2700, 1300, 7, 0, 2)) }
    },
    boo: function (_, R) {
      var no = [], p2 = []
      for (var k = 0; k < 80; k++) { var e = k < 16 ? k / 16 : (80 - k) / 64; no.push([R() < 0.5 ? 10 : 11, Math.round(9 * e + R() * 1.5), 0]); p2.push([150 - k * 0.4, Math.round(7 * e), 0]) }
      return { p: 2, q: 1, no: no, p2: VB(p2, 50, 9) }
    },
    heatingUp: { p: 4, p2: J(M('E5:3 G#5:3 B5:3 F5:3 A5:3 C6:3 F#5:3 A#5:3 C#6:3 G5:3 B5:3 D6:3', 'cb', 1), T(nf('G6'), 'dcba98765432', 1)), no: J(Z(24), NS(20, 1, 2, 7, 0)) },
    onFire: function () {
      var tr = []
      for (var j = 0; j < 12; j++) tr = tr.concat(T(nf(j % 2 ? 'G6' : 'C7'), 'ff'.replace(/f/g, (15 - j).toString(16)), 1))
      return { p: 5, p2: J(M('C5:3 E5:3 G5:3 C6:3 E6:3 G6:3', 'fe', 1), tr), no: J(NS(30, 13, 2, 4, 15), NS(24, 2, 5, 15, 0)), dm: DM('yeah', 18) }
    },
    ballsBack: { p: 6, p1: M('G5:5 G5:5 G5:5 C6:15 A5:8 B5:8 C6:26', 'dcbba99', 1, 12), p2: M('E5:5 E5:5 E5:5 G5:15 F5:8 G5:8 E5:26', 'a9988776', 1),
      tr: M('C4:5 C4:5 C4:5 C3:15 F3:8 G3:8 C3:26', 'f', 0), no: J(Z(15), NE(3, CRASH)), dm: DM('yeah', 14) },
    rerack: function () {
      var no = Z(32)
      ;[0, 4, 7, 12, 15, 19, 23, 26].forEach(function (f, j) { no[f] = [1, 10 - (j & 1) * 3, 1]; no[f + 1] = [1, 4, 1] })
      return { p: 2, no: no, p2: J(Z(30), T(nf('A6'), 'cba98877665544332211', 0)) }
    },
    drink: function () {
      var g = J(P(4, 210, 150, 12, 8, 1), P(4, 150, 120, 8, 2, 1), Z(3)), n = NE(11, '84200000000')
      return { p: 2, p2: J(g, g, g, VB(P(24, 330, 300, 9, 0, 2), 25, 6)), no: J(n, n, n) }
    },
    redemption: { p: 6, p1: M('E6:6 E6:6 E6:6 F6:12 G6:12 A6:36', 'dcbbaa9', 2, 12), p2: M('C6:6 C6:6 C6:6 D6:12 E6:12 C#6:36', 'a998877', 1),
      tr: M('A3:18 D3:12 E3:12 A2:36', 'f', 0), no: J(NE(5, 'c85300'), NE(5, 'c85300'), NE(5, 'c85300'), Z(24), NE(3, CRASH)) },
    pause: { p: 7, p2: M('E6:3 G#6:3 B6:3 E7:3 B6:3 E7:14', 'dcba98765432100', 1) },
    tally: function (i) { var f = nf('A6') * (1 + 0.5 * (i || 0)); return { p: 1, p2: [[f, 9, 1], [f, 7, 1], [f, 3, 1]] } },
    lastCup: { p: 4, p2: J(T(nf('D6'), 'cba98', 2), T(nf('G#6'), 'cba98', 2), T(nf('D6'), 'cba98', 2), T(nf('G#6'), 'cba98', 2), T(nf('D6'), 'cba98', 2), T(nf('G#6'), 'cba987654321', 2)),
      no: J(NE(5, 'a74'), NE(5, 'a74'), NE(5, 'a74'), NE(5, 'a74'), NE(5, 'b85'), NE(5, 'c96'), NE(5, 'da7'), NE(5, 'eb8'), NE(3, 'edcba987654321')) },
    win: { p: 6, p1: M('C6:6 E6:6 G6:6 C7:36', 'dcba99', 2, 12), p2: M('G5:6 C6:6 E6:6 G6:36', 'a9988', 1), tr: M('C3:6 E3:6 G3:6 C3:36', 'f', 0), no: J(Z(18), NE(3, CRASH)) },
    lose: { p: 6, p1: J(M('A5:10 G#5:10 G5:10', 'cba9', 2), VB(P(40, nf('F#5'), nf('E5'), 11, 0, 2), 40, 8)), p2: M('F5:10 E5:10 Eb5:10 D5:40', '98877', 1), tr: M('D3:10 C#3:10 C3:10 B2:40', 'f', 0) },
    tick: { p: 1, p2: [[nf('C7'), 8, 0], [nf('C7'), 4, 0]], no: [[0, 6, 1], [0, 3, 1]] },
    whoosh: { p: 2, no: J(NS(10, 9, 2, 2, 12), NS(16, 2, 7, 12, 0)) },
    letter: { p: 1, p2: J(T(nf('C6'), 'c', 2), T(nf('C7'), 'b964', 0)) },
    error: function () { var b = []; for (var k = 0; k < 10; k++) b.push([110, 12 - (k >> 2), k % 2 ? 0 : 3]); return { p: 2, p2: J(b, Z(4), b) } },
    // extras (not in the contract, harmless): swish, go, start
    swish: { p: 4, p2: J(P(6, 800, 2400, 9, 15, 1), M('C7:3 E7:3 G7:3 C8:9', 'fd', 1)), no: NS(14, 2, 1, 12, 0) },
    go: { p: 4, p2: VB(T(nf('A6'), 'cddddddddddddddddddcba9876543210', 2), 60, 3) },
    start: { p: 7, p1: M('C6:4 G6:4 C7:24', 'ddccbbaa99887766554433221100', 2), p2: M('G5:4 E6:4 G6:24', 'aa99887766554433221100', 1), no: J(Z(8), NE(3, CRASH)) },
  }

  // ------------------------------------------------------------------ live state & public API
  var A = { ctx: null, E: null, pl: null, pend: undefined, paused: null, muted: false, vol: 0.9, tempo: 1, timer: 0, warm: false }
  try { A.muted = window.localStorage.getItem('bp_mute') === '1' } catch (e) {}
  function applyVol() {
    if (!A.E) return
    var g = A.E.master.gain, t = A.ctx.currentTime
    g.cancelScheduledValues(t); g.setTargetAtTime(A.muted ? 0 : A.vol, t, 0.015)
  }
  function normName(n) {
    if (n == null) return null
    n = String(n)
    var m = /^stage(\d+)$/.exec(n)
    if (m) n = 'stage' + (+m[1] % 5)
    return SONGS[n] ? n : undefined
  }
  function stopMusic() { if (A.pl) { try { A.pl.kill(A.ctx.currentTime) } catch (e) {} A.pl = null } }
  function startMusic(name, row) {
    stopMusic()
    if (!name || !A.E) return
    if (!/^(stage|fire)/.test(name)) A.E.tempo = A.tempo = 1
    A.pl = new Player(A.E, name, row || 0, A.ctx.currentTime + 0.06)
    A.pl.pump(A.ctx.currentTime + LOOK)
  }
  function tick() {
    try {
      var p = A.pl
      if (!p || !A.ctx) return
      var now = A.ctx.currentTime
      if (p.done) { if (now > p.end + 0.5) { p.kill(now); A.pl = null } return }
      if (p.t < now - 0.2) p.t = now + 0.03 // fell behind (jank): skip ahead instead of bursting
      p.pump(now + LOOK)
    } catch (e) {}
  }
  function warm() {
    // pre-build the most used noise buffers (cheap: ~20 ms total)
    try { [2, 3, 5, 6, 7, 9, 10].forEach(function (i) { A.E.noise(0, i) }); A.E.noise(1, 1); A.E.noise(1, 2); A.E.noise(1, 3) } catch (e) {}
  }
  function safe(fn, dflt) { return function () { try { return fn.apply(null, arguments) } catch (e) { return dflt } } }

  var Audio = {
    init: safe(function () {}),
    unlock: safe(function () {
      if (!A.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        var ua = navigator.userActivation
        if (ua && !ua.isActive && !ua.hasBeenActive) return // not inside a gesture yet: avoid a blocked context
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch (e) {}
        try { A.ctx = new AC({ latencyHint: 'interactive' }) } catch (e) { A.ctx = new AC() }
        A.E = new Engine(A.ctx, (Date.now() & 0xffff) + 1)
        A.E.master.gain.value = A.muted ? 0 : A.vol
        A.E.tempo = A.tempo
        A.timer = setInterval(tick, 25)
      }
      if (A.ctx.state !== 'running' && !document.hidden) {
        var b = A.ctx.createBuffer(1, 1, 22050), s = A.ctx.createBufferSource()
        s.buffer = b; s.connect(A.ctx.destination); s.start(0)
        var pr = A.ctx.resume()
        if (pr && pr.catch) pr.catch(function () {})
      }
      if (!A.warm) { A.warm = true; setTimeout(warm, 0) }
      if (A.pend !== undefined) { var n = A.pend; A.pend = undefined; if (!A.paused) startMusic(n) }
    }),
    setMuted: safe(function (b) {
      A.muted = !!b
      try { window.localStorage.setItem('bp_mute', A.muted ? '1' : '0') } catch (e) {}
      applyVol()
    }),
    isMuted: safe(function () { return A.muted }, false),
    toggleMute: safe(function () { Audio.setMuted(!A.muted); return A.muted }, false),
    setVolume: safe(function (v) { v = +v; A.vol = isNaN(v) ? 0.9 : Math.max(0, Math.min(1, v)); applyVol() }),
    getVolume: safe(function () { return A.vol }, 0.9),
    music: safe(function (name) {
      var n = normName(name)
      if (n === undefined) return
      A.paused = null
      if (!A.E) { A.pend = n; return }
      if (n && A.pl && A.pl.name === n && !A.pl.done) return
      if (!n) { A.pend = undefined; stopMusic(); return }
      startMusic(n)
    }),
    playing: safe(function () { return A.pl && !A.pl.done ? A.pl.name : A.pend || null }, null),
    setTempo: safe(function (m) {
      m = +m; A.tempo = isNaN(m) ? 1 : Math.max(0.5, Math.min(2, m))
      if (A.E) A.E.tempo = A.tempo
    }),
    sfx: safe(function (name, arg) {
      if (!A.E || A.muted || A.ctx.state !== 'running') return
      A.E.sfx(String(name), arg)
    }),
    pause: safe(function () {
      if (A.paused) return
      if (!A.E) { A.paused = { name: A.pend, row: 0 }; A.pend = undefined; return }
      var p = A.pl
      A.paused = p && !p.done ? { name: p.name, row: p.rowAt(A.ctx.currentTime) } : { name: null }
      stopMusic()
    }),
    resume: safe(function () {
      var p = A.paused
      if (!p) return
      A.paused = null
      if (!p.name) return
      if (!A.E) { A.pend = p.name; return }
      startMusic(p.name, p.row)
    }),
    // ---- test hooks (used by tools/audiotest.html; not part of the game contract)
    _renderOffline: function (spec, seconds) {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 44100
      var oc = new OAC(1, Math.ceil(sr * seconds), sr), E = new Engine(oc, 12345)
      E.master.gain.value = A.vol
      if (typeof spec === 'string') spec = /^sfx:/.test(spec) ? { sfx: [[0.05, spec.slice(4)]] } : { music: spec }
      if (spec.tempo) E.tempo = spec.tempo
      ;(spec.mute || []).forEach(function (ch) { E.lvl[ch].gain.value = 0 })
      if (spec.music) new Player(E, spec.music, 0, 0.05).pump(seconds)
      ;(spec.sfx || []).forEach(function (s) { E.sfx(s[1], s[2], s[0]) })
      return oc.startRendering()
    },
    _info: function (name) {
      var C = song(name)
      if (!C) return null
      var S = C.S, notes = {}
      CHS.forEach(function (ch) { notes[ch] = C.ev[ch].filter(function (e) { return e.m !== -1 }).map(function (e) { return e.m }) })
      return { name: name, bpm: S.bpm, rows: C.rows, bars: C.rows / 16, loop: C.loop, loopRow: C.loopRow, sec: (C.rows * 15) / S.bpm,
        loopSec: ((C.rows - C.loopRow) * 15) / S.bpm, introSec: (C.loopRow * 15) / S.bpm, warn: C.warn, key: S.k, scale: S.sc, extra: S.x || '', notes: notes }
    },
    _dev: { Engine: Engine, Player: Player, dmc: dmcSample, enc: dpcmEncode, dec: dpcmDecode },
    _list: function () { return { music: Object.keys(SONGS), sfx: Object.keys(SFX) } },
    _state: function () { return { ctx: A.ctx ? A.ctx.state : 'none', playing: A.pl ? A.pl.name : null, paused: !!A.paused, muted: A.muted, tempo: A.tempo, pend: A.pend } },
  }
  BP.Audio = Audio

  // belt & braces: unlock on any gesture even if the input module misses one; suspend when hidden
  try {
    ;['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () { Audio.unlock() }, { capture: true, passive: true })
    })
    document.addEventListener('visibilitychange', function () {
      try {
        if (!A.ctx) return
        var pr = document.hidden ? A.ctx.suspend() : A.ctx.resume()
        if (pr && pr.catch) pr.catch(function () {})
      } catch (e) {}
    })
  } catch (e) {}
})()
