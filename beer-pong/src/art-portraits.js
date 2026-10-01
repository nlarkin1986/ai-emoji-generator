/* SUPER BEER PONG — BP.Art portrait override (art-portraits.js, loaded after art.js / art-chars.js).
   Hand-authored NES pixel maps for the VS-card (64x64) and speech-box (32x32) portraits.
   Front-view busts are authored as LEFT HALVES (mirrored to full width so eyes/ears are always level),
   then asymmetric patches add expression (smirks, raised brows, pupils, nose shade, logos).
   Map chars -> per-character palette roles; '.' = background. Patches: '.' = keep, ',' = background. */
(function () {
  'use strict';
  var BP = (window.BP = window.BP || {});
  var A = BP.Art;
  if (!A) return;

  // ---------------------------------------------------------------- helpers
  function mirror(half) {
    var out = [];
    for (var i = 0; i < half.length; i++) out.push(half[i] + half[i].split('').reverse().join(''));
    return out;
  }
  function patch(rows, x, y, p) {
    for (var j = 0; j < p.length; j++) {
      var r = rows[y + j]; if (r == null) continue;
      var a = r.split('');
      for (var i = 0; i < p[j].length; i++) {
        var ch = p[j].charAt(i); if (ch === '.') continue;
        if (x + i >= 0 && x + i < a.length) a[x + i] = ch === ',' ? '.' : ch;
      }
      rows[y + j] = a.join('');
    }
    return rows;
  }
  // light from the upper left: skin within `w` px of the right-hand outline drops to the shade tone
  function shadeRight(rows, y0, y1, w, size) {
    for (var y = y0; y <= y1 && y < rows.length; y++) {
      var a = rows[y].split('');
      for (var x = size >> 1; x < a.length; x++) {
        if (a[x] !== 'S') continue;
        for (var d = 1; d <= w; d++) if (a[x + d] === 'K') { a[x] = 's'; break; }
      }
      rows[y] = a.join('');
    }
  }
  function build(spec, size) {
    var rows = mirror(spec.half);
    if (spec.shade) shadeRight(rows, spec.shade[0], spec.shade[1], spec.shade[2], size);
    for (var i = 0; spec.patches && i < spec.patches.length; i++) {
      var q = spec.patches[i];
      patch(rows, q[0], q[1], q[2]);
      if (q[3] === 'm') for (var j = 0; j < q[2].length; j++) patch(rows, size - q[0] - q[2][j].length, q[1] + j, [q[2][j].split('').reverse().join('')]);
    }
    return rows;
  }
  function hex(name) { var P = A.PAL || {}; return P[name] || (typeof name === 'string' && name.charAt(0) === '#' ? name : '#FCFCFC'); }

  // shared role colors (per character overrides below)
  var BASE = { K: 'black', E: 'black', W: 'white', w: 'lgray', M: 'dred' };

  // ---------------------------------------------------------------- characters
  // roles: S/s skin + shade, H/h hair + shade, C/c cap/crown + shade, P cap highlight,
  //        T/t shirt + shade, L logo, G shades, g shade glint, J jewel, D/d beard
  var CH = {};

  CH.hero = {
    pal: { S: 'skin', s: 'salmon', H: 'maroon', h: 'dbrown', C: 'red', c: 'dred', P: 'salmon', T: 'red', t: 'dred', L: 'white' },
    bg: ['blue', 'dblue'],
    p64: {
      shade: [24, 47, 3],
      half: [
      '................................', // 0
      '................................',
      '................................',
      '................................',
      '................................',
      '.......................KKKKKKKKK', // 5 cap crown
      '....................KKKCCCCCCCCC',
      '..................KKCCCCCCCCCCCC',
      '.................KCCCCCCCCCCCCCC',
      '................KcCCCCCCCCCCCCCC',
      '...............KccCCCCCCCCCCCCCC', // 10
      '...............KccCCCCCCCCCCCCCC',
      '..............KccCCCCCCCCCCCCCCC',
      '..............KccCCCCCCCCCCCCCCC',
      '..............KccCCCCCCCCCCCCCCC',
      '..............Kccccccccccccccccc', // 15 crown seam
      '.............KCCCCCCCCCCCCCCCCCC', // 16 curved brim
      '.............KCCCCCCCCCCCCCCCCCC',
      '.............KcCCCCCCCCCCCCCCCCC',
      '..............KKcCCCCCCCCCCCCCCC', // 19 brim curves down to center
      '...............KHKKccCCCCCCCCCCC',
      '...............KHHHKKKccCCCCCCCC',
      '...............KHHHhhhKKKccccccc',
      '...............KHHhshshsKKKKKKKK',
      '...............KHHHSSSSShhhhhsss', // 24 brim shadow + brow
      '...............KHHHSShhhhhhhSSSS', // 25 brow
      '...............KHHSSSSSSSSSSSSSS',
      '.............KKKHHSSSKKKKKKKSSSS', // 27 ear top, upper lid
      '............KSSsHsSSSSWWEEWWSSSS',
      '............KSsssSSSSSWWEEWWSSSS',
      '............KSsSsSSSSSsWEEWsSSSS', // 30
      '............KSsSsSSSSSSssssSSSSS',
      '............KSSssSsSSSSSSSSSSSSS',
      '.............KSssSsSSSSSSSSSSSSS',
      '..............KKKsSSSSSSSSSSSSss', // 34 ear bottom, nose base
      '................KsSSSSSSSSSSSSSS',
      '................KsSSSSSSSSSSSSSS',
      '.................KsSSSSSSKSSSSSS', // 37 mouth corner
      '.................KsSSSSSSSKKKKKK',
      '..................KsSSSSSSKWWWWW',
      '..................KsSSSSSSSKKWWW', // 40
      '...................KsSSSSSSSSKKK',
      '....................KsSSSSSSSsss',
      '.....................KsSSSSSSSSS',
      '......................KKsSSSSSSS',
      '........................KKKsSSSS', // 45
      '.........................KsKKKKK', // 46 chin
      '......................KKKKssssss',
      '..................KKKKTTTKsssSSS',
      '..............KKKKTTTTTTtKsSSSSS',
      '...........KKKTTTTTTTTTTttKSSSSS', // 50
      '........KKKTTTTTTTTTTTTTTttKKKKK',
      '......KKTTTTTTTTTTTTTTTTTttttttt',
      '.....KTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '....KTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '...KTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 55
      '..KttTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT', // 60
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [20, 7, ['PPP', 'PP', 'P']],                       // cap shine
        [27, 8, ['WW......WW', 'WW......WW', 'WW..WW..WW', 'WW..WW..WW', 'WWWWWWWWWW', '.WW....WW.']], // cap W
        [26, 55, ['LL........LL', 'LL........LL', 'LL...LL...LL', 'LL..LLLL..LL', 'LL.LL..LL.LL', 'LLLL....LLLL', '.LL......LL.']], // shirt W
        [33, 31, ['s', 's', 'ss', 'ss']],                  // nose shade (light from left)
        [12, 23, ['..KH', '.KHH', 'KHHh', '.KK.'], 'm'],   // hair flicks out under the cap
        [22, 28, ['WWWEEW', 'WWWEEW', 'sWWEEs']],          // pupils glance right (at the rival)
        [36, 28, ['WWWEEW', 'WWWEEW', 'sWWEEs']]
      ]
    },
    p32: {
      shade: [11, 25, 2],
      half: [
      '................',
      '................',
      '..........KKKKKK', // 2 cap
      '........KKCCCCCC',
      '.......KCCCCCCCC',
      '......KcCCCCCCCC',
      '......KcCCCCCCCC',
      '......Kccccccccc', // 7
      '.....KCCCCCCCCCC', // 8 brim
      '.....KKcCCCCCCCC',
      '......KHKKcccccc', // 10
      '......KHHhKKKKKK',
      '......KHHShsssss',
      '......KHSShhhhSS', // 13 brow
      '.....KKHSSKKKKSS', // 14 lid
      '....KSssSSWEEWSS',
      '....KSsSSSWEEWSS',
      '....KsSsSSSSSSSS', // 17
      '.....KKsSSSSSSSs',
      '......KsSSSKSSSS', // 19
      '......KsSSSSKKKK',
      '.......KsSSSKWWW', // 21
      '.......KsSSSSKKK',
      '........KsSSSSss',
      '.........KKKKKKK', // 24 chin
      '.........Kssssss',
      '.....KKKKTTtSSSS', // 26
      '..KKKTTTTTTttttt',
      '.KTTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT'
      ],
      patches: [
        [9, 4, ['PP', 'P']],
        [13, 4, ['W....W', 'W.WW.W', '.W..W.']],
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']],
        [16, 17, ['s', 's']]
      ]
    }
  };

  CH.chad = {
    pal: { S: 'skin', s: 'salmon', H: 'maroon', h: 'dbrown', C: 'white', c: 'lgray', T: 'white', t: 'lgray', L: 'red' },
    bg: ['red', 'dred'],
    p64: {
      shade: [24, 47, 3],
      half: [
      '................................', // 0
      '................................',
      '................................',
      '................................',
      '................................',
      '.......................KKKKKKKKK', // 5 backwards cap crown
      '....................KKKCCCCCCCCC',
      '..................KKCCCCCCCCCCCC',
      '.................KCCCCCCCCCCCCCC',
      '................KcCCCCCCCCCCCCCC',
      '...............KccCCCCCCCCCCCCCC', // 10
      '...............KccCCCCCCCCKKKKKK', // 11 strap-gap arch
      '..............KccCCCCCCCKKhhhhhh',
      '..............KccCCCCCCKhhHhhHhh',
      '..............KccCCCCCCKHhHHhHHh',
      '..............KccCCCCCKHHHhHHHHH', // 15
      '..............KccCCCCCKKKKKKKKKK',
      '..............KccCCCCCKccccccccc', // 17 snap strap
      '..............KccCCCCCKKKKKKKKKK',
      '..............Kccccccccccccccccc', // 19 sweatband
      '..............KKKKKKKKKKKKKKKKKK', // 20
      '...............KHHHHSSSSSSSSSSSS',
      '...............KHHHhSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSShhhhhhSSSS', // 25 brow
      '...............KHHSSShSSSSSSSSSS',
      '.............KKKHHSSSSSSSSSSSSSS', // 27 ear top
      '............KSSsHsSSSKKKKKKKSSSS', // 28 heavy (half-closed) lid
      '............KSsssSSSSSWWEEWWSSSS',
      '............KSsSsSSSSSsWEEWsSSSS', // 30
      '............KSsSsSSSSSSssssSSSSS',
      '............KSSssSsSSSSSSSSSSSSS',
      '.............KSssSsSSSSSSSSSSSSS',
      '..............KKKsSSSSSSSSSSSSss', // 34
      '................KsSSSSSSSSSSSSSS',
      '................KsSSSSSSSSSSSSSS',
      '.................KsSSSSSSSSSSSSS',
      '.................KsSSSSSSSSSSSSS',
      '..................KsSSSSSSSSSSSS',
      '..................KsSSSSSSSSSSSS', // 40
      '...................KsSSSSSSSSSSS',
      '....................KsSSSSSSSSSS',
      '.....................KsSSSSSSSSS',
      '......................KKsSSSSSSS',
      '........................KKKsSSSS', // 45
      '.........................KsKKKKK', // 46 chin
      '......................KKKKssssss',
      '..................KKKKTTTKsssSSS',
      '..............KKKKTTTTTTtKsSSSSS',
      '...........KKKTTTTTTTTTTttKSSSSS', // 50
      '........KKKTTTTTTTTTTTTTTttKKKKK',
      '......KKTTTTTTTTTTTTTTTTTttttttt',
      '.....KTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '....KTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '...KTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 55
      '..KttTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT', // 60
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KttTTTTTtTTTTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [26, 17, ['..W....W....W.']],                       // strap snaps
        [12, 21, ['..KH', '.KHH', 'KHHh', '.KK.'], 'm'],   // hair flicks
        [21, 22, ['................hhhh', '...............hhhhhhh', '', '.hhhhhh........SSSSSS', 'hhhhhhh..............S']], // one brow cocked
        [22, 29, ['WEEWWW', 'sEEWWs']],                   // side-eye at the hero
        [36, 29, ['WEEWWW', 'sEEWWs']],
        [33, 31, ['s', 's', 'ss', 'ss']],                 // nose shade
        [26, 36, ['.............s', '............Ks', '..........KK..', 'KKKKKKKKKK....', '..ssssss......']], // smirk
        [26, 55, ['LL........LL', 'LL........LL', 'LL...LL...LL', 'LL..LLLL..LL', 'LL.LL..LL.LL', 'LLLL....LLLL', '.LL......LL.']]
      ]
    },
    p32: {
      shade: [11, 25, 2],
      half: [
      '................',
      '................',
      '..........KKKKKK', // 2 backwards cap
      '........KKCCCCCC',
      '.......KCCCCCCCC',
      '......KcCCCCKKKK', // 5 strap gap
      '......KcCCCKHHHH',
      '......KcCCCKHhHH',
      '......KcCCCKcccc', // 8 strap
      '......KKKKKKKKKK',
      '......KHHSSSSSSS', // 10 forehead
      '......KHHSSSSSSS',
      '......KHSSSSSSSS',
      '......KHSShhhhSS', // 13 brow
      '.....KKHSSSSSSSS',
      '....KSssSSKKKKSS', // 15 heavy lid
      '....KSsSSSWEEWSS',
      '....KsSsSSSssSSS',
      '.....KKsSSSSSSSs',
      '......KsSSSSSSSS',
      '......KsSSSSSSSS', // 20
      '.......KsSSSSSSS',
      '.......KsSSSSSSS',
      '........KsSSSSss',
      '.........KKKKKKK', // 24 chin
      '.........Kssssss',
      '.....KKKKTTtSSSS',
      '..KKKTTTTTTttttt',
      '.KTTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT'
      ],
      patches: [
        [10, 12, ['........hhhh', 'hhhh....SSSS']],       // right brow raised
        [16, 17, ['s', 's']],
        [12, 20, ['.......K', 'KKKKKKK.', '..sss...']],      // smirk
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']]
      ]
    }
  };

  CH.tank = {
    pal: { S: 'brown', s: 'maroon', H: 'dbrown', h: 'black', n: 'olive', T: 'green', t: 'dgreen', L: 'white' },
    bg: ['gray', 'dgray'],
    p64: {
      shade: [15, 46, 3],
      half: [
      '................................', // 0
      '................................',
      '................................',
      '................................',
      '..............KKKKKKKKKKKKKKKKKK', // 4 flat-top
      '.............KnHnHnHnHnHnHnHnHnH',
      '.............KHnHHHnHHHnHHHnHHHn',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH', // 10
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHHHHHHHHHHHHHHH',
      '.............KhHHHSSSSSSSSSSSSSS', // 15 hairline
      '.............KhHHSSSSSSSSSSSSSSS',
      '.............KhHSSSSSSSSSSSSSSSS',
      '.............KhHSSSSSSSSSSSSSSSS',
      '.............KhSSSSSSSSSSSSSSSSS',
      '.............KhSSSKKKKSSSSSSSSss', // 20 brows slam down to the center
      '.............KhSSSSKKKKKKKSSSSss',
      '.............KhSSSSSSSKKKKKKSSSs',
      '..........KKKKSSSSSSKKKKKKKKSSSS', // 23 ear top, lid
      '.........KSsssSSSSSSSKWWEEWWSSSS',
      '.........KSsSsSSSSSSSSsWEEWsSSSS', // 25
      '.........KSsSsSSSSSSSSSssssSSSSS',
      '.........KSsSsSSSSSSSSSSSSSSSSSS',
      '.........KSsSsSSSsSSSSSSSSSSSSSS',
      '.........KSssssSSSSSSSSSSSSSSSSS',
      '..........KSssSSSSSSSSSSSSSSSSSS', // 30
      '...........KKKSSSSSSSSSSSSSSSSSS',
      '.............KSSSSSSSSSSSSSSSSSS',
      '.............KsSSSSSSSSSSSSSSSSS',
      '..............KsSSSSSSSSSSSSSSSS',
      '..............KsSSSSSSSSssssssss', // 35 thick upper lip
      '..............KsSSSSSSSKKKKKKKKK',
      '...............KsSSSSSKSssssssss',
      '...............KsSSSSKSSSSSSSSSS',
      '...............KsSSSSSSSSSSSSSSS',
      '...............KsSSSSSSSSSSSssss', // 40
      '...............KKKsSSSSSSSSSSSSS',
      '...............KsKKKsSSSSSSSSSSS',
      '...............KssssKKKKsSSSSSSS',
      '..............KKsssssssKKKKKKKKK', // 44 square chin
      '..........KKKKTKssssssssssssssss', // 45 bull neck
      '.......KKKTTTTTKssssSSSSSSSSSSSS',
      '.....KKTTTTTTTTTKssSSSSSSSSSSSSS',
      '....KTTTTTTTTTTTWWKsSSSSSSSSSSSS', // 48 V-neck trim
      '...KTTTTTTTTTTTTTTWWKSSSSSSSSSSS',
      '..KTTTTTTTTTTTTTTTTTWWKSSSSSSSSS', // 50
      '..KTTTTTTTTTTTTTTTTTTTWWKSSSSSSS',
      '.KtTTTTTTTTTTTTTTTTTTTTTWWKSSSSS',
      '.KtTTTTTTTTTTTTTTTTTTTTTTTWWKSSS',
      '.KtTTTTTTTTTTTTTTTTTTTTTTTTTWWKs',
      '.KtTTTTTTTTTTTTTTTTTTTTTTTTTTTWW', // 55
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT', // 60
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT',
      '.KtTTTTTTtTTTTTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [30, 20, ['s..s', 's..s']],                                 // frown crease
        [33, 26, ['s', 's', 'ss', 'ss']],                         // nose shade
        [26, 29, ['..ssssss..', '.ssSSSSss.', 'sKsSSSSsKs', '.ssssssss.']], // broad nose
        [29, 41, ['ssss']],                                       // chin shadow
        [26, 55, ['LL........LL', 'LL........LL', 'LL...LL...LL', 'LL..LLLL..LL', 'LL.LL..LL.LL', 'LLLL....LLLL', '.LL......LL.']] // Wisconsin W
      ]
    },
    p32: {
      shade: [7, 22, 2],
      half: [
      '................',
      '................',
      '......KKKKKKKKKK', // 2 flat-top
      '.....KnHnHnHnHnH',
      '.....KhHHHHHHHHH',
      '.....KhHHHHHHHHH',
      '.....KhHHHHHHHHH',
      '.....KhHSSSSSSSS', // 7
      '.....KhSSSSSSSSS',
      '.....KhSSSSSSSSS',
      '.....KhSKKKSSSSs', // 10 brows
      '....KKSSSSKKKKSs',
      '...KSssSSKWEEWSS', // 12 eyes
      '...KSsSSSSsssSSS',
      '...KSsSSSSSSSSSS',
      '....KKSSSSSSSsKs', // 15 nostrils
      '.....KsSSSSSSSSS',
      '.....KsSSSSKKKKK', // 17 frown
      '.....KsSSSKsssss',
      '.....KsSSSSSSSSS',
      '.....KsSSSSSSSss', // 20
      '.....KsKKsSSSSSS',
      '....KKssKKKKKKKK', // 22 chin
      '..KKTKssssssssss',
      '.KTTTTKsssssSSSS',
      '.KTTTTTWKSSSSSSS',
      '.KTTTTTTTWKSSSSS',
      '.KtTTTTTTTTWKSSS',
      '.KtTTTTTTTTTTWKS',
      '.KtTTTTTTTTTTTTW',
      '.KtTTTTTTTTTTTTT',
      '.KtTTTTTTTTTTTTT'
      ],
      patches: [
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']], // Wisconsin W
      ]
    }
  };

  CH.sky = {
    pal: { S: 'skin', s: 'salmon', H: 'blue', h: 'navy', n: 'lblue', G: 'black', g: 'white', T: 'purple', t: 'dpurple', P: 'lpurple', L: 'white' },
    bg: ['cyan', 'teal'],
    p64: {
      shade: [27, 47, 3],
      half: [
      '................................', // 0
      '................................',
      '................................',
      '................................',
      '................................',
      '................................', // 5
      '................................',
      '................................',
      '................................',
      '................................',
      '................................', // 10
      '................................',
      '................................',
      '................................',
      '................................',
      '...............KHHHSSSSSSSSSSSSS', // 15 forehead (hair patch below)
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS', // 20
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHSSSSSSSSSSSSSS', // 25
      '...............KHHSSSSSSSSSSSSSS',
      '.............KKKHHSSSSSSSSSSSSSS', // 27 ear top
      '............KSSsHsSSSSSSSSSSSSSS',
      '............KSsssSSSSSSSSSSSSSSS',
      '............KSsSsSSSSSSSSSSSSSSS', // 30
      '............KSsSsSSSSSSSSSSSSSSS',
      '............KSSssSsSSSSSSSSSSSSS',
      '.............KSssSsSSSSSSSSSSSSS',
      '..............KKKsSSSSSSSSSSSSss', // 34
      '................KsSSSSSSSSSSSSSS',
      '................KsSSSSSSSSSSSSSS',
      '.................KsSSSSSSSSSSSSS',
      '.................KsSSSSSSSSSSSSS',
      '..................KsSSSSSSSSSSSS',
      '..................KsSSSSSSSSSSSS', // 40
      '...................KsSSSSSSSSSSS',
      '.................KK.KsSSSSSSSSSS', // 42 popped collar tips
      '................KPK..KsSSSSSSSSS',
      '................KPPKttKKsSSSSSSS',
      '................KPPPKtttKKKsSSSS', // 45
      '................KPPPPKtttKsKKKKK',
      '...............KTPPPPPKttKssssss',
      '.............KKTTPPPPPPKtKsssSSS',
      '...........KKTTTTTPPPPPPKKsSSSSS',
      '.........KKTTTTTTTTPPPPPPKKSSSSS', // 50
      '.......KKTTTTTTTTTTTTPPPPPPKKKKK',
      '.....KKTTTTTTTTTTTTTTTTPPPPPKsSS',
      '....KTTTTTTTTTTTTTTTTTTTTPPPPKsS',
      '...KTTTTTTTTTTTTTTTTTTTTTTTPPPKs',
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTKKK', // 55
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT', // 60
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [0, 0, [ // swoop: hand-placed, light catches the crest
      '........................KKKKKKKKKK..............................',
      '.....................KKKHHHHHHHHHHKKKKK.........................',
      '...................KKHHHHHHHHHHHHHHHHHHKKK......................',
      '..................KhHHHhHHnnnnnnnnnHHHHHHHKKK...................',
      '.................KhhHHHhHHHHHHHHHHHnnnnHHHHHHK..................',
      '................KhhhHHhHHHHHHHHHHHHHHHHnnHHHHHKK................',
      '...............KhhhhHHhHnnnnnHHHHHHHHHHHHnnHHHHHK...............',
      '...............KhhhhHhHHHHHHHnnnnnHHHHHHHHHnnHHHHK..............',
      '..............KhhhhhHhHHHHHHHHHHHHnnnnnHHHHHHnHHHHK.............',
      '..............KhhhhhHhHHHHHHHHHHHHHHHHHnnHHHHHHHHHK.............',
      '..............KhhhhhhHHHHnnnHHHHHHHHHHHHHnnHHHHHHHHK............',
      '..............KhhhhhhHHHHHHHnnnnHHHHHHHHHHHnnHHHHHHK............',
      '..............KhhhhhhHHHHHHHHHHHnnnnHHHHHHHHHnnHHHHK............',
      '..............KhhhhhHHHHHHHHHHHHHHHHnnHHHHHHHHHnHHHHK...........',
      '..............KhHHHhhhHHHHHHHHHHHHHHHHnnnHHHHHHHHHHHK...........',
      '..............KhHHHKKKhhHHHHHHnnHHHHHHHHHnnHHHHHHHHHK...........',
      '..............KhHHHK..KKhhhhhHHHnnnHHHHHHHHnnHHHHHHHK...........',
      '..............KhHHHK....KKKhhhhhHHHnnHHHHHHHHnHHHHHHK...........',
      '..............KhHHHK.......KKhhhhhHHHnnnHHHHHHnHHHHHK...........',
      '..............KhHHHK.........KKKhhhhhHHHnHHHHHHnnHHHK...........',
      '..............KhHHHK............KKhhhhhHHnnnHHHHHnHHK...........',
      '..............KhHHHK..............KKKhhhhhHHnHHHHHHHK...........',
      '..............KhHHHK.................KKhhhhhHnnHHHHHK...........',
      '..............KhHHHK...................KKKhhhhhHHHHHK...........',
      '..............KhHHHK......................KKhhhhhHHHK...........',
      '..............KhHHHK........................KKKhhhhhK...........',
      '..............KhHHHK...........................KKhhhK...........',
      '.................................................KKK............'
        ]],
        [20, 24, ['.hhhhhh', 'h']],                                  // the one brow you can see
        [13, 27, ['KKKGGGGGGGGGGGGGGGG',                                  // wraparound shades
      '..KGGGGGGGGGGGGGGGG',
      '....GGGGGGGGGGGGGG.',
      '....GGGGGGGGGGGGG..',
      '.....GnnnnnnnnnG...',
                  '.......GGGGGGGG....'], 'm'],
        [22, 28, ['..gg', '.gg', 'gg']], [39, 28, ['..gg', '.gg', 'gg']],
        [33, 34, ['s', 'ss']],                                        // nose shade
        [28, 38, ['.......K', 'KKKKKKK.', '.ssss...']],               // too-cool half smile
        [31, 55, ['LL........LL', 'LL........LL', 'LL...LL...LL', 'LL..LLLL..LL', 'LL.LL..LL.LL', 'LLLL....LLLL', '.LL......LL.']] // Wisconsin W
      ]
    },
    p32: {
      shade: [12, 25, 2],
      half: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................', // 5
      '................',
      '.......KHHSSSSSS', // 7 forehead
      '.......KHHSSSSSS',
      '.......KHHSSSSSS',
      '.......KHSSSSSSS', // 10
      '.......KHSSSSSSS',
      '.......KHSSSSSSS',
      '.....KKKHSSSSSSS', // 13 ear top
      '....KSssSSSSSSSS',
      '....KSsSSSSSSSSS', // 15
      '....KsSsSSSSSSSS',
      '.....KKsSSSSSSSs',
      '......KsSSSSSSSS',
      '......KsSSSSSSSS',
      '......KsSSSSSSSS', // 20
      '.......KsSSSSSSS',
      '.....K.KsSSSSSss',
      '....KPK.KKKKKKKK', // 23 chin + collar
      '....KPPKtKssssss',
      '...KTPPPKtKSSSSS', // 25
      '..KTTTPPPPKKSSSS',
      '.KTTTTTTPPPPKsSS',
      '.KtTTTTTTTTPPPKs',
      '.KtTTTTTTTTTTTKK',
      '.KtTTTTTTTTTTTTT', // 30
      '.KtTTTTTTTTTTTTT'
      ],
      patches: [
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']], // Wisconsin W
        [0, 1, ['.............KKKKKK.............',
      '...........KKHHnnHHKK...........',
      '.........KKHhHHHHnnHHKK.........',
      '........KhHhHHHHHHHnnHHK........',
      '.......KhhhHHnnHHHHHHHHHK.......',
      '.......KhhHHHHHnnnHHHHHHHK......',
      '.......KhhKKhhHHHHnnHHHHHK......',
      '.......KhH..KKhhHHHHnHHHHK......',
      '.......KhH....KKhhHHHHHHHK......',
      '.......KhH......KKhhHHHHK.......',
      '.......KhH........KKhhhHK.......',
                '.......Kh...........KKhhK.......']],
        [10, 11, ['hhh']],
        [5, 13, ['KKGGGGGGGGG', '...GGGGGGG.', '....GGGGG..'], 'm'],
        [10, 14, ['g']], [19, 14, ['g']],
        [16, 15, ['s', 's']],
        [13, 19, ['.....K', 'KKKKK.']],
        [17, 27, ['.KK', 'KLK', 'KK.']]
      ]
    }
  };

  CH.brody = {
    pal: { S: 'orange', s: 'brown', H: 'cream', h: 'gold', G: 'black', g: 'white', r: 'red', y: 'gold', T: 'cyan', t: 'teal', L: 'white' },
    bg: ['rose', 'dmagenta'],
    p64: {
      shade: [27, 47, 3],
      half: [
      '................................', // 0
      '................................',
      '................................',
      '................................',
      '................................',
      '................................', // 5
      '................................',
      '................................',
      '................................',
      '................................',
      '................................', // 10
      '................................',
      '................................',
      '................................',
      '................................',
      '................................', // 15
      '................................',
      '................................',
      '................................',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS', // 20
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHHSSSSSSSSSSSSS',
      '...............KHHSSSSSSSSSSSSSS', // 25
      '...............KHHSSSSSSSSSSSSSS',
      '.............KKKHHSSSSSSSSSSSSSS', // 27 ear top
      '............KSSsHsSSSSSSSSSSSSSS',
      '............KSsssSSSSSSSSSSSSSSS',
      '............KSsSsSSSSSSSSSSSSSSS', // 30
      '............KSsSsSSSSSSSSSSSSSSS',
      '............KSSssSsSSSSSSSSSSSSS',
      '.............KSssSsSSSSSSSSSSSSS',
      '..............KKKsSSSSSSSSSSSSss', // 34
      '................KsSSSSSSSSSSSSSS',
      '................KsSSSSSSSSSSSSSS',
      '.................KsSSSSSKSSSSSSS', // 37 huge grin
      '.................KsSSSSSSKKKKKKK',
      '..................KsSSSSSKWWWWWW',
      '..................KsSSSSSSKMMMMM', // 40
      '...................KsSSSSSSKWWWW',
      '....................KsSSSSSSKKKK',
      '.....................KsSSSSSSSss',
      '......................KKsSSSSSSS',
      '........................KKKsSSSS', // 45
      '.........................KsKKKKK',
      '......................KKKKssssss',
      '..................KKKKSSSKsssSSS', // 48 bare shoulders
      '..............KKKKtTTtSSSssSSSSS',
      '...........KKKSStTTtSSSSSsSSSSSS', // 50
      '........KKKSSSSStTTtSSSSSSssSSSS',
      '......KKSSSSSSStTTtSSSSSSSSSSSSS',
      '.....KSSSSSSSSstTTtSSSSSSSSSSSSS',
      '....KSSSSSSSSsstTTtSSSSSSSSSSSSS',
      '...KSSSSSSSSsKtTTTTtSSSSSSSSSSSS', // 55 tank top
      '..KSSSSSSSSsKtTTTTTTTtSSSSSSSSSS',
      '..KSSSSSSSSsKtTTTTTTTTTtSSSSSSSS',
      '..KSSSSSSSSsKtTTTTTTTTTTTTtSSSSS',
      '..KSSSSSSSSsKtTTTTTTTTTTTTTTTttt',
      '..KSSSSSSSSsKtTTTTTTTTTTTTTTTTTT', // 60
      '..KSSSSSSSSsKtTTTTTTTTTTTTTTTTTT',
      '..KSSSSSSSSsKtTTTTTTTTTTTTTTTTTT',
      '..KSSSSSSSSsKtTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [26, 55, ['LL........LL', 'LL........LL', 'LL...LL...LL', 'LL..LLLL..LL', 'LL.LL..LL.LL', 'LLLL....LLLL', '.LL......LL.']], // Wisconsin W
        [0, 0, [ // bleached spikes, dark roots
      '...............K.........K............K........K................',
      '..............KHK.......KhK..........KhK......KhK...............',
      '..............KHHK......KHhK...KK...KHhK.....KhhK...............',
      '...............KHHK.....KHHhK.KHhK.KHHhK....KhhK................',
      '...............KHHhK....KHHhK.KHhK.KHHhK...KHhhK................',
      '.........K.....KHHHhK...KHHHhKHHHhKHHHhK..KHHhhK......K.........',
      '........KHK.....KHHHhKKKHHHHhHHHHhHHHHhhKKHHHhhK.....KhK........',
      '.........KHKK...KHHHHhhKHHHHhHHHHhHHHHhhKHHHhhK....KKhK.........',
      '.........KHHHK..KHHHHhHHHHHHHhHHHhHHHhHHHHHHhhK...KHhhK.........',
      '.........KHHHhK..KHHHHhHHHHHHhHHHhHHHhHHHHHHhhK..KHHhhK.........',
      '..........KHHHhKKKHHHHHhHHHHHhHHHhHHHhHHHHHhhhKKKHHhhK..........',
      '..........KHHHHhHKHHHHHhHHHHHHHHHhHHHHHHHHhHhhKHHHHhhK..........',
      '...........KHHHhHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhK...........',
      '...........KHHHHhHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhK...........',
      '......K....KHHHHHhHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhhK....K......',
      '.....KHKKK..KHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhK..KKKhK.....',
      '......KHHHKKKKHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhKKKKHhhK......',
      '.......KHHHHHKHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhKHHHhhK.......',
      '........KhHHhHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhK........',
      '.........KhhhhhHHHHhHhhhHhHhhhHhHhhhHhHhhhHhHhHHHhhhhhK.........',
      '..........KKKKKHHHHHHhKKHHHhKKhHHhKKHHHhKKhHHHHhhKKKKK..........',
      '..............KHHHHhhK.KhHHhK.KhhK.KhHHhK.KhhHHhhK..............',
      '..............KHHHHKK...KhhK...KK...KhhK...KKHHhhK..............',
      '..............KHHHHK.....KK..........KK.....KHHhhK..............',
      '..............KHHHHK........................KHHhhK..............',
      '..............KHHHHK........................KHHhhK..............',
      '..............KhhhhK........................KhhhhK..............'
        ]],
        [0, 26, ['............GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG............',
      '..............GrrrrrrrrrrrrrrrrGGrrrrrrrrrrrrrrrrG..............',
      '..............GrrrrrrrrrrrrrrrG..GrrrrrrrrrrrrrrrG..............',
      '...............GyyyyyyyyyyyyyG....GyyyyyyyyyyyyyG...............',
                  '................GGGGGGGGGGGGG......GGGGGGGGGGGGG................']],
        [17, 27, ['gg', 'g']],
        [35, 27, ['gg', 'g']],
        [33, 33, ['s', 'ss']],
        [28, 39, ['w.....w']], [29, 41, ['.w..w']],
        [22, 50, ['W.................W', '..W.............W', '....W.........W', '......W.....W', '........WWWW', '........KWWK', '.........WW', '.........KK']] // shark-tooth necklace
      ]
    },
    p32: {
      shade: [13, 25, 2],
      half: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................', // 5
      '................',
      '................',
      '................',
      '................',
      '................', // 10
      '.......KHSSSSSSS',
      '.......KHSSSSSSS',
      '.....KKKHSSSSSSS', // 13 ear top
      '....KSssSSSSSSSS',
      '....KSsSSSSSSSSS', // 15
      '....KsSsSSSSSSSS',
      '.....KKsSSSSSSSs',
      '......KsSSKSSSSS', // 18 grin
      '......KsSSSKKKKK',
      '.......KsSKWWWWW', // 20
      '.......KsSSKMMMM',
      '........KsSSKKKK',
      '........KsSSSSss',
      '.........KKKKKKK', // 24
      '..........Ksssss',
      '.....KKKKKSSSSSS',
      '..KKKSSStTTtSWSS', // 27 tank-top straps + puka beads
      '.KSSSSSstTTtSSWS',
      '.KSSSSsKtTTTtSSW',
      '.KSSSSsKtTTTTTtt', // 30
      '.KSSSSsKtTTTTTTT'
      ],
      patches: [
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']], // Wisconsin W
        [0, 0, [
      '.......KHK.....K.....KhK........',
      '....K..KHHK...KhK...KHhK..K.....',
      '...KHK.KHHHK.KHhK..KHHhK.KhK....',
      '...KHHKKHHHhKKHHhKKHHHhKKHhK....',
      '....KHHKKHHHHHHHHHHHHhKKHHhK....',
      '....KHHHKHHHHHHHHHHHHHHHHHhK....',
      '....KHHHHHHHHHHHHHHHHHHHHhK.....',
      '.....KHHHHHHHHHHHHHHHHHHHhK.....',
      '.....KHHHHHHHHHHHHHHHHHHHhK.....',
      '......KHHHHhhHHhhHHhhHHHhK......',
      '......KHHhhKKhhKKhhKKhhHhK......',
      '......KHHKK..KK..KK..KKHhK......',
      '......KHHK............KHhK......',
      '......KhhK............KhhK......'
        ]],
        [4, 13, ['.GGGGGGGGGGG', '..GrrrrrrrGG', '...GyyyyyG..'], 'm'],
        [8, 14, ['g']], [19, 14, ['g']],
        [16, 17, ['s']],
        [13, 20, ['w..w']]
      ]
    }
  };

  CH.kegmaster = {
    pal: { S: 'skin', s: 'salmon', H: 'brown', h: 'maroon', D: 'brown', d: 'maroon', C: 'gold', c: 'orange', P: 'cream', J: 'red', T: 'blue', t: 'dblue', L: 'white' },
    bg: ['purple', 'dpurple'],
    p64: {
      shade: [15, 31, 3],
      half: [
      '...............................K', // 0 crown
      '.......................K......KP',
      '................K.....KPK.....KP',
      '...............KPK...KPCcK...KPC',
      '..............KPCcK..KPCcK...KPC',
      '..............KPCcK.KPCCCcK.KPCC', // 5
      '.............KPCCCcKKPCCCcK.KPCC',
      '............KPCCCCCCCCCCCCcKPCCC',
      '............KPCCCCCCCCCCCCcKPCCC',
      '............KPPPPPPPPPPPPPPPPPPP',
      '............KCCCCCCCCCCCCCCCCKJJ', // 10
      '............KCCCCCCCJJCCCCCCCKJJ',
      '............KCCPCCCCJJCCPCCCCKJJ',
      '............KccccccccccccccccKJJ',
      '.............KKKKKKKKKKKKKKKKKKK',
      '.............KHHHHSSSSSSSSSSSSSS', // 15
      '.............KHHHHSSSSSSSSSSSSSS',
      '.............KHHHSSSSSSSSSSSSSSS',
      '.............KHHHSSSSSSSSSSSSSsS',
      '.............KHHHSDDDSSSSSSSSSsS', // 19 brows crash down
      '.............KHHHSSDDDDDDSSSSSsS', // 20
      '.............KHHHSSSSSDDDDDDSSSS',
      '..........KKKKHHSSSSSSSSddddSSSS',
      '.........KSsssHSSSSSKKKKKKKKSSSS', // 23 lid
      '.........KSsSsHSSSSSKWWWEEWWSSSS',
      '.........KSsSsHSSSSSSsWWEEWsSSSS', // 25
      '.........KSsSsHSSSSSSSsssssSSSSS',
      '.........KSsSsDDSSSSSSSSSSSSSSSS',
      '.........KSssDDDSSSSSSSSSSSSSsSS',
      '..........KSsDDDDSSSSSSSSSSSsSSS',
      '...........KKDDDDDSSSSSSSSSsSSSS', // 30
      '............KDDDDDDSSSSSSSSSSSSS',
      '............KDDDDDDDSSSSSSSSDDDD', // 32 mustache
      '............KDDDDDDDDSSSDDDDDDDD',
      '............KDDDDDDDDDDDDDDDDDDD',
      '............KDDDDDDDDDDDDKKKKKKK', // 35 snarl
      '............KDDDDDDDDDDDKWWWWWWW',
      '............KDDDDDDDDDDDDKKKKKKK',
      '............KDDDDDDDDDDDDDDDDDDD',
      '............KDdDDDDdDDDDdDDDDdDD',
      '..........KKKDDdDDDDdDDDDdDDDDdD', // 40
      '.......KKKLLKDDdDDDDdDDDDdDDDDdD',
      '.....KKTTTLLKDDDdDDDDdDDDDdDDDDd',
      '....KTTTTTLLKDDDdDDDDdDDDDdDDDDd',
      '...KTTTTTTTLLKDDDdDDDDdDDDDdDDDD',
      '..KtTTTTTTTTLLKDDDdDDDDdDDDDdDDD', // 45
      '..KtTTTTTTTTTLLKDDDdDDDDdDDDDdDD',
      '..KtTTTTTTTTTTLLKDDDdDDDDdDDDDdD',
      '..KtTTTTTTTTTTTLLKDDDdDDDDdDDDDd',
      '..KtTTTTTTTTTTTTLLKKDDDdDDDDdDDD',
      '..KtTTTTTTTTTTTTTLLLKKDDDdDDDDdD', // 50
      '..KtTTTTTTTTTTTTTTTLLLKKKDDDDdDD',
      '..KtTTTTTTTTTTTTTTTTTLLLLKKKKKKK',
      '..KtTTTTTTTTTTTTTTTTTTTTLLLLLLLL',
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 55
      '..KtTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT', // 60
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT',
      '..KtTTTTTTtTTTTTTTTTTTTTTTTTTTTT'
      ],
      patches: [
        [30, 10, ['W', 'W']], [20, 11, ['W']], [42, 11, ['W']],     // jewel glints
        [21, 24, ['WEEWWW', 'sEEWWs']], [36, 24, ['WEEWWW', 'sEEWWs']], // glare at the hero
        [29, 27, ['..ss', '.sSSs', 'sSSSSs', 'sKSSKs', '.ssss']],     // fat nose
        [26, 36, ['.K..K..K..K.']],                                     // gritted teeth
        [27, 55, ['LL.....LL', 'LL.....LL', 'LL..L..LL', 'LL.LLL.LL', 'LLLL.LLLL', 'LLL...LLL', '.L.....L.']] // Wisconsin W
      ]
    },
    p32: {
      shade: [10, 17, 2],
      half: [
      '................',
      '...............K', // 1 crown
      '..........K...KP',
      '......K..KPK..KP',
      '.....KPK.KPCK.KP',
      '.....KPCKKPCCKKP', // 5
      '.....KPPPPPPPPPP',
      '.....KCCCCCCCCKJ',
      '.....KccccccccKJ',
      '......KKKKKKKKKK',
      '.....KHHSSSSSSSS', // 10
      '.....KHSDDSSSSss',
      '....KKHSSDDDDSSS',
      '...KSsHSSKKKKKSS', // 13 lid
      '...KSsHSSSWEEWSS',
      '...KSsDSSSssssSS', // 15
      '....KDDSSSSSSSsS',
      '....KDDDSSSSSsSS',
      '....KDDDDSSDDDDD', // 18 mustache
      '....KDDDDDDDDDDD',
      '....KDDDDDDKKKKK', // 20 snarl
      '....KDDDDDDKWWWW',
      '....KDDDDDDDKKKK',
      '....KDDDDDDDDDDD',
      '.KKKKDdDDDDDDDDD',
      'KTTLLKDDdDDDDDDD', // 25
      'KTTTLLKDDDdDDDDD',
      'KTTTTLLKDDDDDDDD',
      'KtTTTTLLKKDDDDDD',
      'KtTTTTTTLLKKKKKK',
      'KtTTTTTTTLLLLLLL', // 30
      'KtTTTTTTTTTTTTTT'
      ],
      patches: [
        [13, 28, ['L....L', 'L.LL.L', '.L..L.']], // Wisconsin W
        [15, 15, ['ss', 'KK']],
        [13, 21, ['.K..K.']]
      ]
    }
  };

  // ---------------------------------------------------------------- render
  var cache = {};
  function render(who, size) {
    var def = CH[who], spec = def && (size === 64 ? def.p64 : def.p32);
    if (!spec) return null;
    var rows = build(spec, size), pal = {}, k;
    for (k in BASE) pal[k] = hex(BASE[k]);
    for (k in def.pal) pal[k] = hex(def.pal[k]);
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    var c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    // NES-style striped backdrop in the character's color
    c.fillStyle = hex(def.bg[0]); c.fillRect(0, 0, size, size);
    c.fillStyle = hex(def.bg[1]);
    var per = size === 64 ? 8 : 6, on = size === 64 ? 3 : 2, x, y;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (((x + y) % per) < on) c.fillRect(x, y, 1, 1);
    for (y = 0; y < rows.length && y < size; y++) {
      var r = rows[y];
      for (x = 0; x < r.length && x < size; x++) {
        var col = pal[r.charAt(x)]; if (!col) continue;
        c.fillStyle = col; c.fillRect(x, y, 1, 1);
      }
    }
    c.fillStyle = hex('black');
    c.fillRect(0, 0, size, 1); c.fillRect(0, size - 1, size, 1); c.fillRect(0, 0, 1, size); c.fillRect(size - 1, 0, 1, size);
    return cv;
  }
  function get(who, size) {
    var key = who + '|' + size;
    if (!(key in cache)) { try { cache[key] = render(who, size); } catch (e) { cache[key] = null; } }
    return cache[key];
  }
  var ALIAS = { p1: 'hero', player: 'hero', sal: 'hero', nate: 'chad', p2: 'chad', cpu: 'chad' };
  var origDraw = A.drawPortrait, origInit = A.init;

  A.drawPortrait = function (ctx, who, x, y, size) {
    try {
      if (!ctx) return 0;
      var w = CH[who] ? who : ALIAS[who] || 'chad', sz = (size | 0) >= 48 ? 64 : 32;
      var cv = get(w, sz) || get('chad', sz);
      if (cv) ctx.drawImage(cv, Math.round(x), Math.round(y));
      else if (origDraw) return origDraw(ctx, who, x, y, size);
    } catch (e) { /* never throw from a draw call */ }
    return 0;
  };
  A._portraitDefs = CH; // read by tools/portraits-check.mjs
  A._portraitRows = function (who, size) { var d = CH[who]; return d ? build(size === 64 ? d.p64 : d.p32, size) : null; };
  A.init = function () {
    var r = origInit ? origInit.apply(this, arguments) : undefined;
    try { for (var w in CH) { get(w, 64); get(w, 32); } } catch (e) { /* lazily retried */ }
    return r;
  };
})();
