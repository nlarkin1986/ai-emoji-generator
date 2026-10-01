/* SUPER BEER PONG — BP.Art : all pixel art, fonts, scenes (NES 2C02 palette only).
   Sprites are authored as string pixel maps / tiny procedural "paper dolls" and
   pre-rendered once (init) to offscreen canvases; per frame we only blit + animate. */
(function () {
  'use strict';
  var BP = (window.BP = window.BP || {});

  // ------------------------------------------------------------------ palette
  // Standard NES 2C02 palette (FCEUX table). Index = PPU color number.
  var NES = [
    '#747474', '#24188C', '#0000A8', '#44009C', '#8C0074', '#A80010', '#A40000', '#7C0800',
    '#402C00', '#004400', '#005000', '#003C14', '#183C5C', '#000000', '#000000', '#000000',
    '#BCBCBC', '#0070EC', '#2038EC', '#8000F0', '#BC00BC', '#E40058', '#D82800', '#C84C0C',
    '#887000', '#009400', '#00A800', '#009038', '#008088', '#000000', '#000000', '#000000',
    '#FCFCFC', '#3CBCFC', '#5C94FC', '#CC88FC', '#F478FC', '#FC74B4', '#FC7460', '#FC9838',
    '#F0BC3C', '#80D010', '#4CDC48', '#58F898', '#00E8D8', '#505050', '#000000', '#000000',
    '#FCFCFC', '#A8E4FC', '#C4D4FC', '#D4C8FC', '#FCC4FC', '#FCC4D8', '#FCBCB0', '#FCD8A8',
    '#FCE4A0', '#E0FCA0', '#A8F0BC', '#B0FCCC', '#9CFCF0', '#C4C4C4', '#000000', '#000000'
  ];
  function N(i) { return NES[i]; }
  var PAL = {
    black: N(0x0D), white: N(0x30), gray: N(0x00), lgray: N(0x10), dgray: N(0x2D), xlgray: N(0x3D),
    red: N(0x16), dred: N(0x06), maroon: N(0x07), crimson: N(0x05), rose: N(0x15), pink: N(0x25),
    lpink: N(0x35), salmon: N(0x26), orange: N(0x27), beer: N(0x27), yellow: N(0x28), gold: N(0x28),
    cream: N(0x38), brown: N(0x17), dbrown: N(0x08), olive: N(0x18), tan: N(0x37), skin: N(0x36),
    skin2: N(0x27), skin3: N(0x17), green: N(0x1A), dgreen: N(0x0A), ddgreen: N(0x09), forest: N(0x0B),
    lgreen: N(0x2A), lime: N(0x29), mint: N(0x2B), pgreen: N(0x3A), emerald: N(0x1B), blue: N(0x12),
    dblue: N(0x02), navy: N(0x01), sky: N(0x21), lblue: N(0x22), pblue: N(0x31), azure: N(0x11),
    slate: N(0x0C), teal: N(0x1C), cyan: N(0x2C), aqua: N(0x3C), purple: N(0x13), dpurple: N(0x03),
    lpurple: N(0x23), lavender: N(0x33), magenta: N(0x14), dmagenta: N(0x04), plum: N(0x24),
    periwinkle: N(0x32), lime2: N(0x39)
  };
  var SUB = null; // active per-stage color substitution (hex -> hex) while drawing a stage
  function C(c) { var h = PAL[c] || (typeof c === 'string' && c.charAt(0) === '#' ? c.toUpperCase() : PAL.white); return (SUB && SUB[h]) || h; }

  /* ---- NES color budget. A real NES frame shows <= 25 colors (1 shared bg + 4 BG palettes x3 + 4 sprite
     palettes x3). Every stage is quantized to the sets below (static layer, crowd, table and animated bits);
     player sprites, cups and ball only use the shared sprite colors + their stage's CPU colors.
       Shared sprite palettes (all stages):  SP0 hero/cups  black red dred white  | SP1 skin  skin tan gold
                                             SP2 ball/fx    white lgray gold      | SP3 = CPU character (below)
       0 BACKYARD   BG0 sky  navy slate white | BG1 house gray lgray dgray | BG2 lawn forest dgreen green
                    BG3 lights cream gold brown        SP3 NATE  white lgray brown
       1 BASEMENT   BG0 brick maroon dred dbrown | BG1 olive gold dgray | BG2 kegs gray lgray white
                    BG3 navy blue green                SP3 TANK  brown green dgreen (+dbrown hair)
       2 ROOFTOP    BG0 navy slate dgray | BG1 windows cream gold gray | BG2 lgray white red
                    BG3 neon magenta purple dpurple    SP3 SKY   purple dpurple navy
       3 BEACH      BG0 sky navy dpurple dmagenta | BG1 rose cream gold | BG2 sea dblue blue white
                    BG3 sand olive orange dbrown       SP3 BRO-DY orange cyan rose (+blue/dmagenta)
       4 ARENA      BG0 navy dblue blue | BG1 dgray gray lgray | BG2 cream gold white | BG3 red dred brown
                    SP3 KEGMASTER blue dblue gold (+brown/navy)
     The game HUD adds a few of its own (cyan/sky, orange, lgreen). tools/art-colors.mjs checks the totals. */
  var STAGE_COLS = [
    ['black', 'white', 'lgray', 'red', 'dred', 'skin', 'tan', 'gold', 'navy', 'slate', 'gray', 'dgray', 'cream', 'forest', 'dgreen', 'green', 'brown'],
    ['black', 'white', 'lgray', 'red', 'dred', 'skin', 'tan', 'gold', 'maroon', 'dbrown', 'olive', 'gray', 'dgray', 'navy', 'blue', 'brown', 'green', 'dgreen'],
    ['black', 'white', 'lgray', 'red', 'dred', 'skin', 'tan', 'gold', 'navy', 'slate', 'gray', 'dgray', 'cream', 'magenta', 'purple', 'dpurple', 'cyan', 'brown'],
    ['black', 'white', 'lgray', 'red', 'dred', 'skin', 'tan', 'gold', 'navy', 'dpurple', 'dmagenta', 'rose', 'cream', 'dblue', 'blue', 'olive', 'orange', 'dbrown', 'cyan', 'brown'],
    ['black', 'white', 'lgray', 'red', 'dred', 'skin', 'tan', 'gold', 'dgray', 'gray', 'cream', 'navy', 'dblue', 'blue', 'brown']
  ];
  var STAGE_OVR = [
    { maroon: 'dred', olive: 'dgray', orange: 'gold', salmon: 'red', xlgray: 'lgray', lime2: 'gold', yellow: 'gold', blue: 'slate', dbrown: 'dgray', skin2: 'tan', skin3: 'brown', sky: 'white' },
    { orange: 'gold', salmon: 'red', purple: 'blue', magenta: 'blue', sky: 'white', cream: 'white', forest: 'dgreen', slate: 'navy', skin2: 'tan', skin3: 'brown', cyan: 'white', lgreen: 'green' },
    { orange: 'gold', salmon: 'red', teal: 'slate', blue: 'slate', green: 'cyan', dbrown: 'dgray', olive: 'dgray', dmagenta: 'dpurple', skin2: 'tan', skin3: 'dred', sky: 'cyan', maroon: 'dred' },
    { salmon: 'rose', pblue: 'white', forest: 'dbrown', gray: 'dbrown', teal: 'blue', pink: 'rose', lgreen: 'cyan', green: 'cyan', yellow: 'gold', skin2: 'orange', skin3: 'brown', maroon: 'dred' },
    { lblue: 'blue', purple: 'navy', dpurple: 'navy', orange: 'gold', salmon: 'red', green: 'blue', maroon: 'dred', dbrown: 'brown', skin2: 'tan', skin3: 'brown', slate: 'navy', yellow: 'gold' }
  ];
  var subCache = [];
  function stageSub(s) {
    if (subCache[s]) return subCache[s];
    var allow = {}, m = {}, list = STAGE_COLS[s].map(function (n) { return PAL[n]; }), k, i;
    for (i = 0; i < list.length; i++) allow[list[i]] = 1;
    var ovr = STAGE_OVR[s];
    for (k in ovr) if (!allow[PAL[k]]) m[PAL[k]] = PAL[ovr[k]];
    var all = NES.slice(); for (k in PAL) all.push(PAL[k]);
    for (i = 0; i < all.length; i++) {
      var h = all[i]; if (allow[h] || m[h]) continue;
      var a = parseInt(h.slice(1), 16), best = null, bd = 1e9;
      for (var j = 0; j < list.length; j++) {
        var b = parseInt(list[j].slice(1), 16), dr = (a >> 16) - (b >> 16), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255);
        var d = 3 * dr * dr + 4 * dg * dg + 2 * db * db; if (d < bd) { bd = d; best = list[j]; }
      }
      m[h] = best;
    }
    return (subCache[s] = m);
  }
  function withStage(s, fn) { var old = SUB; SUB = stageSub(s); try { return fn(); } finally { SUB = old; } }
  // darker companion (NES "shade" one luma row down) used by bigText / logo
  var DARK = { white: 'lgray', lgray: 'gray', xlgray: 'lgray', yellow: 'orange', gold: 'orange', cream: 'yellow',
    orange: 'red', beer: 'red', red: 'dred', pink: 'rose', salmon: 'red', green: 'dgreen', lgreen: 'green',
    sky: 'blue', cyan: 'teal', aqua: 'cyan', blue: 'dblue', purple: 'dpurple', lpurple: 'purple',
    magenta: 'dmagenta', dmagenta: 'dpurple', rose: 'crimson', teal: 'slate', tan: 'orange', skin: 'salmon', gray: 'dgray', lblue: 'blue', lime: 'green', mint: 'emerald' };

  var W = 256, H = 240;
  var G = { TABLE_BACK: 182, TABLE_FRONT: 196, TABLE_X0: 32, TABLE_X1: 224, TABLE_MID: 189, FLOOR_Y: 222,
    FEET_Y: 228, HERO_X: 16, CPU_X: 240, HERO_HAND_X: 28, CPU_HAND_X: 228, HAND_Y: 186 };

  // ------------------------------------------------------------------ helpers
  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    var x = c.getContext('2d'); x.imageSmoothingEnabled = false; c._x = x; return c;
  }
  function R(c, x, y, w, h, col) { c.fillStyle = C(col); c.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function P1(c, x, y, col) { c.fillStyle = C(col); c.fillRect(x | 0, y | 0, 1, 1); }
  // checkerboard dither of `col` over a rect (phase 0/1)
  function dith(c, x, y, w, h, col, ph) {
    c.fillStyle = C(col); ph = ph || 0;
    for (var j = 0; j < h; j++) for (var i = ((j + ph + x + y) & 1); i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
  }
  // sparse dither (1 of 4)
  function dith4(c, x, y, w, h, col, ph) {
    c.fillStyle = C(col); ph = ph || 0;
    for (var j = 0; j < h; j++) if (((j + y) & 1) === 0) for (var i = (((j + y) >> 1) + ph + x) & 3; i < w; i += 4) c.fillRect(x + i, y + j, 1, 1);
  }
  function disc(c, cx, cy, r, col) { // crisp filled circle
    c.fillStyle = C(col);
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y) + 0.5); c.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  // paint a string pixel-map: rows[] of chars, map {ch: colorName}
  function paint(c, rows, map, ox, oy, flip) {
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y], w = r.length;
      for (var x = 0; x < w; x++) {
        var col = map[r.charAt(x)]; if (!col) continue;
        c.fillStyle = C(col); c.fillRect(ox + (flip ? w - 1 - x : x), oy + y, 1, 1);
      }
    }
  }
  function spr(rows, map, flip) { var w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); var cv = mk(w, rows.length); paint(cv._x, rows, map, 0, 0, flip); return cv; }
  function flipCanvas(src) { var c = mk(src.width, src.height); c._x.translate(src.width, 0); c._x.scale(-1, 1); c._x.drawImage(src, 0, 0); return c; }

  // ------------------------------------------------------------------ font (8x8 cells, 7x7 chunky glyphs)
  var GL = {
    'A': ['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##'],
    'B': ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '######.'],
    'C': ['..####.', '.##..##', '##.....', '##.....', '##.....', '.##..##', '..####.'],
    'D': ['#####..', '##..##.', '##...##', '##...##', '##...##', '##..##.', '#####..'],
    'E': ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
    'F': ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '##.....'],
    'G': ['..#####', '.##....', '##.....', '##..###', '##...##', '.##..##', '..#####'],
    'H': ['##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
    'I': ['.######', '...##..', '...##..', '...##..', '...##..', '...##..', '.######'],
    'J': ['....###', '.....##', '.....##', '.....##', '##...##', '##...##', '.#####.'],
    'K': ['##...##', '##..##.', '##.##..', '####...', '#####..', '##..##.', '##...##'],
    'L': ['.##....', '.##....', '.##....', '.##....', '.##....', '.##....', '.######'],
    'M': ['##...##', '###.###', '#######', '#######', '##.#.##', '##...##', '##...##'],
    'N': ['##...##', '###..##', '####.##', '##.####', '##..###', '##...##', '##...##'],
    'O': ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
    'P': ['######.', '##...##', '##...##', '##...##', '######.', '##.....', '##.....'],
    'Q': ['.#####.', '##...##', '##...##', '##...##', '##.####', '##..##.', '.####.#'],
    'R': ['######.', '##...##', '##...##', '##..###', '#####..', '##.###.', '##..###'],
    'S': ['.####..', '##..##.', '##.....', '.#####.', '.....##', '##...##', '.#####.'],
    'T': ['.######', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..'],
    'U': ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
    'V': ['##...##', '##...##', '##...##', '###.###', '.#####.', '..###..', '...#...'],
    'W': ['##...##', '##...##', '##.#.##', '#######', '#######', '###.###', '##...##'],
    'X': ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
    'Y': ['.##..##', '.##..##', '.##..##', '..####.', '...##..', '...##..', '...##..'],
    'Z': ['#######', '....###', '...###.', '..###..', '.###...', '###....', '#######'],
    '0': ['..###..', '.#..##.', '##...##', '##...##', '##...##', '.##..#.', '..###..'],
    '1': ['...##..', '..###..', '...##..', '...##..', '...##..', '...##..', '.######'],
    '2': ['.#####.', '##...##', '....###', '..####.', '.####..', '###....', '#######'],
    '3': ['.######', '....##.', '...##..', '..####.', '.....##', '##...##', '.#####.'],
    '4': ['...###.', '..####.', '.##.##.', '##..##.', '#######', '....##.', '....##.'],
    '5': ['######.', '##.....', '######.', '.....##', '.....##', '##...##', '.#####.'],
    '6': ['..####.', '.##....', '##.....', '######.', '##...##', '##...##', '.#####.'],
    '7': ['#######', '##...##', '....##.', '...##..', '..##...', '..##...', '..##...'],
    '8': ['.####..', '##...#.', '###..#.', '.####..', '#..####', '#....##', '.#####.'],
    '9': ['.#####.', '##...##', '##...##', '.######', '.....##', '....##.', '.####..'],
    ' ': [],
    '.': ['', '', '', '', '', '.##....', '.##....'],
    ',': ['', '', '', '', '', '.##....', '.##....', '##.....'],
    '!': ['..##...', '..##...', '..##...', '..##...', '..##...', '.......', '..##...'],
    '?': ['.#####.', '##...##', '....##.', '...##..', '...##..', '.......', '...##..'],
    '-': ['', '', '', '.#####.'],
    '_': ['', '', '', '', '', '', '', '#######'],
    ':': ['', '..##...', '..##...', '', '..##...', '..##...'],
    ';': ['', '..##...', '..##...', '', '..##...', '..##...', '.##....'],
    "'": ['..##...', '..##...', '.##....'],
    '"': ['.##.##.', '.##.##.', '.#..#..'],
    '/': ['.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '#......'],
    '(': ['...##..', '..##...', '.##....', '.##....', '.##....', '..##...', '...##..'],
    ')': ['.##....', '..##...', '...##..', '...##..', '...##..', '..##...', '.##....'],
    '[': ['.####..', '.##....', '.##....', '.##....', '.##....', '.##....', '.####..'],
    ']': ['.####..', '...##..', '...##..', '...##..', '...##..', '...##..', '.####..'],
    '*': ['', '##.#.##', '.#####.', '#######', '.#####.', '##.#.##'],
    '#': ['.##.##.', '#######', '.##.##.', '.##.##.', '#######', '.##.##.'],
    '%': ['##...##', '##..##.', '...##..', '..##...', '.##....', '##..##.', '#...##.'],
    '&': ['.###...', '##.##..', '.###...', '.###.##', '##.###.', '##..##.', '.###.##'],
    '+': ['', '...##..', '...##..', '.######', '...##..', '...##..'],
    '=': ['', '', '.######', '', '.######'],
    '<': ['....##.', '...##..', '..##...', '.##....', '..##...', '...##..', '....##.'],
    '>': ['.##....', '..##...', '...##..', '....##.', '...##..', '..##...', '.##....'],
    '@': ['.#####.', '##...##', '##.####', '##.####', '##.###.', '##.....', '.#####.'],
    '$': ['...#...', '.#####.', '##.#...', '.#####.', '...#.##', '.#####.', '...#...'],
    '^': ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'],
    '▶': ['.#.....', '.##....', '.###...', '.####..', '.###...', '.##....', '.#.....'],
    '◀': ['.....#.', '....##.', '...###.', '..####.', '...###.', '....##.', '.....#.'],
    '▼': ['', '#######', '.#####.', '..###..', '...#...'],
    '♥': ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    '★': ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
    '©': ['.#####.', '#.....#', '#.###.#', '#.#...#', '#.###.#', '#.....#', '.#####.'],
    '×': ['', '##...##', '.##.##.', '..###..', '.##.##.', '##...##']
  };
  GL['►'] = GL['▶']; GL['❤'] = GL['♥']; GL['☆'] = GL['★'];
  var GKEYS = Object.keys(GL), GI = {};
  for (var gi = 0; gi < GKEYS.length; gi++) GI[GKEYS[gi]] = gi;
  var atlases = {};
  function atlas(color) {
    var key = C(color), a = atlases[key];
    if (a) return a;
    a = mk(GKEYS.length * 8, 8); var c = a._x; c.fillStyle = key;
    for (var i = 0; i < GKEYS.length; i++) {
      var g = GL[GKEYS[i]];
      for (var y = 0; y < g.length; y++) for (var x = 0; x < g[y].length; x++) if (g[y].charAt(x) === '#') c.fillRect(i * 8 + x, y, 1, 1);
    }
    atlases[key] = a; return a;
  }
  function glyphIndex(ch) { var i = GI[ch]; return i === undefined ? GI[' '] : i; }
  function text(ctx, str, x, y, color, shadow) {
    if (!ctx) return 0;
    str = String(str == null ? '' : str).toUpperCase();
    x = Math.round(x || 0); y = Math.round(y || 0);
    var a = atlas(color || 'white'), s = shadow ? atlas(shadow === true ? 'black' : shadow) : null;
    var cx = x, maxw = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === '\n') { maxw = Math.max(maxw, cx - x); cx = x; y += 10; continue; }
      var gi2 = glyphIndex(ch);
      if (ch !== ' ') {
        if (s) ctx.drawImage(s, gi2 * 8, 0, 8, 8, cx + 1, y + 1, 8, 8);
        ctx.drawImage(a, gi2 * 8, 0, 8, 8, cx, y, 8, 8);
      }
      cx += 8;
    }
    return Math.max(maxw, cx - x);
  }
  function measure(str) { str = String(str == null ? '' : str); var m = 0, l = 0; for (var i = 0; i < str.length; i++) { if (str.charAt(i) === '\n') { l = 0; continue; } l++; if (l > m) m = l; } return m * 8; }
  function textCenter(ctx, str, y, color, shadow) { return text(ctx, str, Math.max(0, ((W - measure(str)) / 16) | 0) * 8, y, color, shadow); } // snapped to the 8-px tile grid

  // ---- big outlined callout text (cached per string/color/scale)
  var bigCache = {};
  function bigCanvas(str, color, scale) {
    str = String(str == null ? '' : str).toUpperCase(); scale = Math.max(1, Math.min(4, scale | 0 || 2));
    var key = str + '|' + color + '|' + scale; if (bigCache[key]) return bigCache[key];
    var n = str.length, gw = n * 8 * scale, gh = 8 * scale, w = gw + 3, h = gh + 3;
    var grid = new Uint8Array(w * h); // 0 none, 1 face top, 2 face bottom, 3 outline
    for (var i = 0; i < n; i++) {
      var g = GL[str.charAt(i)] || [];
      for (var y = 0; y < g.length; y++) for (var x = 0; x < g[y].length; x++) if (g[y].charAt(x) === '#') {
        for (var sy = 0; sy < scale; sy++) for (var sx = 0; sx < scale; sx++) {
          var px = 1 + i * 8 * scale + x * scale + sx, py = 1 + y * scale + sy;
          grid[py * w + px] = y < 4 ? 1 : 2;
        }
      }
    }
    var out = new Uint8Array(grid);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      if (grid[yy * w + xx]) continue;
      var hit = false;
      for (var dy = -1; dy <= 1 && !hit; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = xx + dx, ny = yy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (grid[ny * w + nx] === 1 || grid[ny * w + nx] === 2) { hit = true; break; }
      }
      // drop shadow (down-right)
      if (!hit && xx > 1 && yy > 1) { var v = grid[(yy - 2) * w + xx - 1]; if (v === 1 || v === 2) hit = true; }
      if (hit) out[yy * w + xx] = 3;
    }
    var cv = mk(w, h), c = cv._x, cols = [null, C(color || 'white'), C(DARK[color] || color || 'white'), PAL.black];
    for (var k = 0; k < w * h; k++) if (out[k]) { c.fillStyle = cols[out[k]]; c.fillRect(k % w, (k / w) | 0, 1, 1); }
    cv._w = gw; bigCache[key] = cv; return cv;
  }
  function bigText(ctx, str, x, y, color, scale) {
    if (!ctx) return 0; var cv = bigCanvas(str, color || 'white', scale || 2);
    ctx.drawImage(cv, Math.round(x) - 1, Math.round(y) - 1); return cv._w;
  }
  function bigTextCenter(ctx, str, y, color, scale) {
    var cv = bigCanvas(str, color || 'white', scale || 2); return bigText(ctx, str, Math.max(0, ((W - cv._w) / 16) | 0) * 8, y, color, scale);
  }

  // ------------------------------------------------------------------ dialog boxes
  var BOX = { 'default': ['white', null, 'black'], red: ['red', 'dred', 'black'], gold: ['gold', 'orange', 'black'],
    dim: ['gray', null, 'black'], blue: ['white', null, 'navy'], green: ['lgreen', 'dgreen', 'black'] };
  function drawBox(ctx, x, y, w, h, style) {
    if (!ctx) return; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 6 || h < 6) { R(ctx, x, y, Math.max(0, w), Math.max(0, h), 'black'); return; }
    var s = BOX[style] || BOX['default'];
    R(ctx, x, y, w, h, s[2]);
    ctx.fillStyle = C(s[0]);
    if (h < 16 || w < 16) { // slim 1-px frame so 8-px text fits inside (e.g. h=12 labels)
      ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 2, y + h - 2, w - 4, 1);
      ctx.fillRect(x + 1, y + 2, 1, h - 4); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
      return;
    }
    ctx.fillRect(x + 2, y + 1, w - 4, 2); ctx.fillRect(x + 2, y + h - 3, w - 4, 2);
    ctx.fillRect(x + 1, y + 2, 2, h - 4); ctx.fillRect(x + w - 3, y + 2, 2, h - 4);
    if (s[1]) {
      ctx.fillStyle = C(s[1]);
      ctx.fillRect(x + 4, y + 4, w - 8, 1); ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
      ctx.fillRect(x + 4, y + 4, 1, h - 8); ctx.fillRect(x + w - 5, y + 4, 1, h - 8);
    }
  }

  // NES palette-step fade: every pixel's 2C02 color drops one luma row (index - 0x10) per level;
  // below row 0 -> black. level 0 = no-op, 4 = black. Post-processes the current frame.
  var fadeLUT = null;
  function nesIndexOf(rgbInt) { // nearest palette index (exact for palette colors)
    var best = 0x0F, bd = 1e9;
    for (var i = 0; i < 64; i++) {
      if ((i & 15) >= 0x0E) continue; var b = parseInt(NES[i].slice(1), 16);
      var dr = (rgbInt >> 16) - (b >> 16), dg = ((rgbInt >> 8) & 255) - ((b >> 8) & 255), db = (rgbInt & 255) - (b & 255), d = dr * dr + dg * dg + db * db;
      if (d < bd || (d === bd && i < best)) { bd = d; best = i; } // lowest index wins ties ($20 white before $30)
    }
    return best;
  }
  function fade(ctx, level) {
    level = Math.max(0, Math.min(4, level | 0)); if (!ctx || !level) return;
    var cw = ctx.canvas ? ctx.canvas.width : W, ch = ctx.canvas ? ctx.canvas.height : H;
    if (level >= 4) { ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, cw, ch); return; }
    if (!fadeLUT) fadeLUT = [null, {}, {}, {}];
    var lut = fadeLUT[level], img = ctx.getImageData(0, 0, cw, ch), d = img.data, last = -1, out = 0;
    for (var p = 0; p < d.length; p += 4) {
      var k = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
      if (k !== last) {
        last = k; out = lut[k];
        if (out === undefined) {
          var j = nesIndexOf(k) - 0x10 * level;
          out = lut[k] = (j < 0 || (j & 15) >= 0x0D) ? 0 : parseInt(NES[j].slice(1), 16);
        }
      }
      d[p] = out >> 16; d[p + 1] = (out >> 8) & 255; d[p + 2] = out & 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------ small sprites
  var S = {}; // prerendered sprite canvases
  var CUPMAP = {
    // classic red party cup: white rolled rim, black outline, white highlight stripe, dred ridge band, slight taper
    full: ['gWWWWWWg', 'KWWWWWWK', 'KRLRRRDK', 'KRLRRRDK', 'KDDDDDDK', '.KLRRDK.', '.KLRRDK.', '.KRRRDK.', '.KRRDDK.', '.KKKKKK.'],
    pal: { W: 'white', g: 'lgray', R: 'red', L: 'white', D: 'dred', K: 'black' }
  };
  var BALL = ['.WWW.', 'WWWWW', 'WWWWg', 'WWWgg', '.ggg.'];
  var FIRE = [ // 8x8 fireball, 2 flicker frames (red/orange/gold + white-hot core)
    ['...R..R.', '..RO.RO.', '.ROORYOR', 'ROYYYYOR', 'ROYWWYOR', 'ROYWWYOR', '.ROYYOR.', '..RRRR..'],
    ['.R...R..', '.OR.ROR.', 'ROORROR.', 'ROYYYYOR', 'ROYWWYOR', 'OOYWWYOO', '.ROYYOR.', '..RRRR..']
  ];
  var FLAME = [ // 5x5 trail flame puffs
    ['..R..', '.ROR.', '.OYO.', 'ROYOR', '.ROR.'],
    ['.R...', '.RR..', 'ROOR.', 'ROYOR', '.ROR.'],
    ['...R.', '..RR.', '.ROOR', 'ROYOR', '.ROR.'],
    ['.....', '..R..', '.ROR.', '.OYO.', '..R..']
  ];
  var XHAIR = ['..WWWWW..', '.W..W..W.', 'W...W...W', 'W.......W', 'WWW.R.WWW', 'W.......W', 'W...W...W', '.W..W..W.', '..WWWWW..'];
  var ICONS = {
    cup: ['.WWWWWW.', '.gWWWWg.', '.RLRRRD.', '..LRRD..', '..LRRD..', '..DDDD..', '..LRRD..', '..DDDD..'],
    cupEmpty: ['.gggggg.', '.g....g.', '.g....g.', '..g..g..', '..g..g..', '..g..g..', '..g..g..', '..gggg..'],
    mug: ['........', 'gggggg..', 'g....ggg', 'g....g.g', 'g....g.g', 'g....ggg', 'g....g..', '.gggg...'],
    mugFull: ['.WWWWW..', 'WWWWWWg.', 'gBYBBggg', 'gBYBBg.g', 'gBYBBg.g', 'gBYBBggg', 'gBBBBg..', '.gggg...'],
    ball: ['........', '..WWW...', '.WWWWW..', '.WWWWg..', '.WWWgg..', '..ggg...', '........', '........'],
    fire: ['...R....', '..RR..R.', '..ROR.R.', '.RROORR.', '.ROYYOR.', 'ROYWWYOR', 'ROYWWYOR', '.ROOOOR.'],
    wind: ['....WW..', '......W.', 'WWWWWW..', '........', '.WWWWWW.', '.......W', '.....WW.', '........'],
    heart: ['.RR.RR..', 'RWRRRRR.', 'RRRRRRR.', 'RRRRRRR.', '.RRRRR..', '..RRR...', '...R....', '........'],
    star: ['...Y....', '...Y....', '..YYY...', 'YYYYYYY.', '.YYYYY..', '..YYY...', '.YY.YY..', '.Y...Y..'],
    arrowL: ['...W....', '..WW....', '.WWWWWW.', 'WWWWWWW.', '.WWWWWW.', '..WW....', '...W....', '........'],
    arrowR: ['....W...', '....WW..', '.WWWWWW.', '.WWWWWWW', '.WWWWWW.', '....WW..', '....W...', '........'],
    arrowU: ['...W....', '..WWW...', '.WWWWW..', 'WWWWWWW.', '..WWW...', '..WWW...', '..WWW...', '........'],
    arrowD: ['..WWW...', '..WWW...', '..WWW...', 'WWWWWWW.', '.WWWWW..', '..WWW...', '...W....', '........'],
    speaker: ['...W....', '..WW..W.', 'WWWW.W.W', 'WWWW.W.W', 'WWWW.W.W', '..WW..W.', '...W....', '........'],
    mute: ['...W....', '..WW....', 'WWWWR.R.', 'WWWW.R..', 'WWWWR.R.', '..WW....', '...W....', '........'],
    crown: ['........', 'Y..Y..Y.', 'YY.Y.YY.', 'YYYYYYY.', 'YRYYYRY.', 'YYYYYYY.', 'OOOOOOO.', '........'],
    trophy: ['YYYYYYY.', 'YWYYYOY.', '.YYYYO..', '..YYO...', '...Y....', '..YYO...', '.OOOOO..', '........']
  };
  var ICONPAL = { W: 'white', g: 'lgray', R: 'red', L: 'red', D: 'dred', B: 'orange', Y: 'gold', O: 'orange' };

  // ------------------------------------------------------------------ characters (paper-doll rasterizer)
  function grid(w, h) { return { w: w, h: h, a: new Array(w * h) }; }
  function gs(g, x, y, v) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; g.a[y * g.w + x] = v; }
  function gg(g, x, y) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return undefined; return g.a[y * g.w + x]; }
  function gCaps(g, x0, y0, x1, y1, r, v) {
    var mnx = Math.floor(Math.min(x0, x1) - r), mxx = Math.ceil(Math.max(x0, x1) + r);
    var mny = Math.floor(Math.min(y0, y1) - r), mxy = Math.ceil(Math.max(y0, y1) + r);
    var dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
    for (var y = mny; y <= mxy; y++) for (var x = mnx; x <= mxx; x++) {
      var t = L ? ((x - x0) * dx + (y - y0) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var px = x0 + t * dx - x, py = y0 + t * dy - y;
      if (px * px + py * py <= r * r + 0.01) gs(g, x, y, v);
    }
  }
  function gPoly(g, pts, v) {
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, i;
    for (i = 0; i < pts.length; i++) { mnx = Math.min(mnx, pts[i][0]); mxx = Math.max(mxx, pts[i][0]); mny = Math.min(mny, pts[i][1]); mxy = Math.max(mxy, pts[i][1]); }
    for (var y = Math.floor(mny); y <= mxy; y++) for (var x = Math.floor(mnx); x <= mxx; x++) {
      var px = x + 0.5, py = y + 0.5, ins = false;
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
      }
      if (ins) gs(g, x, y, v);
    }
  }
  function gStamp(g, rows, ox, oy) {
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y].charAt(x); if (ch !== '.' && ch !== ' ') gs(g, ox + x, oy + y, ch);
    }
  }
  function gOutline(g) {
    var add = [];
    for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
      if (g.a[y * g.w + x] !== undefined) continue;
      var n = gg(g, x - 1, y), e = gg(g, x + 1, y), u = gg(g, x, y - 1), d = gg(g, x, y + 1);
      if ((n && n !== 'K') || (e && e !== 'K') || (u && u !== 'K') || (d && d !== 'K')) add.push(y * g.w + x);
    }
    for (var i = 0; i < add.length; i++) g.a[add[i]] = 'K';
  }
  function gShade(g, from, to) { // back-side (left) shading
    var ch = [];
    for (var y = 0; y < g.h; y++) for (var x = 1; x < g.w; x++) if (g.a[y * g.w + x] === from && g.a[y * g.w + x - 1] === 'K') ch.push(y * g.w + x);
    for (var i = 0; i < ch.length; i++) g.a[ch[i]] = to;
  }
  function gComp(d, s) { for (var i = 0; i < s.a.length; i++) if (s.a[i] !== undefined) d.a[i] = s.a[i]; }
  var rgbCache = {};
  function rgb(hex) { var v = rgbCache[hex]; if (v) return v; var n = parseInt(hex.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; rgbCache[hex] = v; return v; }
  function gCanvas(g, map) {
    var cv = mk(g.w, g.h), id = cv._x.createImageData(g.w, g.h), d = id.data;
    for (var i = 0; i < g.a.length; i++) {
      var v = g.a[i]; if (v === undefined) continue; var col = map[v]; if (!col) continue;
      var c = rgb(C(col)); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    cv._x.putImageData(id, 0, 0); return cv;
  }

  // Heads (14 wide, facing right). K outline, S skin, s shade, H hair, C cap, c cap2, E eye, M mouth,
  // G glasses, g glint, X gold, x gold dark, J jewel, D beard, w white
  var HEADS = {
    hero: [
      '...KKKKKK.....',
      '..KCCCCCCK....',
      '.KCCCwwCCCK...',
      '.KCCCwwCCCCK..',
      '.KCCCCCCCCCKKK',
      '.KHCCCCCCccccK',
      '.KHHKKKKKKKKK.',
      '.KHHSSSSSSSK..',
      '.KHSKSSSSSESK.',
      '.KHSsSSSSSESSK',
      '..KSSSSSSSSSK.',
      '..KKSSSSSMMK..',
      '....KKSSSKK...'],
    chad: [
      '....KKKKKK....',
      '...KCCCCCCK...',
      '..KCCCCCCCCK..',
      '..KCCCCCCCCCK.',
      'KKKCCCCCCCCCK.',
      'KcccCCCCCHHHK.',
      '.KKKKKKKKHHHK.',
      '.KHHSSSSSSSK..',
      '.KHSKSSSSSESK.',
      '.KHSsSSSSSESSK',
      '..KSSSSSSSSSK.',
      '..KKSSSSSMMK..',
      '....KKSSSKK...'],
    tank: [
      '..KKKKKKKKK...',
      '.KHHHHHHHHHK..',
      '.KHHHHHHHHHK..',
      '.KHHHHHHHHHHK.',
      '.KHHSSSSSSSSK.',
      '.KHSSSSSSHHHK.',
      '.KHSKSSSSSESK.',
      '.KHSsSSSSSESSK',
      '.KSSSSSSSSSSK.',
      '.KSSSSSSSSSSK.',
      '.KSSSSSSMMMSK.',
      '..KSSSSSSSSK..',
      '...KKSSSSKK...'],
    sky: [
      '....KKKKK.....',
      '...KHHHHHKK...',
      '..KHHHHHHHHK..',
      '.KHHHHHHHHHHK.',
      '.KHHHHHHHHHHHK',
      '.KHHHHHSSSKKK.',
      '.KHHHSSSSSSK..',
      '.KHHSSSSSSSK..',
      '.KHSKSGGGGGGK.',
      '.KHSsSSSGgGSSK',
      '..KSSSSSSSSSK.',
      '..KKSSSSSMMK..',
      '....KKSSSKK...'],
    brody: [
      '..K..K..K.....',
      '.KHKKHKKHK....',
      '.KHHHHHHHHKK..',
      'KHHHHHHHHHHHK.',
      '.KHHHHHHHHHHHK',
      '.KHHHHSSSSSK..',
      '.KHHSSSSSSSK..',
      '.KHSSSSSSSSK..',
      '.KHSKSGGGGGGK.',
      '.KHSsSSSGgGSSK',
      '..KSSSSSSSSSK.',
      '..KKSSSSMMMK..',
      '....KKSSSKK...'],
    kegmaster: [
      '.K...K...K....',
      'KXK.KXK.KXK...',
      'KXXKXXXKXXK...',
      'KXXXXJXXXXK...',
      'KxxxxxxxxxK...',
      '.KHHSSSSSSKK..',
      '.KHSSSSSSHHK..',
      '.KHSKSSSSSESK.',
      '.KHSsSSSSSESSK',
      '.KDDSSSSSSSSK.',
      '.KDDDDDDDDDDK.',
      '.KDDDDDMMDDK..',
      '..KDDDDDDDK...',
      '...KKDDDKK....']
  };
  var LOGOS = {
    W: ['L...L', 'L...L', 'L.L.L', 'LLLLL', '.L.L.'],
    N8: ['.LLL.', 'L...L', '.LLL.', 'L...L', '.LLL.'],
    bolt: ['...LL', '..LL.', '.LLLL', '..LL.', '.LL..'],
    K: ['L..LL', 'L.LL.', 'LLL..', 'L.LL.', 'L..LL'],
    palm: ['LL.LL', '.LLL.', 'L.L.L', '..L..', '..L..']
  };
  var SHOE = ['WWW..', 'WWWWW', 'uuuuuu'];
  var HELDCUP = ['rrrr', 'RRRR', 'RRRR', '.RR.', '.RR.'];
  var HELDBALL = ['.BB.', 'BBBb', 'BBbb', '.bb.'];
  var CHARS = {
    hero: { name: 'SAL', head: 'hero', logo: 'W', wide: 0, pal: { S: 'skin', s: 'tan', H: 'brown', C: 'red', c: 'dred', w: 'white', T: 'red', t: 'dred', V: 'red', L: 'white', P: 'tan', p: 'gold', O: 'white', W: 'white', w2: 'red' }, bg: 'blue' },
    chad: { name: 'NATE', head: 'chad', logo: 'W', wide: 0, pal: { S: 'skin', s: 'tan', H: 'brown', C: 'white', c: 'lgray', T: 'white', t: 'lgray', V: 'white', L: 'red', P: 'red', p: 'dred', O: 'white', W: 'white', w2: 'red' }, bg: 'red' },
    tank: { name: 'TANK', head: 'tank', logo: 'N8', wide: 3, armR: 1.4, pal: { S: 'brown', s: 'dred', H: 'dbrown', T: 'green', t: 'dgreen', V: 'green', L: 'white', P: 'lgray', p: 'gray', O: 'white', W: 'gray', w2: 'dgray' }, bg: 'orange' },
    sky: { name: 'SKY', head: 'sky', logo: 'bolt', wide: 0, pal: { S: 'skin', s: 'tan', H: 'navy', G: 'black', g: 'white', T: 'purple', t: 'dpurple', V: 'purple', L: 'gold', P: 'dgray', p: 'black', O: 'white', W: 'white', w2: 'purple' }, bg: 'slate' },
    brody: { name: 'BRO-DY', head: 'brody', logo: null, wide: 1, pal: { S: 'orange', s: 'red', H: 'cream', G: 'black', g: 'white', T: 'cyan', t: 'blue', V: 'orange', L: 'white', P: 'rose', p: 'dmagenta', O: 'orange', W: 'gold', w2: 'red' }, bg: 'rose' },
    kegmaster: { name: 'KEGMASTER', head: 'kegmaster', logo: 'K', wide: 4, armR: 1.3, belly: 1, pal: { S: 'skin', s: 'tan', H: 'brown', D: 'brown', X: 'gold', x: 'brown', J: 'red', T: 'blue', t: 'dblue', V: 'blue', L: 'gold', P: 'navy', p: 'black', O: 'white', W: 'gold', w2: 'brown' }, bg: 'dmagenta' }
  };
  // Poses in a 24x48 frame (feet bottom at y=47), facing right. Points: [x,y].
  // h:[hx,hy,expr] t:torso poly, s:shorts poly, ab/af: back/front arm [shoulder,elbow,hand],
  // lb/lf: legs [hip,knee,ankle], lg: logo pos, item: 'ball'|'cup' in front hand
  var STAND_T = [[8, 13], [18, 13], [18, 17], [17, 26], [9, 26], [8, 17]];
  var STAND_S = [[8, 25], [18, 25], [18, 31], [8, 31]];
  var POSES = {
    idle0: { h: [5, 0, 'n'], t: STAND_T, s: STAND_S, ab: [[8, 15], [6, 20], [6, 25]], af: [[17, 15], [19, 20], [19, 25]],
      lb: [[10, 30], [10, 37], [10, 43]], lf: [[15, 30], [15, 37], [15, 43]], lg: [11, 17] },
    idle1: { h: [5, 1, 'n'], t: [[8, 14], [18, 14], [18, 18], [17, 26], [9, 26], [8, 18]], s: STAND_S, ab: [[8, 16], [6, 21], [6, 26]], af: [[17, 16], [19, 21], [19, 26]],
      lb: [[10, 30], [10, 37], [10, 43]], lf: [[15, 30], [15, 37], [15, 43]], lg: [11, 18] },
    aim: { h: [5, 0, 'n'], t: STAND_T, s: STAND_S, ab: [[8, 15], [6, 20], [8, 24]], af: [[17, 15], [21, 19], [20, 11]], item: 'ball',
      lb: [[10, 30], [9, 37], [8, 43]], lf: [[15, 30], [16, 37], [17, 43]], lg: [11, 17] },
    throw: { h: [7, 1, 'n'], t: [[10, 14], [20, 14], [20, 18], [18, 26], [10, 26], [9, 18]], s: [[9, 25], [19, 25], [19, 31], [9, 31]],
      ab: [[10, 16], [6, 20], [3, 23]], af: [[19, 16], [22, 12], [23, 7]],
      lb: [[11, 30], [8, 37], [5, 43]], lf: [[16, 30], [18, 37], [19, 43]], lg: [13, 18] },
    cheer0: { h: [5, 0, 'h'], t: STAND_T, s: STAND_S, ab: [[8, 15], [5, 9], [4, 2]], af: [[17, 15], [20, 9], [21, 2]],
      lb: [[10, 30], [9, 37], [8, 43]], lf: [[15, 30], [16, 37], [17, 43]], lg: [11, 17] },
    cheer1: { h: [5, -2, 'h'], t: [[8, 11], [18, 11], [18, 15], [17, 24], [9, 24], [8, 15]], s: [[8, 23], [18, 23], [18, 29], [8, 29]],
      ab: [[8, 13], [3, 11], [3, 4]], af: [[17, 13], [22, 11], [22, 4]],
      lb: [[10, 28], [8, 34], [9, 40]], lf: [[15, 28], [17, 34], [16, 40]], lg: [11, 15] },
    drink: { h: [10, 5, 'c'], t: [[8, 29], [17, 29], [22, 20], [20, 16], [12, 16], [8, 22]], s: [[8, 27], [18, 27], [18, 33], [8, 33]],
      ab: [[12, 19], [11, 25], [12, 30]], af: [[19, 19], [23, 24], [22, 17]], item: 'cup',
      lb: [[10, 31], [10, 37], [10, 43]], lf: [[15, 31], [16, 37], [16, 43]], lg: null },
    sad: { h: [5, 3, 's'], t: [[8, 15], [17, 15], [18, 18], [17, 27], [9, 27], [8, 18]], s: [[8, 26], [18, 26], [18, 32], [8, 32]],
      ab: [[8, 17], [7, 23], [7, 28]], af: [[17, 17], [21, 21], [18, 13]],
      lb: [[10, 31], [10, 37], [10, 43]], lf: [[15, 31], [15, 37], [15, 43]], lg: [11, 19] },
    walk0: { h: [5, 0, 'n'], t: STAND_T, s: STAND_S, ab: [[8, 15], [6, 20], [4, 24]], af: [[17, 15], [19, 20], [21, 24]],
      lb: [[10, 30], [8, 37], [6, 43]], lf: [[15, 30], [17, 37], [18, 43]], lg: [11, 17] },
    walk1: { h: [5, -1, 'n'], t: [[8, 12], [18, 12], [18, 16], [17, 25], [9, 25], [8, 16]], s: [[8, 24], [18, 24], [18, 30], [8, 30]],
      ab: [[8, 14], [7, 19], [7, 24]], af: [[17, 14], [18, 19], [18, 24]],
      lb: [[10, 29], [11, 36], [11, 43]], lf: [[15, 29], [18, 34], [15, 40]], lg: [11, 16] }
  };
  var POSE_FRAMES = { idle: ['idle0', 'idle1'], aim: ['aim'], 'throw': ['throw'], cheer: ['cheer0', 'cheer1'], drink: ['drink'], sad: ['sad'], walk: ['walk0', 'walk1'] };

  function headRows(ch, expr) {
    var rows = HEADS[ch.head] || HEADS.hero;
    if (expr === 'n') return rows;
    rows = rows.map(function (r) { return r.split(''); });
    var y, x;
    for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === 'E' && (expr === 'c' || expr === 's') && rows[y + 1] && rows[y + 1][x] === 'E') rows[y][x] = 'S';
    }
    if (expr === 'h') { // open mouth
      for (y = rows.length - 1; y >= 0; y--) for (x = 0; x < rows[y].length; x++) if (rows[y][x] === 'M' && rows[y - 1] && rows[y - 1][x] === 'S') rows[y - 1][x] = 'm';
    }
    if (expr === 's') { // frown: shift mouth corners
      for (y = 0; y < rows.length; y++) { var j = rows[y].indexOf('M'); if (j >= 0) { rows[y][j] = 'S'; } }
    }
    return rows.map(function (r) { return r.join(''); });
  }

  function buildChar(who, pk) {
    var ch = CHARS[who] || CHARS.chad, P = POSES[pk] || POSES.idle0, k = ch.wide || 0, kL = k >> 1;
    var GW = 28 + k, GH = 52, OX = 2, OY = 4;
    function X(x) { return x + OX + (x > 12.5 ? k : 0); }
    function Y(y) { return y + OY; }
    function pt(p) { return [X(p[0]), Y(p[1])]; }
    var armR = ch.armR || 1, legR = ch.legR || (k >= 3 ? 1.3 : 1), out = grid(GW, GH);
    function arm(a, item) {
      var g = grid(GW, GH), s = pt(a[0]), e = pt(a[1]), h = pt(a[2]);
      gCaps(g, s[0], s[1], e[0], e[1], armR, 'S'); gCaps(g, e[0], e[1], h[0], h[1], armR, 'S');
      gCaps(g, h[0], h[1], h[0], h[1], armR + 0.45, 'S');
      var m = [s[0] + (e[0] - s[0]) * 0.5, s[1] + (e[1] - s[1]) * 0.5];
      gCaps(g, s[0], s[1], m[0], m[1], armR + 0.6, 'V');
      if (item === 'ball') gStamp(g, HELDBALL, h[0] - 1, h[1] - 4);
      if (item === 'cup') gStamp(g, HELDCUP, h[0] - 2, h[1] - 5);
      gOutline(g); return g;
    }
    // back arm
    gComp(out, arm(P.ab));
    // legs + shorts
    var lg = grid(GW, GH);
    [P.lb, P.lf].forEach(function (L) {
      var a = pt(L[0]), b = pt(L[1]), c = pt(L[2]);
      gCaps(lg, a[0], a[1], b[0], b[1], legR, 'S'); gCaps(lg, b[0], b[1], c[0], c[1], legR, 'S');
      for (var yy = c[1] - 2; yy <= c[1]; yy++) for (var xx = c[0] - 2; xx <= c[0] + 2; xx++) if (gg(lg, xx, yy) === 'S') gs(lg, xx, yy, 'O');
    });
    [P.lb, P.lf].forEach(function (L) {
      var a = pt(L[0]), b = pt(L[1]);
      gCaps(lg, a[0], a[1], a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45, 2.2 + (k >= 3 ? 0.4 : 0), 'P');
      var c = pt(L[2]); gStamp(lg, SHOE, c[0] - 2, c[1] + 1);
    });
    gPoly(lg, P.s.map(pt), 'P');
    gOutline(lg); gShade(lg, 'P', 'p');
    gComp(out, lg);
    // torso
    var tg = grid(GW, GH), tp = P.t.map(pt);
    gPoly(tg, tp, 'T');
    if (ch.belly) { var bx = X(16) + 1, by = Y(P.t[3][1]) - 5; gCaps(tg, bx, by, bx, by + 1, 3.2, 'T'); }
    if (ch.head === 'brody') { // tank top: skin shoulders
      for (var yy = tp[0][1]; yy < tp[0][1] + 3; yy++) for (var xx = 0; xx < GW; xx++) { var v = gg(tg, xx, yy); if (v === 'T' && (xx < tp[0][0] + 2 || xx > tp[1][0] - 3)) gs(tg, xx, yy, 'S'); }
    }
    if (P.lg && ch.logo && LOGOS[ch.logo]) gStamp(tg, LOGOS[ch.logo], X(P.lg[0]) + (k >> 1), Y(P.lg[1]));
    gOutline(tg); gShade(tg, 'T', 't');
    gComp(out, tg);
    // head
    var hg = grid(GW, GH);
    gStamp(hg, headRows(ch, P.h[2]), P.h[0] + OX + kL, P.h[1] + OY);
    gComp(out, hg);
    // front arm (+ held item)
    gComp(out, arm(P.af, P.item));
    var map = { K: 'black', E: 'black', M: 'dred', m: 'black', B: 'white', b: 'lgray', R: 'red', r: 'white', G: 'black', g: 'sky', w: 'white' };
    for (var key in ch.pal) map[key] = ch.pal[key];
    map.u = ch.pal.w2 || 'red'; map.w = 'white';
    return gCanvas(out, map);
  }
  var charCache = {};
  function charSprite(who, pk, flip) {
    var key = who + '|' + pk + '|' + (flip ? 1 : 0), c = charCache[key];
    if (c) return c;
    var base = charCache[who + '|' + pk + '|0'] || (charCache[who + '|' + pk + '|0'] = buildChar(who, pk));
    c = flip ? (charCache[key] = flipCanvas(base)) : base;
    return c;
  }
  function drawPlayer(ctx, who, pose, x, feetY, t, flip) {
    if (!ctx) return;
    if (!CHARS[who]) who = who === 'p1' || who === 'player' ? 'hero' : 'chad';
    var frames = POSE_FRAMES[pose] || POSE_FRAMES.idle;
    t = t | 0;
    var f = frames.length > 1 ? frames[(pose === 'cheer' ? (t >> 3) : pose === 'walk' ? (t >> 3) : (t >> 5)) & 1] : frames[0];
    var mirror = (who !== 'hero') !== !!flip;
    var cv = charSprite(who, f, mirror);
    ctx.drawImage(cv, Math.round(x) - (cv.width >> 1), Math.round(feetY) - 52);
  }

  // ------------------------------------------------------------------ portraits (32x32 Punch-Out style)
  var portraitCache = {};
  function buildPortrait(who) {
    var ch = CHARS[who] || CHARS.chad, g = grid(32, 32), wide = ch.wide >= 3 ? 1 : 0, i, x, y;
    var lay = grid(32, 32);
    // shoulders + neck
    gPoly(lay, [[2 - wide, 32], [30 + wide, 32], [27 + wide, 26], [5 - wide, 26]], 'T');
    if (ch.head === 'brody') { gPoly(lay, [[2, 32], [9, 32], [9, 26], [5, 26]], 'S'); gPoly(lay, [[23, 32], [30, 32], [27, 26], [23, 26]], 'S'); }
    gPoly(lay, [[12 - wide, 22], [20 + wide, 22], [20 + wide, 28], [12 - wide, 28]], 'S');
    gCaps(lay, 16, 27, 16, 27, 2.2, 'S');
    if (ch.logo && LOGOS[ch.logo]) gStamp(lay, LOGOS[ch.logo], 14, 28);
    gOutline(lay); gComp(g, lay);
    // face oval
    var f = grid(32, 32), rx = 7.6 + wide, ry = 9.2;
    for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) { var dx = (x + 0.5 - 16) / rx, dy = (y + 0.5 - 15.5) / ry; if (dx * dx + dy * dy <= 1) gs(f, x, y, 'S'); }
    // ears
    gCaps(f, 8 - wide, 16, 8 - wide, 17, 1.3, 'S'); gCaps(f, 23 + wide, 16, 23 + wide, 17, 1.3, 'S');
    for (y = 0; y < 32; y++) { for (x = 0; x < 32; x++) if (gg(f, x, y) === 'S') { gs(f, x, y, 's'); if (y > 12) gs(f, x + 1, y, 's'); break; } }
    for (x = 0; x < 32; x++) for (y = 31; y >= 0; y--) if (gg(f, x, y) === 'S') { gs(f, x, y, 's'); break; }
    // hair / hats
    var hd = ch.head;
    if (hd === 'hero' || hd === 'chad') {
      for (y = 2; y < 12; y++) for (x = 6; x < 26; x++) { var ex = (x + 0.5 - 16) / 9.6, ey = (y + 0.5 - 11) / 8.6; if (ex * ex + ey * ey <= 1) gs(f, x, y, 'C'); }
      for (x = 7; x < 25; x++) gs(f, x, 11, 'H');
      for (x = 7; x < 9; x++) for (y = 11; y < 16; y++) gs(f, x, y, 'H');
      for (x = 23; x < 25; x++) for (y = 11; y < 16; y++) gs(f, x, y, 'H');
      if (hd === 'hero') {
        for (x = 6; x < 26; x++) { gs(f, x, 10, 'c'); gs(f, x, 11, 'c'); }
        for (x = 4; x < 28; x++) gs(f, x, 12, 'c');
        gStamp(f, ['w...w', 'w.w.w', '.w.w.'], 14, 5);
      } else {
        // backwards cap: strap gap with hair tuft in front
        for (y = 7; y < 11; y++) for (x = 13; x < 19; x++) gs(f, x, y, 'H');
        for (x = 12; x < 20; x++) gs(f, x, 10, 'c');
        for (x = 6; x < 26; x++) gs(f, x, 11, 'c');
      }
    } else if (hd === 'tank') {
      gPoly(f, [[7, 4], [25, 4], [25, 11], [7, 11]], 'H');
      for (x = 7; x < 25; x++) gs(f, x, 4, (x & 1) ? 'H' : 'h');
    } else if (hd === 'sky') {
      gCaps(f, 9, 7, 22, 4, 4.2, 'H'); gCaps(f, 21, 4, 25, 6, 2.5, 'H');
      for (y = 8; y < 12; y++) { gs(f, 8, y, 'H'); gs(f, 7, y + 1, 'H'); gs(f, 24, y, 'H'); }
    } else if (hd === 'brody') {
      gCaps(f, 9, 8, 23, 8, 3.5, 'H');
      var spikes = [[7, 2], [11, 0], [15, 1], [19, 0], [23, 2], [26, 6], [5, 6]];
      for (i = 0; i < spikes.length; i++) gCaps(f, spikes[i][0], spikes[i][1], 16 + (spikes[i][0] - 16) * 0.5, 8, 1.2, 'H');
    } else if (hd === 'kegmaster') {
      gPoly(f, [[7, 9], [25, 9], [25, 12], [7, 12]], 'H');
      gPoly(f, [[7, 3], [25, 3], [25, 10], [7, 10]], 'X');
      for (x = 7; x < 25; x++) gs(f, x, 9, 'x');
      [[8, 0], [16, 0], [24, 0]].forEach(function (p) { gCaps(f, p[0], p[1] + 1, p[0], p[1] + 3, 1.2, 'X'); });
      gs(f, 16, 6, 'J'); gs(f, 15, 6, 'J'); gs(f, 11, 6, 'J'); gs(f, 21, 6, 'J');
      // beard
      for (y = 18; y < 28; y++) for (x = 7; x < 26; x++) if (gg(f, x, y) === 'S' && (y > 20 || x < 10 || x > 21)) gs(f, x, y, 'D');
      gCaps(f, 16, 27, 16, 28, 3.5, 'D');
    }
    gOutline(f);
    // features
    var eyeY = 15;
    if (hd === 'sky' || hd === 'brody') {
      for (x = 9; x < 24; x++) { gs(f, x, eyeY, 'G'); gs(f, x, eyeY + 1, 'G'); }
      for (x = 10; x < 15; x++) gs(f, x, eyeY + 2, 'G'); for (x = 18; x < 23; x++) gs(f, x, eyeY + 2, 'G');
      gs(f, 11, eyeY, 'g'); gs(f, 19, eyeY, 'g');
    } else {
      [[11, -1], [19, 1]].forEach(function (e) {
        var ex2 = e[0];
        for (var q = 0; q < 3; q++) { gs(f, ex2 + q, eyeY - 1, 'K'); gs(f, ex2 + q, eyeY, q === 1 ? 'E' : 'w'); gs(f, ex2 + q, eyeY + 1, q === 1 ? 'E' : 'w'); }
        var bc = hd === 'kegmaster' ? 'D' : hd === 'chad' || hd === 'brody' ? 'h' : 'K';
        for (var bx2 = ex2 - 1; bx2 < ex2 + 4; bx2++) gs(f, bx2, eyeY - 3 + ((e[1] < 0 ? bx2 - ex2 : ex2 + 2 - bx2) > 1 ? 1 : 0), bc);
      });
    }
    // nose + mouth
    gs(f, 16, 18, 's'); gs(f, 15, 19, 's'); gs(f, 16, 19, 's'); gs(f, 17, 19, 'S');
    var my = hd === 'kegmaster' ? 22 : 22;
    if (who === 'hero') { for (x = 13; x < 20; x++) gs(f, x, my, 'K'); gs(f, 13, my - 1, 'K'); gs(f, 19, my - 1, 'K'); for (x = 14; x < 19; x++) gs(f, x, my + 1, 'w'); }
    else if (who === 'chad') { for (x = 14; x < 20; x++) gs(f, x, my, 'K'); gs(f, 20, my - 1, 'K'); gs(f, 13, my, 'K'); }
    else if (who === 'kegmaster') { for (x = 12; x < 21; x++) gs(f, x, my - 1, 'D'); for (x = 14; x < 19; x++) gs(f, x, my + 1, 'M'); for (x = 15; x < 18; x++) gs(f, x, my + 2, 'w'); }
    else { for (x = 13; x < 20; x++) gs(f, x, my, 'K'); if (who === 'tank') { gs(f, 12, my + 1, 'K'); gs(f, 20, my + 1, 'K'); } if (who === 'brody') { for (x = 14; x < 19; x++) gs(f, x, my + 1, 'w'); gs(f, 13, my - 1, 'K'); gs(f, 19, my - 1, 'K'); } }
    // cheek shading
    gs(f, 10, 19, 's'); gs(f, 22, 19, 's');
    gComp(g, f);
    var cv = mk(32, 32), c = cv._x;
    R(c, 0, 0, 32, 32, ch.bg);
    c.fillStyle = C(DARK[ch.bg] || 'black');
    for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) if (((x + y) % 6) < 2) c.fillRect(x, y, 1, 1);
    var map = { K: 'black', E: 'black', M: 'dred', w: 'white', G: 'black', g: 'white', h: ch.pal.H === 'yellow' || ch.pal.H === 'cream' ? 'olive' : 'dgray' };
    for (var key in ch.pal) map[key] = ch.pal[key];
    map.w = 'white'; map.c = ch.pal.c || 'dred'; map.D = ch.pal.D || 'brown';
    c.drawImage(gCanvas(g, map), 0, 0);
    R(c, 0, 0, 32, 1, 'black'); R(c, 0, 31, 32, 1, 'black'); R(c, 0, 0, 1, 32, 'black'); R(c, 31, 0, 1, 32, 'black');
    return cv;
  }
  // ---- 64x64 native VS-screen portraits (Punch-Out!! style): same roles, hand-placed detail at 1:1
  function ell(g, cx, cy, rx, ry, v, pw, only) {
    pw = pw || 2;
    for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
      var dx = Math.abs(x + 0.5 - cx) / rx, dy = Math.abs(y + 0.5 - cy) / ry;
      if (Math.pow(dx, pw) + Math.pow(dy, (y + 0.5 > cy ? pw : 2)) <= 1 && (!only || gg(g, x, y) === only)) gs(g, x, y, v);
    }
  }
  function hline(g, x0, x1, y, v) { for (var x = x0; x <= x1; x++) gs(g, x, y, v); }
  function buildPortrait64(who) {
    var ch = CHARS[who] || CHARS.chad, hd = ch.head, big = ch.wide >= 3 ? 2 : 0, g = grid(64, 64), x, y, i;
    // shoulders / shirt
    var b = grid(64, 64);
    gPoly(b, [[1 - big, 64], [63 + big, 64], [57 + big, 50], [44, 47], [20, 47], [7 - big, 50]], 'T');
    if (hd === 'brody') { gPoly(b, [[1, 64], [18, 64], [18, 49], [7, 51]], 'S'); gPoly(b, [[46, 64], [63, 64], [57, 51], [46, 49]], 'S'); }
    gPoly(b, [[23 - big, 36], [41 + big, 36], [42 + big, 52], [32, 56], [22 - big, 52]], 'S'); // neck
    for (y = 42; y < 50; y++) for (x = 22 - big; x < 33; x++) if (gg(b, x, y) === 'S' && x < 26 - big + (y - 42) / 3) gs(b, x, y, 's');
    hline(b, 22 - big, 42 + big, 47, 's'); hline(b, 23, 41, 48, 's');
    if (hd !== 'brody') { for (x = 20; x < 45; x++) { var cy2 = 49 + Math.round(Math.pow((x - 32) / 12, 2) * -3) + 3; gs(b, x, cy2, 't'); gs(b, x, cy2 + 1, 't'); } }
    if (ch.logo && LOGOS[ch.logo]) { var L = LOGOS[ch.logo]; for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) if (L[y].charAt(x) === 'L') { gs(b, 27 + x * 2, 54 + y * 2, 'L'); gs(b, 28 + x * 2, 54 + y * 2, 'L'); gs(b, 27 + x * 2, 55 + y * 2, 'L'); gs(b, 28 + x * 2, 55 + y * 2, 'L'); } }
    for (y = 50; y < 64; y++) for (x = 0; x < 64; x++) if (gg(b, x, y) === 'T' && (x < 12 - big || x > 52 + big) && ((x + y) & 1)) gs(b, x, y, 't');
    gOutline(b); gComp(g, b);
    // head
    var f = grid(64, 64), rx = 15 + (big ? 2 : 0), cx = 32, cy = 29;
    ell(f, cx, cy, rx, 18, 'S', 2.6);
    gCaps(f, cx - rx - 1, 29, cx - rx - 1, 33, 2.6, 'S'); gCaps(f, cx + rx + 1, 29, cx + rx + 1, 33, 2.6, 'S'); // ears
    for (y = 0; y < 64; y++) { for (x = 0; x < 64; x++) if (gg(f, x, y) === 'S') { gs(f, x, y, 's'); if (y > 22) gs(f, x + 1, y, 's'); break; } }
    gs(f, cx - rx - 1, 31, 's'); gs(f, cx - rx - 1, 32, 's'); gs(f, cx + rx + 1, 31, 's'); gs(f, cx + rx + 1, 32, 's');
    // hair & headwear
    if (hd === 'hero' || hd === 'chad') {
      for (y = 19; y < 29; y++) { hline(f, cx - rx, cx - rx + 2, y, 'H'); hline(f, cx + rx - 2, cx + rx, y, 'H'); }
      for (y = 0; y <= 19; y++) for (x = 0; x < 64; x++) { var ddx = (x + 0.5 - 32) / (19 + big), ddy = (y + 0.5 - 20) / 16; if (ddx * ddx + ddy * ddy <= 1) gs(f, x, y, 'C'); }
      for (y = 5; y < 19; y++) { gs(f, 32, y, 'c'); if (y > 8) { gs(f, 22 - ((y - 5) >> 3), y, 'c'); gs(f, 42 + ((y - 5) >> 3), y, 'c'); } }
      for (x = 0; x < 64; x++) for (y = 0; y < 19; y++) if (gg(f, x, y) === 'C' && x < 21 && ((x + y) & 1)) gs(f, x, y, 'c');
      if (hd === 'hero') {
        hline(f, 9, 55, 19, 'c'); hline(f, 7, 57, 20, 'c'); hline(f, 6, 58, 21, 'c'); hline(f, 7, 57, 22, 'K');
        hline(f, 15, 49, 23, 'H');
        var Wm = ['w...w', 'w...w', 'w.w.w', 'wwwww', '.w.w.'];
        for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) if (Wm[y].charAt(x) === 'w') { gs(f, 27 + x * 2, 8 + y * 2, 'w'); gs(f, 28 + x * 2, 8 + y * 2, 'w'); gs(f, 27 + x * 2, 9 + y * 2, 'w'); gs(f, 28 + x * 2, 9 + y * 2, 'w'); }
      } else {
        for (y = 10; y < 20; y++) hline(f, 25, 39, y, 'H');
        for (y = 11; y < 19; y += 3) hline(f, 26, 38, y, 'h');
        hline(f, 24, 40, 17, 'c'); hline(f, 24, 40, 18, 'c'); hline(f, 31, 33, 16, 'c');
        hline(f, 12, 52, 19, 'c'); hline(f, 13, 51, 20, 'c'); hline(f, 14, 50, 21, 'K');
        gCaps(f, 26, 23, 31, 24, 1.2, 'H'); hline(f, 16, 48, 22, 'H');
      }
    } else if (hd === 'tank') {
      gPoly(f, [[13, 5], [51, 5], [51, 22], [47, 18], [17, 18], [13, 22]], 'H');
      for (x = 14; x < 51; x += 2) gs(f, x, 5, 'h'); for (x = 15; x < 51; x += 4) gs(f, x, 7, 'h');
      for (y = 18; y < 30; y++) { hline(f, 13, 15, y, 'H'); hline(f, 49, 51, y, 'H'); }
    } else if (hd === 'sky') {
      gCaps(f, 18, 18, 40, 10, 8, 'H'); gCaps(f, 38, 8, 50, 14, 5, 'H'); gCaps(f, 15, 22, 16, 32, 3, 'H'); gCaps(f, 48, 18, 49, 28, 3, 'H');
      for (i = 0; i < 4; i++) for (x = 20 + i * 6; x < 26 + i * 6; x++) gs(f, x, 6 + i + ((x - 20) >> 2), 'h');
    } else if (hd === 'brody') {
      ell(f, 32, 20, 18, 9, 'H', 2);
      var sp = [[10, 6], [17, 0], [25, 2], [32, -1], [39, 2], [47, 0], [54, 6], [8, 16], [56, 16]];
      for (i = 0; i < sp.length; i++) gCaps(f, sp[i][0], sp[i][1], 32 + (sp[i][0] - 32) * 0.5, 18, 2.4, 'H');
      for (i = 0; i < sp.length; i++) gCaps(f, sp[i][0] + 1, sp[i][1] + 3, 32 + (sp[i][0] - 32) * 0.55, 18, 0.6, 'h');
      for (y = 20; y < 30; y++) { hline(f, 15, 17, y, 'H'); hline(f, 47, 49, y, 'H'); }
    } else if (hd === 'kegmaster') {
      for (y = 16; y < 26; y++) { hline(f, 13, 17, y, 'H'); hline(f, 47, 51, y, 'H'); }
      gPoly(f, [[12, 8], [52, 8], [52, 20], [12, 20]], 'X');
      [[13, 0], [22, 2], [32, -1], [42, 2], [51, 0]].forEach(function (pp) { gPoly(f, [[pp[0] - 4, 9], [pp[0] + 4, 9], [pp[0], pp[1]]], 'X'); gCaps(f, pp[0], pp[1] + 1, pp[0], pp[1] + 1, 1.4, 'X'); });
      hline(f, 12, 51, 17, 'x'); hline(f, 12, 51, 18, 'x'); hline(f, 12, 51, 19, 'X');
      [[18, 13], [32, 12], [46, 13]].forEach(function (pp, k) { gCaps(f, pp[0], pp[1], pp[0], pp[1], k === 1 ? 2.3 : 1.6, 'J'); gs(f, pp[0] - 1, pp[1] - 1, 'w'); });
      for (x = 13; x < 52; x += 3) gs(f, x, 10, 'w');
      // beard
      for (y = 33; y < 52; y++) for (x = 10; x < 54; x++) { var v = gg(f, x, y); if ((v === 'S' || v === 's') && (y > 37 || x < 21 || x > 43)) gs(f, x, y, 'D'); }
      gCaps(f, 32, 49, 32, 52, 7, 'D'); gCaps(f, 24, 46, 40, 46, 6, 'D');
    }
    gOutline(f);
    // eyes
    var ey = 28, glasses = hd === 'sky' || hd === 'brody';
    if (glasses) {
      for (y = ey - 2; y < ey + 4; y++) hline(f, 16, 48, y, 'G');
      for (y = ey + 4; y < ey + 6; y++) { hline(f, 18, 29, y, 'G'); hline(f, 35, 46, y, 'G'); }
      hline(f, 30, 34, ey + 4, 'S'); hline(f, 30, 34, ey + 5, 'S');
      for (i = 0; i < 3; i++) { gs(f, 21 + i, ey - 1 + i, 'g'); gs(f, 38 + i, ey - 1 + i, 'g'); gs(f, 22 + i, ey - 1 + i, 'g'); }
    } else {
      [[20, 1], [37, -1]].forEach(function (e) {
        var ex = e[0];
        hline(f, ex, ex + 6, ey - 1, 'K');
        for (y = ey; y < ey + 4; y++) { hline(f, ex, ex + 6, y, 'w'); }
        var px = e[1] > 0 ? ex + 3 : ex + 2;
        for (y = ey; y < ey + 4; y++) { gs(f, px, y, 'E'); gs(f, px + 1, y, 'E'); }
        gs(f, px, ey, 'w'); hline(f, ex + 1, ex + 5, ey + 4, 's');
        gs(f, ex - 1, ey, 'K'); gs(f, ex + 7, ey, 'K');
        var bc = hd === 'kegmaster' ? 'D' : hd === 'chad' ? 'h' : 'K';
        for (x = ex - 1; x < ex + 8; x++) { var inner = e[1] > 0 ? x - ex : ex + 6 - x, by = ey - 5 + (inner > 4 ? 1 : 0) + (hd === 'tank' || hd === 'kegmaster' ? (inner > 4 ? 1 : 0) : 0); gs(f, x, by, bc); gs(f, x, by + 1, bc); }
      });
    }
    // nose
    for (y = ey + 3; y < ey + 8; y++) gs(f, 31, y, 's');
    gs(f, 29, ey + 8, 's'); gs(f, 30, ey + 8, 's'); gs(f, 34, ey + 8, 's'); gs(f, 35, ey + 8, 's'); gs(f, 32, ey + 9, 's'); gs(f, 33, ey + 9, 's');
    // cheeks
    hline(f, 18, 20, ey + 8, 's'); hline(f, 44, 46, ey + 8, 's');
    // mouth
    var my = ey + 13;
    if (who === 'hero' || who === 'brody') { hline(f, 25, 39, my, 'K'); for (y = my + 1; y < my + 3; y++) hline(f, 26, 38, y, 'w'); hline(f, 27, 37, my + 3, 'K'); gs(f, 24, my - 1, 'K'); gs(f, 40, my - 1, 'K'); for (x = 28; x < 38; x += 3) gs(f, x, my + 1, 's'); }
    else if (who === 'chad') { hline(f, 26, 38, my, 'K'); gs(f, 39, my - 1, 'K'); gs(f, 40, my - 2, 'K'); hline(f, 28, 36, my + 2, 's'); }
    else if (who === 'tank') { hline(f, 24, 40, my, 'K'); hline(f, 26, 38, my + 2, 's'); gs(f, 23, my + 1, 'K'); gs(f, 41, my + 1, 'K'); }
    else if (who === 'sky') { hline(f, 27, 37, my, 'K'); gs(f, 38, my - 1, 'K'); hline(f, 29, 35, my + 2, 's'); }
    else if (who === 'kegmaster') { for (y = my - 3; y < my; y++) hline(f, 21, 43, y, 'D'); hline(f, 22, 42, my - 4, 'D'); hline(f, 26, 38, my, 'K'); for (y = my + 1; y < my + 4; y++) hline(f, 26, 38, y, 'M'); hline(f, 27, 37, my + 1, 'w'); hline(f, 26, 38, my + 4, 'K'); }
    gComp(g, f);
    var cv = mk(64, 64), c = cv._x;
    R(c, 0, 0, 64, 64, ch.bg);
    c.fillStyle = C(DARK[ch.bg] || 'black');
    for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) if (((x + y) % 8) < 3) c.fillRect(x, y, 1, 1);
    var map = { K: 'black', E: 'black', M: 'dred', w: 'white', G: 'black', g: 'white', h: ch.pal.H === 'gold' || ch.pal.H === 'cream' ? 'olive' : 'dgray' };
    for (var key in ch.pal) map[key] = ch.pal[key];
    map.w = 'white'; map.c = ch.pal.c || 'dred'; map.D = ch.pal.D || 'brown';
    if (hd === 'hero' || hd === 'chad') map.h = 'dbrown';
    c.drawImage(gCanvas(g, map), 0, 0);
    R(c, 0, 0, 64, 1, 'black'); R(c, 0, 63, 64, 1, 'black'); R(c, 0, 0, 1, 64, 'black'); R(c, 63, 0, 1, 64, 'black');
    return cv;
  }
  var portrait64 = {};
  function drawPortrait(ctx, who, x, y, size) {
    if (!ctx) return; if (!CHARS[who]) who = 'chad';
    var cv = (size | 0) >= 48 ? (portrait64[who] || (portrait64[who] = buildPortrait64(who))) : (portraitCache[who] || (portraitCache[who] = buildPortrait(who)));
    ctx.drawImage(cv, Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------------ crowd (background partygoers 20x32)
  // Hand-authored pixel maps. A partygoer = body frame (20 wide, arms) + head/hair style (12 wide, stamped
  // at col 4). Head is 10x10 with 1-px eyes; the table (y 182..200) hides everything below the waist.
  // K outline, S skin, T shirt, t shirt shade, A sleeve/arm (shirt or skin for tank tops), L chest print,
  // P pants, H hair, C cap, c cap brim, W white, R cup red, E eye, M mouth, G shades.
  var CB = { // body halves are mirrored: each pose lists the LEFT 10 columns; right side = mirror of a pose
    idle: [
      '..........', '..........', '..........', '..........', '..........', '..........', '..........',
      '..........', '..........', '..........', '..........', '..........', '..........', '..........',
      '........KS',
      '...KKTTTTS',
      '..KAATTTTT',
      '..KAAKTTTT',
      '..KAAKTTTT',
      '..KSSKTTTL',
      '..KSSKTTTL',
      '..KSSKTTTT',
      '..KSSKTTTT',
      '..KSSKTTTT',
      '..KSSKPPPP',
      '...KKKPPPP',
      '.....KPPPP',
      '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK'],
    up: [ // arm straight up, fist above the head
      '..........',
      '.KKK......',
      'KSSSK.....',
      'KSSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KAAK.....',
      '.KAAK.....',
      '.KAAAK....',
      '..KAAAK.KS',
      '...KAAATTS',
      '....KTTTTT',
      '.....KTTTT',
      '.....KTTTT',
      '.....KTTTL',
      '.....KTTTL',
      '.....KTTTT',
      '.....KTTTT',
      '.....KTTTT',
      '.....KPPPP',
      '.....KPPPP',
      '.....KPPPP',
      '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK'],
    cup: [ // raised red cup at head height ("cheers!")
      '..........',
      '..........',
      '..........',
      'WWWWW.....',
      'KRRRK.....',
      'KRRRK.....',
      'KSSSK.....',
      'KSSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KSSK.....',
      '.KAAK.....',
      '.KAAK.....',
      '.KAAAK....',
      '..KAAAK.KS',
      '...KAAATTS',
      '....KTTTTT',
      '.....KTTTT',
      '.....KTTTT',
      '.....KTTTL',
      '.....KTTTL',
      '.....KTTTT',
      '.....KTTTT',
      '.....KTTTT',
      '.....KPPPP',
      '.....KPPPP',
      '.....KPPPP',
      '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK', '.....KPPPK']
  };
  var CH = { // head + hair styles, 12 wide, rows 0..15 (row 4 = top of a plain head)
    short: ['', '', '', '',
      '...KKKKKK...', '..KHHHHHHK..', '.KHHHHHHHHK.', '.KHHHHHHHHK.', '.KHSSSSSSHK.',
      'KSSSESSESSSK', '.KSSSSSSSSK.', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    long: ['', '', '', '',
      '...KKKKKK...', '..KHHHHHHK..', '.KHHHHHHHHK.', 'KHHHHHHHHHHK', 'KHHSSSSSSHHK',
      'KHSSESSESSHK', 'KHSSSSSSSSHK', 'KHSSSMMSSSHK', 'KHHKSSSSKHHK', 'KHHHKKKKHHHK', 'KHHK....KHHK', '.KK......KK.'],
    cap: ['', '', '', '',
      '...KKKKKK...', '..KCCCCCCK..', '.KCCCWWCCCK.', '.KCCCCCCCCK.', 'KccccccccccK',
      'KSSSESSESSSK', '.KSSSSSSSSK.', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    beanie: ['', '', '',
      '....KKKK....', '...KCCCCK...', '..KCCCCCCK..', '.KCCCCCCCCK.', '.KccccccccK.', '.KHSSSSSSHK.',
      'KSSSESSESSSK', '.KSSSSSSSSK.', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    afro: ['',
      '...KKKKKK...', '..KHHHHHHK..', '.KHHHHHHHHK.', 'KHHHHHHHHHHK', 'KHHHHHHHHHHK', 'KHHHHHHHHHHK', 'KHHHHHHHHHHK', 'KHHSSSSSSHHK',
      'KHSSESSESSHK', '.KSSSSSSSSK.', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    bun: ['',
      '....KKKK....', '...KHHHHK...', '...KHHHHK...', '...KKKKKK...', '..KHHHHHHK..', '.KHHHHHHHHK.', '.KHHHHHHHHK.', 'KHHHSSSSHHHK',
      'KHSSESSESSHK', 'KHSSSSSSSSHK', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    spiky: ['', '',
      '..K..KK..K..', '.KHKKHHKKHK.', '.KHHHHHHHHK.', '.KHHHHHHHHK.', '.KHHHHHHHHK.', '.KHHHHHHHHK.', '.KHSSSSSSHK.',
      'KSSSESSESSSK', '.KSSSSSSSSK.', '.KSSSMMSSSK.', '..KSSSSSSK..', '...KKKKKK...'],
    bald: ['', '', '', '',
      '...KKKKKK...', '..KSSWWSSK..', '.KSSSSSSSSK.', '.KSSSSSSSSK.', '.KSSSSSSSSK.',
      'KSSSESSESSSK', '.KHSSSSSSHK.', '.KHHSMMSHHK.', '..KHHHHHHK..', '...KKKKKK...']
  };
  var SHADES_ROW = 'KSKWKKKKWKSK';
  function mirrorRow(r) { return r.split('').reverse().join(''); }
  var crowdCache = {};
  // v: [style, hair, skin, shirt, print, pants, cap, flags]  flags: 's' shades, 'k' tank top (bare arms)
  function crowdSprite(v, frame, st) {
    var key = v.join(',') + '|' + frame + '|' + st; if (crowdCache[key]) return crowdCache[key];
    var L = CB[frame === 'cheer' || frame === 'pumpL' ? 'up' : 'idle'];
    var Rt = CB[frame === 'cheer' || frame === 'wave' ? 'up' : frame === 'cup' ? 'cup' : 'idle'];
    var rows = [], y;
    for (y = 0; y < 32; y++) rows.push((L[y] + mirrorRow(Rt[y])).split(''));
    // body shading: right edge of the torso one shade darker
    for (y = 15; y < 24; y++) if (rows[y][13] === 'T') rows[y][13] = 't';
    var hs = CH[v[0]] || CH.short, open = frame === 'cheer' || frame === 'pumpL' || frame === 'wave';
    for (y = 0; y < hs.length; y++) {
      var hr = hs[y]; if (y === 9 && v[7] && v[7].indexOf('s') >= 0) hr = SHADES_ROW;
      for (var x = 0; x < hr.length; x++) { var ch = hr.charAt(x); if (ch !== '.') rows[y][x + 4] = (open && ch === 'M') ? 'K' : ch; }
    }
    var tank = v[7] && v[7].indexOf('k') >= 0;
    var map = { K: 'black', E: 'black', M: 'dred', S: v[2], T: v[3], t: CSHADE[v[3]] || v[3], A: tank ? v[2] : v[3], L: v[4], P: v[5],
      H: v[1], C: v[6] || 'red', c: CSHADE[v[6] || 'red'] || 'black', W: 'white', R: 'red', G: 'black' };
    return (crowdCache[key] = spr(rows.map(function (r) { return r.join(''); }), map, false));
  }
  var CSHADE = { white: 'lgray', lgray: 'gray', red: 'dred', gold: 'brown', green: 'dgreen', blue: 'dblue', slate: 'navy',
    cyan: 'blue', magenta: 'purple', purple: 'dpurple', orange: 'brown', rose: 'dmagenta', gray: 'dgray', navy: 'black', olive: 'dbrown', cream: 'gold' };
  // per stage: [centerX, dy, [style, hair, skin, shirt, print, pants, cap, flags], role]  role: 0 plain, 1 drinker
  // 5-6 per stage between the racks (10-cup racks reach x 72 / 184) so cups and splashes always read against the backdrop
  var CROWDS = [
    [[78, 0, ['cap', 'brown', 'skin', 'red', 'white', 'navy', 'white'], 1], [98, 1, ['long', 'gold', 'tan', 'white', 'red', 'slate'], 0],
      [118, -1, ['afro', 'black', 'brown', 'red', 'white', 'dgray'], 0], [138, 1, ['bun', 'black', 'tan', 'lgray', 'red', 'navy'], 1],
      [158, 0, ['spiky', 'gold', 'skin', 'white', 'red', 'navy'], 1], [178, -1, ['beanie', 'brown', 'tan', 'slate', 'white', 'dgray', 'red'], 0]],
    [[78, 0, ['short', 'dbrown', 'skin', 'blue', 'white', 'navy'], 1], [98, 1, ['long', 'gold', 'skin', 'red', 'white', 'navy'], 0],
      [118, -1, ['cap', 'black', 'brown', 'white', 'blue', 'dgray', 'green'], 1], [138, 0, ['bald', 'dbrown', 'tan', 'green', 'white', 'navy', null, 's'], 0],
      [158, 1, ['bun', 'maroon', 'skin', 'gold', 'red', 'navy'], 0], [178, -1, ['afro', 'dbrown', 'brown', 'red', 'white', 'navy'], 1]],
    [[78, 1, ['long', 'black', 'tan', 'magenta', 'white', 'navy'], 0], [98, -1, ['cap', 'brown', 'skin', 'white', 'purple', 'dgray', 'purple'], 1],
      [118, 0, ['afro', 'black', 'brown', 'cyan', 'navy', 'navy'], 0], [138, 1, ['spiky', 'gold', 'skin', 'purple', 'white', 'dgray', null, 's'], 1],
      [158, 0, ['bun', 'brown', 'tan', 'white', 'magenta', 'navy'], 0], [178, -1, ['short', 'black', 'skin', 'red', 'white', 'dgray'], 1]],
    [[102, 0, ['long', 'gold', 'tan', 'rose', 'white', 'blue', null, 'k'], 0], [122, -1, ['spiky', 'gold', 'skin', 'cyan', 'white', 'dblue', null, 'sk'], 1],
      [142, 1, ['bun', 'dbrown', 'orange', 'white', 'rose', 'blue'], 0], [162, 0, ['cap', 'dbrown', 'tan', 'orange', 'white', 'dblue', 'cyan'], 1],
      [182, -1, ['afro', 'black', 'brown', 'gold', 'red', 'blue', null, 'k'], 0]],
    [[88, 0, ['cap', 'black', 'skin', 'gold', 'blue', 'navy', 'blue'], 1], [108, 1, ['long', 'brown', 'tan', 'blue', 'gold', 'navy'], 0],
      [128, -1, ['afro', 'black', 'brown', 'red', 'white', 'navy'], 1], [148, 0, ['spiky', 'gold', 'skin', 'white', 'blue', 'navy', null, 's'], 0],
      [168, 1, ['bald', 'black', 'tan', 'blue', 'gold', 'navy'], 1]]
  ];
  var CROWD_TOP = 157; // sprite row 0; row 25 (= y 182) is the table's far edge, so legs never show
  var JUMP = [0, -2, -3, -4, -4, -3, -2, 0], FR_I = { idle: 0, cheer: 1, pumpL: 2, wave: 3, cup: 4 };
  function drawCrowd(ctx, stage, t, ex) {
    var list = CROWDS[stage] || CROWDS[0];
    for (var i = 0; i < list.length; i++) {
      var m = list[i], ph = (t + i * 37) | 0, fr = 'idle', dy = 0, drinker = m[3] === 1;
      var lively = ex > 0.05 && ((i * 3 + (ph >> 6)) % 5) < Math.ceil(ex * 5);
      if (lively) {
        var beat = (ph >> 4) & 3; // 4 beats of 16 ticks: arms-up / pump / arms-up / cup or wave
        fr = beat === 1 ? (i & 1 ? 'pumpL' : 'wave') : beat === 3 ? (drinker ? 'cup' : 'idle') : 'cheer';
        if (ex > 0.5) dy = JUMP[(ph >> 2) & 7] * (i & 1 ? 1 : 0) + (i & 1 ? 0 : -((ph >> 3) & 1));
        else dy = -((ph >> 3) & 1);
      } else {
        var slow = (ph >> 5) & 7;
        if (drinker && (slow === 2 || slow === 3)) fr = 'cup';
        if (slow === 5) dy = -1;
      }
      ctx.drawImage(m[4 + FR_I[fr]] || (m[4 + FR_I[fr]] = crowdSprite(m[2], fr, stage)), m[0] - 10, CROWD_TOP + m[1] + dy);
    }
  }

  // ------------------------------------------------------------------ stage backgrounds (static layer + anim)
  var stageCache = [];
  var STAR_SETS = [];
  function stars(c, seed, n, y0, y1, avoid) {
    var r = rng(seed), list = [];
    for (var i = 0; i < n; i++) {
      var x = (r() * 256) | 0, y = (y0 + r() * (y1 - y0)) | 0;
      if (avoid && avoid(x, y)) continue;
      var b = r();
      P1(c, x, y, b < 0.5 ? 'gray' : b < 0.85 ? 'lgray' : 'white');
      if (b > 0.93) list.push([x, y]);
    }
    return list;
  }
  function moonCrescent(c, cx, cy, r, sky) { disc(c, cx, cy, r, 'cream'); disc(c, cx + 1, cy, r - 2, 'yellow'); disc(c, cx - 3, cy - 2, r - 1, sky); }
  function window4(c, x, y, w, h, lit, frame) { // lit window w/ mullions
    R(c, x - 1, y - 1, w + 2, h + 2, frame || 'lgray');
    R(c, x, y, w, h, lit ? 'cream' : 'navy');
    if (lit) { R(c, x, y + (h >> 1), w, h - (h >> 1), 'yellow'); dith(c, x, y + (h >> 1) - 1, w, 2, 'yellow'); }
    else { dith4(c, x, y, w, h, 'slate'); }
    R(c, x + (w >> 1), y, 1, h, lit ? 'orange' : 'black'); R(c, x, y + (h >> 1), w, 1, lit ? 'orange' : 'black');
    R(c, x - 2, y + h + 1, w + 4, 2, frame || 'lgray');
  }
  // foliage: overlapping round lobes, each with a crisp light crescent on its upper-left (no dither noise)
  function lobe(c, cx, cy, r, base, hi) { disc(c, cx, cy, r, base); if (hi && r > 3) { disc(c, cx - 1, cy - 1, r - 2, hi); disc(c, cx + 1, cy + 1, r - 2, base); } }
  function canopy(c, lobes, base, hi) {
    var L = lobes.slice().sort(function (a, b) { return a[1] - b[1]; });
    L.forEach(function (l) { // silhouette with leafy bumps round the rim
      disc(c, l[0], l[1], l[2], base);
      for (var a = 0; a < 9; a++) { var an = (a / 9 + l[0] * 0.013) * 6.283; disc(c, Math.round(l[0] + Math.cos(an) * l[2]), Math.round(l[1] + Math.sin(an) * l[2]), 2, base); }
    });
    if (hi) L.forEach(function (l) { if (l[2] > 4) { disc(c, l[0] - 1, l[1] - 1, l[2] - 3, hi); disc(c, l[0] + 1, l[1] + 1, l[2] - 3, base); } });
  }
  function hedge(c, x0, x1, y, r, base, hi) { var L = [], k = 0; for (var x = x0 + r; x <= x1 - r; x += r + 3, k++) L.push([x, y + [0, -2, 1, -1][k & 3], r]); canopy(c, L, base, hi); }
  var TUFTS = [[3, 2], [21, 4], [12, 7], [28, 10], [6, 13], [17, 14]];
  function grassBand(c, y0, y1, base, tuft, tuft2) { // 32x16 metatile of grass tufts, tiled like NES BG tiles
    R(c, 0, y0, W, y1 - y0, base);
    for (var ty = y0; ty < y1; ty += 16) for (var tx = 0; tx < W; tx += 32) for (var i = 0; i < TUFTS.length; i++) {
      var x = tx + TUFTS[i][0], y = ty + TUFTS[i][1], col = (i % 3 === 1) && tuft2 ? tuft2 : tuft; if (y + 1 >= y1) continue;
      P1(c, x, y + 1, col); P1(c, x + 1, y, col); P1(c, x + 2, y + 1, col);
    }
  }
  function lyingCup(c, x, y) { paint(c, ['.WRRRRD', 'WWRLRRD', 'WWRRRRD', '.WRRRD.'], { W: 'white', R: 'red', L: 'white', D: 'dred' }, x, y); }

  function bgBackyard() {
    var cv = mk(W, H), c = cv._x, i;
    R(c, 0, 0, W, H, 'navy');
    R(c, 0, 0, W, 30, 'black'); dith(c, 0, 30, W, 4, 'black');
    STAR_SETS[0] = stars(c, 11, 120, 26, 120, function (x, y) { return (x > 52 && x < 204 && y > 24) || (x < 66 && y > 30) || (x > 196 && y > 52); });
    moonCrescent(c, 226, 40, 8, 'navy');
    // far trees right
    canopy(c, [[212, 80, 10], [228, 68, 11], [246, 66, 11], [222, 92, 11], [242, 86, 12], [256, 96, 10]], 'forest', 'dgreen');
    // neighbor house (right)
    c.fillStyle = C('dgray');
    for (i = 0; i < 26; i++) c.fillRect(226 - i * 2, 74 + i, 4 + i * 4, 1);
    R(c, 204, 100, 52, 56, 'slate');
    for (i = 102; i < 156; i += 3) R(c, 204, i, 52, 1, 'navy');
    c.fillStyle = C('lgray'); for (i = 0; i < 26; i++) { c.fillRect(226 - i * 2, 74 + i, 2, 1); c.fillRect(228 + i * 2, 74 + i, 2, 1); }
    window4(c, 222, 108, 10, 14, true, 'gray'); window4(c, 240, 108, 10, 14, false, 'gray');
    // left trees (big dark clump)
    disc(c, 22, 90, 34, 'forest'); disc(c, 30, 124, 26, 'forest');
    canopy(c, [[12, 46, 11], [32, 40, 10], [50, 52, 9], [2, 66, 11], [22, 62, 11], [44, 72, 10], [8, 86, 11], [30, 84, 11], [52, 94, 9],
      [14, 106, 11], [38, 104, 10], [4, 124, 10], [26, 124, 11], [50, 118, 9], [16, 140, 10], [40, 138, 10]], 'forest', 'dgreen');
    // ---- main house
    var hx0 = 66, hx1 = 190, eave = 56, peak = 28;
    // roof (gable) dark shingles
    for (var y = peak; y <= eave; y++) {
      var half = Math.round((y - peak) * 2.55) + 2;
      R(c, 128 - half - 4, y, half * 2 + 8, 1, (y - peak) % 4 === 3 ? 'black' : 'dgray');
    }
    // gable face (siding) inset
    for (y = peak + 5; y <= eave; y++) {
      var hh = Math.round((y - peak - 5) * 2.55);
      if (hh > 0) R(c, 128 - hh, y, hh * 2, 1, (y % 3 === 0) ? 'slate' : 'gray');
    }
    // fascia trim lines
    c.fillStyle = C('lgray');
    for (y = peak; y <= eave + 1; y++) { var hf = Math.round((y - peak) * 2.55) + 2; c.fillRect(128 - hf - 4, y, 3, 1); c.fillRect(128 + hf + 1, y, 3, 1); }
    R(c, hx0 - 6, eave + 1, hx1 - hx0 + 12, 2, 'lgray'); R(c, hx0 - 6, eave + 3, hx1 - hx0 + 12, 1, 'black');
    // attic vent
    R(c, 122, 40, 12, 9, 'lgray'); for (i = 41; i < 49; i += 2) R(c, 123, i, 10, 1, 'dgray');
    // walls with siding
    R(c, hx0, eave + 4, hx1 - hx0, 150 - eave - 4, 'gray');
    for (y = eave + 5; y < 150; y += 3) R(c, hx0, y, hx1 - hx0, 1, 'slate');
    R(c, hx0, eave + 4, 2, 150 - eave - 4, 'lgray'); R(c, hx1 - 2, eave + 4, 2, 150 - eave - 4, 'lgray');
    // belt trim between floors
    R(c, hx0, 98, hx1 - hx0, 2, 'lgray'); R(c, hx0, 100, hx1 - hx0, 1, 'dgray');
    // upper windows
    window4(c, 100, 66, 22, 24, true); window4(c, 134, 66, 22, 24, true);
    // lower windows (left pair)
    window4(c, 78, 108, 20, 22, true); window4(c, 104, 108, 20, 22, true);
    // shutters
    R(c, 75, 107, 2, 24, 'dgray'); R(c, 125, 107, 2, 24, 'dgray');
    // porch: roof overhang + door
    R(c, 136, 102, 50, 3, 'lgray'); R(c, 136, 105, 50, 1, 'black');
    R(c, 140, 106, 2, 44, 'lgray'); R(c, 182, 106, 2, 44, 'lgray');
    R(c, 152, 110, 18, 36, 'lgray'); R(c, 154, 112, 14, 34, 'dgreen');
    R(c, 155, 113, 5, 14, 'forest'); R(c, 162, 113, 5, 14, 'forest'); R(c, 155, 129, 5, 14, 'forest'); R(c, 162, 129, 5, 14, 'forest');
    R(c, 158, 113, 1, 13, 'green'); R(c, 165, 113, 1, 13, 'green');
    P1(c, 165, 130, 'gold'); P1(c, 165, 131, 'orange');
    R(c, 158, 116, 6, 4, 'cream'); R(c, 158, 118, 6, 2, 'yellow'); // door window
    // porch light fixture
    R(c, 146, 114, 3, 1, 'black'); R(c, 145, 115, 5, 6, 'black'); R(c, 146, 116, 3, 4, 'cream');
    // steps
    R(c, 148, 146, 26, 2, 'lgray'); R(c, 146, 148, 30, 2, 'gray'); R(c, 144, 150, 34, 2, 'lgray'); R(c, 144, 152, 34, 1, 'dgray');
    // ground/lawn
    grassBand(c, 150, 230, 'dgreen', 'forest', 'green');
    R(c, 0, 150, W, 2, 'forest');
    // hedges in front of house (back row dark, front row a step lighter)
    hedge(c, 40, 148, 138, 8, 'forest', 'dgreen'); hedge(c, 184, 222, 140, 8, 'forest', 'dgreen');
    hedge(c, 64, 140, 148, 6, 'dgreen', null);
    // walkway to steps
    R(c, 150, 153, 22, 8, 'gray'); R(c, 150, 153, 22, 1, 'lgray'); R(c, 160, 154, 1, 7, 'dgray');
    // dropped cups in lawn under the table
    lyingCup(c, 70, 214); lyingCup(c, 150, 218); lyingCup(c, 196, 212);
    // sidewalk
    R(c, 0, 230, W, 10, 'gray'); R(c, 0, 230, W, 1, 'lgray'); R(c, 0, 231, W, 1, 'xlgray');
    for (i = 0; i < W; i += 32) R(c, i + 12, 232, 1, 8, 'dgray');
    return cv;
  }

  function bgBasement() {
    var cv = mk(W, H), c = cv._x, x, y, i;
    R(c, 0, 0, W, H, 'black');
    // ceiling joists + pipes
    R(c, 0, 24, W, 14, 'dbrown');
    for (x = 4; x < W; x += 20) R(c, x, 24, 6, 14, 'olive');
    for (x = 4; x < W; x += 20) R(c, x + 5, 24, 1, 14, 'black');
    R(c, 0, 38, W, 1, 'black');
    R(c, 0, 33, W, 3, 'lgray'); R(c, 0, 35, W, 1, 'gray');
    for (x = 30; x < W; x += 64) R(c, x, 32, 3, 5, 'gray');
    // brick wall
    // brick wall: one clean 16x8 brick tile (2 courses, half-brick offset), dbrown mortar, lit top edge
    R(c, 0, 39, W, 131, 'dbrown');
    for (y = 40; y < 170; y += 4) {
      var off = ((y - 40) >> 2) & 1 ? 8 : 0;
      for (x = -off, i = 0; x < W; x += 16, i++) { var dk = ((i + (y >> 2) * 3) % 7) === 0; R(c, x, y, 15, 3, dk ? 'dbrown' : 'maroon'); R(c, x, y, 3, 1, dk ? 'maroon' : 'dred'); }
    }
    R(c, 0, 39, W, 2, 'black');
    // small high window showing night + moon
    R(c, 108, 44, 40, 20, 'lgray'); R(c, 110, 46, 36, 16, 'navy'); dith(c, 110, 46, 36, 4, 'black');
    P1(c, 116, 50, 'white'); P1(c, 132, 48, 'lgray'); P1(c, 140, 53, 'white');
    disc(c, 126, 54, 3, 'cream'); R(c, 110, 58, 36, 4, 'forest'); for (x = 112; x < 146; x += 6) R(c, x, 46, 1, 16, 'gray');
    R(c, 127, 46, 2, 16, 'lgray');
    // dartboard
    disc(c, 30, 70, 10, 'black'); disc(c, 30, 70, 9, 'red'); disc(c, 30, 70, 7, 'cream'); disc(c, 30, 70, 5, 'green'); disc(c, 30, 70, 3, 'cream'); disc(c, 30, 70, 1, 'red');
    R(c, 21, 70, 19, 1, 'black'); R(c, 30, 61, 1, 19, 'black');
    // pennant flag "PONG"
    c.fillStyle = C('blue');
    for (i = 0; i < 18; i++) c.fillRect(176 + i * 3, 64 + (i >> 1), 60 - i * 3, 1);
    for (i = 0; i < 18; i++) P1(c, 236 - i * 3, 64 + (i >> 1), 'black');
    R(c, 176, 64, 2, 18, 'sky'); R(c, 174, 60, 2, 28, 'lgray'); P1(c, 174, 59, 'gold');
    text(c, 'PONG', 182, 66, 'white');
    // poster
    R(c, 64, 60, 26, 34, 'lgray'); R(c, 66, 62, 22, 30, 'navy'); R(c, 70, 70, 12, 16, 'black'); R(c, 71, 71, 10, 14, 'gold'); R(c, 71, 71, 10, 3, 'white'); R(c, 73, 75, 1, 9, 'olive');
    R(c, 81, 74, 3, 1, 'black'); R(c, 83, 74, 1, 8, 'black'); R(c, 81, 81, 3, 1, 'black'); R(c, 70, 68, 12, 3, 'white'); P1(c, 69, 70, 'white'); P1(c, 75, 67, 'white'); R(c, 68, 88, 18, 2, 'red');
    // couch (behind crowd)
    R(c, 39, 137, 80, 1, 'black'); R(c, 38, 138, 82, 34, 'black'); R(c, 39, 138, 80, 22, 'olive'); R(c, 40, 138, 78, 1, 'gold');
    for (x = 65; x < 119; x += 26) R(c, x, 139, 1, 20, 'dbrown');
    R(c, 39, 160, 80, 10, 'olive'); R(c, 39, 160, 80, 1, 'gold'); R(c, 65, 160, 1, 10, 'dbrown'); R(c, 92, 160, 1, 10, 'dbrown');
    R(c, 31, 148, 11, 24, 'black'); R(c, 32, 149, 9, 22, 'olive'); R(c, 32, 149, 9, 1, 'gold'); R(c, 40, 150, 1, 21, 'dbrown');
    R(c, 116, 148, 11, 24, 'black'); R(c, 117, 149, 9, 22, 'olive'); R(c, 117, 149, 9, 1, 'gold'); R(c, 117, 150, 1, 21, 'dbrown');
    // kegs stacked (right)
    function keg(kx, ky) {
      R(c, kx, ky, 20, 22, 'lgray'); R(c, kx + 14, ky, 6, 22, 'gray'); R(c, kx + 2, ky, 2, 22, 'white');
      R(c, kx, ky + 4, 20, 2, 'gray'); R(c, kx, ky + 16, 20, 2, 'gray'); R(c, kx - 1, ky, 22, 1, 'black'); R(c, kx - 1, ky + 22, 22, 1, 'black');
      R(c, kx - 1, ky, 1, 22, 'black'); R(c, kx + 20, ky, 1, 22, 'black');
    }
    keg(186, 148); keg(208, 148); keg(197, 125);
    R(c, 205, 120, 4, 5, 'black'); R(c, 206, 118, 2, 3, 'red');
    // concrete floor
    R(c, 0, 170, W, 70, 'dgray');
    R(c, 0, 170, W, 1, 'gray'); R(c, 0, 171, W, 1, 'black');
    for (x = 0; x < W; x += 64) { R(c, x, 172, 1, 68, 'black'); R(c, x + 1, 172, 1, 68, 'gray'); }
    R(c, 0, 204, W, 1, 'black'); R(c, 0, 205, W, 1, 'gray');
    // rug under table: red field, dred border, gold trim + diamond row
    R(c, 26, 211, 204, 18, 'gold'); R(c, 27, 212, 202, 16, 'dred'); R(c, 29, 214, 198, 12, 'red');
    for (x = 36; x < 222; x += 12) { R(c, x, 219, 3, 1, 'gold'); P1(c, x + 1, 218, 'gold'); P1(c, x + 1, 220, 'gold'); }
    lyingCup(c, 90, 214); lyingCup(c, 172, 220);
    // string light wire
    for (x = 0; x < W; x++) P1(c, x, 44 + Math.round(Math.sin((x % 64) / 64 * Math.PI) * 8), 'black');
    return cv;
  }
  function bulbsY(x) { return 44 + Math.round(Math.sin((x % 64) / 64 * Math.PI) * 8); }

  function bgRooftop() {
    var cv = mk(W, H), c = cv._x, x, y, i, r = rng(77);
    R(c, 0, 0, W, H, 'navy'); R(c, 0, 0, W, 26, 'black'); dith(c, 0, 26, W, 16, 'black'); dith4(c, 0, 42, W, 12, 'black');
    STAR_SETS[2] = stars(c, 23, 90, 26, 90);
    // full-ish moon
    disc(c, 40, 46, 9, 'cream'); P1(c, 37, 43, 'yellow'); R(c, 41, 47, 3, 2, 'yellow'); P1(c, 36, 50, 'yellow');
    // far skyline
    var x0 = 0;
    while (x0 < W) {
      var bw = 10 + ((r() * 16) | 0), bh = 30 + ((r() * 46) | 0);
      R(c, x0, 150 - bh, bw, bh, 'slate');
      for (y = 150 - bh + 3; y < 148; y += 4) for (x = x0 + 2; x < x0 + bw - 1; x += 3) if (r() < 0.3) P1(c, x, y, 'teal');
      x0 += bw + ((r() * 3) | 0);
    }
    // near skyline (taller, black w/ lit windows)
    var B = [[0, 22, 70], [24, 18, 54], [44, 26, 88], [72, 16, 60], [92, 30, 106], [124, 20, 66], [146, 24, 80], [172, 14, 50], [188, 28, 96], [218, 20, 64], [240, 16, 76]];
    for (i = 0; i < B.length; i++) {
      var b = B[i]; R(c, b[0], 160 - b[2], b[1], b[2], 'black');
      R(c, b[0], 160 - b[2], b[1], 1, 'dgray');
      for (y = 160 - b[2] + 4; y < 156; y += 5) for (x = b[0] + 2; x < b[0] + b[1] - 2; x += 4) {
        var q = r(); if (q < 0.26) R(c, x, y, 2, 2, q < 0.05 ? 'cream' : 'gold'); else if (q < 0.4) R(c, x, y, 2, 2, 'slate');
      }
    }
    // radio tower on tallest building (x 92..122)
    c.fillStyle = C('gray');
    for (y = 22; y < 54; y++) { var w2 = Math.max(1, ((y - 22) / 6) | 0); c.fillRect(107 - w2, y, 1, 1); c.fillRect(107 + w2, y, 1, 1); if (y % 5 === 0) c.fillRect(107 - w2, y, w2 * 2 + 1, 1); }
    R(c, 107, 18, 1, 6, 'lgray');
    // water tower on right building
    R(c, 194, 52, 18, 14, 'dbrown'); R(c, 194, 52, 18, 1, 'brown'); for (x = 196; x < 212; x += 3) R(c, x, 53, 1, 13, 'black');
    c.fillStyle = C('dbrown'); for (i = 0; i < 6; i++) c.fillRect(193 + i * 2, 51 - i, 20 - i * 4, 1);
    R(c, 196, 66, 1, 10, 'dgray'); R(c, 209, 66, 1, 10, 'dgray'); R(c, 196, 70, 14, 1, 'dgray');
    // neon sign on building (static part)
    R(c, 150, 92, 20, 10, 'black'); R(c, 149, 91, 22, 1, 'dgray');
    // roof parapet + floor
    R(c, 0, 160, W, 14, 'gray'); R(c, 0, 160, W, 2, 'lgray'); R(c, 0, 172, W, 2, 'dgray');
    for (x = 0; x < W; x += 16) R(c, x, 162, 1, 10, 'dgray');
    R(c, 0, 174, W, 66, 'dgray');
    for (y = 186, i = 0; y < 240; y += 14, i++) { R(c, 0, y, W, 1, 'black'); for (x = (i & 1) * 24; x < W; x += 48) R(c, x, y - 13, 1, 13, 'black'); }
    R(c, 0, 174, W, 1, 'black');
    // AC unit + vent
    R(c, 6, 140, 26, 20, 'lgray'); R(c, 8, 142, 22, 16, 'gray'); disc(c, 19, 150, 6, 'dgray'); for (i = -5; i <= 5; i += 2) R(c, 14, 150 + i, 11, 1, 'black');
    R(c, 222, 146, 8, 14, 'gray'); R(c, 220, 144, 12, 3, 'lgray');
    // string light wire
    for (x = 0; x < W; x++) P1(c, x, rlY(x), 'black');
    // flag pole (flag animated)
    R(c, 236, 118, 1, 42, 'lgray'); P1(c, 236, 117, 'gold');
    lyingCup(c, 84, 216); lyingCup(c, 176, 220);
    return cv;
  }
  function rlY(x) { return 132 + Math.round(Math.sin((x % 128) / 128 * Math.PI) * 10); }

  function bgBeach() {
    var cv = mk(W, H), c = cv._x, x, y, i;
    R(c, 0, 0, W, H, 'black');
    R(c, 0, 24, W, 40, 'navy'); dith(c, 0, 24, W, 10, 'black');
    R(c, 0, 64, W, 26, 'dpurple'); dith(c, 0, 60, W, 8, 'dpurple'); dith(c, 0, 64, W, 6, 'navy');
    R(c, 0, 90, W, 18, 'dmagenta'); dith(c, 0, 86, W, 6, 'dmagenta'); dith(c, 0, 90, W, 6, 'dpurple');
    R(c, 0, 106, W, 4, 'rose'); dith(c, 0, 104, W, 3, 'rose'); R(c, 0, 109, W, 1, 'salmon');
    STAR_SETS[3] = stars(c, 51, 70, 26, 70);
    // big moon
    disc(c, 186, 54, 12, 'cream'); disc(c, 189, 51, 3, 'yellow'); disc(c, 181, 58, 2, 'yellow'); P1(c, 191, 60, 'yellow');
    // sea
    R(c, 0, 110, W, 46, 'dblue');
    for (y = 112; y < 156; y += 4) for (x = (y * 7) % 16; x < W; x += 16) R(c, x, y, 6, 1, 'blue');
    // sand
    R(c, 0, 154, W, 86, 'olive'); R(c, 0, 154, W, 2, 'white'); dith(c, 0, 156, W, 2, 'lgray');
    R(c, 0, 158, W, 1, 'dbrown');
    // sand: one 32x16 speck tile repeated (no noise), then a crisp 2-step firelight pool round the bonfire
    for (y = 160; y < 240; y += 8) for (x = ((y >> 3) & 1) * 16; x < W; x += 32) { P1(c, x + 3, y + 2, 'dbrown'); P1(c, x + 11, y + 5, 'orange'); P1(c, x + 12, y + 5, 'dbrown'); }
    for (y = 160; y < 214; y++) for (x = 16; x < 140; x++) { var dx = (x - 77) / 50, dy = (y - 175) / 18, d = dx * dx + dy * dy; if (d < 1 && (d < 0.12 || ((x + y) & 1))) P1(c, x, y, 'orange'); }
    // palms
    function palm(px, py, h, dir) { // dusk silhouette: ringed trunk, thick drooping fronds tapering to a point
      for (i = 0; i < h; i++) { var xx = px + Math.round(Math.sin(i / h * 1.6) * 9 * dir); R(c, xx, py - i, 4, 1, i % 4 === 0 ? 'black' : 'dbrown'); P1(c, xx + (dir > 0 ? 3 : 0), py - i, 'black'); }
      var tx = px + Math.round(Math.sin(1.6) * 9 * dir) + 2, ty = py - h;
      var fr = [[-17, 5], [-12, -5], [-3, -9], [7, -8], [16, -3], [18, 7], [-9, 10], [6, 11]];
      for (var f = 0; f < fr.length; f++) for (var s = 0; s <= 14; s++) {
        var t2 = s / 14, fx = Math.round(tx + fr[f][0] * t2), fy = Math.round(ty + fr[f][1] * t2 + (Math.abs(fr[f][0]) > 8 ? t2 * t2 * 8 : t2 * t2 * 3)), wd = s < 6 ? 3 : s < 11 ? 2 : 1;
        R(c, fx - (wd >> 1), fy, wd, 2, 'dbrown'); if (s > 3 && !(s & 1)) P1(c, fx, fy + 2, 'dbrown');
      }
      disc(c, tx, ty + 2, 2, 'black'); P1(c, tx - 1, ty + 1, 'dbrown');
    }
    palm(8, 176, 90, 1); palm(232, 178, 80, -1); palm(214, 178, 56, -1);
    // tiki torches

    // logs of bonfire
    R(c, 64, 168, 26, 3, 'brown'); R(c, 62, 171, 30, 3, 'dbrown'); R(c, 65, 169, 2, 2, 'orange'); R(c, 86, 169, 2, 2, 'orange');
    for (i = 0; i < 7; i++) { R(c, 60 + i * 5, 174, 4, 3, 'gray'); R(c, 60 + i * 5, 174, 4, 1, 'lgray'); }
    // cooler
    R(c, 223, 165, 20, 12, 'black'); R(c, 224, 166, 18, 10, 'blue'); R(c, 224, 166, 18, 3, 'white'); R(c, 224, 169, 18, 1, 'dblue'); R(c, 230, 164, 6, 2, 'lgray');
    lyingCup(c, 92, 212); lyingCup(c, 182, 218);
    // footprints / shells
    var r2 = rng(9); for (i = 0; i < 18; i++) P1(c, (r2() * 256) | 0, (200 + r2() * 38) | 0, 'cream');
    return cv;
  }

  function bgArena() {
    var cv = mk(W, H), c = cv._x, x, y, i;
    R(c, 0, 0, W, H, 'black');
    // rafters / dark roof with lights
    R(c, 0, 24, W, 10, 'dgray'); for (x = 0; x < W; x += 8) R(c, x, 24 + (x % 16 ? 2 : 0), 1, 8, 'black');
    for (x = 16; x < W; x += 32) { R(c, x, 34, 8, 3, 'gray'); R(c, x + 1, 37, 6, 1, 'cream'); }
    // stands handled as separate pre-rendered frames; floor + barrier here
    R(c, 0, 140, W, 14, 'navy'); R(c, 0, 140, W, 1, 'gold'); R(c, 0, 141, W, 1, 'brown'); R(c, 0, 153, W, 1, 'black');
    // ad boards
    var ads = ['PONG', 'CUP', 'PARTY', 'SOFT'];
    for (i = 0; i < 4; i++) { R(c, 4 + i * 64, 142, 56, 10, i % 2 ? 'red' : 'blue'); R(c, 4 + i * 64, 151, 56, 1, i % 2 ? 'dred' : 'dblue'); text(c, ads[i], 4 + i * 64 + 28 - ads[i].length * 4, 143, i % 2 ? 'white' : 'gold'); }
    // floor: dark court, clean perspective plank seams (wider apart toward the viewer)
    R(c, 0, 154, W, 86, 'dblue'); R(c, 0, 154, W, 1, 'blue');
    [158, 163, 169, 176, 184, 193, 203, 214, 226].forEach(function (yy) { R(c, 0, yy, W, 1, 'navy'); });
    // big center circle (perspective ellipse) under table
    for (i = 0; i < 360; i += 2) { var a = i / 180 * Math.PI; P1(c, Math.round(128 + Math.cos(a) * 70), Math.round(212 + Math.sin(a) * 18), 'gold'); }
    return cv;
  }
  // arena stands frames (2): tiers of fans
  var standFrames = null;
  function arenaStands() { // tiled fans: 8x10 cells, 4-fan pattern per row, rows offset half a cell; frame 1 = arms up
    if (standFrames) return standFrames;
    var SH = ['blue', 'dred', 'dblue', 'dgray', 'blue', 'red', 'dgray', 'dblue'], SK = ['skin', 'tan', 'brown', 'skin'], HR = ['black', 'brown', 'gold', 'black', 'dgray'];
    standFrames = withStage(4, function () { return [0, 1].map(function (fr) {
      var cv = mk(W, 102), c = cv._x, x, k;
      R(c, 0, 0, W, 102, 'black');
      for (var row = 0; row < 10; row++) {
        var ty = 2 + row * 10;
        for (x = -4 + (row & 1) * 4, k = 0; x < W; x += 8, k++) {
          var q = (k + row * 3) & 7, sh = SH[(q + row) & 7], sk = SK[(k * 3 + row) & 3], hr = HR[(k + row * 2) % 5];
          var up = fr && ((k + row) % 3 === 0) ? 1 : 0;
          R(c, x + 1, ty + 5 - up, 6, 4, sh); R(c, x + 2, ty + 4 - up, 4, 1, sh);
          R(c, x + 2, ty + 1 - up, 4, 3, sk); R(c, x + 2, ty - up, 4, 1, hr); P1(c, x + 2, ty + 1 - up, hr); P1(c, x + 5, ty + 1 - up, hr);
          if (fr && ((k + row) % 4 === 1)) { R(c, x, ty - 1, 1, 4, sk); R(c, x + 7, ty - 1, 1, 4, sk); }
        }
        R(c, 0, ty + 9, W, 1, 'navy');
      }
      dith4(c, 0, 0, W, 20, 'black', 1);
      return cv;
    }); });
    return standFrames;
  }
  var BG_BUILDERS = [bgBackyard, bgBasement, bgRooftop, bgBeach, bgArena];
  function stageBG(s) { return stageCache[s] || (stageCache[s] = withStage(s, BG_BUILDERS[s])); }
  function clampStage(stage) { stage = stage | 0; return ((stage % 5) + 5) % 5; }

  function twinkle(ctx, list, t) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], ph = ((t >> 3) + i * 5) % 12;
      if (ph === 0) { P1(ctx, p[0], p[1], 'white'); P1(ctx, p[0] - 1, p[1], 'lgray'); P1(ctx, p[0] + 1, p[1], 'lgray'); P1(ctx, p[0], p[1] - 1, 'lgray'); P1(ctx, p[0], p[1] + 1, 'lgray'); }
      else if (ph === 6) P1(ctx, p[0], p[1], 'navy');
    }
  }
  var BULB_COLS = ['red', 'yellow', 'green', 'sky', 'magenta'];
  function flame(ctx, x, y, t, s) { // small flickering flame, base at (x,y)
    var f = (t >> 2) & 3, h = 5 + s + [0, 1, 2, 1][f];
    for (var i = 0; i < h; i++) {
      var w = Math.max(1, Math.round((h - i) / h * (3 + s))) + (i % 2 && f & 1 ? 1 : 0);
      var col = i < h * 0.3 ? 'red' : i < h * 0.65 ? 'orange' : 'yellow';
      R(ctx, x - (w >> 1) + ((i > h / 2 && f === 2) ? 1 : 0), y - i, w, 1, col);
    }
    P1(ctx, x, y - 1, 'cream');
  }
  function drawBackground(ctx, stage, t, excite) {
    if (!ctx) return;
    stage = clampStage(stage); t = t | 0; var ex = Math.max(0, Math.min(1, +excite || 0));
    withStage(stage, function () { drawBG(ctx, stage, t, ex); });
  }
  function drawBG(ctx, stage, t, ex) {
    if (stage === 4) { var sf = arenaStands(); ctx.drawImage(stageBG(4), 0, 0); ctx.drawImage(sf[(ex > 0.05 ? (t >> (ex > 0.6 ? 2 : 3)) : (t >> 5)) & 1], 0, 38); }
    else ctx.drawImage(stageBG(stage), 0, 0);
    var i, x, y;
    if (stage === 0) {
      twinkle(ctx, STAR_SETS[0], t);
      // window light toggle (upper left window someone flips the switch)
      if (((t >> 6) % 23) === 7) { R(ctx, 100, 66, 22, 24, 'navy'); dith4(ctx, 100, 66, 22, 24, 'slate'); R(ctx, 111, 66, 1, 24, 'black'); R(ctx, 100, 78, 22, 1, 'black'); }
      // silhouette passing in lower window
      var sx = ((t >> 1) % 300) - 40; if (sx > 78 && sx < 118) { R(ctx, sx, 116, 6, 14, 'olive'); R(ctx, sx + 1, 112, 4, 4, 'olive'); }
      // porch light glow
      if (((t >> 2) % 37) !== 0) { R(ctx, 146, 116, 3, 4, 'cream'); P1(ctx, 147, 117, 'white'); } else R(ctx, 146, 116, 3, 4, 'yellow');
      // fireflies
      for (i = 0; i < 4; i++) { var ph = (t + i * 97) % 240; if (ph < 120 && ((ph >> 3) & 1)) P1(ctx, (40 + i * 53 + Math.round(Math.sin((t + i * 40) / 40) * 10)) | 0, (160 + i * 9 + Math.round(Math.cos((t + i * 30) / 30) * 5)) | 0, 'lime2'); }
    } else if (stage === 1) {
      for (x = 6, i = 0; x < W; x += 12, i++) {
        y = bulbsY(x) + 1; var on = ((i + (t >> 4)) % 5) !== 0, col = BULB_COLS[i % 5];
        P1(ctx, x, y, 'black'); R(ctx, x - 1, y + 1, 3, 3, on ? col : 'dgray'); if (on) P1(ctx, x - 1, y + 1, 'white');
      }
      // dartboard? no — TV flicker of the poster glow; hanging bulb sway
      var bx = 128 + Math.round(Math.sin(t / 50) * 2); R(ctx, bx, 38, 1, 30, 'black'); R(ctx, bx - 1, 68, 3, 3, 'cream'); P1(ctx, bx, 71, 'yellow');
    } else if (stage === 2) {
      twinkle(ctx, STAR_SETS[2], t);
      if ((t % 60) < 30) { R(ctx, 106, 16, 3, 3, 'red'); P1(ctx, 107, 16, 'salmon'); } else P1(ctx, 107, 17, 'dred');
      // neon sign
      var neon = ((t >> 5) % 6) !== 5; text(ctx, 'BAR', 148, 93, neon ? 'magenta' : 'dmagenta');
      // blinking windows
      for (i = 0; i < 6; i++) if ((((t >> 6) + i * 3) % 7) === 0) R(ctx, [48, 96, 150, 192, 8, 222][i] + 2, [96, 70, 100, 80, 110, 118][i], 2, 2, 'yellow');
      // string lights
      for (x = 8, i = 0; x < W; x += 16, i++) { y = rlY(x) + 1; var on2 = ((i + (t >> 4)) & 1) === 0; R(ctx, x - 1, y, 3, 3, on2 ? 'cream' : 'olive'); }
      // flag fluttering
      var fl = (t >> 3) & 1; for (i = 0; i < 6; i++) R(ctx, 237 + i * 2, 118 + (((i + fl) & 1) ? 1 : 0), 2, 6 - (i >> 1), i < 3 ? 'red' : 'white');
    } else if (stage === 3) {
      twinkle(ctx, STAR_SETS[3], t);
      // moon reflection shimmer
      for (y = 112; y < 154; y += 2) { var w = 10 - ((y - 112) >> 3) + (((t >> 3) + y) % 3); var ox = ((t >> 4) + y) % 3 - 1; R(ctx, 186 - (w >> 1) + ox, y, w, 1, ((y + (t >> 3)) % 6) < 2 ? 'white' : 'cream'); }
      // wave foam
      for (x = 0; x < W; x += 8) { var wv = ((x >> 3) + (t >> 4)) % 4; if (wv === 0) R(ctx, x, 152, 6, 1, 'white'); else if (wv === 1) R(ctx, x + 2, 150, 4, 1, 'pblue'); }
      // bonfire
      flame(ctx, 69, 168, t, 5); flame(ctx, 84, 168, t + 11, 5); flame(ctx, 76, 168, t + 5, 9);
      for (i = 0; i < 6; i++) { var sp = (t + i * 29) % 60; P1(ctx, 76 + Math.round(Math.sin((t + i * 30) / 9) * 3) + (i - 3) * 3, 153 - sp, sp < 25 ? 'yellow' : sp < 45 ? 'orange' : 'red'); }

    } else if (stage === 4) {
      // banner
      drawBox(ctx, 40, 44, 176, 22, 'red');
      textCenter(ctx, 'WORLD CUP OF PONG', 51, 'gold', true);
      // spotlights sweeping (dithered beams)
      beam(ctx, 24, 36, 128 + Math.round(Math.sin(t / 70) * 90), t);
      beam(ctx, 232, 36, 128 + Math.round(Math.sin(t / 55 + 2) * 90), t);
      // camera flashes in stands
      var fl2 = 2 + Math.round(ex * 6);
      for (i = 0; i < fl2; i++) { var q = (t * 7 + i * 131) % 977; if ((q % 13) === 0 || (ex > 0.5 && (q % 7) === 0)) { x = (q * 37) % 250; y = 70 + (q * 13) % 70; P1(ctx, x, y, 'white'); P1(ctx, x - 1, y, 'cream'); P1(ctx, x + 1, y, 'cream'); P1(ctx, x, y - 1, 'cream'); P1(ctx, x, y + 1, 'cream'); } }
    }
    drawCrowd(ctx, stage, t, ex);
  }
  var beamPat = null;
  function beam(ctx, sx, sy, tx, t) {
    if (!beamPat) { var p = mk(4, 4); P1(p._x, 0, 0, 'cream'); P1(p._x, 2, 2, 'cream'); P1(p._x, 1, 3, 'yellow'); P1(p._x, 3, 1, 'yellow'); beamPat = ctx.createPattern(p, 'repeat'); }
    ctx.fillStyle = beamPat;
    var ty = 210, n = ty - sy;
    for (var y = sy; y < ty; y += 2) {
      var k = (y - sy) / n, cx = sx + (tx - sx) * k, hw = 2 + k * 16;
      ctx.fillRect(Math.round(cx - hw), y, Math.round(hw * 2), 2);
    }
    // pool of light on the floor
    for (var j = -5; j <= 5; j++) { var ww = Math.round(Math.sqrt(1 - (j * j) / 30) * 22); ctx.fillRect(Math.round(tx - ww), 210 + j, ww * 2, 1); }
  }

  // ------------------------------------------------------------------ tables
  var TABLES = [
    { top: 'red', top2: 'dred', trim: 'white', stripe: 'white', apron: 'red', apron2: 'dred', leg: 'dgray', leg2: 'black', shadow: 'forest' },
    { top: 'brown', top2: 'dbrown', trim: 'gold', stripe: 'dbrown', apron: 'dbrown', apron2: 'maroon', leg: 'dgray', leg2: 'black', wood: 1, shadow: 'maroon' },
    { top: 'slate', top2: 'navy', trim: 'lgray', stripe: 'cyan', apron: 'gray', apron2: 'dgray', leg: 'lgray', leg2: 'gray', shadow: 'black' },
    { top: 'gold', top2: 'orange', trim: 'cream', stripe: 'olive', apron: 'olive', apron2: 'dbrown', leg: 'olive', leg2: 'dbrown', wood: 2, shadow: 'dbrown' },
    { top: 'dblue', top2: 'navy', trim: 'gold', stripe: 'white', apron: 'blue', apron2: 'dblue', leg: 'gold', leg2: 'orange', star: 1, shadow: 'navy' }
  ];
  var tableCache = [];
  function buildTable(s) {
    var T = TABLES[s], cv = mk(W, 48), c = cv._x, oy = 180, x, y;
    function r(x, y, w, h, col) { R(c, x, y - oy, w, h, col); }
    var X0 = 32, X1 = 224, Wd = X1 - X0;
    // floor shadow under the table (solid, NES style) grounds it against the backdrop
    r(42, 218, 172, 1, T.shadow); r(36, 219, 184, 3, T.shadow); r(42, 222, 172, 1, T.shadow);
    // legs (folding) - back legs first
    function leg(lx, top, bot, col, col2) { r(lx - 1, top, 4, bot - top, 'black'); r(lx, top, 2, bot - top, col); r(lx + 1, top, 1, bot - top, col2); r(lx - 2, bot - 1, 6, 2, 'black'); r(lx - 1, bot - 1, 4, 1, col2); }
    leg(48, 200, 219, T.leg2, 'black'); leg(206, 200, 219, T.leg2, 'black');
    leg(38, 200, 223, T.leg, T.leg2); leg(216, 200, 223, T.leg, T.leg2);
    // braces
    r(39, 209, 11, 1, T.leg2); r(206, 209, 11, 1, T.leg2);
    for (var i = 0; i < 8; i++) { r(40 + i, 201 + i, 1, 1, 'black'); r(214 - i, 201 + i, 1, 1, 'black'); }
    // top surface
    r(X0, 182, Wd, 14, T.top);
    r(X0, 182, Wd, 1, T.trim); r(X0, 183, Wd, 1, T.top2);
    if (T.wood === 1) { for (y = 185; y < 196; y += 3) for (x = X0; x < X1; x += 24) r(x + ((y * 5) % 17), y, 10, 1, T.top2); r(127, 182, 2, 14, T.top2); }
    else if (T.wood === 2) { for (x = X0; x < X1; x += 6) r(x, 183, 1, 13, T.stripe); r(127, 182, 2, 14, T.top2); }
    else { r(X0, 189, Wd, 1, T.stripe); }
    if (T.star) { // center logo
      paint(c, ['...W...', '..WWW..', 'WWWWWWW', '.WWWWW.', '.WW.WW.'], { W: 'gold' }, 125, 186 - oy);
    }
    if (s === 0) { r(127, 183, 2, 13, 'white'); }
    if (s === 2) { r(X0 + 2, 184, 1, 11, T.stripe); r(X1 - 3, 184, 1, 11, T.stripe); }
    // end caps
    r(X0, 182, 1, 18, 'black'); r(X1 - 1, 182, 1, 18, 'black');
    // front edge / apron
    r(X0, 196, Wd, 1, T.trim); r(X0, 197, Wd, 2, T.apron); r(X0, 199, Wd, 1, T.apron2); r(X0, 200, Wd, 1, 'black');
    r(X0 + 1, 197, 1, 3, T.trim); r(X1 - 2, 197, 1, 3, T.trim);
    return cv;
  }
  function drawTable(ctx, stage) {
    if (!ctx) return; stage = clampStage(stage);
    var cv = tableCache[stage] || (tableCache[stage] = withStage(stage, function () { return buildTable(stage); }));
    ctx.drawImage(cv, 0, 180);
  }

  // ------------------------------------------------------------------ cups, ball, fx
  function drawCup(ctx, cx, baseY, state, t) {
    if (!ctx || state === 'gone') return;
    cx = Math.round(cx); baseY = Math.round(baseY); t = t | 0;
    var ox = 0, oy = 0;
    if (state === 'hit') {
      var k = Math.max(0, 20 - t);
      ox = t < 16 ? [0, 1, 0, -1][(t >> 1) & 3] : 0; oy = (t >= 1 && t < 4) ? -1 : 0;
      ctx.drawImage(S.cup, cx - 4 + ox, baseY - 10 + oy);
      if (t < 12) { // beer slosh above rim
        var h = t < 6 ? t : 12 - t;
        P1(ctx, cx - 1 + ox, baseY - 11 - (h >> 1), 'beer'); P1(ctx, cx + 1 + ox, baseY - 11 - (h >> 1), 'beer');
        if (h > 2) { P1(ctx, cx - 3, baseY - 11 - h, 'white'); P1(ctx, cx + 3, baseY - 11 - h, 'white'); P1(ctx, cx, baseY - 12 - h, 'beer'); }
      }
      if (k === 0) return;
      return;
    }
    ctx.drawImage(state === 'dim' ? S.cupDim : S.cup, cx - 4, baseY - 10);
  }
  function drawCupTop(ctx, cx, cy, state) {
    if (!ctx) return;
    ctx.drawImage(state === 'gone' ? S.cupTopGone : state === 'hit' ? S.cupTopHit : S.cupTop, Math.round(cx) - 6, Math.round(cy) - 6);
  }
  function drawBall(ctx, x, y, fire, t) {
    if (!ctx) return; x = Math.round(x); y = Math.round(y);
    if (fire) { var f = ((t | 0) >> 2) & 1; ctx.drawImage(S.fire[f], x - 4, y - 5); }
    else ctx.drawImage(S.ball, x - 2, y - 2);
  }
  function drawFlame(ctx, x, y, t) { // short flickering flame-trail puff centered at x,y (t = frame/age)
    if (!ctx || !S.flame) return; var f = (((t | 0) >> 2) + ((x + y) & 1)) & 3;
    ctx.drawImage(S.flame[f], Math.round(x) - 2, Math.round(y) - 2);
  }
  function drawShadow(ctx, x, y) {
    if (!ctx) return; x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = PAL.black; ctx.fillRect(x - 1, y - 1, 3, 1); ctx.fillRect(x - 2, y, 5, 1);
  }
  function drawTrailDot(ctx, x, y, fire) {
    if (!ctx) return; x = Math.round(x); y = Math.round(y);
    if (fire) { R(ctx, x - 1, y - 1, 2, 2, ((x + y) & 2) ? 'orange' : 'yellow'); P1(ctx, x - 1, y - 1, 'red'); }
    else { R(ctx, x, y, 1, 1, 'white'); P1(ctx, x + 1, y, 'lgray'); }
  }
  // sink splash: 6 snappy NES-style frames (3-5 ticks each) built from stamps: sparkle stars + beer droplets
  var SPARK = [['.W.', 'WWW', '.W.'], ['..W..', '..W..', 'WWYWW', '..W..', '..W..'],
    ['...W...', '...W...', '..WYW..', 'WWYWYWW', '..WYW..', '...W...', '...W...']];
  var SPL_T = [0, 3, 6, 10, 14, 19, 25];
  var SPL_F = [ // [kind, dx, dy]  kind: 0..2 sparkle size, 'D' 2x2 droplet w/ white glint, 'd' 2x2 droplet, 'p' 1px, 'w' foam
    [[2, 0, -9], ['D', -4, -3], ['D', 3, -3], ['D', -1, -5], ['w', -2, -1], ['w', 0, -2], ['w', 2, -1]],
    [[2, 0, -15], ['D', -6, -6], ['D', 5, -6], ['D', -3, -10], ['D', 2, -10], ['d', -8, -2], ['d', 7, -2], ['w', -4, -1], ['w', 4, -1], ['w', 0, -3]],
    [[1, 0, -18], ['d', -9, -9], ['d', 8, -9], ['d', -4, -14], ['d', 3, -14], ['p', -11, -4], ['p', 11, -4], ['w', -6, -5], ['w', 6, -5]],
    [[0, -7, -18], [0, 7, -16], ['d', -11, -8], ['d', 10, -8], ['p', -5, -15], ['p', 5, -15], ['p', -13, -2], ['p', 13, -2]],
    [[0, 0, -19], ['p', -12, -3], ['p', 12, -3], ['p', -7, -8], ['p', 7, -8], ['p', -14, 2], ['p', 14, 2]],
    [['p', -13, 3], ['p', 13, 3], ['p', -8, 1], ['p', 8, 1]]
  ];
  function drawSplash(ctx, x, y, t) {
    if (!ctx) return; t = t | 0; if (t < 0 || t > 24) return; x = Math.round(x); y = Math.round(y);
    var f = 0; while (f < 5 && t >= SPL_T[f + 1]) f++;
    var L = SPL_F[f];
    for (var i = 0; i < L.length; i++) {
      var k = L[i][0], px = x + L[i][1], py = y + L[i][2];
      if (k === 'd' || k === 'D') { R(ctx, px, py, 2, 2, 'beer'); P1(ctx, px, py, k === 'D' ? 'white' : 'gold'); }
      else if (k === 'p') P1(ctx, px, py, 'beer');
      else if (k === 'w') P1(ctx, px, py, 'white');
      else { var sp = SPARK[k], h = sp.length >> 1; paint(ctx, sp, { W: 'white', Y: 'gold' }, px - h, py - h); }
    }
  }
  function drawCrosshair(ctx, x, y, t) {
    if (!ctx) return; x = Math.round(x); y = Math.round(y);
    var blink = (((t | 0) >> 3) & 1);
    ctx.drawImage(S.xhairShadow, x - 3, y - 3);
    ctx.drawImage(blink ? S.xhair2 : S.xhair, x - 4, y - 4);
  }
  function drawIcon(ctx, name, x, y) {
    if (!ctx) return; var cv = S.icons && (S.icons[name] || S.icons.ball); if (!cv) return;
    ctx.drawImage(cv, Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------------ title logo
  var logo = null;
  function buildLogo() {
    var LW = 212, LH = 58, g = new Uint8Array(LW * LH), band = new Uint8Array(LW * LH), i, x, y;
    // "BEER PONG" 3x glyphs, italic shear, with ping-pong-ball 'O'
    var str = 'BEER PONG', sc = 3, ox = 4, oy = 22;
    var cx = ox, ballAt = null;
    for (i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === ' ') { cx += 12; continue; }
      if (ch === 'O') { ballAt = [cx + 10, oy + 10]; cx += 23; continue; }
      var gl = GL[ch];
      for (y = 0; y < 7; y++) for (x = 0; x < 7; x++) if (gl[y] && gl[y].charAt(x) === '#') {
        for (var sy = 0; sy < sc; sy++) for (var sx = 0; sx < sc; sx++) {
          var py = oy + y * sc + sy, px = cx + x * sc + sx + (6 - y);
          if (px >= 0 && px < LW && py < LH) { g[py * LW + px] = 1; band[py * LW + px] = y * sc + sy; }
        }
      }
      cx += 23;
    }
    // "SUPER" 2x small caps at top-left with bars
    var str2 = 'SUPER', sc2 = 2, ox2 = 44, oy2 = 3; cx = ox2;
    for (i = 0; i < str2.length; i++) {
      var gl2 = GL[str2.charAt(i)];
      for (y = 0; y < 7; y++) for (x = 0; x < 7; x++) if (gl2[y].charAt(x) === '#') {
        for (sy = 0; sy < sc2; sy++) for (sx = 0; sx < sc2; sx++) { var qy = oy2 + y * sc2 + sy, qx = cx + x * sc2 + sx + ((6 - y) >> 1); g[qy * LW + qx] = 2; }
      }
      cx += 17;
    }
    // extrude: 3px down-right in dark, then outline
    var out = new Uint8Array(LW * LH); // 0 none 1 face 2 superface 3 extrude 4 outline 5 ball
    for (i = 0; i < g.length; i++) out[i] = g[i];
    for (var d = 3; d >= 1; d--) for (y = LH - 1; y >= 0; y--) for (x = LW - 1; x >= 0; x--) {
      var v = g[y * LW + x]; if (!v) continue; var nx = x + d, ny = y + d; if (nx >= LW || ny >= LH) continue;
      if (!out[ny * LW + nx]) out[ny * LW + nx] = v === 1 ? 3 : 6;
    }
    var o2 = new Uint8Array(out);
    for (y = 0; y < LH; y++) for (x = 0; x < LW; x++) {
      if (out[y * LW + x]) continue;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < LW && yy < LH && out[yy * LW + xx]) o2[y * LW + x] = 4; }
    }
    var cv = mk(LW, LH), c = cv._x, face = mk(LW, LH), fc = face._x;
    for (i = 0; i < o2.length; i++) {
      var k = o2[i]; if (!k) continue; x = i % LW; y = (i / LW) | 0; var col;
      if (k === 1) { var b = band[i]; col = b < 4 ? 'cream' : b < 10 ? 'yellow' : b < 16 ? 'orange' : 'red'; P1(fc, x, y, 'white'); }
      else if (k === 2) { col = y - oy2 < 7 ? 'white' : 'lgray'; }
      else if (k === 3) col = 'dred'; else if (k === 6) col = 'blue'; else col = 'black';
      P1(c, x, y, col);
    }
    // ping-pong ball 'O' (with outline + extrusion shadow)
    if (ballAt) {
      var bx = ballAt[0] + 2, by = ballAt[1];
      disc(c, bx + 2, by + 2, 11, 'black'); disc(c, bx + 1, by + 1, 10, 'dred'); disc(c, bx, by, 11, 'black');
      disc(c, bx, by, 10, 'lgray'); disc(c, bx - 1, by - 1, 9, 'white'); disc(fc, bx - 1, by - 1, 9, 'white');
      R(c, bx - 5, by - 6, 3, 2, 'xlgray'); P1(c, bx - 6, by - 4, 'xlgray');
      // seam arc
      P1(c, bx + 6, by + 5, 'lgray'); P1(c, bx + 7, by + 4, 'lgray'); P1(c, bx + 4, by + 7, 'lgray');
      // little red cup to the right of SUPER, ball hopping into it
    }
    // red cup emblem next to SUPER
    var cupx = 184, cupy = 0;
    paint(c, ['KKKKKKKKKK', 'KWWWWWWWWK', 'KgWWWWWWgK', 'KRLRRRRRDK', '.KRLRRRDK.', '.KRLRRRDK.', '.KDDDDDDK.', '.KRLRRRDK.', '.KRLRRDDK.', '.KDDDDDDK.', '..KKKKKK..'],
      { K: 'black', W: 'white', g: 'lgray', R: 'red', L: 'salmon', D: 'dred' }, cupx, cupy);
    // dotted arc from SUPER to the cup
    for (i = 0; i < 6; i++) { var ax = 156 + i * 5, ay = 16 - Math.round(Math.sin((i + 1) / 7 * Math.PI) * 14); if (!o2[ay * LW + ax]) { R(c, ax, ay, 2, 2, 'white'); P1(c, ax + 1, ay + 1, 'lgray'); } }
    // underline bar with stars
    logo = { cv: cv, face: face, w: LW, h: LH };
    return logo;
  }
  function drawLogo(ctx, x, y, t) {
    if (!ctx) return; var L = logo || buildLogo(); t = t | 0;
    var lx = Math.round(x) - (L.w >> 1), ly = Math.round(y);
    ctx.drawImage(L.cv, lx, ly);
    // shine sweep every ~4 s
    var p = (t % 240) * 3 - 30;
    if (p > -20 && p < L.w + 40) {
      for (var row = 0; row < L.h; row++) {
        var sx = p - (row >> 1); if (sx < 0 || sx >= L.w - 3) continue;
        ctx.drawImage(L.face, sx, row, 3, 1, lx + sx, ly + row, 3, 1);
      }
    }
    // sparkle star on the ball
    var tw = (t >> 3) % 8; if (tw < 3) { var sx2 = lx + 136, sy2 = ly + 26; R(ctx, sx2 - tw, sy2, tw * 2 + 1, 1, 'white'); R(ctx, sx2, sy2 - tw, 1, tw * 2 + 1, 'white'); }
  }

  // ------------------------------------------------------------------ init
  var inited = false;
  function init() {
    if (inited) return; inited = true;
    try {
      S.cup = spr(CUPMAP.full, CUPMAP.pal);
      S.cupDim = spr(CUPMAP.full, { W: 'lgray', g: 'gray', R: 'dred', L: 'red', D: 'maroon', K: 'black' });
      S.ball = spr(BALL, { W: 'white', g: 'lgray' });
      S.fire = FIRE.map(function (f) { return spr(f, { R: 'red', Y: 'gold', W: 'white', O: 'orange' }); });
      S.flame = FLAME.map(function (f) { return spr(f, { R: 'red', Y: 'gold', O: 'orange' }); });
      S.xhair = spr(XHAIR, { W: 'white', R: 'red' }); S.xhair2 = spr(XHAIR, { W: 'yellow', R: 'white' });
      S.xhairShadow = spr(XHAIR, { W: 'black', R: 'black' });
      S.icons = {}; for (var k in ICONS) S.icons[k] = spr(ICONS[k], ICONPAL);
      // top-down cups
      function topCup(mode) {
        var cv = mk(12, 12), c = cv._x;
        for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
          var dx = x - 5.5, dy = y - 5.5, d = Math.sqrt(dx * dx + dy * dy), col = null;
          if (mode === 'gone') { if (d <= 6 && d > 4.6) col = (x + y) & 1 ? 'dgray' : null; }
          else if (d <= 6.1) col = d > 5.3 ? 'black' : d > 4.2 ? (dx + dy > 2.5 ? 'dred' : 'red') : d > 3.1 ? 'white' : (mode === 'hit' ? ((x + y) & 1 ? 'white' : 'beer') : (dx + dy < -1.5 ? 'yellow' : 'beer'));
          if (col) P1(c, x, y, col);
        }
        if (mode !== 'gone') { P1(c, 4, 4, 'white'); P1(c, 5, 4, 'white'); }
        return cv;
      }
      S.cupTop = topCup('full'); S.cupTopGone = topCup('gone'); S.cupTopHit = topCup('hit');
      for (var w in CHARS) for (var pk in POSES) { charSprite(w, pk, false); charSprite(w, pk, true); }
      for (var w2 in CHARS) { portraitCache[w2] = buildPortrait(w2); portrait64[w2] = buildPortrait64(w2); }
      for (var s = 0; s < 5; s++) { stageBG(s); drawTable(mk(1, 1)._x, s); }
      arenaStands(); buildLogo(); atlas('white'); atlas('black');
    } catch (e) { if (window.console) console.warn('Art.init', e); }
  }
  function ensure() { if (!inited) init(); }
  function wrap(fn) { return function () { try { ensure(); return fn.apply(null, arguments); } catch (e) { if (!wrap.warned) { wrap.warned = 1; if (window.console) console.warn('Art', e); } return 0; } }; }

  BP.Art = {
    W: W, H: H, PAL: PAL, NES: NES, G: G,
    TABLE_BACK: 182, TABLE_FRONT: 196, TABLE_X0: 32, TABLE_X1: 224, TABLE_MID: 189, FLOOR_Y: 222, FEET_Y: 228,
    CHARS: { hero: 'SAL', chad: 'NATE', tank: 'TANK', sky: 'SKY', brody: 'BRO-DY', kegmaster: 'THE KEGMASTER' },
    STAGES: ['BACKYARD BASH', 'FRAT BASEMENT', 'ROOFTOP', 'BEACH BONFIRE', 'CHAMPIONSHIP'],
    init: init,
    text: wrap(text), textCenter: wrap(textCenter), measure: measure,
    bigText: wrap(bigText), bigTextCenter: wrap(bigTextCenter),
    drawBox: wrap(drawBox), fade: wrap(fade),
    drawBackground: wrap(drawBackground), drawTable: wrap(drawTable), drawPlayer: wrap(drawPlayer),
    drawCup: wrap(drawCup), drawCupTop: wrap(drawCupTop), drawBall: wrap(drawBall), drawShadow: wrap(drawShadow),
    drawSplash: wrap(drawSplash), drawCrosshair: wrap(drawCrosshair), drawIcon: wrap(drawIcon),
    drawLogo: wrap(drawLogo), drawFlame: wrap(drawFlame), drawPortrait: wrap(drawPortrait), drawTrailDot: wrap(drawTrailDot)
  };
})();
