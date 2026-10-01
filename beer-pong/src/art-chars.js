/* SUPER BEER PONG — BP.Art character sprites (overrides BP.Art.drawPlayer).
   Hand-authored NES-style paper dolls: every part is a string pixel map, composed per pose and
   pre-rendered once per facing to an offscreen canvas.  Frame = 32 (+wide) x 52, feet bottom row 51,
   anchor = bottom-center of feet.  Hero faces RIGHT; CPU sprites are mirrored (logos re-stamped unmirrored).
   Layer order: back arm, legs, torso, head, front arm (+ball/cup), chest logo.
   Codes: K outline  S/s skin/shade  T/t shirt  V/v sleeve  k sleeve hem  P/p shorts  O/o shoe/trim
          H/h hair  C/c cap  w cap logo  E pupil  e eye white  M mouth  G/g shades/glint  X/x/J crown
          D/d beard  B/b ball  R/r/Q cup  Y chest logo.
   Colors: only the shared sprite colors (black red dred white skin tan gold brown lgray) + each CPU's
   stage colors (see the budget comment at the top of art.js). */
(function () {
  'use strict';
  var BP = (window.BP = window.BP || {});
  var A = BP.Art; if (!A || !A.PAL) return;
  var PAL = A.PAL, baseInit = A.init, baseDraw = A.drawPlayer;

  // ---------------------------------------------------------------- heads (20 wide, facing right)
  // shared lower face (rows 8..14); eyes rows 8-9 (near eye e+E at 11-12, far eye E at 15), nose row 10, mouth row 11
  var FACE = [
    '..KHHHSSSSSeESSESK',
    '..KHKSKSSSSeESSESK',
    '..KHSSKSSSSSSSSSSSK',
    '...KHSSSSSSSSMMSSK',
    '...KKsSSSSSSSSSSK',
    '.....KKssSSSSSKK',
    '.......KKKKKKK'];
  var TOPS = {
    hero: [
      '......KKKKKKK',
      '....KKCCCCCCCKK',
      '...KCCCCCCCCCwCwK',
      '...KCCCCCCCCCwwwCK',
      '..KcCCCCCCCCCCCCCK',
      '..KccCCCCCCCCCCCCKKK',
      '..KHcccccccccccCCCCK',
      '..KHHKKKKKKKKKKKKKK'],
    chad: [
      '......KKKKKKK',
      '....KKCCCCCCCKK',
      '...KCCCCCCCCCCCK',
      '..KCCCCCCCCCCCCCK',
      '..KcCCCCCCCCCCKHK',
      'KKKccCCCCCCCCKHHK',
      'KcccccccccccKHHHHK',
      'KKKKKKcccccKHHHKKK'],
    sky: [
      '.......KKKKKK',
      '.....KKHHHHHHKK',
      '....KHHHHHHHHHHKK',
      '...KHHHhhHHHHHHHHK',
      '..KHHHHHHhhHHHHHHHK',
      '..KHHHHHHHHHhhHHHHK',
      '..KHHHHHHHHHHHHKKK',
      '..KHHHHSSSSSSHHK'],
    brody: [
      '....K...K...K',
      '...KHK.KHK.KHK.K',
      '..KHHHKHHHKHHHKHK',
      '..KHHHHHHHHHHHHHHK',
      '.KHHHHHHHHHHHHHHHHK',
      '..KHHHHHHHHHHHHHHK',
      '..KHHHHHSSSSSHHHK',
      '..KHHHSSSSSSSSHK'],
    kegmaster: [
      '....K....K....K',
      '...KXK..KXK..KXK',
      '...KXXK.KXK.KXXK',
      '...KXXXKXJXKXXXK',
      '...KxxxxxxxxxxxxK',
      '..KHHHHSSSSSSSSSK',
      '..KHHHSSSSSKKSSKSK',
      '..KHHSSSSSSSSSSSSK']
  };
  // wide build (TANK / KEGMASTER): face template widened by 2 (col 8 duplicated)
  var TOPS_W = {
    tank: [
      '...KKKKKKKKKKKKKK',
      '..KHHHHHHHHHHHHHHK',
      '..KHHHHHHHHHHHHHHK',
      '..KHHHHHHHHHHHHHHK',
      '..KHHHHHHHHHHHHHHHK',
      '..KHHHSSSSSSSSSSSHK',
      '..KHHSSSSSSSSKKSSKSK',
      '..KHHSSSSSSSSSSSSSSK']
  };
  // per-head overlays (rows from 8 onward), eye/mouth anchors for expressions
  var OVER = {
    sky: ['.......KKKKGgGGGGK', '...........qqqKqqK'],
    brody: ['.......KKKKGgGGGGK', '...........qqqKqqK'],
    kegmaster: [null, null,
      '..KHDDKSSSSSSSSSSSK',
      '...KDDDDDDDDdddddK',
      '...KDDDDDDDDDMMDDK',
      '....KDDDDDDDDDDDK',
      '.....KDDDDDDDDDK',
      '......KKDDDDDKK',
      '........KKKKK'],
    chad: [null, null, '..KHSSKSSSSSSSSMSSK']
  };
  var HEADS = {
    hero: { top: 'hero' }, chad: { top: 'chad' }, sky: { top: 'sky', shades: 1 }, brody: { top: 'brody', shades: 1 },
    tank: { top: 'tank', wide: 1 }, kegmaster: { top: 'kegmaster', beard: 1 }
  };

  function widenRows(rows, col, n) {
    return rows.map(function (r) { if (r.length <= col) return r; var c = r.charAt(col); var s = ''; for (var i = 0; i < n; i++) s += c; return r.slice(0, col) + s + r.slice(col); });
  }
  var FACE_W = widenRows(FACE, 8, 2);

  // returns {g: grid rows (array of char arrays), w, h}
  function headGrid(who, expr) {
    var hd = HEADS[who] || HEADS.chad, wide = hd.wide ? 2 : 0;
    var top = (wide ? TOPS_W : TOPS)[hd.top], face = wide ? FACE_W : FACE, W = 20 + wide, rows = [], y, x;
    for (y = 0; y < 18; y++) { rows.push([]); for (x = 0; x < W; x++) rows[y].push('.'); }
    function put(r, oy) { for (var i = 0; i < r.length; i++) if (r[i]) for (var j = 0; j < r[i].length; j++) { var c = r[i].charAt(j); if (c !== '.' && rows[oy + i]) rows[oy + i][j] = c; } }
    put(face, 8); put(top, 0); if (OVER[who]) put(OVER[who], 8);
    var ex = 11 + wide, fx = 15 + wide, mx = 13 + wide, my = hd.beard ? 12 : 11, sk = hd.beard ? 'D' : 'S';
    function px(x, y, c) { if (rows[y] && x >= 0 && x < W) rows[y][x] = c; }
    if (!hd.shades) {
      if (expr === 'c') { px(ex, 8, 'S'); px(ex + 1, 8, 'S'); px(fx, 8, 'S'); px(ex, 9, 'K'); px(ex + 1, 9, 'K'); px(fx, 9, 'K'); }
      if (expr === 's') { px(ex, 8, 'K'); px(ex + 1, 8, 'K'); px(fx, 8, 'K'); }
    }
    if (expr === 'h' || expr === 's') { if (who === 'chad') px(mx + 2, 10, 'S'); px(mx, my, sk); px(mx + 1, my, sk); }
    if (expr === 'h') { px(mx - 1, my, 'K'); px(mx, my, 'K'); px(mx + 1, my, 'K'); px(mx - 1, my + 1, 'K'); px(mx, my + 1, 'M'); px(mx + 1, my + 1, 'K'); }
    if (expr === 's') { px(mx, my + 1, 'M'); px(mx + 1, my + 1, 'M'); }
    return { rows: rows, w: W, h: 18 };
  }

  // ---------------------------------------------------------------- torso (shoulders row 18, hem row 30)
  var TORSO = [
    '.........KKKKKKKKKKKKKK',
    '........KvVVTTTTTTTTVVVK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KtTTTTTTTK',
    '...........KKKKKKKKKK'];
  // ---------------------------------------------------------------- arms (front arm, facing right)
  // a: [ax, ay] = map pixel placed on the front shoulder socket (canvas 21,20); back arm = mirrored + shaded
  var ARMS = {
    hang: { a: [1, 0], m: [
      'KVVVK',
      'KVVVK',
      'KkkkK',
      'KsSSK',
      'KsSSK',
      'KsSSK',
      'KsSSK',
      'KsSSK',
      'KsSSK',
      'KsSSK',
      'KsSSSK',
      'KsSSSK',
      '.KKKK'] },
    swing: { a: [1, 0], m: [
      'KVVVK',
      'KVVVVK',
      'KkkkkK',
      '.KsSSK',
      '.KsSSK',
      '..KsSSK',
      '..KsSSK',
      '...KsSSK',
      '...KsSSK',
      '...KsSSSK',
      '...KsSSSK',
      '....KKKK'] },
    up: { a: [1, 17], m: [
      '.....KKKK',
      '....KSSSSK',
      '....KSSSSK',
      '....KsSSSK',
      '...KsSSK',
      '...KsSSK',
      '..KsSSK',
      '..KsSSK',
      '..KsSSK',
      '.KsSSK',
      '.KkkkK',
      '.KVVVK',
      'KvVVVK',
      'KvVVK',
      'KvVVK',
      'KvVVK',
      'KVVVK',
      'KVVVK'] },
    pump: { a: [1, 10], m: [
      '....KKKK',
      '...KSSSSK',
      '...KSSSSK',
      '...KsSSSK',
      '...KsSSK',
      '...KsSSK',
      '...KsSSK',
      '...KsSSK',
      'KKKKsSSK',
      'KVVVKSSK',
      'KVVVKSSK',
      'KVVVKSSK',
      'KkkkSSSK',
      '.KKKKKK'] },
    aim: { a: [1, 10], m: [
      '....KKKK',
      '...KBBBbK',
      '...KBBbbK',
      '...KSbbSK',
      '...KsSSSK',
      '...KsSSK',
      '...KsSSK',
      '...KsSSK',
      'KKKKsSSK',
      'KVVVKSSK',
      'KVVVKSSK',
      'KVVVKSSK',
      'KkkkSSSK',
      '.KKKKKK'] },
    'throw': { a: [1, 10], m: [
      '.......KKK',
      '......KSSSK',
      '.....KSSSSK',
      '.....KsSSSK',
      '....KsSSSK',
      '....KsSSK',
      '...KsSSK',
      '..KkSSK',
      '.KkVsK',
      'KVkVK',
      'KVVVK',
      'KVVK',
      'KVVK',
      'KKK'] },
    cup: { a: [1, 8], m: [
      '.....KKKK',
      '..KKKRRQK',
      '.KrRRRRQK',
      '.KrRRRRK',
      '.KrKSSSK',
      '..KKsSSK',
      '...KsSSK',
      'KKKKsSSK',
      'KVVVKSSK',
      'KVVVKSSK',
      'KkkkkSSK',
      '.KKKKKK'] },
    hip: { a: [1, 0], m: [
      'KVVVK',
      'KVVVVK',
      'KkkkkK',
      '.KsSSK',
      '..KsSSK',
      '..KsSSK',
      '..KsSSK',
      '.KsSSK',
      'KsSSK',
      'KsSSK',
      '.KKK'] }
  };
  // ---------------------------------------------------------------- legs (shorts top row 30, feet row 51)
  var LEGS = {
    stand: [
      '..........KKKKKKKKKKKK',
      '..........KpPPPPPPPPPK',
      '..........KpPPPPPPPPPK',
      '..........KpPPPPPPPPPK',
      '..........KpPPPPPPPPPK',
      '..........KpPPPKKpPPPK',
      '..........KpPPPKKpPPPK',
      '..........KKKKKKKKKKKK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KsSSK..KsSSK',
      '..........KoooK..KoooK',
      '..........KOOOK..KOOOK',
      '..........KOOOOK.KOOOOK',
      '..........KOOOOOKKOOOOOK',
      '..........KOOOOOKKOOOOOK',
      '..........KoooooKKoooooK',
      '..........KKKKKKKKKKKKKK'],
    stride: [
      '..........KKKKKKKKKKKK',
      '..........KpPPPPPPPPPK',
      '..........KpPPPPPPPPPK',
      '.........KpPPPPPPPPPPK',
      '.........KpPPPPPPPPPPPK',
      '.........KpPPPKKKpPPPPK',
      '.........KpPPPK.KpPPPPK',
      '.........KKKKKK.KKKKKKK',
      '.........KsSSK...KsSSK',
      '.........KsSSK...KsSSK',
      '.........KsSSK...KsSSK',
      '........KsSSK....KsSSK',
      '........KsSSK.....KsSSK',
      '........KsSSK.....KsSSK',
      '.......KsSSK......KsSSK',
      '.......KsSSK......KsSSK',
      '.......KsSSK.......KsSSK',
      '.......KoooK.......KoooK',
      '.......KOOOK.......KOOOK',
      '.......KOOOOK......KOOOOK',
      '.......KOOOOOK.....KOOOOOK',
      '.......KOOOOOK.....KOOOOOK',
      '.......KoooooK.....KoooooK',
      '.......KKKKKKK.....KKKKKKK']
  };
  LEGS.walkA = LEGS.stride;

  // ---------------------------------------------------------------- poses
  // u: torso offset, h: head offset [x,y], f/b: front/back arm [name, dx, dy, mirror], l: legs, e: expression
  var POSES = {
    idle0: { l: 'stand', h: [6, 3], f: ['hang'], b: ['hang'], lg: [14, 21] },
    idle1: { l: 'stand', u: [0, 1], h: [6, 4], f: ['hang'], b: ['hang'], lg: [14, 22] },
    aim: { l: 'stride', h: [6, 3], f: ['aim', 0, 1], b: ['hang'], lg: [14, 21] },
    'throw': { l: 'stride', u: [1, 0], h: [8, 4], f: ['throw', -1, 2], b: ['swing'], lg: [15, 21], fb: 1 },
    recover: { l: 'stride', u: [0, 1], h: [7, 4], f: ['swing'], b: ['hang'], lg: [14, 22] },
    cheer0: { l: 'stand', h: [6, 3], f: ['up'], b: ['up'], lg: [14, 21], e: 'h', fb: 1 },
    cheer1: { l: 'stand', u: [0, 1], h: [6, 4], f: ['up'], b: ['hip'], lg: [14, 22], e: 'h', fb: 1 },
    drink0: { l: 'stand', h: [5, 2], f: ['cup'], b: ['hip'], lg: [14, 21], e: 'c' },
    drink1: { l: 'stand', h: [4, 2], f: ['cup', 0, -1], b: ['hip'], lg: [14, 21], e: 'c', tilt: 1 },
    sad: { l: 'stand', u: [0, 1], h: [8, 5], f: ['hang', 0, 2], b: ['hang', 0, 2], lg: [14, 22], e: 's' },
    walk0: { l: 'stride', h: [6, 3], f: ['swing'], b: ['swing'], lg: [14, 21] },
    walk1: { l: 'stand', u: [0, 1], h: [6, 4], f: ['hang'], b: ['hang'], lg: [14, 22] }
  };
  var FRAMES = { idle: ['idle0', 'idle1'], aim: ['aim'], 'throw': ['throw'], cheer: ['cheer0', 'cheer1'], drink: ['drink0', 'drink1'], sad: ['sad'], walk: ['walk0', 'walk1'] };
  var UY = -2; // body rows shifted up 2 to make room for 2 px longer legs

  var LOGOS = {
    W: ['Y...Y', 'Y.Y.Y', 'YYYYY', '.Y.Y.'],
    N8: ['YYY', 'Y.Y', 'YYY', 'Y.Y', 'YYY'],
    bolt: ['..YY', '.YY.', 'YYYY', '.YY.', 'YY..'],
    K: ['Y..Y', 'Y.Y.', 'YY..', 'Y.Y.', 'Y..Y']
  };
  var CHARS = {
    hero: { logo: 'W', pal: { S: 'skin', s: 'salmon', H: 'maroon', h: 'dbrown', C: 'red', c: 'dred', w: 'white', T: 'red', t: 'dred', V: 'red', v: 'dred', k: 'black', Y: 'white', P: 'tan', p: 'gold', O: 'white', o: 'red' } },
    chad: { logo: 'W', pal: { S: 'skin', s: 'salmon', H: 'maroon', h: 'dbrown', C: 'white', c: 'lgray', T: 'white', t: 'lgray', V: 'white', v: 'lgray', k: 'black', Y: 'red', P: 'red', p: 'dred', O: 'white', o: 'red' } },
    tank: { logo: 'N8', wide: 4, pal: { S: 'brown', s: 'maroon', H: 'dbrown', h: 'black', z: 'brown', T: 'green', t: 'dgreen', V: 'green', v: 'dgreen', k: 'black', Y: 'white', P: 'lgray', p: 'gray', O: 'white', o: 'gray', e: 'white' } },
    sky: { logo: 'bolt', pal: { S: 'skin', s: 'salmon', H: 'blue', h: 'navy', G: 'black', q: 'black', g: 'white', T: 'purple', t: 'dpurple', V: 'purple', v: 'dpurple', k: 'black', Y: 'gold', P: 'dgray', p: 'black', O: 'white', o: 'purple' } },
    brody: { logo: null, pal: { S: 'orange', s: 'brown', H: 'cream', h: 'gold', G: 'red', q: 'gold', g: 'white', T: 'cyan', t: 'blue', V: 'orange', v: 'brown', k: 'brown', Y: 'white', P: 'rose', p: 'dmagenta', O: 'orange', o: 'dbrown' } },
    kegmaster: { logo: 'K', wide: 4, belly: 1, pal: { S: 'skin', s: 'salmon', H: 'brown', h: 'maroon', D: 'brown', d: 'maroon', X: 'gold', x: 'orange', J: 'red', T: 'blue', t: 'dblue', V: 'blue', v: 'dblue', k: 'black', Y: 'gold', P: 'navy', p: 'black', O: 'white', o: 'gold' } }
  };
  var BASE = { K: 'black', E: 'black', e: 'white', M: 'maroon', B: 'white', b: 'lgray', R: 'red', r: 'white', Q: 'dred' };
  var DARKEN = { S: 'z', V: 'v', T: 't' };

  // ---------------------------------------------------------------- composition
  function Grid(w, h) { this.w = w; this.h = h; this.a = []; for (var i = 0; i < w * h; i++) this.a.push(''); }
  Grid.prototype.set = function (x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = c; };
  Grid.prototype.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.a[y * this.w + x] : ''; };
  function stamp(g, rows, ox, oy, mirror, remap) {
    var w = 0, y, x; for (y = 0; y < rows.length; y++) w = Math.max(w, rows[y].length);
    for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) {
      var c = rows[y].charAt(x); if (c === '.' || c === ' ') continue;
      if (remap && remap[c]) c = remap[c];
      g.set(ox + (mirror ? w - 1 - x : x), oy + y, c);
    }
  }
  // duplicate column `col` n times (n may vary per row via fn)
  function widen(g, col, nfn) {
    var mx = 0, y; for (y = 0; y < g.h; y++) mx = Math.max(mx, nfn(y));
    var o = new Grid(g.w + mx, g.h);
    for (y = 0; y < g.h; y++) {
      var n = nfn(y), x2 = 0;
      for (var x = 0; x < g.w; x++) { var c = g.get(x, y); o.set(x2++, y, c); if (x === col) for (var i = 0; i < n; i++) o.set(x2++, y, c); }
    }
    return o;
  }
  function over(dst, src, dx) { for (var y = 0; y < src.h; y++) for (var x = 0; x < src.w; x++) { var c = src.get(x, y); if (c) dst.set(x + (dx || 0), y, c); } }

  function armLayer(spec, front, W, ux, uy) {
    var g = new Grid(W, 52); if (!spec) return g;
    var A2 = ARMS[spec[0]] || ARMS.hang, m = A2.m, mw = 0;
    for (var i = 0; i < m.length; i++) mw = Math.max(mw, m[i].length);
    var mirror = front ? !!spec[3] : !spec[3];
    var ax = mirror ? mw - 1 - A2.a[0] : A2.a[0];
    var sx = front ? 21 : 10, sy = 20 + UY;
    stamp(g, m, sx - ax + (spec[1] || 0) + ux, sy - A2.a[1] + (spec[2] || 0) + uy, mirror, front ? null : DARKEN);
    return g;
  }

  function build(who, pk) {
    var ch = CHARS[who] || CHARS.chad, P = POSES[pk] || POSES.idle0, k = ch.wide || 0;
    var u = P.u || [0, 0], W = 32;
    var back = armLayer(P.b, false, W, u[0], u[1]), front = armLayer(P.f, true, W, u[0], u[1]);
    var legs = new Grid(W, 52); stamp(legs, LEGS[P.l] || LEGS.stand, 0, 30 + UY);
    var torso = new Grid(W, 52); stamp(torso, TORSO, u[0], 18 + UY + u[1]);
    var split = 15;
    if (k) {
      back = widen(back, split, function () { return k; });
      front = widen(front, split, function () { return k; });
      legs = widen(legs, split, function () { return k; });
      var bt = 18 + UY + u[1];
      torso = widen(torso, split + u[0], function (y) {
        if (!ch.belly) return k; var r = y - bt; return k + (r >= 6 && r <= 11 ? 2 : r === 5 || r === 12 ? 1 : 0);
      });
    }
    var GW = W + k, out = new Grid(GW, 52);
    over(out, back); over(out, legs); over(out, torso); if (P.fb) over(out, front);
    // head
    var hg = headGrid(who, P.e || 'n'), hx = P.h[0] + k - (hg.w - 20), hy = P.h[1] - 1;
    if (k) hx -= (k >> 1) - (hg.w - 20); // centre wider head on widened torso
    for (var y = 0; y < hg.h; y++) for (var x = 0; x < hg.w; x++) {
      var c = hg.rows[y][x]; if (c === '.') continue;
      out.set(hx + x + (P.tilt && y < 6 ? -1 : 0), hy + y, c);
    }
    if (!P.fb) over(out, front);
    return { g: out, k: k, logo: P.lg ? [P.lg[0] + (k >> 1) + (u[0] || 0), P.lg[1] + UY] : null };
  }

  function render(who, pk, mirror) {
    var ch = CHARS[who] || CHARS.chad, b = build(who, pk), g = b.g;
    var map = {}, key; for (key in BASE) map[key] = BASE[key]; for (key in ch.pal) map[key] = ch.pal[key]; if (!map.z) map.z = map.s;
    if (ch.logo && b.logo && LOGOS[ch.logo] && pk.indexOf('drink')) {
      var L = LOGOS[ch.logo], lw = L[0].length;
      var lx = mirror ? g.w - b.logo[0] - lw : b.logo[0];
      // stamp unmirrored after flip: pre-mirror the logo so the final image reads correctly
      for (var y = 0; y < L.length; y++) for (var x = 0; x < lw; x++) if (L[y].charAt(x) === 'Y') {
        var gx = mirror ? g.w - 1 - (lx + x) : lx + x; g.set(gx, b.logo[1] + y, 'Y');
      }
    }
    var cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h;
    var cx = cv.getContext('2d'), id = cx.createImageData(g.w, g.h), d = id.data;
    for (var yy = 0; yy < g.h; yy++) for (var xx = 0; xx < g.w; xx++) {
      var c = g.get(mirror ? g.w - 1 - xx : xx, yy); if (!c) continue;
      var hex = PAL[map[c]] || PAL.black, n = parseInt(hex.slice(1), 16), i = (yy * g.w + xx) * 4;
      d[i] = n >> 16 & 255; d[i + 1] = n >> 8 & 255; d[i + 2] = n & 255; d[i + 3] = 255;
    }
    cx.putImageData(id, 0, 0);
    return cv;
  }

  var cache = {};
  function sprite(who, pk, mirror) {
    var key = who + '|' + pk + '|' + (mirror ? 1 : 0);
    return cache[key] || (cache[key] = render(who, pk, mirror));
  }
  function prerender() { for (var w in CHARS) for (var p in POSES) { sprite(w, p, false); sprite(w, p, true); } }

  A.init = function () {
    var r = baseInit && baseInit.apply(A, arguments);
    try { prerender(); } catch (e) { if (window.console) console.warn('ArtChars.init', e); }
    return r;
  };
  var warned = false, last = {};
  A.drawPlayer = function (ctx, who, pose, x, feetY, t, flip) {
    if (!ctx) return 0;
    try {
      if (!CHARS[who]) who = who === 'p1' || who === 'player' ? 'hero' : 'chad';
      if (!FRAMES[pose]) pose = 'idle'; t = t | 0;
      // remember each on-screen player's last pose so a throw eases out through a 4-frame recovery
      var key = who + '|' + Math.round(x), st = last[key];
      if (!st || st.p !== pose) st = last[key] = { p: pose, t0: t, prev: st ? st.p : '' };
      var fr = FRAMES[pose], dt = t - st.t0;
      var f = fr.length > 1 ? fr[(pose === 'walk' ? t >> 3 : pose === 'cheer' ? t >> 4 : pose === 'drink' ? (t / 10 | 0) : t >> 5) & 1] : fr[0];
      if (st.prev === 'throw' && pose !== 'throw' && dt >= 0 && dt < 4) f = 'recover';
      var mirror = (who !== 'hero') !== !!flip, cv = sprite(who, f, mirror);
      ctx.drawImage(cv, Math.round(x) - (cv.width >> 1), Math.round(feetY) - 52);
    } catch (e) {
      if (!warned) { warned = true; if (window.console) console.warn('ArtChars', e); }
      if (baseDraw) return baseDraw(ctx, who, pose, x, feetY, t, flip);
    }
    return 0;
  };
  A.charSprite = sprite; // debug / tools
  A.CHAR_POSES = FRAMES;
})();
