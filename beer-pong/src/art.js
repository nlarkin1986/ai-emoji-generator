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
  function C(c) { return PAL[c] || (typeof c === 'string' && c.charAt(0) === '#' ? c : PAL.white); }
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
  function textCenter(ctx, str, y, color, shadow) { return text(ctx, str, Math.round((W - measure(str)) / 2), y, color, shadow); }

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
    var cv = bigCanvas(str, color || 'white', scale || 2); return bigText(ctx, str, Math.round((W - cv._w) / 2), y, color, scale);
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
    ctx.fillRect(x + 2, y + 1, w - 4, 2); ctx.fillRect(x + 2, y + h - 3, w - 4, 2);
    ctx.fillRect(x + 1, y + 2, 2, h - 4); ctx.fillRect(x + w - 3, y + 2, 2, h - 4);
    if (s[1] && w > 10 && h > 10) {
      ctx.fillStyle = C(s[1]);
      ctx.fillRect(x + 4, y + 4, w - 8, 1); ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
      ctx.fillRect(x + 4, y + 4, 1, h - 8); ctx.fillRect(x + w - 5, y + 4, 1, h - 8);
    }
  }

  // NES-style fade helper: level 0 (none) .. 4 (black) using ordered dither
  var fadePats = null;
  function fade(ctx, level) {
    level = Math.max(0, Math.min(4, level | 0)); if (!ctx || !level) return;
    if (level >= 4) { R(ctx, 0, 0, W, H, 'black'); return; }
    if (!fadePats) {
      fadePats = [];
      var M = [[0, 2], [3, 1]];
      for (var l = 1; l <= 3; l++) {
        var p = mk(2, 2); for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < 2; xx++) if (M[yy][xx] < l + (l === 3 ? 0 : 0)) P1(p._x, xx, yy, 'black');
        fadePats[l] = ctx.createPattern(p, 'repeat');
      }
    }
    ctx.fillStyle = fadePats[level]; ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ small sprites
  var S = {}; // prerendered sprite canvases
  var CUPMAP = {
    full: ['WWWWWWWW', 'gWWWWWWg', 'RLRRRRRD', 'RLRRRRRD', '.DDDDDD.', '.RLRRRD.', '.RLRRRD.', '.RLRRRD.', '.RLRRDD.', '.DDDDDD.'],
    pal: { W: 'white', g: 'lgray', R: 'red', L: 'salmon', D: 'dred' }
  };
  var BALL = ['.WWW.', 'WWWWW', 'WWWWg', 'WWWgg', '.ggg.'];
  var FIRE = [
    ['...R...', '..RYR..', '.RYWYOR', 'RYWWWYR', 'RYWWWYO', '.OYYYO.', '..OOO..'],
    ['..R....', '.RYR.R.', '.RYYRYR', 'RYWWWYR', 'OYWWWYR', '.OYYYO.', '..OOO..']
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
  var ICONPAL = { W: 'white', g: 'lgray', R: 'red', L: 'salmon', D: 'dred', B: 'beer', Y: 'yellow', O: 'orange' };

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
    hero: { name: 'YOU', head: 'hero', logo: 'W', wide: 0, pal: { S: 'skin', s: 'salmon', H: 'maroon', C: 'red', c: 'dred', w: 'white', T: 'red', t: 'dred', V: 'red', L: 'white', P: 'tan', p: 'yellow', O: 'white', W: 'white', w2: 'red' }, bg: 'blue' },
    chad: { name: 'CHAD', head: 'chad', logo: 'W', wide: 0, pal: { S: 'skin', s: 'salmon', H: 'yellow', C: 'white', c: 'lgray', T: 'white', t: 'lgray', V: 'white', L: 'red', P: 'red', p: 'dred', O: 'white', W: 'white', w2: 'red' }, bg: 'red' },
    tank: { name: 'TANK', head: 'tank', logo: 'N8', wide: 3, armR: 1.4, pal: { S: 'skin3', s: 'maroon', H: 'dbrown', T: 'green', t: 'dgreen', V: 'green', L: 'white', P: 'lgray', p: 'gray', O: 'white', W: 'gray', w2: 'dgray' }, bg: 'orange' },
    sky: { name: 'SKY', head: 'sky', logo: 'bolt', wide: 0, pal: { S: 'skin', s: 'salmon', H: 'slate', G: 'black', g: 'sky', T: 'purple', t: 'dpurple', V: 'purple', L: 'yellow', P: 'dgray', p: 'black', O: 'white', W: 'white', w2: 'purple' }, bg: 'teal' },
    brody: { name: 'BRO-DY', head: 'brody', logo: null, wide: 1, pal: { S: 'skin2', s: 'brown', H: 'cream', G: 'black', g: 'pink', T: 'cyan', t: 'teal', V: 'skin2', L: 'white', P: 'pink', p: 'rose', O: 'skin2', W: 'yellow', w2: 'orange' }, bg: 'rose' },
    kegmaster: { name: 'KEGMASTER', head: 'kegmaster', logo: 'K', wide: 4, armR: 1.3, belly: 1, pal: { S: 'skin', s: 'salmon', H: 'brown', D: 'brown', X: 'gold', x: 'orange', J: 'red', T: 'blue', t: 'dblue', V: 'blue', L: 'gold', P: 'dpurple', p: 'black', O: 'white', W: 'gold', w2: 'orange' }, bg: 'dmagenta' }
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
  function drawPortrait(ctx, who, x, y) {
    if (!ctx) return; if (!CHARS[who]) who = 'chad';
    var cv = portraitCache[who] || (portraitCache[who] = buildPortrait(who));
    ctx.drawImage(cv, Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------------ crowd (background partygoers 12x24)
  var CROWD = {
    stand: [
      '....KKKK....',
      '...KHHHHK...',
      '..KHHHHHHK..',
      '..KHSSSSHK..',
      '..KSESSESK..',
      '..KSSSSSSK..',
      '...KSMMSK...',
      '...KKSSKK...',
      '..KTTTTTTK..',
      '.KTTTTTTTTK.',
      'KTTTTLLTTTTK',
      'KTKTTLLTTKTK',
      'KTKTTTTTTKTK',
      'KSKTTTTTRRSK',
      'KSKTTTTTRRK.',
      '.KKPPPPPPKK.',
      '..KPPPPPPK..',
      '..KPPKKPPK..',
      '..KPPKKPPK..',
      '..KSSKKSSK..',
      '..KSSK.KSSK.',
      '..KSSK.KSSK.',
      '.KWWWK.KWWWK',
      '.KKKKK.KKKKK'],
    cheer: [
      'KK..KKKK..KK',
      'SK.KHHHHK.KS',
      'SKKHHHHHHKKS',
      'SKKHSSSSHKKS',
      'SKKSESSESKKS',
      'TKKSSSSSSKKT',
      'TTKKSMMSKKTT',
      '.TTKKMMKKTT.',
      '..KTTTTTTK..',
      '..KTTTTTTK..',
      '..KTTLLTTK..',
      '..KTTLLTTK..',
      '..KTTTTTTK..',
      '..KTTTTTTK..',
      '..KTTTTTTK..',
      '.KKPPPPPPKK.',
      '..KPPPPPPK..',
      '..KPPKKPPK..',
      '..KPPKKPPK..',
      '..KSSKKSSK..',
      '..KSSK.KSSK.',
      '..KSSK.KSSK.',
      '.KWWWK.KWWWK',
      '.KKKKK.KKKKK'],
    cup: [
      '....KKKK.RR.',
      '...KHHHHKRRK',
      '..KHHHHHHKSK',
      '..KHSSSSHKSK',
      '..KSESSESKSK',
      '..KSSSSSSKTK',
      '...KSMMSKTTK',
      '...KKSSKKTK.',
      '..KTTTTTTTK.',
      '.KTTTTTTTK..',
      'KTTTTLLTTK..',
      'KTKTTLLTTK..',
      'KTKTTTTTTK..',
      'KSKTTTTTTK..',
      'KSKTTTTTTK..',
      '.KKPPPPPPKK.',
      '..KPPPPPPK..',
      '..KPPKKPPK..',
      '..KPPKKPPK..',
      '..KSSKKSSK..',
      '..KSSK.KSSK.',
      '..KSSK.KSSK.',
      '.KWWWK.KWWWK',
      '.KKKKK.KKKKK']
  };
  var crowdCache = {};
  function crowdSprite(v, frame) {
    var key = v.join(',') + frame; if (crowdCache[key]) return crowdCache[key];
    var map = { K: 'black', E: 'black', M: 'dred', R: 'red', H: v[0], S: v[1], T: v[2], L: v[3], P: v[4], W: 'white' };
    return (crowdCache[key] = spr(CROWD[frame], map, false));
  }
  // variant: [hair, skin, shirt, logo, pants]
  var CROWDS = [
    [[46, ['maroon', 'skin', 'red', 'white', 'slate']], [66, ['yellow', 'skin', 'white', 'red', 'blue']], [88, ['dbrown', 'skin3', 'red', 'white', 'tan']],
      [112, ['orange', 'skin', 'white', 'red', 'slate']], [146, ['black', 'skin2', 'red', 'white', 'dgray']], [168, ['cream', 'skin', 'lgray', 'red', 'blue']],
      [190, ['maroon', 'skin', 'red', 'red', 'tan']], [212, ['dbrown', 'skin3', 'white', 'red', 'slate']]],
    [[44, ['dbrown', 'skin', 'blue', 'white', 'tan']], [64, ['yellow', 'skin', 'green', 'white', 'slate']], [90, ['black', 'skin3', 'white', 'blue', 'dgray']],
      [116, ['maroon', 'skin', 'orange', 'white', 'blue']], [144, ['cream', 'skin', 'lgray', 'green', 'slate']], [170, ['dbrown', 'skin2', 'red', 'white', 'tan']],
      [196, ['black', 'skin', 'purple', 'white', 'blue']]],
    [[48, ['black', 'skin', 'magenta', 'white', 'dgray']], [72, ['cream', 'skin', 'cyan', 'navy', 'slate']], [100, ['maroon', 'skin2', 'white', 'purple', 'dgray']],
      [130, ['dbrown', 'skin', 'lgray', 'red', 'blue']], [158, ['yellow', 'skin', 'purple', 'white', 'dgray']], [184, ['black', 'skin3', 'blue', 'white', 'slate']],
      [208, ['orange', 'skin', 'green', 'white', 'dgray']]],
    [[86, ['cream', 'skin2', 'pink', 'white', 'cyan']], [108, ['dbrown', 'skin3', 'yellow', 'red', 'blue']], [132, ['yellow', 'skin', 'cyan', 'white', 'pink']],
      [156, ['maroon', 'skin2', 'orange', 'white', 'teal']], [180, ['black', 'skin', 'lgreen', 'white', 'blue']], [204, ['cream', 'skin2', 'white', 'cyan', 'orange']]],
    [[44, ['black', 'skin', 'gold', 'blue', 'dgray']], [66, ['maroon', 'skin3', 'blue', 'gold', 'slate']], [90, ['yellow', 'skin', 'red', 'white', 'dgray']],
      [114, ['dbrown', 'skin2', 'gold', 'red', 'blue']], [142, ['cream', 'skin', 'white', 'blue', 'slate']], [166, ['black', 'skin3', 'red', 'gold', 'dgray']],
      [190, ['orange', 'skin', 'blue', 'white', 'slate']], [212, ['maroon', 'skin', 'gold', 'blue', 'dgray']]]
  ];
  function drawCrowd(ctx, stage, t, ex) {
    var list = CROWDS[stage] || CROWDS[0];
    for (var i = 0; i < list.length; i++) {
      var m = list[i], ph = (t + i * 23) | 0, fr = 'stand', dy = 0;
      if (i % 3 === 1) fr = 'cup';
      if (ex > 0.05) {
        var lively = ((i * 5 + (ph >> 5)) % 4) < Math.ceil(ex * 4);
        if (lively) { fr = ((ph >> 3) & 1) ? 'cheer' : (i % 3 === 1 ? 'cup' : 'stand'); var j = (ph >> 2) % 6; dy = -Math.round([0, 2, 3, 3, 2, 0][j] * Math.min(1, ex * 1.4)); }
      } else if (((ph >> 5) & 3) === 0) dy = -1;
      if (((ph >> 6) % 5) === 0 && ex <= 0.05 && i % 2 === 0) fr = 'cup';
      ctx.drawImage(crowdSprite(m[1], fr), m[0] - 6, 160 + dy);
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
  function treeBlob(c, cx, cy, r, base, hi, dark) {
    disc(c, cx, cy, r, base);
    // highlight upper-left dithered
    for (var y = -r; y < 0; y++) for (var x = -r; x < 0; x++) if (x * x + y * y < r * r * 0.8 && ((x + y + cx + cy) & 1) && (x + y) < -r * 0.6) P1(c, cx + x, cy + y, hi);
    // leafy edge bumps
    for (var a = 0; a < 12; a++) { var an = a / 12 * Math.PI * 2, px = Math.round(cx + Math.cos(an) * r), py = Math.round(cy + Math.sin(an) * r); disc(c, px, py, 2, base); }
    if (dark) for (var b = 0; b < r; b += 3) P1(c, cx + ((b * 7) % r) - (r >> 1), cy + (r >> 2) + (b % 5), dark);
  }
  function bush(c, x, y, w, h, base, hi) {
    for (var i = 0; i < w; i += 7) disc(c, x + i + 3, y + (h >> 1) + ((i * 3) % 4) - 1, (h >> 1) + ((i * 5) % 3), base);
    for (var j = 0; j < w; j += 7) { P1(c, x + j + 2, y + 3 + (j % 3), hi); P1(c, x + j + 4, y + 2 + (j % 2), hi); P1(c, x + j + 1, y + 5, hi); }
  }
  function grassBand(c, y0, y1, base, tuft, seed) {
    R(c, 0, y0, 256, y1 - y0, base);
    var r = rng(seed);
    for (var i = 0; i < 260; i++) { var x = (r() * 256) | 0, y = (y0 + 2 + r() * (y1 - y0 - 3)) | 0; P1(c, x, y, tuft); P1(c, x + 1, y - 1, tuft); P1(c, x + 2, y, tuft); }
  }
  function lyingCup(c, x, y) { paint(c, ['.WRRRRD', 'WWRLRRD', 'WWRRRRD', '.WRRRD.'], { W: 'white', R: 'red', L: 'salmon', D: 'dred' }, x, y); }

  function bgBackyard() {
    var cv = mk(W, H), c = cv._x, i;
    R(c, 0, 0, W, H, 'navy');
    dith(c, 0, 0, W, 34, 'black'); R(c, 0, 0, W, 26, 'black'); dith4(c, 0, 34, W, 10, 'black');
    STAR_SETS[0] = stars(c, 11, 120, 26, 120, function (x, y) { return (x > 52 && x < 204 && y > 24) || (x < 66 && y > 30) || (x > 196 && y > 52); });
    moonCrescent(c, 226, 40, 8, 'navy');
    // far trees right
    treeBlob(c, 214, 82, 16, 'forest', 'dgreen', 'black'); treeBlob(c, 244, 70, 16, 'forest', 'dgreen', 'black'); treeBlob(c, 232, 100, 18, 'forest', 'dgreen');
    // neighbor house (right)
    c.fillStyle = C('dgray');
    for (i = 0; i < 26; i++) c.fillRect(226 - i * 2, 74 + i, 4 + i * 4, 1);
    R(c, 204, 100, 52, 56, 'slate');
    for (i = 102; i < 156; i += 3) R(c, 204, i, 52, 1, 'navy');
    c.fillStyle = C('lgray'); for (i = 0; i < 26; i++) { c.fillRect(226 - i * 2, 74 + i, 2, 1); c.fillRect(228 + i * 2, 74 + i, 2, 1); }
    window4(c, 222, 108, 10, 14, true, 'gray'); window4(c, 240, 108, 10, 14, false, 'gray');
    // left trees (big dark clump)
    treeBlob(c, 18, 66, 20, 'forest', 'dgreen', 'black'); treeBlob(c, 44, 52, 16, 'forest', 'dgreen', 'black');
    treeBlob(c, 8, 104, 22, 'forest', 'dgreen', 'black'); treeBlob(c, 40, 90, 18, 'forest', 'dgreen', 'black'); treeBlob(c, 30, 128, 20, 'forest', 'dgreen', 'black');
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
    grassBand(c, 150, 232, 'dgreen', 'green', 5);
    dith4(c, 0, 150, 256, 6, 'forest');
    // hedges in front of house
    bush(c, 44, 128, 98, 26, 'forest', 'dgreen');
    bush(c, 186, 130, 30, 24, 'forest', 'dgreen');
    bush(c, 66, 138, 72, 18, 'forest', 'green');
    // walkway to steps
    R(c, 150, 153, 22, 8, 'gray'); dith4(c, 150, 153, 22, 8, 'lgray');
    // dropped cups in lawn under the table
    lyingCup(c, 70, 214); lyingCup(c, 150, 218); lyingCup(c, 196, 212);
    // sidewalk
    R(c, 0, 230, W, 10, 'gray'); R(c, 0, 230, W, 1, 'lgray'); R(c, 0, 231, W, 1, 'xlgray');
    for (i = 0; i < W; i += 32) R(c, i + 12, 232, 1, 8, 'dgray');
    dith4(c, 0, 233, W, 7, 'dgray', 2);
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
    for (y = 39; y < 170; y += 5) {
      var off = ((y / 5) | 0) % 2 ? 6 : 0;
      for (x = -off; x < W; x += 12) {
        R(c, x, y, 11, 4, 'maroon');
        var hsh = (x * 7 + y * 13) & 15;
        if (hsh === 3) R(c, x, y, 10, 1, 'dred');
        else if (hsh === 9 || hsh === 12) R(c, x, y, 11, 4, 'dbrown');
        else if (hsh === 5) dith(c, x, y, 11, 4, 'dbrown');
      }
    }
    dith(c, 0, 39, W, 22, 'black'); dith4(c, 0, 61, W, 109, 'black', 1);
    dith(c, 0, 39, 16, 131, 'black'); dith(c, 240, 39, 16, 131, 'black');
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
    R(c, 64, 60, 26, 34, 'cream'); R(c, 66, 62, 22, 30, 'magenta'); disc(c, 77, 74, 6, 'yellow'); R(c, 68, 84, 18, 2, 'white'); R(c, 70, 88, 14, 1, 'white');
    // couch (behind crowd)
    R(c, 39, 137, 80, 1, 'black'); R(c, 38, 138, 82, 34, 'black'); R(c, 39, 138, 80, 22, 'olive'); R(c, 40, 138, 78, 1, 'gold');
    for (x = 65; x < 119; x += 26) R(c, x, 139, 1, 20, 'dbrown');
    dith4(c, 39, 141, 80, 18, 'dbrown');
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
    dith4(c, 0, 170, W, 70, 'gray', 0);
    R(c, 0, 170, W, 1, 'gray');
    for (x = 0; x < W; x += 64) R(c, x, 171, 1, 69, 'black');
    R(c, 0, 205, W, 1, 'black');
    // rug under table
    R(c, 26, 212, 204, 16, 'dred'); R(c, 28, 214, 200, 12, 'red'); dith4(c, 28, 214, 200, 12, 'dred'); R(c, 26, 212, 204, 1, 'gold'); R(c, 26, 227, 204, 1, 'gold');
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
        var q = r(); if (q < 0.38) R(c, x, y, 2, 2, q < 0.1 ? 'cream' : 'yellow'); else if (q < 0.45) R(c, x, y, 2, 2, 'slate');
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
    R(c, 0, 174, W, 66, 'dgray'); dith4(c, 0, 174, W, 66, 'black');
    for (y = 186; y < 240; y += 14) R(c, 0, y, W, 1, 'black');
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
    dith4(c, 0, 158, W, 82, 'orange', 0);
    // fire glow on sand around bonfire (left)
    for (y = 160; y < 240; y++) for (x = 0; x < 120; x++) { var dx = (x - 48) / 60, dy = (y - 186) / 34; var d = dx * dx + dy * dy; if (d < 1 && ((x + y) & 1)) P1(c, x, y, d < 0.35 ? 'gold' : 'orange'); }
    // palms
    function palm(px, py, h, dir) {
      for (i = 0; i < h; i++) { var xx = px + Math.round(Math.sin(i / h * 1.6) * 8 * dir); R(c, xx, py - i, 4, 1, i % 4 === 0 ? 'black' : 'dbrown'); }
      var tx = px + Math.round(Math.sin(1.6) * 8 * dir) + 2, ty = py - h;
      var fr = [[-14, 4], [-10, -6], [0, -9], [10, -6], [15, 5], [6, 10], [-6, 10]];
      for (var f = 0; f < fr.length; f++) {
        for (var s = 0; s <= 10; s++) { var t2 = s / 10, fx = Math.round(tx + fr[f][0] * t2), fy = Math.round(ty + fr[f][1] * t2 + (Math.abs(fr[f][0]) > 8 ? t2 * t2 * 6 : 0)); R(c, fx - 1, fy, 3, 2, 'forest'); }
      }
      disc(c, tx, ty + 1, 2, 'dbrown');
    }
    palm(8, 176, 90, 1); palm(232, 178, 80, -1); palm(214, 178, 56, -1);
    // tiki torches
    R(c, 196, 140, 2, 40, 'brown'); R(c, 194, 136, 6, 5, 'olive'); R(c, 120, 146, 2, 34, 'brown'); R(c, 118, 142, 6, 5, 'olive');
    // logs of bonfire
    R(c, 36, 171, 26, 3, 'brown'); R(c, 34, 174, 30, 3, 'dbrown'); R(c, 37, 172, 2, 2, 'orange'); R(c, 58, 172, 2, 2, 'orange');
    for (i = 0; i < 7; i++) { R(c, 32 + i * 5, 177, 4, 3, 'gray'); R(c, 32 + i * 5, 177, 4, 1, 'lgray'); }
    // cooler
    R(c, 146, 160, 22, 14, 'blue'); R(c, 146, 160, 22, 3, 'white'); R(c, 154, 158, 6, 2, 'lgray');
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
    R(c, 0, 150, W, 14, 'navy'); R(c, 0, 150, W, 2, 'gold'); R(c, 0, 162, W, 2, 'dblue');
    // ad boards
    var ads = ['PONG', 'CUP', 'PARTY', 'SOFT'];
    for (i = 0; i < 4; i++) { R(c, 4 + i * 64, 152, 56, 10, i % 2 ? 'red' : 'blue'); text(c, ads[i], 4 + i * 64 + 28 - ads[i].length * 4, 153, i % 2 ? 'white' : 'gold'); }
    // floor: dark court with star
    R(c, 0, 164, W, 76, 'dblue'); dith4(c, 0, 164, W, 76, 'navy');
    for (y = 170; y < 240; y += 10) R(c, 0, y, W, 1, 'navy');
    R(c, 0, 164, W, 1, 'lblue');
    // big center circle (perspective ellipse) under table
    for (i = 0; i < 360; i += 2) { var a = i / 180 * Math.PI; P1(c, Math.round(128 + Math.cos(a) * 70), Math.round(212 + Math.sin(a) * 18), 'gold'); }
    return cv;
  }
  // arena stands frames (2): tiers of fans
  var standFrames = null;
  function arenaStands() {
    if (standFrames) return standFrames;
    standFrames = [0, 1].map(function (fr) {
      var cv = mk(W, 112), c = cv._x, r = rng(31), x, y;
      R(c, 0, 0, W, 112, 'black');
      for (var row = 0; row < 9; row++) {
        var ty = 8 + row * 12; R(c, 0, ty + 9, W, 2, row % 2 ? 'dgray' : 'dpurple');
        for (x = 2 + (row % 2) * 3; x < W - 3; x += 6) {
          var q = r(), shirt = ['red', 'blue', 'gold', 'white', 'green', 'purple', 'orange', 'lgray'][(q * 8) | 0];
          var skin = ['skin', 'skin2', 'skin3'][(r() * 3) | 0], hair = ['black', 'dbrown', 'yellow', 'maroon'][(r() * 4) | 0];
          var up = fr && ((x >> 2) + row) % 3 === 0 ? 1 : 0;
          var arms = fr && ((x >> 2) + row) % 5 === 1;
          R(c, x, ty + 4 - up, 4, 5, shirt); R(c, x + 1, ty + 1 - up, 2, 3, skin); R(c, x + 1, ty + 0 - up, 2, 1, hair);
          if (arms) { P1(c, x - 1, ty + 1 - up, skin); P1(c, x + 4, ty + 1 - up, skin); P1(c, x - 1, ty + 2 - up, shirt); P1(c, x + 4, ty + 2 - up, shirt); }
        }
      }
      dith4(c, 0, 0, W, 40, 'black', 1);
      return cv;
    });
    return standFrames;
  }

  var BG_BUILDERS = [bgBackyard, bgBasement, bgRooftop, bgBeach, bgArena];
  function stageBG(s) { return stageCache[s] || (stageCache[s] = BG_BUILDERS[s]()); }
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
      flame(ctx, 41, 171, t, 5); flame(ctx, 56, 171, t + 11, 5); flame(ctx, 48, 171, t + 5, 9);
      for (i = 0; i < 6; i++) { var sp = (t + i * 29) % 60; P1(ctx, 48 + Math.round(Math.sin((t + i * 30) / 9) * 3) + (i - 3) * 3, 156 - sp, sp < 25 ? 'yellow' : sp < 45 ? 'orange' : 'red'); }
      flame(ctx, 197, 136, t + 3, 0); flame(ctx, 121, 142, t + 8, 0);
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
    { top: 'red', top2: 'dred', trim: 'white', stripe: 'white', apron: 'red', apron2: 'dred', leg: 'dgray', leg2: 'black' },
    { top: 'orange', top2: 'brown', trim: 'tan', stripe: 'brown', apron: 'brown', apron2: 'maroon', leg: 'dgray', leg2: 'black', wood: 1 },
    { top: 'dgray', top2: 'black', trim: 'lgray', stripe: 'cyan', apron: 'gray', apron2: 'dgray', leg: 'lgray', leg2: 'gray' },
    { top: 'gold', top2: 'orange', trim: 'cream', stripe: 'olive', apron: 'olive', apron2: 'dbrown', leg: 'olive', leg2: 'dbrown', wood: 2 },
    { top: 'dblue', top2: 'navy', trim: 'gold', stripe: 'white', apron: 'blue', apron2: 'dblue', leg: 'gold', leg2: 'orange', star: 1 }
  ];
  var tableCache = [];
  function buildTable(s) {
    var T = TABLES[s], cv = mk(W, 48), c = cv._x, oy = 180, x, y;
    function r(x, y, w, h, col) { R(c, x, y - oy, w, h, col); }
    var X0 = 32, X1 = 224, Wd = X1 - X0;
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
    var cv = tableCache[stage] || (tableCache[stage] = buildTable(stage));
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
    if (fire) { var f = ((t | 0) >> 2) & 1; ctx.drawImage(S.fire[f], x - 3, y - 3); }
    else ctx.drawImage(S.ball, x - 2, y - 2);
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
  var SPL_DIRS = [[0, -1], [0.7, -0.7], [1, -0.2], [-0.7, -0.7], [-1, -0.2], [0.4, -0.9], [-0.4, -0.9]];
  function drawSplash(ctx, x, y, t) {
    if (!ctx) return; t = t | 0; if (t < 0 || t > 24) return; x = Math.round(x); y = Math.round(y);
    var i;
    if (t < 16) { // starburst lines (white core, amber tips) like a comic "plink"
      var d0 = 2 + Math.round(t * 0.6), len = t < 10 ? 4 : 2;
      for (i = 0; i < SPL_DIRS.length; i++) {
        var dx = SPL_DIRS[i][0], dy = SPL_DIRS[i][1];
        for (var s = 0; s < len; s++) P1(ctx, x + Math.round(dx * (d0 + s)), y + Math.round(dy * (d0 + s)), t < 6 || s < len - 1 ? 'white' : 'beer');
      }
      if (t < 5) { R(ctx, x - 2, y - 1, 5, 2, 'white'); R(ctx, x - 1, y - 3, 3, 2, 'beer'); P1(ctx, x, y - 4, 'white'); }
    }
    // droplets arcing out and falling
    for (i = 0; i < 6; i++) {
      var vx = [-1.1, 1.1, -0.6, 0.6, -1.6, 1.6][i], vy = [-2.2, -2.2, -2.8, -2.8, -1.6, -1.6][i];
      var px = Math.round(x + vx * t * 0.7), py = Math.round(y + vy * t * 0.7 + 0.09 * t * t);
      if (t > 3) { R(ctx, px, py, i < 2 && t < 14 ? 2 : 1, 1, i & 1 ? 'beer' : 'yellow'); if (t < 12) P1(ctx, px, py - 1, 'white'); }
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
          var py = oy + y * sc + sy, px = cx + x * sc + sx + Math.round((20 - y * sc - sy) / 5);
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
        for (sy = 0; sy < sc2; sy++) for (sx = 0; sx < sc2; sx++) { var qy = oy2 + y * sc2 + sy, qx = cx + x * sc2 + sx + Math.round((14 - y * sc2 - sy) / 5); g[qy * LW + qx] = 2; }
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
      S.cupDim = spr(CUPMAP.full, { W: 'lgray', g: 'gray', R: 'dred', L: 'red', D: 'maroon' });
      S.ball = spr(BALL, { W: 'white', g: 'lgray' });
      S.fire = FIRE.map(function (f, i) { return spr(f, i ? { R: 'red', Y: 'yellow', W: 'white', O: 'orange' } : { R: 'red', Y: 'orange', W: 'cream', O: 'red' }); });
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
        if (mode !== 'gone') { P1(c, 4, 4, 'cream'); P1(c, 5, 4, 'cream'); }
        return cv;
      }
      S.cupTop = topCup('full'); S.cupTopGone = topCup('gone'); S.cupTopHit = topCup('hit');
      for (var w in CHARS) for (var pk in POSES) { charSprite(w, pk, false); charSprite(w, pk, true); }
      for (var w2 in CHARS) portraitCache[w2] = buildPortrait(w2);
      for (var s = 0; s < 5; s++) { stageBG(s); tableCache[s] = buildTable(s); }
      arenaStands(); buildLogo(); atlas('white'); atlas('black');
    } catch (e) { if (window.console) console.warn('Art.init', e); }
  }
  function ensure() { if (!inited) init(); }
  function wrap(fn) { return function () { try { ensure(); return fn.apply(null, arguments); } catch (e) { if (!wrap.warned) { wrap.warned = 1; if (window.console) console.warn('Art', e); } return 0; } }; }

  BP.Art = {
    W: W, H: H, PAL: PAL, NES: NES, G: G,
    TABLE_BACK: 182, TABLE_FRONT: 196, TABLE_X0: 32, TABLE_X1: 224, TABLE_MID: 189, FLOOR_Y: 222, FEET_Y: 228,
    CHARS: { hero: 'YOU', chad: 'CHAD', tank: 'TANK', sky: 'SKY', brody: 'BRO-DY', kegmaster: 'THE KEGMASTER' },
    STAGES: ['BACKYARD BASH', 'FRAT BASEMENT', 'ROOFTOP', 'BEACH BONFIRE', 'CHAMPIONSHIP'],
    init: init,
    text: wrap(text), textCenter: wrap(textCenter), measure: measure,
    bigText: wrap(bigText), bigTextCenter: wrap(bigTextCenter),
    drawBox: wrap(drawBox), fade: wrap(fade),
    drawBackground: wrap(drawBackground), drawTable: wrap(drawTable), drawPlayer: wrap(drawPlayer),
    drawCup: wrap(drawCup), drawCupTop: wrap(drawCupTop), drawBall: wrap(drawBall), drawShadow: wrap(drawShadow),
    drawSplash: wrap(drawSplash), drawCrosshair: wrap(drawCrosshair), drawIcon: wrap(drawIcon),
    drawLogo: wrap(drawLogo), drawPortrait: wrap(drawPortrait), drawTrailDot: wrap(drawTrailDot)
  };
})();
