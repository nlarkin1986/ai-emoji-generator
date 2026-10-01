/* ==========================================================================
   SUPER BEER PONG — game.js  (BP.Game)
   State machine, fixed-step main loop, 3D ball physics, CPU AI, scoring,
   HUD, every screen, attract mode, TV mode, pause, QA debug hooks.
   ========================================================================== */
;(function () {
  'use strict'
  var BP = (window.BP = window.BP || {})

  // ---------------------------------------------------------------- constants
  var W = 256, H = 240, STEP = 1000 / 60
  var TX0 = 32, TX1 = 224, TMID = 189, TZ = 14, FLOOR_H = -33
  var CUP_R = 4, RIM_H = 10, BALL_R = 2, GRAV = 0.1, TABLE_E = 0.68
  var HAND = [{ x: 28, y: 3, z: 0 }, { x: 228, y: 3, z: 0 }]
  var PX = [16, 240], FEET = 228
  var TWO_PI = Math.PI * 2

  // acc = Round 1 CPU make chance, acc2 = Round 2 (remixed: 10-cup racks, wind on rooftop + beach, faster meters)
  var STAGES = [
    { name: 'BACKYARD BASH', who: 'chad', cpu: 'CHAD', acc: 0.22, acc2: 0.5, aim: 12, pow: 6, bounce: 0, wind: false, band: 'dblue', stars: 1,
      taunt: ['NICE HAT, ROOKIE.', 'THIS IS MY YARD!'], taunt2: ['I PRACTICED, BRO.', 'REMATCH TIME!'] },
    { name: 'FRAT BASEMENT', who: 'tank', cpu: 'TANK', acc: 0.33, acc2: 0.57, aim: 16, pow: 8, bounce: 0.05, wind: false, band: 'dred', stars: 2,
      taunt: ['TANK NO MISS.', 'TANK ONLY DRINK.'], taunt2: ['TANK ANGRY NOW.', 'TANK SMASH CUPS.'] },
    { name: 'ROOFTOP', who: 'sky', cpu: 'SKY', acc: 0.42, acc2: 0.64, aim: 10, pow: 6, bounce: 0.08, wind: true, band: 'purple', stars: 3,
      taunt: ['FEEL THAT BREEZE?', 'THE WIND IS MINE.'], taunt2: ['STORM IS COMING.', 'HOLD ON TIGHT!'] },
    { name: 'BEACH BONFIRE', who: 'brody', cpu: 'BRO-DY', acc: 0.5, acc2: 0.7, aim: 12, pow: 6, bounce: 0.1, wind: false, band: 'dgreen', stars: 4,
      taunt: ["SURF'S UP, BRO.", 'CUPS GOING DOWN.'], taunt2: ['SEA BREEZE, BRO.', 'GOOD LUCK, HA!'] },
    { name: 'CHAMPIONSHIP', who: 'kegmaster', cpu: 'KEGMASTER', acc: 0.58, acc2: 0.77, aim: 16, pow: 8, bounce: 0.18, wind: false, band: 'dred', stars: 5,
      taunt: ['KNEEL BEFORE THE', 'KEGMASTER, PEON!'], taunt2: ['NO ONE BEATS ME', 'TWICE. NO ONE!'] },
  ]

  // ---------------------------------------------------------------- url flags
  var Q
  try { Q = new URLSearchParams(location.search) } catch (e) { Q = { has: function () { return false }, get: function () { return null } } }
  var FAST = Q.has('fast'), TVMODE = Q.has('tv')
  // QA hooks (autoplay / step / startAt ...) only exist with ?debug, ?test or ?seed
  var DEBUG = Q.has('debug') || Q.has('test') || Q.has('seed')
  var SEEDP = Q.get('seed')

  // ---------------------------------------------------------------- rng
  function mkRng(s) {
    var a = s >>> 0
    return function () {
      a = (a + 0x6d2b79f5) | 0
      var t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  var rnd = mkRng(SEEDP != null ? parseInt(SEEDP, 10) || 0 : (Date.now() ^ ((Math.random() * 1e9) | 0)) >>> 0)
  var vrnd = mkRng(12345) // visual-only randomness (particles) — never affects gameplay
  function rr(a, b) { return a + (b - a) * rnd() }
  function ri(n) { return (rnd() * n) | 0 }
  function gauss() { return (rnd() + rnd() + rnd() - 1.5) * 2 }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function R(v) { return Math.round(v) }
  function pad(n, l) { n = String(Math.max(0, Math.floor(n))); while (n.length < l) n = '0' + n; return n }

  // ---------------------------------------------------------------- module wrappers (never throw)
  var curMusic = null, curTempo = 1
  function sfx(n) { if (S && S.silent) return; try { BP.Audio && BP.Audio.sfx(n) } catch (e) {} }
  function music(n, force) {
    if (!force && n === curMusic) return
    curMusic = n
    try { BP.Audio && BP.Audio.music(n) } catch (e) {}
  }
  function tempo(m) { if (m === curTempo) return; curTempo = m; try { BP.Audio && BP.Audio.setTempo(m) } catch (e) {} }
  function rumble(ms) { try { BP.Input && BP.Input.rumble && BP.Input.rumble(ms) } catch (e) {} }

  // ---------------------------------------------------------------- input
  var virt = {}
  var BTNS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']
  function pr(b) { if (virt[b]) return true; try { return !!BP.Input.pressed(b) } catch (e) { return false } }
  function anyPr() {
    for (var k in virt) if (virt[k]) return true
    try { return !!BP.Input.anyPressed() } catch (e) { return false }
  }
  function tap() { return curTap }
  function readTap() {
    try { var p = BP.Input.pointer(); return p && p.tapped ? { x: p.x, y: p.y } : null } catch (e) { return null }
  }
  function inR(p, x, y, w, h) { return p && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h }
  function okPr() { return pr('a') || pr('start') }

  // ---------------------------------------------------------------- drawing helpers
  var ctx = null, canvas = null
  function PAL() { return (BP.Art && BP.Art.PAL) || {} }
  function col(c) { var p = PAL(); return p[c] || c }
  function rect(x, y, w, h, c) { ctx.fillStyle = col(c); ctx.fillRect(R(x), R(y), R(w), R(h)) }
  function T(s, x, y, c, sh) { return BP.Art.text(ctx, String(s), R(x), R(y), c || 'white', !!sh) || String(s).length * 8 }
  function TC(s, y, c, sh) { BP.Art.textCenter(ctx, String(s), R(y), c || 'white', !!sh) }
  function TR(s, xr, y, c, sh) { s = String(s); T(s, xr - s.length * 8, y, c, sh) }
  function BIG(s, cx, y, c, sc) {
    sc = sc || 2; s = String(s)
    BP.Art.bigText(ctx, s, R(cx - (s.length * 8 * sc) / 2), R(y), c || 'white', sc)
  }
  function box(x, y, w, h, st) { BP.Art.drawBox(ctx, R(x), R(y), R(w), R(h), st || 'default') }
  function sy(y, z) { return TMID - y + z * 0.5 }
  function blink(t, p) { return ((t / (p || 16)) | 0) % 2 === 0 }

  // ---------------------------------------------------------------- global state
  var S = null // current screen {name, t, ...}
  var fade = null // {phase:'out'|'in', t, fn}
  var FADE_T = FAST ? 4 : 12
  var frame = 0, ticks = 0
  var hi = 0
  var run = null // current tournament run
  var m = null // current match
  var paused = false, pauseSel = 0
  var errors = []
  var shotLog = []
  var cpuStats = {}
  var bot = { aimT: -1, powT: -1, plannedFor: null }

  function setState(name, data) {
    S = { name: name, t: 0 }
    if (data) for (var k in data) S[k] = data[k]
    var st = STATES[name]
    if (st && st.enter) st.enter()
  }
  // Screen transitions never get dropped: during a fade-out the newest target wins, during a fade-in the
  // request is queued and starts as soon as the fade-in ends.
  var pendingGo = null
  function go(name, data) {
    var fn = function () { setState(name, data) }
    if (fade) {
      if (fade.phase === 'out') fade.fn = fn
      else pendingGo = { name: name, data: data }
      return
    }
    fade = { phase: 'out', t: 0, fn: fn }
  }
  // Watchdog: maximum idle time (no input) per non-gameplay screen before it escapes on its own.
  var lastInput = 0, lastTapTick = -999, curTap = null
  var WATCHDOG = { vs: 20, clear: 45, gameover: 40, scores: 90, howto: 120, ending: 150 }
  function watchdog() {
    if (!S || fade) return
    var lim = WATCHDOG[S.name]
    if (lim && S.t > 60 * lim && ticks - lastInput > 60 * lim) {
      logNote('watchdog: ' + S.name)
      if (S.name === 'vs') startStage()
      else if (S.name === 'clear') nextStage()
      else if (S.name === 'gameover') go('entry')
      else if (S.name === 'ending') continueGauntlet()
      else go('title')
    }
    // name entry: a submit that never answers falls back to the local board
    if (S.name === 'entry' && S.sent && S.t - S.sentT > 60 * 7 && S.finish) S.finish(null)
  }
  function logNote(n) { notes.push(n); if (notes.length > 20) notes.shift() }
  var notes = []
  // Shared NES menu tap semantics: tap a non-selected row = move the cursor there; tap the selected row
  // (or anywhere else) = confirm. Returns {move:i} | {confirm:true} | null.
  function menuTap(p, rows, cur) {
    if (!p) return null
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      if (inR(p, r[0], r[1], r[2], r[3])) return i === cur ? { confirm: true } : { move: i }
    }
    return { confirm: true }
  }
  function isTouch() { try { return BP.Input.device && BP.Input.device() === 'touch' } catch (e) { return false } }

  function refreshHi() {
    try {
      Promise.resolve(BP.Scores.best()).then(function (v) { v = +v || 0; if (v > hi) hi = v }, function () {})
    } catch (e) {}
  }

  // ======================================================================== RACKS
  function buildRack(side, rows) {
    var cups = [], dir = side === 1 ? -1 : 1, backX = side === 1 ? 214 : 42 // inset so the oblique projection keeps every cup on the table
    for (var r = 0; r < rows; r++) {
      var n = rows - r
      for (var i = 0; i < n; i++) {
        cups.push({ x: backX + dir * r * 9, z: (i - (n - 1) / 2) * 8, alive: true, hitT: 99 }) // rows 9 px apart: readable columns in the side view
      }
    }
    return cups
  }
  function alive(side) {
    var n = 0, c = m.sides[side].cups
    for (var i = 0; i < c.length; i++) if (c[i].alive) n++
    return n
  }
  function aliveCups(side) { return m.sides[side].cups.filter(function (c) { return c.alive }) }
  function hasNeighbor(c, side) {
    var cs = m.sides[side].cups
    for (var i = 0; i < cs.length; i++) {
      var o = cs[i]
      if (o === c || !o.alive) continue
      if (Math.hypot(o.x - c.x, o.z - c.z) < 10.5) return true
    }
    return false
  }
  function nearestAlive(c, side) {
    var best = null, bd = 1e9, cs = m.sides[side].cups
    for (var i = 0; i < cs.length; i++) {
      var o = cs[i]
      if (o === c || !o.alive) continue
      var d = Math.hypot(o.x - c.x, o.z - c.z)
      if (d < bd) { bd = d; best = o }
    }
    return best
  }

  // ======================================================================== PHYSICS
  function onTable(x, z) { return x >= TX0 && x <= TX1 && z >= -TZ - 1 && z <= TZ + 1 }

  // Pure trajectory sim (no cups) used by the launch solver.
  function simLand(p0, v0, needBounce, wind) {
    var x = p0.x, y = p0.y, z = p0.z, vx = v0.x, vy = v0.y, vz = v0.z, bounced = false
    for (var i = 0; i < 400; i++) {
      vy -= GRAV
      if (wind) { vx += wind.ax; vz += wind.az }
      x += vx; y += vy; z += vz
      if (y < BALL_R && vy < 0 && onTable(x, z)) {
        if (bounced) return { x: x, z: z, ok: false }
        y = BALL_R; vy = -vy * TABLE_E; vx *= 0.88; vz *= 0.88; bounced = true
        continue
      }
      if (vy < 0 && y <= RIM_H && (bounced || !needBounce)) return { x: x, z: z, ok: true, n: i + 1 }
      if (y < FLOOR_H) return { x: x, z: z, ok: false }
    }
    return { x: x, z: z, ok: false }
  }
  function directV(p0, tx, ty, tz, n) {
    return { x: (tx - p0.x) / n, y: (ty - p0.y + (GRAV * n * (n + 1)) / 2) / n, z: (tz - p0.z) / n }
  }
  // Returns launch velocity to land at (tx,tz) at rim height (optionally via a table bounce).
  function solveLaunch(side, tx, tz, bounce, wind, fastArc) {
    var p0 = HAND[side], dist = Math.abs(tx - p0.x)
    if (!bounce) {
      var n = clamp(Math.round((fastArc ? 22 : 30) + dist * (fastArc ? 0.14 : 0.18)), 30, 80)
      var ax = tx, az = tz, v = directV(p0, ax, RIM_H, az, n)
      if (wind && (wind.ax || wind.az)) {
        for (var it = 0; it < 6; it++) {
          var L = simLand(p0, v, false, wind)
          ax += tx - L.x; az += tz - L.z
          v = directV(p0, ax, RIM_H, az, n)
        }
      }
      return v
    }
    var dir = side === 0 ? 1 : -1
    var bx = tx - dir * 50, bz = p0.z + (tz - p0.z) * 0.7, vb = null
    for (var k = 0; k < 14; k++) {
      vb = directV(p0, bx, BALL_R, bz, 60)
      var L2 = simLand(p0, vb, true, wind)
      if (!L2.ok) { bx -= dir * 6; continue }
      bx += (tx - L2.x) * 0.9; bz += (tz - L2.z) * 0.9
      bx = clamp(bx, TX0 + 10, TX1 - 10); bz = clamp(bz, -TZ + 1, TZ - 1)
    }
    return vb
  }

  function launch(side, tx, tz, bounce, comp) {
    var v = solveLaunch(side, tx, tz, bounce, comp ? m.wind : null, side === 1 || (m.demo && side === 0))
    var p = HAND[side]
    m.ball = {
      x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, side: side,
      rim: 0, bounces: 0, floor: 0, floorT: 0, rolling: false, t: 0, lastRim: -99, bshot: bounce,
      fire: (side === 0 && !m.demo && run && run.streak >= 3) || (side === 1 && !!(m.plan && m.plan.fire)), tx: tx, tz: tz,
    }
    m.trail = []
    shotLog.push({ side: side, tx: +tx.toFixed(2), tz: +tz.toFixed(2), bounce: !!bounce, v: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] })
    if (shotLog.length > 50) shotLog.shift()
    sfx('throw')
    sfx('whoosh')
  }

  function stepBall() {
    var b = m.ball, tgt = 1 - b.side
    b.t++
    var preY = b.y
    b.vy -= GRAV
    if (m.wind.s) { b.vx += m.wind.ax; b.vz += m.wind.az }
    var SUB = 4
    for (var s = 0; s < SUB; s++) {
      b.x += b.vx / SUB; b.y += b.vy / SUB; b.z += b.vz / SUB
      // ---- cups of the target rack
      var cs = m.sides[tgt].cups
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i]
        if (!c.alive) continue
        var dx = b.x - c.x, dz = b.z - c.z, d = Math.sqrt(dx * dx + dz * dz)
        if (d > CUP_R + BALL_R + 1) continue
        // a ball only counts once it entered the rim circle from ABOVE the rim (never through the side wall)
        if (d < CUP_R && b.y >= RIM_H - 1) b.enter = c
        if (d < CUP_R && b.y < RIM_H - 1.5 && b.y > 0 && b.enter === c) { resolveSink(c); return }
        // cup side wall (below the rim): solid from the outside
        if (b.y < RIM_H - 1 && b.y > -1 && b.enter !== c && d < CUP_R + BALL_R) {
          var wx = d > 1e-4 ? dx / d : 1, wz = d > 1e-4 ? dz / d : 0
          var vw = b.vx * wx + b.vz * wz
          if (vw < 0) { b.vx -= 1.4 * vw * wx; b.vz -= 1.4 * vw * wz; sfx('rim') }
          b.x = c.x + wx * (CUP_R + BALL_R); b.z = c.z + wz * (CUP_R + BALL_R)
          continue
        }
        if (b.y > RIM_H - 4 && b.y < RIM_H + 4) {
          if (d < 1e-4) continue
          var nx = dx / d, nz = dz / d
          var rx = c.x + nx * CUP_R, rz = c.z + nz * CUP_R
          var ex = b.x - rx, ey = b.y - RIM_H, ez = b.z - rz
          var dist = Math.sqrt(ex * ex + ey * ey + ez * ez)
          if (dist < BALL_R && dist > 1e-4) {
            var ux = ex / dist, uy = ey / dist, uz = ez / dist
            var vn = b.vx * ux + b.vy * uy + b.vz * uz
            if (vn < 0) {
              b.vx -= 1.45 * vn * ux; b.vy -= 1.45 * vn * uy; b.vz -= 1.45 * vn * uz
              b.vx *= 0.9; b.vz *= 0.9
              if (d < CUP_R) {
                var k = rnd() < 0.6 ? -0.16 : 0.12 // rattle in vs spin out
                b.vx += nx * k; b.vz += nz * k
              }
              b.rim++
              if (b.t - b.lastRim > 5) { sfx('rim'); b.lastRim = b.t; m.shake = Math.max(m.shake, 3) }
            }
            b.x = rx + ux * BALL_R; b.y = RIM_H + uy * BALL_R; b.z = rz + uz * BALL_R
          }
        }
      }
      // ---- table
      if (b.y < BALL_R && b.y > -5 && b.vy < 0 && onTable(b.x, b.z)) {
        b.y = BALL_R
        if (b.vy < -0.4) {
          b.vy = -b.vy * TABLE_E; b.vx *= 0.88; b.vz *= 0.88
          b.bounces++
          sfx('bounce')
          if (b.bshot && b.bounces === 1) { b.vz += gauss() * 0.07; b.vx += gauss() * 0.06 }
          puff(ox(b.x, b.z), sy(0, b.z), 'white', 3)
        } else { b.vy = 0; if (!b.rolling) b.rollT = b.t; b.rolling = true }
      }
      // ---- floor
      if (b.y < FLOOR_H + BALL_R && b.vy < 0) {
        b.y = FLOOR_H + BALL_R
        if (b.vy < -0.5) sfx('floor')
        b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8
        if (!b.floor) b.floorT = b.t
        b.floor++
      }
    }
    if (b.rolling && b.y <= BALL_R + 0.01 && onTable(b.x, b.z)) { b.vx *= 0.97; b.vz *= 0.97 }
    if (!b.cross && preY >= RIM_H && b.y < RIM_H) b.cross = { x: b.x, z: b.z } // for the miss explanation
    // trail (screen space, oblique projection)
    if (b.t % 2 === 0) { m.trail.push({ x: ox(b.x, b.z), y: sy(b.y, b.z), t: b.t }); if (m.trail.length > 40) m.trail.shift() }
    // ---- out / failsafe
    var speed = Math.abs(b.vx) + Math.abs(b.vz) + Math.abs(b.vy)
    if (b.t > 240 || b.rim > 14) {
      // failsafe: a ball balanced on / circling a rim drops in, anything else is a miss
      var tc = m.sides[tgt].cups
      for (var q = 0; q < tc.length; q++) if (tc[q].alive && b.enter === tc[q] && Math.hypot(b.x - tc[q].x, b.z - tc[q].z) < CUP_R && b.y > 0 && b.y < RIM_H + 3) { resolveSink(tc[q]); return }
      resolveMiss(); return
    }
    // a ball that has dropped below the table edge is a miss: resolve now, let a visual-only "dead ball" keep falling
    if (b.y < -6 && !onTable(b.x, b.z) && b.vy < 0) { m.dead = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, t: 0, fire: b.fire }; resolveMiss(); return }
    if ((b.floor && b.t - b.floorT > (b.side === 1 ? 8 : 16)) || b.floor >= 3 || b.x < -10 || b.x > 266 ||
        (b.rolling && (speed < 0.08 || b.t - b.rollT > 24))) resolveMiss()
  }

  // ======================================================================== FX
  function rr2(a, b) { return a + (b - a) * vrnd() }
  function part(x, y, vx, vy, c, life, g) { if (m.parts.length < 160) m.parts.push({ x: x, y: y, vx: vx, vy: vy, c: c, life: life, g: g == null ? 0.12 : g }) }
  function puff(x, y, c, n) { for (var i = 0; i < n; i++) part(x, y, rr2(-0.8, 0.8), rr2(-1, -0.2), c, 10 + ((vrnd() * 6) | 0), 0.08) }
  function splash(x, y, big) {
    var n = big ? 22 : 14
    for (var i = 0; i < n; i++) part(x, y - 2, rr2(-1.4, 1.4), rr2(-2.6, -0.6), vrnd() < 0.7 ? 'beer' : 'white', 18 + ((vrnd() * 14) | 0))
  }
  function callouts(list) {
    var l = list.map(function (c, i) { return { text: c[0], c: c[1] || 'white', t: 0, p: PRI[c[0]] || 20, i: i } })
    l.sort(function (a, b) { return b.p - a.p || a.i - b.i })
    m.calls = l
  }
  function ox(x, z) { return x + z * 0.5 } // oblique side-view projection: deeper cups shift left, nearer right
  function popup(x, y, txt, c) { m.pops.push({ x: x, y: y, text: txt, c: c || 'yellow', t: 0 }) }
  function setPose(side, p, dur, delay) { m.poses[side] = { p: p, t: dur || 0, delay: delay || 0 } }

  // ======================================================================== RUN / MATCH SETUP
  function newRun() {
    run = { score: 0, disp: 0, stage: 0, loop: 0, buzz: 0, streak: 0, shots: 0, makes: 0, cups: 0, stShots: 0, stMakes: 0,
      hints: 0, best: 0, cpuShots: 0, cpuMakes: 0, t0: Date.now(), tick0: ticks }
  }
  // Score multiplier = round number (R1 x1, R2 x2, gauntlet R3 x3, R4 x4 ...)
  function roundMult() { return run ? run.loop + 1 : 1 }
  function cpuAcc(stg, loop) {
    if (loop >= 2) return Math.min(0.9, 0.8 + 0.02 * (loop - 2) + 0.01 * stg) // CHAMPION'S GAUNTLET: max skill
    return Math.min(0.78, loop > 0 ? STAGES[stg].acc2 : STAGES[stg].acc)
  }
  function windOn() { return !!(m && (m.st.wind || (m.loop > 0 && m.stage === 3))) }

  function newMatch(demo, stg, loop) {
    var st = STAGES[stg]
    var n = stg === 4 || loop > 0 ? 10 : 6
    var rows = n === 10 ? 4 : 3
    m = {
      demo: demo, stage: stg, loop: loop, st: st,
      sides: [{ who: 'hero', name: 'YOU', cups: buildRack(0, rows), form: n }, { who: st.who, name: st.cpu, cups: buildRack(1, rows), form: n }],
      turn: 0, balls: 2, made: 0, phase: 'ready', pt: 0, ball: null, trail: [],
      aim: null, pow: null, plan: null, lockAim: null, lockPow: 0, bounce: false,
      wind: { ax: 0, az: 0, s: 0, ang: 0 }, overtime: false, redemption: false, redUsed: false,
      calls: [], pops: [], parts: [], shake: 0, hitstop: 0, excite: 0.2, over: null, endT: 0,
      poses: [{ p: 'idle', t: 0, delay: 0 }, { p: 'idle', t: 0, delay: 0 }],
      ctrl: demo ? ['cpu', 'cpu'] : ['human', 'cpu'],
      lost: 0, banner: '', bannerC: 'white', lastSank: false, ballsBack: false, resT: 40, windParts: [],
      cpuStreak: 0, kegP2: false, flash: 0, speech: null, smoke: [], tankJolt: false, missX: null, bbUsed: false, chirp: null,
    }
    if (n === 10) { m.sides[0].form = 10; m.sides[1].form = 10 }
    tempo(1)
    if (!demo) music('stage' + stg, true)
    m.phase = 'ready'; m.pt = 0
  }

  function rollWind() {
    if (!windOn()) { m.wind = { ax: 0, az: 0, s: 0, ang: 0 }; return }
    var s = m.loop > 0 && m.stage === 2 ? 2 + ri(2) : 1 + ri(3) // rooftop is always breezy, a gale in Round 2
    var a = ri(8) * (TWO_PI / 8)
    var k = 0.0011 * s
    m.wind = { ax: Math.cos(a) * k, az: Math.sin(a) * k, s: s, ang: a }
  }

  function rerackCheck() {
    for (var sd = 0; sd < 2; sd++) {
      var n = alive(sd), f = m.sides[sd].form
      if ((n === 3 && f > 3) || (n === 6 && f > 6)) {
        m.sides[sd].cups = buildRack(sd, n === 3 ? 2 : 3)
        m.sides[sd].form = n
        callouts([['RE-RACK!', 'cyan']])
        sfx('rerack')
        return true
      }
    }
    return false
  }

  function startTurn(side) {
    m.turn = side
    m.ff = false
    m.bbUsed = false
    m.missX = null
    m.balls = m.redemption ? 1 : 2
    m.made = 0
    m.ballsBack = false
    rerackCheck()
    rollWind()
    m.phase = 'banner'; m.pt = 0
    if (m.redemption) { m.banner = 'REDEMPTION!'; m.bannerC = 'gold' }
    else if (m.overtime && m.otBanner) { m.banner = 'OVERTIME!'; m.bannerC = 'orange'; m.otBanner = false }
    else if (side === 0) { m.banner = m.demo ? 'HERO TURN' : 'YOUR TURN'; m.bannerC = 'white' }
    else { m.banner = m.sides[1].name + "'S TURN"; m.bannerC = 'red' }
    var last = alive(0) === 1 || alive(1) === 1
    tempo(last ? 1.25 : 1)
  }

  function beginThrow() {
    m.phase = 'aim'; m.pt = 0
    m.bounce = false
    m.lockAim = null
    m.ball = null
    m.calls = [] // no stale MISS / SPIN OUT boxes over the next aim
    m.missX = null
    m.chirp = null
    var side = m.turn
    if (m.ctrl[side] === 'human' && m.st.who === 'chad' && !m.demo && rnd() < 0.3) { var ch = LINES.chad.chirp; m.chirp = { text: 'CHAD: ' + ch[ri(ch.length)], t: 0 } }
    setPose(side, 'aim', 0)
    setupAim(side)
    if (m.ctrl[side] === 'human' && m.tankJolt) { m.aim.wob += 2.5; m.tankJolt = false }
    setupPow()
    if (m.ctrl[side] === 'cpu') m.plan = cpuPlan(side)
    else m.plan = null
    bot.aimT = -1; bot.powT = -1
  }

  // ---------------------------------------------------------------- aim + power models
  function speedMul() {
    if (!run) return 1
    var s = (0.84 + 0.09 * m.stage) * (m.loop > 0 ? 1.18 : 1) * (1 + 0.12 * run.buzz)
    if (run.streak >= 3) s *= 0.7
    if (m.kegP2) s *= 1.15
    return s
  }
  function setupAim(side) {
    var cs = aliveCups(1 - side)
    var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
    cs.forEach(function (c) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z) })
    if (!cs.length) { x0 = x1 = side === 0 ? 211 : 45; z0 = z1 = 0 }
    var sm = m.ctrl[side] === 'human' ? speedMul() : 1
    m.aim = {
      cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
      ax: Math.min(17, Math.max(9, (x1 - x0) / 2 + 5)), az: Math.max(10, (z1 - z0) / 2 + 5),
      wx: (TWO_PI / 124) * sm, wz: (TWO_PI / 86) * sm,
      px: rnd() * TWO_PI, pz: rnd() * TWO_PI,
      wob: m.ctrl[side] === 'human' && run ? run.buzz * 0.75 : 0,
    }
  }
  function aimPos(t) {
    var a = m.aim
    return {
      x: a.cx + a.ax * Math.sin(a.wx * t + a.px) + a.wob * Math.sin(t * 0.13 + 1.3) * (1 + 0.5 * Math.sin(t * 0.031)),
      z: a.cz + a.az * Math.sin(a.wz * t + a.pz) + a.wob * Math.sin(t * 0.171) * (1 + 0.5 * Math.cos(t * 0.027)),
    }
  }
  function setupPow() {
    // stage 1 is forgiving (wide green zone, slower bar); it tightens every stage and again in Round 2
    var sm = 0.92 + 0.06 * m.stage + (m.loop > 0 ? 0.2 : 0) + (m.loop > 1 ? 0.05 * (m.loop - 1) : 0) + (m.kegP2 ? 0.15 : 0)
    m.pow = { period: Math.round(58 / sm), sc: 0.66, bw: Math.max(0.04, 0.088 - 0.007 * m.stage - (m.loop > 0 ? 0.012 : 0)) }
  }
  function powVal(t) {
    var p = m.pow.period, u = (t % p) / p
    return u < 0.5 ? u * 2 : 2 - u * 2
  }
  function powErr(v) {
    var dp = v - m.pow.sc, bw = m.pow.bw, a = Math.abs(dp)
    return a <= bw ? dp * 12 : (dp < 0 ? -1 : 1) * (bw * 12 + (a - bw) * 58)
  }

  // Opponent personality: one-line speech (Punch-Out style) + per-stage gimmicks
  var LINES = {
    chad: { make: ['TOO EASY, BRO!', 'CHAD NEVER MISSES!', 'DRINK UP, ROOKIE!'], miss: ['WIND. TOTALLY WIND.', 'THAT WAS A WARMUP.', 'THE CUP MOVED!'],
      fire: ['DUDE... CHILL.'], chirp: ['AIRBALL!', 'CHOKE!', 'BRICK!', 'NO CHANCE!', 'YOU WISH!'] },
    tank: { make: ['TANK SMASH!', 'TABLE GO BOOM!'], miss: ['TANK... SAD.', 'BALL TOO SMALL.'], fire: ['TANK SCARED NOW.'] },
    sky: { make: ['RIDE THE BREEZE.', 'THE WIND SAYS HI.'], miss: ['GUST. NOT ME.', 'ROOKIE WIND.'], fire: ['NOT BAD... FOR YOU.'] },
    brody: { make: ['GNARLY, BRO!', 'TOTALLY TUBULAR!'], miss: ['WIPEOUT, BRO.', 'SMOKE IN MY EYES!'], fire: ["BRO, YOU'RE ON FIRE!"] },
    kegmaster: { make: ['AS I CALLED IT!', 'BOW, PEON!'], miss: ['IMPOSSIBLE!', 'THE KEG BETRAYED ME!'], fire: ['THIS CHANGES NOTHING!'], p2: ['NOW I AM ANGRY!'] },
  }
  function say(kind, chance) {
    if (m.demo) return
    var L = LINES[m.st.who], arr = L && L[kind]
    if (!arr || rnd() >= (chance == null ? 1 : chance)) return
    m.speech = { who: m.st.who, name: m.st.cpu, text: arr[ri(arr.length)], t: 0 }
  }
  function cpuFireOK() { return m.stage >= 2 || m.loop >= 1 }
  function cupName(c, side) { // KEGMASTER calls his shot
    var cs = aliveCups(1 - side), dir = side === 0 ? 1 : -1
    var front = cs.reduce(function (a, o) { return (o.x * dir < a.x * dir) ? o : a }, cs[0])
    var back = cs.reduce(function (a, o) { return (o.x * dir > a.x * dir) ? o : a }, cs[0])
    if (cs.length === 1) return 'LAST CUP'
    if (c === front && Math.abs(c.z) < 2) return 'HEAD CUP'
    if (Math.abs(c.x - back.x) < 1 && Math.abs(c.z) >= Math.max.apply(null, cs.map(function (o) { return Math.abs(o.z) })) - 0.5) return 'CORNER CUP'
    return Math.abs(c.z) < 2 ? 'MIDDLE CUP' : 'SIDE CUP'
  }
  // Power sweet spot depends on the target's distance: front cups low, back cups high (+ small jitter)
  function sweetFor(side, x) {
    var dist = Math.abs(x - HAND[side].x)
    m.pow.sc = clamp(0.45 + clamp((dist - 158) / 30, 0, 1) * 0.33 + rr(-0.035, 0.035), m.pow.bw + 0.04, 0.96 - m.pow.bw)
  }

  function cpuPlan(side) {
    var st = m.st
    var acc = side === 0 ? 0.45 : cpuAcc(m.stage, m.loop)
    var fire = side === 1 && m.cpuStreak >= 3
    if (fire) acc = Math.min(0.92, acc + 0.12)
    var cs = aliveCups(1 - side)
    var c = cs[ri(cs.length)]
    var bounce = st.bounce > 0 && cs.length >= 2 && rnd() < st.bounce
    var make = rnd() < acc
    var tx = c.x, tz = c.z, dirX = side === 0 ? 1 : -1, longShort = 0
    if (make) { tx += gauss() * 0.25; tz += gauss() * 0.25 }
    else {
      var minD = rnd() < 0.7 ? 6.6 : 5.2 // mostly clean misses, sometimes a rim scare
      var found = false
      for (var k = 0; k < 30 && !found; k++) {
        var along = rnd() < 0.65
        var dd = rr(minD, 12)
        var sgn = along ? (rnd() < 0.72 ? 1 : -1) * dirX : rnd() < 0.5 ? -1 : 1 // misses are mostly long
        var cx = c.x + (along ? sgn * dd : gauss() * 2), cz = c.z + (along ? gauss() * 2 : sgn * dd)
        var ok = true
        for (var j = 0; j < cs.length; j++) if (Math.hypot(cs[j].x - cx, cs[j].z - cz) < minD) { ok = false; break }
        if (ok) { tx = cx; tz = cz; longShort = along ? sgn * dirX : 0; found = true }
      }
      if (!found) { // guaranteed clean miss: long, past the back row
        var bx = cs.reduce(function (a, o) { return dirX > 0 ? Math.max(a, o.x) : Math.min(a, o.x) }, c.x)
        tx = bx + dirX * rr(8, 11); tz = clamp(c.z + gauss() * 3, -TZ, TZ); longShort = 1
      }
    }
    sweetFor(side, tx)
    var pv = m.pow.sc + (make ? rr(-0.6, 0.6) * m.pow.bw : longShort > 0 ? m.pow.bw + rr(0.05, 0.2) : longShort < 0 ? -m.pow.bw - rr(0.05, 0.25) : rr(-0.8, 0.8) * m.pow.bw)
    // crosshair shows the point the CPU aims at (upwind compensation visible)
    var ax = tx - m.wind.ax * 1600, az = tz - m.wind.az * 1600
    var at = st.aim + ri(8)
    if (side === 0) at = 30 + ri(10)
    if (fire) at = Math.round(at * 0.6)
    var call = side === 1 && st.who === 'kegmaster' ? cupName(c, side) + '!' : null
    if (call) at += 24 // he takes a beat to call it
    var start = aimPos(0)
    return { make: make, tx: tx, tz: tz, ax: ax, az: az, sx: start.x, sz: start.z, pv: clamp(pv, 0.04, 0.98), bounce: bounce, aimT: at, powT: (side === 0 ? 14 : st.pow), call: call, fire: fire }
  }

  // ======================================================================== RESOLUTION
  // Callout priority: big moments first (shown big), shot type second (small)
  var PRI = { 'YOU WIN!': 100, 'GAME OVER': 100, 'REDEMPTION!': 99, 'OVERTIME!': 99, 'HERO WINS!': 98, 'ON FIRE!': 90, "HE'S ON FIRE!": 90,
    'BALLS BACK!': 85, 'HEATING UP!': 80, 'LAST CUP!': 75, "HE'S MAD!": 74, 'ISLAND!': 60, '2 CUPS!': 55, 'BOUNCE!': 50, 'SWISH!': 40,
    'LUCKY BOUNCE!': 30, 'RATTLED IN!': 30, 'FIRE OUT': 15 }
  function resolveSink(c) {
    var b = m.ball, side = b.side, vic = 1 - side
    if (shotLog.length) shotLog[shotLog.length - 1].res = 'sink r' + b.rim + ' b' + b.bounces
    if (side === 1 && m.plan) { var ks = m.plan.make + '>sink' + (b.bounces ? 'B' : b.rim ? 'R' : ''); cpuStats[ks] = (cpuStats[ks] || 0) + 1 }
    var island = !hasNeighbor(c, vic) && alive(vic) > 1
    var bounced = b.bounces > 0
    var declared = bounced && b.bshot // a called BOUNCE shot (B) takes 2 cups; accidental bounces only 1
    var clean = b.rim === 0 && !bounced
    c.alive = false; c.hitT = 0
    var removed = 1, extra = null
    if (declared) { extra = nearestAlive(c, vic); if (extra) { extra.alive = false; extra.hitT = -8; removed = 2 } }
    var cx = ox(c.x, c.z), cyy = sy(0, c.z)
    m.ball = null
    m.missX = null
    m.lastSank = true
    m.made++
    m.balls--
    m.hitstop = 7
    m.shake = bounced ? 10 : 7
    m.excite = 1
    splash(cx, cyy - 10, bounced)
    sfx('sink'); sfx('splash'); sfx('cheer')
    rumble(bounced ? 90 : 50)
    setPose(side, 'cheer', 70)
    setPose(vic, 'drink', 70, 22)
    var calls = []
    var human = m.ctrl[side] === 'human'
    if (clean) calls.push(['SWISH!', 'white'])
    else if (declared) { calls.push(['BOUNCE!', 'gold']); if (removed > 1) calls.push(['2 CUPS!', 'gold']) }
    else if (bounced) calls.push(['LUCKY BOUNCE!', 'gold'])
    else calls.push(['RATTLED IN!', 'gold'])
    if (human) {
      var mult = run.streak >= 3 ? 3 : run.streak === 2 ? 2 : 1
      var rm = roundMult()
      var pts = 100 * mult * removed
      if (clean) { pts += 50; sfx('swish') }
      else if (declared) pts += 200
      else pts += 25
      if (island) { pts += 250; calls.push(['ISLAND!', 'white']) }
      pts *= rm
      run.score += pts
      run.makes++; run.stMakes++
      run.cups += removed
      popup(cx, cyy - 22, '+' + pts, mult > 1 ? 'orange' : 'gold')
      run.streak++
      if (run.streak === 2) { calls.push(['HEATING UP!', 'orange']); sfx('heatingUp') }
      if (run.streak === 3) {
        calls.push(['ON FIRE!', 'red']); sfx('onFire'); sfx('crowdYeah'); music('fire')
        m.flash = 2; m.shake = 12
        say('fire')
      }
    } else if (!m.demo) {
      if (side === 1 && cpuFireOK()) {
        m.cpuStreak++
        if (m.cpuStreak === 2) calls.push(['HEATING UP!', 'orange'])
        if (m.cpuStreak === 3) { calls.push(["HE'S ON FIRE!", 'red']); sfx('onFire'); m.flash = 2; m.shake = 12 }
      }
      if (vic === 0) {
        run.cpuMakes++
        run.buzz = Math.min(5, run.buzz + removed)
        m.lost += removed
        sfx('drink')
        if (m.st.who === 'tank') { m.shake = 16; m.tankJolt = true } // TANK: the whole table shakes, your next aim wobbles
        say('make', 0.7)
      }
    }
    var left = alive(vic)
    // ---- match-ending checks
    if (left === 0) {
      if (m.demo) { m.over = 'demo'; calls.unshift([side === 0 ? 'HERO WINS!' : 'CPU WINS!', 'gold']); return finishResolve(calls, 150) }
      if (side === 0) {
        if (m.redemption) {
          m.redemption = false; m.redUsed = true; m.overtime = true; m.otBanner = true
          run.score += 2000 * roundMult()
          popup(128, 120, '+' + 2000 * roundMult(), 'gold')
          calls.unshift(['OVERTIME!', 'orange'])
          sfx('redemption'); sfx('crowdYeah')
          m.pendingOT = true
          return finishResolve(calls, 110)
        }
        m.over = 'win'
        calls.unshift(['YOU WIN!', 'gold'])
        sfx('win'); sfx('crowdYeah'); music(null)
        setPose(0, 'cheer', 999); setPose(1, 'sad', 999, 24)
        return finishResolve(calls, 150)
      } else {
        if (!m.overtime && !m.redUsed) {
          m.redemption = true
          calls.unshift(['REDEMPTION!', 'gold'])
          sfx('redemption')
          m.pendingRed = true
          return finishResolve(calls, 110)
        }
        m.over = 'lose'
        calls.unshift(['GAME OVER', 'red'])
        sfx('lose'); music(null)
        setPose(1, 'cheer', 999); setPose(0, 'sad', 999, 30)
        return finishResolve(calls, 160)
      }
    }
    if (left === 1) { calls.push(['LAST CUP!', 'red']); sfx('lastCup'); tempo(1.25) }
    // KEGMASTER phase 2: down to his last 3 cups he gets angry (faster meters for you, crowd chant)
    if (side === 0 && m.st.who === 'kegmaster' && left <= 3 && !m.kegP2 && !m.demo) {
      m.kegP2 = true; calls.push(["HE'S MAD!", 'red']); say('p2'); sfx('crowdOh')
    }
    // balls back (once per turn)
    if (!m.redemption && m.balls === 0 && m.made >= 2 && !m.bbUsed) {
      m.balls = 2; m.made = 0; m.ballsBack = true; m.bbUsed = true
      calls.push(['BALLS BACK!', 'lgreen'])
      sfx('ballsBack')
      if (human) { run.score += 300 * roundMult(); popup(HAND[0].x + 20, 150, '+' + 300 * roundMult(), 'lgreen') }
    }
    finishResolve(calls, m.speech && m.speech.t === 0 ? 70 : 52)
  }

  function resolveMiss() {
    var b = m.ball, side = b.side
    if (side === 1 && m.plan) { var km = m.plan.make + '>miss'; cpuStats[km] = (cpuStats[km] || 0) + 1 }
    if (shotLog.length) shotLog[shotLog.length - 1].res = 'miss r' + b.rim + ' b' + b.bounces + ' f' + b.floor + ' t' + b.t + ' @' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ',' + b.z.toFixed(1)
    var rim = b.rim > 0
    // explain the miss: where the ball crossed rim height vs the nearest cup
    var cr = b.cross || { x: b.x, z: b.z }, why = 'MISS'
    var cs = aliveCups(1 - side), near = null, nd = 1e9
    cs.forEach(function (o) { var d = Math.hypot(o.x - cr.x, o.z - cr.z); if (d < nd) { nd = d; near = o } })
    if (rim) why = 'RIM OUT!'
    else if (near) {
      var dir = side === 0 ? 1 : -1
      var dl = (cr.x - near.x) * dir, dlat = (cr.z - near.z) * dir
      why = Math.abs(dl) >= Math.abs(dlat) ? (dl > 0 ? 'LONG!' : 'SHORT!') : (dlat > 0 ? 'WIDE RIGHT!' : 'WIDE LEFT!')
    }
    m.missX = m.ctrl[side] === 'human' ? { x: cr.x, z: cr.z, side: side } : null
    m.ball = null
    m.lastSank = false
    m.balls--
    sfx('miss')
    if (rim) sfx('crowdOh')
    setPose(side, 'sad', 34)
    var calls = [[why, rim ? 'orange' : 'lgray']]
    if (m.ctrl[side] === 'human') {
      if (run.streak >= 3) { calls.push(['FIRE OUT', 'lgray']); music('stage' + m.stage) }
      run.streak = 0
    } else if (side === 1 && !m.demo) {
      if (m.cpuStreak >= 3) calls.push(['FIRE OUT', 'lgray'])
      m.cpuStreak = 0
      say('miss', 0.45)
    }
    if (m.redemption && side === 0) {
      m.over = 'lose'
      calls = [['GAME OVER', 'red']]
      sfx('lose'); music(null)
      setPose(1, 'cheer', 999); setPose(0, 'sad', 999)
      return finishResolve(calls, 160)
    }
    finishResolve(calls, m.speech && m.speech.t === 0 ? 60 : m.missX ? 48 : 34)
  }

  function finishResolve(calls, dur) {
    if (m.ctrl[m.turn] === 'cpu' && !m.over && !m.pendingRed && !m.pendingOT && !m.demo) dur = Math.round(dur * 0.6)
    callouts(calls)
    m.phase = 'result'; m.pt = 0; m.resT = FAST ? Math.min(dur, 40) : dur
  }

  function afterResult() {
    if (m.over) {
      m.phase = 'end'; m.pt = 0
      return
    }
    if (m.pendingRed) {
      m.pendingRed = false
      m.balls = 0
      startTurn(0)
      return
    }
    if (m.pendingOT) {
      m.pendingOT = false
      m.sides[0].cups = buildRack(0, 2); m.sides[0].form = 3
      m.sides[1].cups = buildRack(1, 2); m.sides[1].form = 3
      sfx('rerack')
      startTurn(0)
      return
    }
    if (m.redemption) {
      if (m.lastSank) { m.balls = 1; beginThrow(); return }
    }
    if (m.balls > 0) { beginThrow(); return }
    startTurn(1 - m.turn)
  }

  // ======================================================================== MATCH UPDATE
  function updateMatch() {
    var M = m
    M.pt++
    // decays
    if (M.shake > 0) M.shake--
    var base = 0.15 + (alive(0) === 1 || alive(1) === 1 ? 0.3 : 0) + (run && run.streak >= 3 && !M.demo ? 0.3 : 0) + (M.kegP2 ? 0.4 : 0)
    M.excite += (base - M.excite) * 0.02
    for (var sd = 0; sd < 2; sd++) {
      var ps = M.poses[sd]
      if (ps.delay > 0) { ps.delay--; continue }
      if (ps.t > 0 && ps.t < 999) { ps.t--; if (ps.t === 0) ps.p = 'idle' }
    }
    M.calls.forEach(function (c) { c.t++ })
    M.calls = M.calls.filter(function (c) { return c.t < 90 })
    M.pops.forEach(function (p) { p.t++ })
    M.pops = M.pops.filter(function (p) { return p.t < 50 })
    for (var i = M.parts.length - 1; i >= 0; i--) {
      var p = M.parts[i]
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--
      if (p.life <= 0) M.parts.splice(i, 1)
    }
    ;[0, 1].forEach(function (s) { M.sides[s].cups.forEach(function (c) { if (c.hitT < 99) c.hitT++ }) })
    if (M.wind.s && frame % 3 === 0 && M.windParts.length < 18) {
      M.windParts.push({ x: M.wind.ax > 0 ? -4 : M.wind.ax < 0 ? 260 : vrnd() * 256, y: 30 + vrnd() * 140, life: 200 })
    }
    for (var wi = M.windParts.length - 1; wi >= 0; wi--) {
      var wp = M.windParts[wi]
      wp.x += M.wind.ax * 1400 + (M.wind.ax === 0 ? 0 : 0); wp.y += M.wind.az * 500 + Math.sin((frame + wi * 9) * 0.1) * 0.2; wp.life--
      if (wp.life <= 0 || wp.x < -8 || wp.x > 264) M.windParts.splice(wi, 1)
    }
    if (M.dead) {
      var db = M.dead
      db.t++; db.vy -= GRAV; db.x += db.vx; db.y += db.vy; db.z += db.vz
      if (db.y < FLOOR_H + BALL_R && db.vy < 0) { db.y = FLOOR_H + BALL_R; if (db.vy < -0.6) sfx('floor'); db.vy = -db.vy * 0.5; db.vx *= 0.8; db.vz *= 0.8 }
      if (db.t > 50 || db.x < -10 || db.x > 266) M.dead = null
    }
    if (M.flash > 0) M.flash--
    if (M.speech && ++M.speech.t > 170) M.speech = null
    if (M.chirp && ++M.chirp.t > 100) M.chirp = null
    // BRO-DY: bonfire smoke drifts across part of the aim inset now and then
    if (M.st.who === 'brody' && !M.demo && M.phase === 'aim' && M.ctrl[M.turn] === 'human' && M.pt % 200 === 60) {
      var fromL = vrnd() < 0.5
      M.smoke.push({ x: fromL ? -20 : IW + 4, y: 14 + vrnd() * (IH - 40), vx: fromL ? 0.55 : -0.55, t: 0 })
    }
    for (var si = M.smoke.length - 1; si >= 0; si--) { var sm = M.smoke[si]; sm.x += sm.vx; sm.t++; if (sm.t > 200) M.smoke.splice(si, 1) }
    // score roll-up
    if (run && !M.demo && run.disp < run.score) run.disp = Math.min(run.score, run.disp + Math.max(5, Math.ceil((run.score - run.disp) / 6)))

    if (M.hitstop > 0) { M.hitstop--; return }

    var side = M.turn, human = M.ctrl[side] === 'human'
    var tp = tap()
    if (M.phase !== 'end' && M.phase !== 'done' && M.phase !== 'ready') M.playT = (M.playT || 0) + 1
    // CPU turn fast-forward: any A / tap during the CPU's turn speeds the whole turn up
    if (!human && !M.demo && !M.ff && M.phase !== 'end' && M.phase !== 'done' && (okPr() || tp)) { M.ff = true; sfx('select') }
    switch (M.phase) {
      case 'ready':
        // match start: brief READY / GO overlay
        if (M.pt === 1) { M.banner = 'READY?'; M.bannerC = 'white' }
        if (M.pt === 31 && !FAST) sfx('go')
        if (M.pt >= (FAST ? 10 : 50)) { startTurn(0) }
        break
      case 'banner':
        if (M.pt >= (FAST ? 14 : side === 1 ? 24 : 40) || (M.ff && M.pt > 4) || (!M.demo && M.pt > 10 && okPr() && side === 0)) { M.banner = ''; beginThrow() }
        break
      case 'aim':
        if (human) {
          if (run && run.hints < 4) run.hintOn = true
          var bt = tp && inR(tp, IX, IY + IH + 1, IW, 12)
          if (pr('b') || pr('select') || bt) {
            if (alive(1 - side) >= 2 || M.bounce) { M.bounce = !M.bounce; sfx(M.bounce ? 'select' : 'cancel') } else sfx('error')
          } else if (pr('a') && M.pt > 6) {
            M.lockAim = aimPos(M.pt)
            sweetFor(side, M.lockAim.x)
            M.phase = 'power'; M.pt = 0
            sfx('aimLock')
          }
        } else {
          var P = M.plan
          if (M.ff && M.pt > 3) M.pt = Math.max(M.pt, P.aimT)
          if (M.pt >= P.aimT) {
            M.lockAim = { x: P.ax, z: P.az }; M.bounce = P.bounce
            M.phase = 'power'; M.pt = 0
            sfx('aimLock')
          }
        }
        break
      case 'power':
        if (human) {
          if (pr('a') && M.pt > 3) {
            M.lockPow = powVal(M.pt)
            sfx('powerLock')
            if (run) run.hints++
            M.phase = 'throw'; M.pt = 0
            setPose(side, 'throw', 22)
          } else if (pr('b') && M.pt < 200) {
            // B in power phase: back to aim (no penalty) — friendlier
            M.phase = 'aim'; M.pt = 0; sfx('cancel'); setupAim(side)
          }
        } else {
          var P2 = M.plan
          if (M.ff && M.pt > 2) M.pt = Math.max(M.pt, P2.powT)
          if (M.pt >= P2.powT) {
            M.lockPow = P2.pv
            sfx('powerLock')
            M.phase = 'throw'; M.pt = 0
            setPose(side, 'throw', 22)
          }
        }
        break
      case 'throw':
        if (M.pt >= 5) {
          if (human) {
            var err = powErr(M.lockPow) * (M.bounce ? 2.2 : 1)
            var dir = side === 0 ? 1 : -1
            var tx = M.lockAim.x + dir * err, tz = M.lockAim.z
            if (run && run.buzz) { tx += gauss() * 0.2 * run.buzz; tz += gauss() * 0.2 * run.buzz }
            if (run && !M.demo) { run.shots++; run.stShots++ }
            launch(side, tx, tz, M.bounce, false)
          } else {
            if (run && !M.demo) run.cpuShots++
            launch(side, M.plan.tx, M.plan.tz, M.plan.bounce, true)
            if (shotLog.length) { var sl = shotLog[shotLog.length - 1]; sl.plan = M.plan.make ? 'make' : 'miss'; sl.cups = aliveCups(0).map(function (c) { return c.x + ',' + c.z }).join(' '); sl.ptx = M.plan.tx }
          }
          M.phase = 'flight'; M.pt = 0
        }
        break
      case 'flight':
        if (M.ball) stepBall()
        if (M.ff && M.ball && M.phase === 'flight') stepBall()
        break
      case 'result':
        // result pause: skippable with A / tap (never skips a match-ending moment)
        if (M.pt >= M.resT || (M.ff && M.pt > 10 && !M.over) || (M.pt > 12 && human && !M.over && !M.demo && (okPr() || tp))) afterResult()
        break
      case 'end':
        M.endT++
        if (M.over === 'win') M.excite = 1
        if (M.pt >= (FAST ? 40 : 110) || (M.pt > 40 && okPr() && !M.demo)) {
          if (M.over === 'win') go('clear')
          else if (M.over === 'lose') go('gameover')
          else if (M.over === 'demo') go('title')
          M.phase = 'done'
        }
        break
    }
  }

  // ======================================================================== MATCH DRAW
  var IX = 84, IY = 25, IW = 90, IH = 82
  function drawMatch(showHud) {
    var M = m, A = BP.Art
    ctx.save()
    if (M.shake > 0) {
      var a = M.shake > 5 ? 2 : 1
      ctx.translate(((M.shake * 7) % 3) - 1 ? a : -a, M.shake % 2 ? a : -a)
    }
    A.drawBackground(ctx, M.stage, frame, clamp(M.excite, 0, 1))
    if (M.windParts.length) M.windParts.forEach(function (w) { rect(w.x, w.y, 2, 1, 'lgray') })
    for (var s = 0; s < 2; s++) {
      var ps = M.poses[s], pose = ps.p
      if (ps.delay > 0 && (ps.p === 'drink' || ps.p === 'sad')) pose = 'idle'
      A.drawPlayer(ctx, M.sides[s].who, pose, PX[s], FEET, frame, false)
    }
    A.drawTable(ctx, M.stage)
    var b = M.ball
    if (b) {
      if (onTable(b.x, b.z) && b.y >= -1) A.drawShadow(ctx, R(ox(b.x, b.z)), R(sy(0, b.z)))
      else A.drawShadow(ctx, R(ox(b.x, b.z)), R(sy(FLOOR_H, b.z)))
    }
    // dotted arc trail; ON FIRE balls leave a flame trail
    var fire = b && b.fire, tl = M.trail.length
    for (var i = 0; i < tl; i++) {
      var tp = M.trail[i]
      if (fire && i >= tl - 8 && A.drawFlame) A.drawFlame(ctx, R(tp.x), R(tp.y), frame + i)
      else A.drawTrailDot(ctx, R(tp.x), R(tp.y), !!fire)
    }
    if (M.dead) {
      A.drawShadow(ctx, R(ox(M.dead.x, M.dead.z)), R(sy(FLOOR_H, M.dead.z)))
      A.drawBall(ctx, R(ox(M.dead.x, M.dead.z)), R(sy(M.dead.y, M.dead.z)), !!M.dead.fire, frame)
    }
    // painter's algorithm: cups + ball back-to-front by z (oblique projection: screenX = x + z/2)
    var list = []
    for (var sd = 0; sd < 2; sd++) {
      M.sides[sd].cups.forEach(function (c) { if (c.alive || c.hitT < 22) list.push({ z: c.z, c: c }) })
    }
    if (b) list.push({ z: b.z + 0.6, b: b })
    list.sort(function (p, q) { return p.z - q.z })
    for (var k = 0; k < list.length; k++) {
      var it = list[k]
      if (it.c) {
        var c = it.c
        A.drawCup(ctx, R(ox(c.x, c.z)), R(sy(0, c.z)), c.alive || c.hitT < 0 ? 'full' : 'hit', c.alive ? 0 : Math.max(0, c.hitT))
      } else A.drawBall(ctx, R(ox(it.b.x, it.b.z)), R(sy(it.b.y, it.b.z)), !!it.b.fire, frame)
    }
    for (var sd2 = 0; sd2 < 2; sd2++) {
      M.sides[sd2].cups.forEach(function (c) {
        if (!c.alive && c.hitT >= 0 && c.hitT < 24) A.drawSplash(ctx, R(ox(c.x, c.z)), R(sy(0, c.z) - 10), c.hitT)
      })
    }
    M.parts.forEach(function (p) { rect(p.x, p.y, 1, 1, p.c) })
    M.pops.forEach(function (p) { T(p.text, p.x - p.text.length * 4, p.y - p.t * 0.5, p.c, true) })
    ctx.restore()
    if (M.flash > 0) rect(0, 24, W, H - 24, 'white') // ON FIRE: NES-style palette flash

    var ph = M.phase
    var humanTurn = M.ctrl[M.turn] === 'human'
    if (!paused && (ph === 'aim' || ph === 'power' || ph === 'throw' || ph === 'flight' || (ph === 'result' && M.missX))) drawInset()
    if (!paused) drawCallouts()
    if ((ph === 'banner' || ph === 'ready') && M.banner && !paused) {
      var txt = M.banner
      if (ph === 'ready' && M.pt > 30) txt = 'GO!'
      var w = Math.max(96, txt.length * 16 + 24)
      var withBalls = ph === 'banner' && !M.redemption
      box(128 - w / 2, 108, w, withBalls ? 40 : 30, M.redemption ? 'gold' : M.turn === 1 && ph === 'banner' ? 'red' : 'default')
      BIG(txt, 128, 115, ph === 'ready' && M.pt > 30 ? 'gold' : M.bannerC, 2)
      if (withBalls) for (var bi = 0; bi < M.balls; bi++) A.drawIcon(ctx, 'ball', 128 - M.balls * 5 + bi * 10 + 1, 135)
    }
    // opponent speech (Punch-Out style): portrait + one line; hidden while the aim inset is up
    var insetUp = ph === 'aim' || ph === 'power' || ph === 'throw' || ph === 'flight' || (ph === 'result' && M.missX)
    if (M.speech && !paused && !insetUp) {
      box(4, 26, 248, 40, 'red')
      if (A.drawPortrait) A.drawPortrait(ctx, M.speech.who, 8, 30)
      T(M.speech.name + ':', 46, 33, 'red')
      T(M.speech.text.slice(0, Math.max(0, M.speech.t)), 46, 47, 'white')
    }
    if (M.chirp && !paused && humanTurn && (ph === 'aim' || ph === 'power')) {
      box(52, 204, 152, 14, 'dim')
      TC(M.chirp.text, 207, 'white')
    }
    if (showHud !== false) drawHUD()
    if (!M.demo && M.turn === 1 && !M.ff && !paused && (ph === 'banner' || ph === 'aim' || ph === 'power' || ph === 'throw' || ph === 'flight')) {
      rect(52, 213, 152, 11, 'black')
      if (blink(frame, 24)) TC(isTouch() ? 'TAP TO SKIP ▶▶' : 'A: SKIP ▶▶', 215, 'gold')
    }
    if (M.demo) {
      box(84, 188, 88, 18, 'dim')
      if (blink(frame, 24)) TC('DEMO PLAY', 193, 'gold')
      if (blink(frame, 30)) TC('PUSH START', 210, 'white', true)
    }
  }

  function drawCallouts() {
    var cs = m.calls
    if (!cs.length) return
    var y = 132
    var first = cs[0]
    if (first.t < 90) {
      var w = first.text.length * 16 + 20
      var bob = first.t < 6 ? 6 - first.t : 0
      box(128 - w / 2, y - 4 - bob, w, 26, first.c === 'red' ? 'red' : first.c === 'gold' ? 'gold' : 'default')
      BIG(first.text, 128, y + 1 - bob, first.c, 2)
    }
    for (var i = 1; i < cs.length && i < 4; i++) {
      var c = cs[i]
      if (c.t < (i * 6)) continue
      var tw = c.text.length * 8 + 12
      box(128 - tw / 2, y + 22 + (i - 1) * 13, tw, 13, 'dim')
      TC(c.text, y + 25 + (i - 1) * 13, c.c)
    }
  }

  // inset mapping (behind-the-shooter view of the target rack)
  function insetXY(side, x, z) {
    var icx = IX + IW / 2
    if (side === 0) return { x: icx + z * 2, y: IY + 13 + (214 - x) * 2 } // anchored on the back row
    return { x: icx - z * 2, y: IY + 13 + (x - 42) * 2 }
  }
  function drawInset() {
    var M = m, A = BP.Art, side = M.turn, human = M.ctrl[side] === 'human'
    box(IX, IY, IW, IH, M.bounce ? 'gold' : side === 1 ? 'red' : 'default')
    ctx.save()
    ctx.beginPath(); ctx.rect(IX + 3, IY + 3, IW - 6, IH - 6); ctx.clip()
    rect(IX + 3, IY + 3, IW - 6, IH - 6, 'black')
    var icx = IX + IW / 2
    // table surface (top-down)
    rect(icx - 29, IY + 3, 58, IH, 'dred')
    rect(icx - 29, IY + 3, 1, IH, 'white')
    rect(icx + 28, IY + 3, 1, IH, 'white')
    rect(icx, IY + 3, 1, IH, 'red')
    // cups
    var cs = M.sides[1 - side].cups
    cs.forEach(function (c) {
      var p = insetXY(side, c.x, c.z)
      A.drawCupTop(ctx, R(p.x), R(p.y), c.alive ? 'full' : 'gone')
    })
    // BRO-DY's bonfire smoke drifting through
    M.smoke.forEach(function (sm) {
      for (var py = 0; py < 16; py += 2) for (var px = 0; px < 28; px += 2) {
        var d = Math.hypot((px - 14) / 14, (py - 8) / 8)
        if (d < 1 && ((px + py + (sm.t >> 3)) & 2) === 0) rect(IX + sm.x + px, IY + sm.y + py, 2, 2, d < 0.6 ? 'lgray' : 'gray')
      }
    })
    // wind arrow (shooter's view: the only wind arrow)
    if (M.wind.s) drawWindArrow(side)
    // miss explanation: X where the ball crossed rim height
    if (M.phase === 'result' && M.missX) {
      var mq = insetXY(side, M.missX.x, M.missX.z)
      if (blink(frame, 8)) for (var xi = -3; xi <= 3; xi++) { rect(mq.x + xi, mq.y + xi, 1, 1, 'white'); rect(mq.x + xi, mq.y - xi, 1, 1, 'white') }
      if (M.lockAim) { var la = insetXY(side, M.lockAim.x, M.lockAim.z); reticle(R(la.x), R(la.y), 'gold') }
    }
    // crosshair / ball
    var ch = null
    if (M.phase === 'aim') {
      if (human) ch = aimPos(M.pt)
      else {
        var P = M.plan, u = clamp(M.pt / P.aimT, 0, 1), e = u * u * (3 - 2 * u)
        var wob = (1 - u) * 2
        ch = { x: P.sx + (P.ax - P.sx) * e + Math.sin(M.pt * 0.4) * wob, z: P.sz + (P.az - P.sz) * e + Math.cos(M.pt * 0.33) * wob }
      }
    } else if (M.phase === 'power' || M.phase === 'throw') ch = M.lockAim
    if (ch) {
      var q = insetXY(side, ch.x, ch.z)
      var onT = false
      for (var ci = 0; ci < cs.length; ci++) if (cs[ci].alive && Math.hypot(cs[ci].x - ch.x, cs[ci].z - ch.z) < 2.2) onT = true
      if (M.phase === 'aim' || blink(frame, 4)) {
        A.drawCrosshair(ctx, R(q.x), R(q.y), frame)
        reticle(R(q.x), R(q.y), M.phase !== 'aim' ? 'white' : onT ? 'lgreen' : 'yellow')
      }
    }
    if (M.phase === 'flight' && M.ball) {
      var b = M.ball, bp = insetXY(side, b.x, b.z)
      if (b.y > -2) A.drawShadow(ctx, R(bp.x), R(bp.y))
      var lift = Math.min(10, Math.max(0, b.y) * 0.15)
      A.drawBall(ctx, R(bp.x), R(bp.y - lift), !!b.fire, frame)
      if (M.lockAim) { var lq = insetXY(side, M.lockAim.x, M.lockAim.z); rect(lq.x - 1, lq.y, 3, 1, 'white'); rect(lq.x, lq.y - 1, 1, 3, 'white') }
    }
    ctx.restore()
    // shooter tag
    if (!human) T(M.demo && side === 0 ? 'HERO' : M.sides[side].name.slice(0, 9), IX + 4, IY + IH - 11, side === 0 ? 'white' : 'red', true)
    // bounce toggle button (14 px: full NES frame)
    if (human && (M.phase === 'aim')) {
      box(IX, IY + IH + 1, IW, 14, M.bounce ? 'gold' : 'dim')
      T(M.bounce ? (blink(frame, 10) ? 'BOUNCE ON' : 'B:BOUNCE') : 'B:BOUNCE', IX + (M.bounce && blink(frame, 10) ? 9 : 13), IY + IH + 4, M.bounce ? 'gold' : 'lgray')
    }
    // KEGMASTER calls his shot
    if (!human && M.plan && M.plan.call && (M.phase === 'aim' || M.phase === 'power')) {
      box(52, IY + IH + 1, 152, 14, 'red')
      TC('KEG: ' + M.plan.call, IY + IH + 4, 'white')
    }
    // power meter
    var mx = IX + IW + 3, my = IY, mw = 16, mh = IH
    box(mx, my, mw, mh, 'default')
    var fx = mx + 4, fy = my + 4, fw = mw - 8, fh = mh - 8
    rect(fx, fy, fw, fh, 'dgray')
    var sc = M.pow.sc, bw = M.pow.bw
    // the green zone is revealed only after the aim lock: its height depends on how far the target cup is
    if (M.phase !== 'aim') {
      var y0 = fy + fh * (1 - (sc + bw)), y1 = fy + fh * (1 - (sc - bw))
      rect(fx, y0, fw, y1 - y0, 'green')
      rect(fx, fy + fh * (1 - sc), fw, 1, 'lgreen')
    }
    var v = 0, show = false
    if (M.phase === 'power') {
      show = true
      v = human ? powVal(M.pt) : M.plan.pv * clamp(M.pt / M.plan.powT, 0, 1)
    } else if (M.phase === 'throw' || M.phase === 'flight' || M.phase === 'result') { v = M.lockPow; show = true }
    if (show) {
      var hh = fh * v
      var inZone = Math.abs(v - sc) <= bw
      rect(fx, fy + fh - hh, fw, hh, inZone ? 'lgreen' : v > sc ? 'red' : 'orange')
      if (M.phase === 'power' || blink(frame, 4)) rect(fx - 2, R(fy + fh - hh) - 1, fw + 4, 2, 'white')
    }
    if (M.phase !== 'aim') { // the green zone stays visible over the fill: outline + brackets outside the bar
      var zy0 = R(fy + fh * (1 - (sc + bw))), zy1 = R(fy + fh * (1 - (sc - bw)))
      rect(fx, zy0, fw, 1, 'lgreen'); rect(fx, zy1, fw, 1, 'lgreen')
      rect(fx - 3, zy0, 2, zy1 - zy0 + 1, 'lgreen'); rect(fx + fw + 1, zy0, 2, zy1 - zy0 + 1, 'lgreen')
    }
    // hint for first-timers
    if (human && run && run.hints < 4 && !M.demo) {
      var hint = M.phase === 'aim' ? 'TAP OR A: LOCK AIM' : M.phase === 'power' ? 'TAP IN THE GREEN!' : ''
      if (hint && blink(frame, 20)) {
        var hw = hint.length * 8 + 8
        rect(128 - hw / 2, IY + IH + (M.phase === 'aim' ? 16 : 3), hw, 10, 'black')
        TC(hint, IY + IH + (M.phase === 'aim' ? 17 : 4), 'gold')
      }
    }
  }
  function reticle(x, y, c) {
    var o = 8, l = 3
    rect(x - o, y - o, l, 1, c); rect(x - o, y - o, 1, l, c)
    rect(x + o - l + 1, y - o, l, 1, c); rect(x + o, y - o, 1, l, c)
    rect(x - o, y + o, l, 1, c); rect(x - o, y + o - l + 1, 1, l, c)
    rect(x + o - l + 1, y + o, l, 1, c); rect(x + o, y + o - l + 1, 1, l, c)
  }
  function drawWindArrow(side) {
    var M = m
    var dx = Math.cos(M.wind.ang), dz = Math.sin(M.wind.ang)
    // to inset screen direction
    var sx = side === 0 ? dz : -dz, syy = side === 0 ? -dx : dx
    var cx = IX + IW - 14, cy = IY + IH - 14, L = 4 + M.wind.s * 2
    for (var i = -L; i <= L; i++) rect(cx + sx * i, cy + syy * i, 1, 1, 'white')
    var hx = cx + sx * L, hy = cy + syy * L
    for (var j = 1; j <= 3; j++) {
      rect(hx - sx * j - syy * j, hy - syy * j + sx * j, 1, 1, 'white')
      rect(hx - sx * j + syy * j, hy - syy * j - sx * j, 1, 1, 'white')
    }
    T(String(M.wind.s), IX + IW - 26, IY + IH - 26 + 1, 'white')
  }

  // HUD: two tile rows inside the NES safe area (y 8 and 16) on the black band y 0..23
  function drawHUD() {
    var M = m, A = BP.Art
    rect(0, 0, W, 24, 'black')
    var score = M.demo ? 0 : run.disp
    T('1P', 8, 8, 'red')
    T(pad(score, 6), 32, 8, 'white')
    T('HI', 168, 8, 'red')
    T(pad(Math.max(hi, run && !M.demo ? run.disp : 0), 6), 192, 8, 'white')
    if (M.overtime || M.redemption) { if (blink(frame, 12)) T(M.overtime ? 'OT!' : 'RED!', 128 - 16, 8, 'gold') }
    else { var stl = (M.loop > 0 ? 'R' + (M.loop + 1) + '-' : 'ST') + (M.stage + 1); T(stl, 128 - stl.length * 4 - 4, 8, 'gold') }
    // row 2: your cups | balls | buzz mugs | fire | their cups
    var n0 = M.sides[0].cups.length, sp0 = n0 > 6 ? 5 : 7
    M.sides[0].cups.forEach(function (c, i) { A.drawIcon(ctx, c.alive ? 'cup' : 'cupEmpty', 8 + i * sp0, 16) })
    var n1 = M.sides[1].cups.length, sp1 = n1 > 6 ? 5 : 7
    M.sides[1].cups.forEach(function (c, i) { A.drawIcon(ctx, c.alive ? 'cup' : 'cupEmpty', 240 - (n1 - 1 - i) * sp1, 16) })
    var bl = M.redemption ? 1 : M.balls
    for (var i = 0; i < Math.min(bl, 2); i++) A.drawIcon(ctx, 'ball', 62 + i * 8, 16)
    if (!M.demo) {
      for (var k = 0; k < 5; k++) A.drawIcon(ctx, k < run.buzz ? 'mugFull' : 'mug', 82 + k * 9, 16)
      var st = run.streak
      if (st >= 3) { if (blink(frame, 6)) T('FIRE', 130, 16, 'red'); A.drawIcon(ctx, 'fire', 164, 16) }
      else for (var f = 0; f < 3; f++) if (f < st) A.drawIcon(ctx, 'fire', 130 + f * 9, 16)
      if (M.cpuStreak >= 3 && blink(frame, 6)) A.drawIcon(ctx, 'fire', 176, 16)
    }
  }

  // ======================================================================== SCREENS
  var MENU = ['1 PLAYER', 'HIGH SCORES', 'HOW TO PLAY']
  var titleCursor = 0
  var titleRack = null

  var STATES = {}

  // ---------------------------------------------------------------- TITLE
  STATES.title = {
    enter: function () { music('title'); S.idle = 0; paused = false; m = null; refreshHi() },
    update: function () {
      S.idle++
      var p = tap()
      if (anyPr()) S.idle = 0
      if (pr('up')) { titleCursor = (titleCursor + 2) % 3; sfx('select') }
      if (pr('down') || pr('select')) { titleCursor = (titleCursor + 1) % 3; sfx('select') }
      var choose = -1
      if (p && S.t > 10) {
        var mt = menuTap(p, [[64, 104, 128, 14], [64, 118, 128, 14], [64, 132, 128, 14]], titleCursor)
        if (mt.move != null) { titleCursor = mt.move; sfx('select') } else choose = titleCursor
      } else if (okPr() && S.t > 10) choose = titleCursor
      if (choose >= 0) {
        titleCursor = choose
        sfx('confirm')
        if (choose === 0) startRun()
        else if (choose === 1) go('scores', { attract: false })
        else go('howto')
        return
      }
      if (S.idle > (FAST ? 600 : 1200)) go('scores', { attract: true })
    },
    draw: function () {
      var A = BP.Art, t = S.t
      A.drawBackground(ctx, 0, frame, 0.25)
      A.drawPlayer(ctx, 'hero', t % 160 < 18 ? 'throw' : t % 160 > 80 && t % 160 < 130 ? 'cheer' : 'idle', PX[0], FEET, frame)
      A.drawPlayer(ctx, 'chad', t % 160 > 86 && t % 160 < 140 ? 'sad' : 'idle', PX[1], FEET, frame)
      A.drawTable(ctx, 0)
      // little ball into cup demo
      var rack = titleRack || (titleRack = buildRack(1, 3).concat(buildRack(0, 3)))
      var ph = t % 160
      var target = rack[4]
      var list = rack.map(function (c) { return { z: c.z, c: c } })
      var bx = null
      if (ph >= 4 && ph < 70) {
        var u = (ph - 4) / 66
        var x = HAND[0].x + (target.x - HAND[0].x) * u
        var h = HAND[0].y + (RIM_H - 4 - HAND[0].y) * u + 220 * u * (1 - u)
        var z = target.z * u
        bx = { x: ox(x, z), y: sy(h, z), z: z + 0.6 }
        list.push({ z: z + 0.6, b: bx })
        A.drawShadow(ctx, R(ox(x, z)), R(sy(0, z)))
      }
      list.sort(function (p, q) { return p.z - q.z })
      list.forEach(function (it) {
        if (it.c) A.drawCup(ctx, R(ox(it.c.x, it.c.z)), R(sy(0, it.c.z)), it.c === target && ph >= 70 && ph < 92 ? 'hit' : 'full', ph - 70)
        else A.drawBall(ctx, R(it.b.x), R(it.b.y), false, frame)
      })
      if (ph >= 70 && ph < 94) A.drawSplash(ctx, R(ox(target.x, target.z)), R(sy(0, target.z) - 10), ph - 70)
      if (ph === 70) { /* silent on title */ }
      // logo + menu
      A.drawLogo(ctx, 128, 26, frame)
      box(64, 98, 128, 52, 'default')
      for (var i = 0; i < 3; i++) {
        var yy = 108 + i * 14
        T(MENU[i], 88, yy, i === titleCursor ? 'white' : 'lgray')
        if (i === titleCursor && blink(frame, 16)) T('▶', 74, yy, 'red')
      }
      rect(64, 152, 128, 12, 'black')
      if (blink(frame, 30)) TC(isTouch() ? 'TAP TO START' : 'PUSH START', 154, 'white')
      T('HI ' + pad(hi, 6), 8, 8, 'white', true)
      rect(48, 213, 160, 11, 'black')
      TC('© 1989 PARTY SOFT', 215, 'white')
    },
  }

  function startRun() {
    newRun()
    try { if (BP.Scores && BP.Scores.startRun) Promise.resolve(BP.Scores.startRun()).then(null, function () {}) } catch (e) {}
    sfx('start')
    go('vs', { stage: 0 })
  }

  // ---------------------------------------------------------------- HIGH SCORES (menu / attract / board)
  STATES.scores = {
    enter: function () {
      S.rows = null
      music('scores')
      if (S.preRows) { S.rows = S.preRows.slice(0, 10); return }
      try {
        var self = S
        Promise.resolve(BP.Scores.top(10)).then(function (r) { self.rows = Array.isArray(r) ? r : [] }, function () { self.rows = [] })
      } catch (e) { S.rows = [] }
    },
    update: function () {
      if (S.attract) {
        if (anyPr() || tap()) { go('title'); return }
        if (S.t > (FAST ? 240 : 480)) startDemo()
        return
      }
      var lim = S.board ? 120 : 10 // board: 2 s input lock so mashing can't fall through to a new game
      if (S.board && S.t === 2) { if (S.myRank === 1) { sfx('win'); music('clear', true) } else sfx('confirm') }
      if (S.t > lim && (okPr() || pr('b') || tap())) { sfx('cancel'); go('title') }
      if (S.board && S.t > 1200) go('title')
      if (!S.board && S.t > 1800) go('title')
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      drawScoreTable(S.rows, S.hlRank, S.t, S.board ? S.label : null, S.board ? S.myRank : 0)
      if (S.board && S.myRank > 10 && !S.hlRank) {
        // your row when you are outside the top 10: its own strip, text inset 8 px, any rank width
        box(8, 192, 240, 22, 'gold')
        if (blink(frame, 8)) {
          var rk = '#' + S.myRank, nmx = String(S.myName || '').toUpperCase().slice(0, 8)
          T(rk, 18, 199, 'gold')
          T(nmx, 18 + Math.max(5, rk.length + 1) * 8, 199, 'white')
          TR(pad(S.myScore || 0, 7), 238, 199, 'gold')
        }
      }
      if (S.attract) { if (blink(frame, 30)) TC('PUSH START', 208, 'white') }
      else if (S.t > (S.board ? 120 : 40) && blink(frame, 30)) TC(isTouch() ? 'TAP TO CONTINUE' : 'PUSH A', S.myRank > 10 && !S.hlRank ? 216 : 208, 'lgray')
    },
  }
  function drawScoreRow(rank, r, y, c) {
    var nm = String(r.name || '???').toUpperCase().slice(0, 8)
    TR(String(rank), 34, y, c)
    T('.', 34, y, c)
    T(nm, 46, y, c)
    TR(pad(r.score || 0, 7), 184, y, c)
    var rd = +r.round || 1
    T((rd > 1 ? rd + '-' : '') + ((+r.stage || 0) + 1), 200, y, c)
  }
  function scoresMode() { try { return BP.Scores.mode() === 'global' ? 'GLOBAL' : 'LOCAL' } catch (e) { return 'LOCAL' } }
  function drawScoreTable(rows, hl, t, label, myRank) {
    if (myRank === 1) BIG('NEW HIGH SCORE!', 128, 12, blink(frame, 6) ? 'gold' : 'white', 2)
    else if (myRank > 1) BIG("YOU'RE #" + myRank + '!', 128, 12, 'cyan', 2)
    else BIG('HIGH SCORES', 128, 12, 'gold', 2)
    var mode = label || scoresMode() + ' RANKING'
    TC(mode, 34, mode.indexOf('GLOBAL') >= 0 ? 'cyan' : mode.indexOf('SENDING') >= 0 ? 'yellow' : 'lgray')
    box(8, 46, 240, 146, 'default')
    T('RK', 18, 54, 'red'); T('NAME', 46, 54, 'red'); TR('SCORE', 184, 54, 'red'); T('STG', 200, 54, 'red')
    if (!rows) { if (blink(frame, 10)) TC('LOADING...', 110, 'white'); return }
    if (!rows.length) { TC('NO SCORES YET!', 100, 'white'); TC('BE THE FIRST!', 116, 'gold'); return }
    for (var i = 0; i < 10; i++) {
      var y = 68 + i * 12
      var r = rows[i]
      if (!r) { TR(String(i + 1), 34, y, 'dgray'); T('.  --------', 34, y, 'dgray'); continue }
      var c = i === 0 ? 'gold' : i === 1 ? 'lgray' : i === 2 ? 'orange' : 'white'
      if (i === 0) BP.Art.drawIcon(ctx, 'crown', 14, y)
      if (hl === i + 1) { if (!blink(frame, 8)) continue; c = 'cyan' }
      drawScoreRow(i + 1, r, y, c)
    }
  }

  // ---------------------------------------------------------------- DEMO PLAY (attract)
  var demoStage = 0
  function startDemo() {
    go('demo', {})
  }
  STATES.demo = {
    enter: function () {
      var keep = run
      S.keepRun = keep
      run = null
      newMatch(true, demoStage, 0)
      demoStage = (demoStage + 1) % 5
      music('stage' + m.stage, true)
    },
    update: function () {
      if (S.t > 3 && (anyPr() || tap())) { m = null; go('title'); return }
      updateMatch()
      if (S.t > (FAST ? 900 : 1800) && !fade) go('title')
    },
    draw: function () { if (m) drawMatch(true); else rect(0, 0, W, H, 'black') },
  }

  // ---------------------------------------------------------------- HOW TO PLAY
  // Layout rules (checked at 3x): the frame interior is x 8..247, y 40..212; text columns never reach a sprite.
  var HOWTO = [
    { title: 'AIM', lines: ['THE CROSSHAIR', 'SWEEPS OVER THE', 'CUPS. PRESS A', 'OR TAP TO LOCK', 'IT ON A CUP.', '', 'HIT THE BEER', 'FOR A SWISH!'] },
    { title: 'POWER', lines: ['PRESS A AGAIN', 'WHEN THE BAR', 'IS IN THE', 'GREEN ZONE.', '', 'LOW  = SHORT', 'HIGH = LONG'] },
    { title: 'RULES', lines: ['2 BALLS A TURN. SINK BOTH', 'FOR BALLS BACK!', '', '2 IN A ROW: HEATING UP X2', '3 IN A ROW: ON FIRE!   X3', '', 'LOSE A CUP: +1 BUZZ. BUZZ', 'MAKES YOUR AIM SHAKY.', '', 'LAST CUP GONE? SINK THEM', 'ALL FOR REDEMPTION!', '', 'WIN 2 ROUNDS = CHAMPION!'] },
    { title: 'SCORING', lines: ['CUP ............ 100', 'SWISH ........... +50', 'RATTLED IN ...... +25', 'BOUNCE SHOT .... +200', 'ISLAND CUP ..... +250', 'BALLS BACK ..... +300', 'HEATING UP ....... X2', 'ON FIRE .......... X3', 'FAST CLEAR ... +3000', 'PERFECT ....... +3000', 'ROUND 2 .......... X2'] },
  ]
  STATES.howto = {
    enter: function () { S.page = 0; S.demoRack = buildRack(1, 3) },
    update: function () {
      var p = tap()
      if (pr('start') && S.t > 5) { sfx('cancel'); go('title'); return }
      if ((pr('a') || pr('right') || p) && S.t > 5) {
        S.t = 1
        if (S.page < HOWTO.length - 1) { S.page++; sfx('select') } else { sfx('confirm'); go('title') }
      } else if ((pr('b') || pr('left')) && S.t > 5) {
        S.t = 1
        if (S.page > 0) { S.page--; sfx('cancel') } else { sfx('cancel'); go('title') }
      }
    },
    draw: function () {
      var A = BP.Art, pg = HOWTO[S.page]
      rect(0, 0, W, H, 'black')
      box(4, 4, 248, 28, 'red')
      TC('HOW TO PLAY  ' + (S.page + 1) + '/' + HOWTO.length, 9, 'white')
      TC(pg.title, 19, 'gold')
      box(4, 36, 248, 168, 'default')
      if (S.page === 0 || S.page === 1) {
        var ex = 14, ey = 46, ew = 90, eh = 82
        box(ex, ey, ew, eh, 'default')
        ctx.save(); ctx.beginPath(); ctx.rect(ex + 3, ey + 3, ew - 6, eh - 6); ctx.clip()
        rect(ex + 3, ey + 3, ew - 6, eh - 6, 'black')
        var icx = ex + ew / 2
        rect(icx - 29, ey + 8, 58, eh, 'dred'); rect(icx - 29, ey + 8, 58, 1, 'white')
        S.demoRack.forEach(function (c) { A.drawCupTop(ctx, R(icx + c.z * 2), R(ey + 14 + (TX1 - c.x) * 2), 'full') })
        if (S.page === 0) {
          var cxh = R(icx + 13 * Math.sin(frame * 0.05)), cyh = R(ey + 14 + 16 + 14 * Math.sin(frame * 0.035 + 1))
          A.drawCrosshair(ctx, cxh, cyh, frame)
          var on = false
          S.demoRack.forEach(function (c) { if (Math.hypot(icx + c.z * 2 - cxh, ey + 14 + (TX1 - c.x) * 2 - cyh) < 4.5) on = true })
          reticle(cxh, cyh, on ? 'lgreen' : 'yellow')
        } else A.drawCrosshair(ctx, R(icx), R(ey + 14 + 18), frame)
        ctx.restore()
        if (S.page === 1) {
          var mx = ex + ew + 4, fh = eh - 8
          box(mx, ey, 16, eh, 'default')
          rect(mx + 4, ey + 4, 8, fh, 'dgray')
          rect(mx + 4, ey + 4 + fh * (1 - 0.75), 8, fh * 0.18, 'green')
          var u = (frame % 66) / 66, v = u < 0.5 ? u * 2 : 2 - u * 2
          var inZ = Math.abs(v - 0.66) <= 0.09
          rect(mx + 4, ey + 4 + fh * (1 - v), 8, fh * v, inZ ? 'lgreen' : v > 0.66 ? 'red' : 'orange')
          rect(mx + 2, ey + 3 + fh * (1 - v), 12, 2, 'white')
        }
        var tx = S.page === 1 ? 132 : 112
        pg.lines.forEach(function (l, i) { T(l, tx, 48 + i * 11, i === pg.lines.length - 1 ? 'gold' : 'white') })
        if (S.page === 0) {
          A.drawPlayer(ctx, 'hero', 'aim', 40, 198, frame)
          T('A', 72, 150, 'red'); T('/ TAP = LOCK AIM', 88, 150, 'white')
          T('GREEN BRACKETS =', 72, 168, 'lgreen')
          T('RIGHT ON A CUP!', 72, 180, 'white')
        } else {
          A.drawPlayer(ctx, 'hero', 'throw', 224, 198, frame)
          T('B', 16, 146, 'red'); T(': BOUNCE SHOT ON/OFF', 24, 146, 'white')
          T('HARDER TO SINK, BUT', 16, 160, 'white')
          T('IT TAKES 2 CUPS!', 16, 172, 'gold')
        }
      } else if (S.page === 2) {
        pg.lines.forEach(function (l, i) { T(l, 16, 44 + i * 12, l.indexOf('FIRE') >= 0 || l.indexOf('HEATING') >= 0 ? 'orange' : l.indexOf('BUZZ') >= 0 ? 'beer' : l.indexOf('CHAMPION') >= 0 || l.indexOf('REDEMPTION') >= 0 ? 'gold' : 'white') })
        A.drawIcon(ctx, 'ball', 226, 44); A.drawIcon(ctx, 'ball', 236, 44)
        A.drawIcon(ctx, 'fire', 230, 92); A.drawIcon(ctx, 'mugFull', 230, 116); A.drawIcon(ctx, 'trophy', 230, 188)
      } else {
        pg.lines.forEach(function (l, i) { T(l, 40, 46 + i * 14, i === 6 || i === 7 ? 'orange' : i >= 8 ? 'gold' : 'white') })
        A.drawIcon(ctx, 'cup', 22, 46); A.drawIcon(ctx, 'star', 22, 60); A.drawIcon(ctx, 'fire', 22, 158); A.drawIcon(ctx, 'trophy', 22, 186)
      }
      if (blink(frame, 30)) TC(S.page < HOWTO.length - 1 ? 'A: NEXT   B: BACK' : 'A: DONE   B: BACK', 210, 'lgray')
    },
  }

  // ---------------------------------------------------------------- VS CARD
  STATES.vs = {
    enter: function () {
      run.stage = S.stage
      run.stageT0 = ticks // a stage (VS card + match + tally) never takes < 45 s, even for a perfect player
      S.dur = FAST ? 24 : 230
      music('vs', true)
    },
    update: function () {
      if (S.t > (FAST ? 8 : 90) && (okPr() || tap())) { if (S.t < S.dur - 50) { S.t = S.dur - 50; sfx('confirm') } else S.t = S.dur }
      if (S.t === S.dur - 50 && !FAST) sfx('go')
      if (S.t >= S.dur) startStage()
    },
    draw: function () {
      var A = BP.Art, st = STAGES[run.stage], t = S.t
      rect(0, 0, W, H, 'black')
      var hdr = (run.loop >= 2 ? 'GAUNTLET R' + (run.loop + 1) + '  ' : run.loop > 0 ? 'ROUND ' + (run.loop + 1) + '  ' : '') + 'STAGE ' + (run.stage + 1)
      TC(hdr, 10, run.loop >= 2 ? 'red' : 'white')
      TC(st.name, 24, 'gold')
      rect(0, 40, W, 72, st.band)
      for (var i = 0; i < 6; i++) rect(0, 44 + i * 12, W, 1, 'black')
      var slide = Math.max(0, 40 - t) * 3
      // native 64x64 portraits (no canvas scaling: one pixel scale everywhere)
      A.drawPortrait(ctx, 'hero', R(16 - slide), 44, 64)
      A.drawPortrait(ctx, st.who, R(176 + slide), 44, 64)
      var go = t > S.dur - 50
      if (go) BIG('GO!', 128, 64, 'gold', 3)
      else if (t > 36) {
        BIG('VS', 128, 60, blink(frame, 6) ? 'red' : 'white', 3)
        if (t > 60 && blink(frame, 12)) TC('READY?', 96, 'white')
      }
      TR('YOU', 80, 116, 'white'); T(st.cpu, 176, 116, 'red')
      T('BUZZ', 16, 128, 'beer')
      for (var k = 0; k < 5; k++) A.drawIcon(ctx, k < run.buzz ? 'mugFull' : 'mug', 16 + k * 9, 138)
      T('SKILL', 176, 128, 'lgray')
      var stars = run.loop > 0 ? 5 : st.stars
      for (var s2 = 0; s2 < stars; s2++) A.drawIcon(ctx, 'star', 176 + s2 * 9, 138)
      if (t > 50) {
        box(12, 152, 232, 56, 'dim')
        var tn = run.loop > 0 ? st.taunt2 : st.taunt
        var shown = Math.min(tn[0].length + tn[1].length, ((t - 50) / 2) | 0)
        T(st.cpu + ':', 22, 160, 'red')
        T(tn[0].slice(0, shown), 22, 176, 'white')
        if (shown > tn[0].length) T(tn[1].slice(0, shown - tn[0].length), 22, 192, 'white')
        if (t % 2 === 0 && shown < tn[0].length + tn[1].length && !FAST) sfx('letter')
      }
    },
  }

  function startStage() {
    run.stShots = 0; run.stMakes = 0
    newMatch(false, run.stage, run.loop)
    setState('match', {})
  }

  // ---------------------------------------------------------------- MATCH
  STATES.match = {
    enter: function () { paused = false },
    update: function () {
      if (paused) { updatePause(); return }
      if (pr('start') && m.phase !== 'end' && m.phase !== 'done') { doPause(); return }
      updateMatch()
    },
    draw: function () {
      drawMatch(true)
      if (paused) drawPause()
    },
  }
  function doPause() {
    if (paused) return
    paused = true; pauseSel = 0; pauseT = 0; pauseConfirm = null
    sfx('pause')
    try { BP.Audio.pause() } catch (e) {}
  }
  var pauseT = 0, pauseConfirm = null
  function unpause() {
    paused = false
    try { BP.Audio.resume() } catch (e) {}
    sfx('pause')
  }
  // NES-style YES/NO prompt (state object {sel, t}); returns 'yes' | 'no' | null
  function yesNo(st, x, y) {
    st.t++
    if (st.t < 12) return null
    if (pr('left') || pr('right') || pr('up') || pr('down') || pr('select')) { st.sel = 1 - st.sel; sfx('select') }
    var p = tap()
    if (p) {
      var mt = menuTap(p, [[x, y - 4, 52, 16], [x + 56, y - 4, 52, 16]], st.sel)
      if (mt.move != null) { st.sel = mt.move; sfx('select'); return null }
      return st.sel === 0 ? 'yes' : 'no'
    }
    if (pr('a')) return st.sel === 0 ? 'yes' : 'no'
    if (pr('b')) return 'no'
    return null
  }
  function drawYesNo(st, x, y) {
    T('YES', x + 18, y, st.sel === 0 ? 'white' : 'gray')
    T('NO', x + 74, y, st.sel === 1 ? 'white' : 'gray')
    if (blink(ticks, 16)) T('▶', x + 6 + st.sel * 56, y, 'red')
  }
  function updatePause() {
    pauseT++
    if (pauseConfirm) {
      var r = yesNo(pauseConfirm, 76, 128)
      if (r === 'no') { pauseConfirm = null; sfx('cancel') }
      else if (r === 'yes') {
        pauseConfirm = null
        paused = false
        try { BP.Audio.resume() } catch (e) {}
        sfx('cancel')
        music(null)
        go('gameover', { quit: true })
      }
      return
    }
    if (pauseT < 10) return
    var p = tap()
    if (pr('start')) { unpause(); return }
    if (pr('up') || pr('down') || pr('select')) { pauseSel = 1 - pauseSel; sfx('select') }
    var choose = -1
    if (p) {
      var mt = menuTap(p, [[72, 108, 112, 14], [72, 122, 112, 14]], pauseSel)
      if (mt.move != null) { pauseSel = mt.move; sfx('select') } else choose = pauseSel
    } else if (pr('a')) choose = pauseSel
    if (choose === 0) unpause()
    else if (choose === 1) { pauseConfirm = { sel: 1, t: 0 }; sfx('select') } // default NO
  }
  function drawPause() {
    box(40, 82, 176, 66, 'default')
    if (pauseConfirm) {
      BIG('QUIT?', 128, 92, 'red', 2)
      T('YOUR RUN ENDS', 76, 110, 'lgray')
      drawYesNo(pauseConfirm, 76, 128)
      return
    }
    BIG('PAUSE', 128, 92, 'white', 2)
    T('RESUME', 104, 112, pauseSel === 0 ? 'white' : 'lgray')
    T('QUIT', 104, 126, pauseSel === 1 ? 'white' : 'lgray')
    if (blink(ticks, 16)) T('▶', 88, 112 + pauseSel * 14, 'red')
  }

  // ---------------------------------------------------------------- STAGE CLEAR TALLY
  STATES.clear = {
    enter: function () {
      music('clear', true)
      var rm = roundMult()
      var left = alive(0)
      var acc = run.stShots ? Math.round((100 * run.stMakes) / run.stShots) : 0
      var pt = m.playT || 0, secs = Math.round(pt / 60)
      var tb = Math.round((3000 * Math.max(0, 1 - pt / 7200)) / 10) * 10 // time bonus: 3000 decaying to 0 over 2 min
      S.lines = [
        { l: 'CLEAR BONUS', v: 1000 * (run.stage + 1) * rm },
        { l: 'CUPS LEFT  ' + left + '\u00D7200', v: 200 * left * rm },
        { l: 'ACCURACY ' + acc + '%', v: acc * 10 * rm },
        { l: 'TIME ' + ((secs / 60) | 0) + ':' + pad(secs % 60, 2), v: tb * rm },
      ]
      if (m.lost === 0 && !m.overtime) S.lines.push({ l: 'PERFECT!', v: 3000 * rm, gold: true })
      S.i = 0; S.cnt = 0; S.done = false; S.wait = 0; S.total = 0
      S.confetti = []
      run.buzz = Math.max(0, run.buzz - 2)
      run.streak = Math.min(run.streak, 2)
    },
    update: function () {
      var skip = (okPr() || tap()) && S.t > 10
      // confetti
      if (S.confetti.length < 70 && frame % 2 === 0) S.confetti.push({ x: vrnd() * 256, y: -4, vy: 0.5 + vrnd(), c: ['red', 'gold', 'white', 'cyan', 'lgreen', 'pink'][(vrnd() * 6) | 0] })
      S.confetti.forEach(function (c) { c.y += c.vy; c.x += Math.sin((c.y + c.vy * 50) * 0.08) * 0.4 })
      S.confetti = S.confetti.filter(function (c) { return c.y < 244 })
      if (m) { m.excite = 1; m.poses[0] = { p: 'cheer', t: 999, delay: 0 }; m.poses[1] = { p: 'sad', t: 999, delay: 0 } }
      if (!S.done) {
        if (S.t < (FAST ? 4 : 40)) return
        var ln = S.lines[S.i]
        if (skip) {
          // finish everything
          for (var j = S.i; j < S.lines.length; j++) { var rest = S.lines[j].v - (j === S.i ? S.cnt : 0); run.score += rest; S.total += rest }
          S.i = S.lines.length; S.done = true; sfx('tally'); return
        }
        var stepv = Math.max(10, Math.ceil(ln.v / 40 / 10) * 10)
        var d = Math.min(stepv, ln.v - S.cnt)
        S.cnt += d; run.score += d; S.total += d
        if (d > 0 && S.t % 3 === 0) sfx('tally')
        if (S.cnt >= ln.v) {
          S.wait++
          if (S.wait > (FAST ? 2 : 24)) { S.i++; S.cnt = 0; S.wait = 0; sfx('tick'); if (S.i >= S.lines.length) S.done = true }
        }
        run.disp = run.score
        return
      }
      S.wait++
      run.disp = run.score
      if (!S.cp) { // anti-cheat checkpoint at each stage clear (after the tally)
        S.cp = true
        try { if (BP.Scores && BP.Scores.checkpoint) Promise.resolve(BP.Scores.checkpoint({ round: run.loop + 1, stage: run.stage, score: run.score, makes: run.makes, shots: run.shots })).then(null, function () {}) } catch (e) {}
      }
      var minOk = FAST || run.stageT0 == null || ticks - run.stageT0 >= 45 * 60
      if (minOk && ((skip && S.wait > 10) || S.wait > (FAST ? 30 : 200))) nextStage()
    },
    draw: function () {
      if (m) drawMatch(false)
      else rect(0, 0, W, H, 'black')
      S.confetti.forEach(function (c) { rect(c.x, c.y, 2, 2, c.c) })
      rect(0, 0, W, 24, 'black')
      T('1P', 8, 8, 'red'); T(pad(run.disp, 6), 32, 8, 'white')
      T('HI', 168, 8, 'red'); T(pad(Math.max(hi, run.score), 6), 192, 8, 'white')
      TC('STAGE ' + (run.stage + 1) + ' CLEAR!', 16, 'gold')
      box(20, 34, 216, 138, 'gold')
      BIG('YOU WIN!', 128, 42, 'gold', 2)
      BP.Art.drawIcon(ctx, 'trophy', 30, 46); BP.Art.drawIcon(ctx, 'trophy', 218, 46)
      for (var i = 0; i < S.lines.length; i++) {
        if (i > S.i) break
        var ln = S.lines[i], y = 66 + i * 14
        var v = i < S.i ? ln.v : S.cnt
        T(ln.l, 30, y, ln.gold ? (blink(frame, 6) ? 'gold' : 'yellow') : 'white')
        TR(pad(v, 5), 226, y, 'white')
      }
      if (S.done) {
        rect(30, 66 + S.lines.length * 14 - 4, 196, 1, 'white')
        T('TOTAL', 30, 70 + S.lines.length * 14 - 2, 'gold')
        TR(pad(S.total, 6), 226, 70 + S.lines.length * 14 - 2, 'gold')
        var nxt = run.stage >= 4 ? (run.loop === 1 ? 'YOU ARE THE CHAMPION!' : run.loop >= 2 ? 'GAUNTLET ROUND ' + (run.loop + 2) + '!' : 'ROUND 2: NO MERCY!') : 'NEXT: ' + STAGES[run.stage + 1].name
        if (blink(frame, 16)) TC(nxt, 176, 'white', true)
      }
    },
  }
  function nextStage() {
    if (run.stage >= 4 && run.loop === 1 && !run.champion) { go('ending'); return } // beat Round 2's KEGMASTER: the ending
    // ...then the CHAMPION'S GAUNTLET: endless rounds 3, 4, ... at max CPU skill, score x round number
    if (run.stage >= 4) { run.loop++; run.stage = 0 } else run.stage++
    go('vs', { stage: run.stage })
  }

  // ---------------------------------------------------------------- GAME OVER
  STATES.gameover = {
    enter: function () {
      music('gameover', true)
      S.dur = FAST ? 60 : 300
    },
    update: function () {
      if ((S.t > 40 && (okPr() || tap())) || S.t > S.dur) {
        sfx('confirm')
        go(run ? 'entry' : 'title')
      }
    },
    draw: function () {
      var A = BP.Art
      rect(0, 0, W, H, 'black')
      var y = Math.min(80, -20 + S.t * 3)
      BIG('GAME OVER', 128, y, 'red', 3)
      if (S.t > 30 && run) {
        TC('FINAL SCORE', 118, 'lgray')
        BIG(pad(run.score, 6), 128, 130, 'white', 2)
        TC('REACHED ' + (run.loop > 0 ? 'ROUND ' + (run.loop + 1) + ' ' : '') + 'STAGE ' + (run.stage + 1), 156, 'gold')
        var acc = run.shots ? Math.round((100 * run.makes) / run.shots) : 0
        TC('CUPS ' + run.cups + '   ACCURACY ' + acc + '%', 170, 'white')
      }
      A.drawPlayer(ctx, 'hero', 'sad', 40, 228, frame)
      if (run) A.drawPlayer(ctx, STAGES[run.stage].who, 'cheer', 216, 228, frame)
      if (S.t > 40 && blink(frame, 30)) TC('PUSH START', 206, 'white')
    },
  }

  // ---------------------------------------------------------------- NAME ENTRY
  var GRID = [
    'ABCDEFGHIJ'.split(''),
    'KLMNOPQRST'.split(''),
    'UVWXYZ0123'.split(''),
    '456789.-! '.split(''),
  ]
  var GX = 28, GY = 98, GCW = 20, GCH = 18
  var sessionName = '' // only pre-fill a name typed earlier in THIS page session (shared party phones)
  STATES.entry = {
    enter: function () {
      music('entry', true)
      S.nm = sessionName
      S.fresh = !!sessionName
      S.cx = 0; S.cy = 0; S.end = false
      S.sent = false; S.confirm = null; S.typed = false; S.msg = 0; S.idle = 0
    },
    update: function () {
      if (S.sent) return
      if (S.t < 30) return // input lock: mashing A on GAME OVER must not type or submit
      S.idle = anyPr() || tap() ? 0 : S.idle + 1
      if (S.msg > 0) S.msg--
      if (S.confirm) {
        var r = yesNo(S.confirm, 92, 146)
        if (r === 'yes') finishEntry()
        else if (r === 'no') { S.confirm = null; sfx('cancel') }
        return
      }
      var p = tap()
      if (p) { // taps only act when they hit a cell
        var hit = cellAt(p.x, p.y)
        if (hit) { S.cx = hit.cx; S.cy = hit.cy; S.end = hit.end; activate() }
        return
      }
      // START never submits: it only jumps the cursor to END (and is locked for the first second)
      if (pr('start')) { if (S.t > 60) { S.cy = 4; S.end = true; sfx('select') } return }
      if (pr('b')) { delLetter(); return }
      if (pr('left')) { mv(-1, 0) } else if (pr('right')) { mv(1, 0) } else if (pr('up')) { mv(0, -1) } else if (pr('down')) { mv(0, 1) }
      if (pr('a') && ticks - lastTapTick > 10) activate()
      // a player who typed a name and walked away still gets on the board (never a blank auto-submit)
      if (S.typed && S.nm.length && S.idle > 60 * 120) finishEntry()
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      BIG('NAME ENTRY', 128, 8, 'gold', 2)
      TC('SCORE ' + pad(run ? run.score : 0, 6), 28, 'white')
      for (var i = 0; i < 8; i++) {
        var x = 64 + i * 16
        rect(x, 62, 12, 2, i === S.nm.length ? (blink(frame, 8) ? 'red' : 'black') : 'gray')
        if (S.nm[i] && S.nm[i] !== ' ') BIG(S.nm[i], x + 6, 44, 'white', 2)
      }
      if (S.msg > 0) TC('ENTER A NAME FIRST!', 70, 'red')
      else if (S.fresh) TC('NEW PLAYER? B = CLEAR', 70, 'yellow')
      else if (S.nm.length >= 8) TC('NAME FULL - PICK END', 70, 'lgray')
      box(GX - 10, GY - 8, 220, 108, 'default')
      for (var r = 0; r < 4; r++) for (var c = 0; c < 10; c++) {
        var ch = GRID[r][c], sel = !S.end && S.cy === r && S.cx === c
        var cx = GX + c * GCW, cy = GY + r * GCH
        if (sel) rect(cx - 3, cy - 3, 14, 14, blink(frame, 12) ? 'red' : 'dred')
        T(ch === ' ' ? '_' : ch, cx, cy, sel ? 'white' : 'lgray')
      }
      var dsel = S.cy === 4 && !S.end, esel = S.cy === 4 && S.end
      if (dsel) rect(GX + 20 - 3, GY + 4 * GCH - 3, 46, 14, blink(frame, 12) ? 'red' : 'dred')
      if (esel) rect(GX + 120 - 3, GY + 4 * GCH - 3, 46, 14, blink(frame, 12) ? 'red' : 'dred')
      T('DEL', GX + 24, GY + 4 * GCH, dsel ? 'white' : 'lgray')
      T('END', GX + 124, GY + 4 * GCH, esel ? 'white' : 'gold')
      if (S.confirm) {
        box(56, 116, 144, 44, 'gold')
        TC('NAME: ' + S.nm, 124, 'white')
        T('OK?', 64, 146, 'gold')
        drawYesNo(S.confirm, 92, 146)
      }
      if (S.sent) { box(64, 116, 128, 32, 'gold'); if (blink(frame, 8)) TC('SENDING...', 128, 'white') }
      TC('A:ADD  B:DEL  START:GO TO END', 202, 'lgray')
      TC('OR TAP THE LETTERS', 214, 'gray')
    },
  }
  function cellAt(x, y) {
    for (var r = 0; r < 4; r++) for (var c = 0; c < 10; c++) {
      var cx = GX + c * GCW, cy = GY + r * GCH
      if (x >= cx - 6 && x < cx + 14 && y >= cy - 5 && y < cy + 13) return { cx: c, cy: r, end: false }
    }
    var yy = GY + 4 * GCH
    if (y >= yy - 6 && y < yy + 14) {
      if (x >= GX + 10 && x < GX + 80) return { cx: 2, cy: 4, end: false }
      if (x >= GX + 110 && x < GX + 180) return { cx: 7, cy: 4, end: true }
    }
    return null
  }
  function mv(dx, dy) {
    sfx('select')
    if (S.cy === 4) {
      if (dy === -1) { S.cy = 3; S.cx = S.end ? 7 : 2; S.end = false; return }
      if (dx) { S.end = !S.end; return }
      if (dy === 1) { S.cy = 0; S.cx = S.end ? 7 : 2; S.end = false }
      return
    }
    S.cx = (S.cx + dx + 10) % 10
    S.cy += dy
    if (S.cy < 0) { S.cy = 4; S.end = S.cx >= 5 }
    else if (S.cy > 3) { S.cy = 4; S.end = S.cx >= 5 }
  }
  function askEnd() {
    if (!S.nm.trim().length) { sfx('error'); S.msg = 120; return }
    S.confirm = { sel: S.fresh ? 1 : 0, t: 0 } // a pre-filled (previous player's) name defaults to NO
    sfx('select')
  }
  function activate() {
    if (S.cy === 4) { if (S.end) askEnd(); else delLetter(); return }
    if (S.nm.length >= 8) { sfx('error'); return } // full: stay put, never auto-jump to END
    S.nm += GRID[S.cy][S.cx]
    S.typed = true; S.fresh = false
    sfx('letter')
  }
  function delLetter() {
    if (S.fresh) { S.nm = ''; S.fresh = false; sfx('cancel'); return }
    if (!S.nm.length) { sfx('error'); return }
    S.nm = S.nm.slice(0, -1); sfx('cancel')
  }
  function finishEntry() {
    var nm = S.nm.trim()
    if (!nm) nm = 'PLAYER'
    sessionName = nm
    sfx('confirm')
    S.sent = true; S.sentT = S.t; S.confirm = null
    var entry = {
      name: nm, score: run.score, stage: run.stage, round: run.loop + 1, cups: run.cups,
      accuracy: run.shots ? Math.round((100 * run.makes) / run.shots) : 0,
      shots: run.shots, makes: run.makes, durationMs: Date.now() - run.t0,
    }
    var done = false
    var me = S
    function show(res) {
      if (done) return
      done = true
      var rank = res && +res.rank ? +res.rank : 0
      var rows = res && Array.isArray(res.top) ? res.top : null
      var hl = 0
      if (rows) {
        for (var i = 0; i < rows.length && i < 10; i++) if (rows[i] && rows[i].you) { hl = i + 1; break }
        if (!hl) for (var j = 0; j < rows.length && j < 10; j++) if (rows[j].name === entry.name && +rows[j].score === entry.score) { hl = j + 1; break }
      }
      if (!rank) rank = hl
      var label = !res ? 'LOCAL RANKING' : res.queued ? 'SAVED - SENDING...' : res.rejected ? 'LOCAL ONLY' : res.mode === 'global' ? 'GLOBAL RANKING' : 'LOCAL RANKING'
      if (entry.score > hi) hi = entry.score
      refreshHi()
      go('scores', { board: true, hlRank: hl, myRank: rank, myName: entry.name, myScore: entry.score, myStage: entry.stage, myRound: entry.round, preRows: rows, label: label })
    }
    me.finish = show
    try { Promise.resolve(BP.Scores.submit(entry)).then(show, function () { show(null) }) } catch (e) { show(null) }
    setTimeout(function () { show(null) }, 6000)
  }

  // ---------------------------------------------------------------- ENDING (beat Round 2's KEGMASTER)
  var CREDITS = [
    ['SUPER BEER PONG', 'gold'], ['', ''], ['- STAFF -', 'red'], ['', ''],
    ['PRODUCER', 'gold'], ['BIG KEG KENJI', 'white'], ['', ''],
    ['DIRECTOR', 'gold'], ['SPLASH-SAN', 'white'], ['', ''],
    ['PROGRAM', 'gold'], ['MR. RATTLE', 'white'], ['NETWORK NED', 'white'], ['', ''],
    ['GRAPHIC DESIGN', 'gold'], ['PIXEL PATTY', 'white'], ['', ''],
    ['SOUND COMPOSER', 'gold'], ['CHIPTUNE CHUCK', 'white'], ['', ''],
    ['PLAY TESTERS', 'gold'], ['THE WHOLE BACKYARD', 'white'], ['', ''],
    ['- CAST -', 'red'], ['CHAD', 'white'], ['TANK', 'white'], ['SKY', 'white'], ['BRO-DY', 'white'], ['THE KEGMASTER', 'white'], ['AND YOU', 'gold'], ['', ''],
    ['SPECIAL THANKS', 'gold'], ['ALL PARTY PEOPLE', 'white'], ['', ''],
    ['NO CUPS WERE HARMED', 'lgray'], ['IN THE MAKING OF', 'lgray'], ['THIS GAME.', 'lgray'], ['', ''],
    ['PRESENTED BY', 'gold'], ['PARTY SOFT', 'white'], ['', ''],
    ['THANKS FOR PLAYING!', 'gold'],
  ]
  function continueGauntlet() {
    run.loop = Math.max(2, run.loop + 1); run.stage = 0
    go('vs', { stage: 0 })
  }
  STATES.ending = {
    enter: function () {
      music('clear', true)
      sfx('win')
      run.champion = true
      S.bonus = 5000
      run.score += S.bonus; run.disp = run.score
      S.conf = []
      S.scroll = 0
    },
    update: function () {
      var t = S.t, skip = t > 60 && (okPr() || tap())
      if (S.conf.length < 80 && frame % 2 === 0) S.conf.push({ x: vrnd() * 256, y: -4, vy: 0.5 + vrnd(), c: ['red', 'gold', 'white', 'cyan', 'lgreen', 'pink'][(vrnd() * 6) | 0] })
      S.conf.forEach(function (c) { c.y += c.vy; c.x += Math.sin((c.y + c.vy * 50) * 0.08) * 0.4 })
      S.conf = S.conf.filter(function (c) { return c.y < 244 })
      if (!S.phase && (t > 420 || skip)) { S.phase = 1; S.t0 = t; music('title', true); return }
      if (S.phase === 1) {
        S.scroll += 0.5
        if (skip || S.scroll > CREDITS.length * 14 + 180) { S.phase = 2; S.t0 = t; sfx('win'); return }
      }
      if (S.phase === 2 && ((t - S.t0 > 40 && skip) || t - S.t0 > 420)) { S.phase = 3; S.t0 = t; music('vs', true); return }
      if (S.phase === 3 && ((t - S.t0 > 60 && skip) || t - S.t0 > 300)) { sfx('confirm'); continueGauntlet() }
    },
    draw: function () {
      var A = BP.Art, t = S.t
      if (!S.phase) {
        A.drawBackground(ctx, 4, frame, 1)
        A.drawTable(ctx, 4)
        A.drawPlayer(ctx, 'kegmaster', 'sad', PX[1], FEET, frame)
        var bob = ((frame / 10) | 0) % 2
        A.drawPlayer(ctx, 'hero', 'cheer', 128, FEET, frame)
        A.drawIcon(ctx, 'trophy', 124, 166 - bob * 2)
        S.conf.forEach(function (c) { rect(c.x, c.y, 2, 2, c.c) })
        box(8, 28, 240, 86, 'gold')
        TC('CONGRATULATIONS!', 38, blink(frame, 8) ? 'gold' : 'yellow')
        if (t > 60) TC('YOU ARE THE', 54, 'white')
        if (t > 90) BIG('PONG CHAMPION!', 128, 68, 'gold', 2)
        if (t > 150) TC('CHAMPION BONUS +' + S.bonus, 96, 'cyan')
        return
      }
      rect(0, 0, W, H, 'black')
      for (var i = 0; i < 40; i++) rect((i * 97 + 13) % 256, (i * 57 + frame / 3) % 240, 1, 1, i % 3 ? 'dgray' : 'white')
      if (S.phase === 1) {
        for (var k = 0; k < CREDITS.length; k++) {
          var y = 240 - S.scroll + k * 14
          if (y > -10 && y < 176) TC(CREDITS[k][0], y, CREDITS[k][1] || 'white')
        }
        rect(0, 186, W, 54, 'black')
        rect(0, 232, W, 8, 'dgreen')
        A.drawPlayer(ctx, 'hero', 'walk', 20 + ((frame / 2) | 0) % 230, 232, frame)
        return
      }
      if (S.phase === 3) {
        TC("BUT THE PARTY", 64, 'white')
        TC("ISN'T OVER...", 80, 'white')
        if (t - S.t0 > 60) BIG('GAUNTLET!', 128, 104, blink(frame, 8) ? 'red' : 'gold', 2)
        if (t - S.t0 > 100) { TC('EVERY CUP NOW PAYS X3', 136, 'gold'); TC('AND IT KEEPS RISING.', 150, 'white') }
        A.drawPlayer(ctx, 'kegmaster', 'idle', 200, 214, frame)
        A.drawPlayer(ctx, 'hero', 'aim', 56, 214, frame)
        if (t - S.t0 > 60 && blink(frame, 30)) TC(isTouch() ? 'TAP TO CONTINUE' : 'PUSH START', 200, 'white')
        return
      }
      BIG('THE END', 128, 40, 'gold', 3)
      TC('FINAL SCORE', 88, 'lgray')
      BIG(pad(run.score, 6), 128, 100, 'white', 2)
      A.drawIcon(ctx, 'crown', 124, 140)
      A.drawPlayer(ctx, 'hero', 'cheer', 128, 198, frame)
      if (blink(frame, 30)) TC(isTouch() ? 'TAP TO CONTINUE' : 'PUSH START', 208, 'white')
    },
  }

  // ---------------------------------------------------------------- TV MODE
  // ---------------------------------------------------------------- QR CODE (byte mode, ECC M/L, versions 1-6)
  var QR = (function () {
    var TAB = { // [ec codewords per block, blocks, data codewords per block]
      L: [null, [7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108], [18, 2, 68]],
      M: [null, [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27]],
    }
    var FMT = { L: 1, M: 0 }
    var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]]
    function gmul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x } return z & 255 }
    function rsDiv(deg) {
      var r = [], i, j, root = 1
      for (i = 0; i < deg - 1; i++) r.push(0)
      r.push(1)
      for (i = 0; i < deg; i++) {
        for (j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1] }
        root = gmul(root, 2)
      }
      return r
    }
    function rsRem(data, div) {
      var r = div.map(function () { return 0 })
      data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= gmul(c, f) }) })
      return r
    }
    function utf8(str) { var e = unescape(encodeURIComponent(str)), out = []; for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i)); return out }
    function formatBits(ecl, mask) {
      var data = (FMT[ecl] << 3) | mask, rem = data
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
      return ((data << 10) | rem) ^ 0x5412
    }
    function maskFn(k, x, y) {
      switch (k) {
        case 0: return (x + y) % 2 === 0
        case 1: return y % 2 === 0
        case 2: return x % 3 === 0
        case 3: return (x + y) % 3 === 0
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
        case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
        case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
        default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
      }
    }
    function encode(text, ecl) {
      var bytes = utf8(text), ver = 0, t = null, v, i, j
      for (v = 1; v <= 6; v++) { t = TAB[ecl][v]; if (t[1] * t[2] * 8 >= 12 + bytes.length * 8) { ver = v; break } }
      if (!ver) return null
      var cap = t[1] * t[2], bits = []
      var put = function (val, n) { for (var q = n - 1; q >= 0; q--) bits.push((val >>> q) & 1) }
      put(4, 4); put(bytes.length, 8); bytes.forEach(function (bb) { put(bb, 8) })
      put(0, Math.min(4, cap * 8 - bits.length))
      while (bits.length % 8) bits.push(0)
      var data = []
      for (i = 0; i < bits.length; i += 8) { var by = 0; for (j = 0; j < 8; j++) by = (by << 1) | bits[i + j]; data.push(by) }
      for (var padb = 0xec; data.length < cap; padb ^= 0xec ^ 0x11) data.push(padb)
      var div = rsDiv(t[0]), blocks = [], ecs = [], all = []
      for (i = 0; i < t[1]; i++) { var blk = data.slice(i * t[2], (i + 1) * t[2]); blocks.push(blk); ecs.push(rsRem(blk, div)) }
      for (i = 0; i < t[2]; i++) for (j = 0; j < t[1]; j++) all.push(blocks[j][i])
      for (i = 0; i < t[0]; i++) for (j = 0; j < t[1]; j++) all.push(ecs[j][i])
      var n = ver * 4 + 17, mod = [], fn = []
      for (i = 0; i < n; i++) { mod.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)) }
      var set = function (x, y, d) { mod[y][x] = d; fn[y][x] = true }
      for (i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
      var finder = function (cx, cy) {
        for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy
          if (xx >= 0 && xx < n && yy >= 0 && yy < n) set(xx, yy, d !== 2 && d !== 4)
        }
      }
      finder(3, 3); finder(n - 4, 3); finder(3, n - 4)
      var al = ALIGN[ver]
      for (i = 0; i < al.length; i++) for (j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue
        for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) set(al[i] + ax, al[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1)
      }
      var drawFormat = function (mask) {
        var fb = formatBits(ecl, mask), bit = function (k) { return ((fb >>> k) & 1) !== 0 }, k
        for (k = 0; k <= 5; k++) set(8, k, bit(k))
        set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
        for (k = 9; k < 15; k++) set(14 - k, 8, bit(k))
        for (k = 0; k < 8; k++) set(n - 1 - k, 8, bit(k))
        for (k = 8; k < 15; k++) set(8, n - 15 + k, bit(k))
        set(8, n - 8, true)
      }
      drawFormat(0)
      var bi = 0
      for (var right = n - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5
        for (var vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert
          if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++ }
        }
      }
      var applyMask = function (k) { for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) if (!fn[yy][xx] && maskFn(k, xx, yy)) mod[yy][xx] = !mod[yy][xx] }
      var best = 0, bestP = 1e9
      for (var mk = 0; mk < 8; mk++) {
        applyMask(mk); drawFormat(mk)
        var pn = penalty(mod, n)
        if (pn < bestP) { bestP = pn; best = mk }
        applyMask(mk)
      }
      applyMask(best); drawFormat(best)
      return { size: n, mod: mod, version: ver, mask: best, ecl: ecl }
    }
    function penalty(mod, n) {
      var p = 0, x, y, run, dark = 0
      for (var pass = 0; pass < 2; pass++) {
        for (y = 0; y < n; y++) {
          run = 1
          for (x = 1; x <= n; x++) {
            var cur = x < n ? (pass ? mod[x][y] : mod[y][x]) : null, prev = pass ? mod[x - 1][y] : mod[y][x - 1]
            if (cur === prev) run++
            else { if (run >= 5) p += 3 + run - 5; run = 1 }
          }
          for (x = 0; x + 10 < n; x++) {
            var g = function (k) { return pass ? mod[x + k][y] : mod[y][x + k] }
            var a1 = g(0) && !g(1) && g(2) && g(3) && g(4) && !g(5) && g(6)
            if (a1 && !g(7) && !g(8) && !g(9) && !g(10)) p += 40
            var a2 = !g(0) && !g(1) && !g(2) && !g(3) && g(4) && !g(5) && g(6) && g(7) && g(8) && !g(9) && g(10)
            if (a2) p += 40
          }
        }
      }
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) {
        var c = mod[y][x]
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3
      }
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (mod[y][x]) dark++
      p += (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10
      return p
    }
    return { encode: function (text) { return encode(text, 'M') || encode(text, 'L') }, _encode: encode, _rsDiv: rsDiv, _rsRem: rsRem, _formatBits: formatBits }
  })()
  var qrCache = null
  function playUrl() {
    try {
      if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin + location.pathname
      return location.href.split('?')[0].split('#')[0]
    } catch (e) { return '' }
  }
  function drawQR(x, y, maxPx, center) {
    var url = playUrl()
    if (!qrCache || qrCache.url !== url) { var q = null; try { q = QR.encode(url) } catch (e) {} qrCache = { url: url, q: q } }
    var q = qrCache.q
    if (!q) return 0
    var quiet = 2, sc = Math.max(2, Math.floor(maxPx / (q.size + quiet * 2))), tot = (q.size + quiet * 2) * sc
    if (center) { x += Math.floor((maxPx - tot) / 2); y += Math.floor((maxPx - tot) / 2) }
    rect(x, y, tot, tot, 'white')
    ctx.fillStyle = col('black')
    for (var yy = 0; yy < q.size; yy++) for (var xx = 0; xx < q.size; xx++) if (q.mod[yy][xx]) ctx.fillRect(x + (xx + quiet) * sc, y + (yy + quiet) * sc, sc, sc)
    return tot
  }

  // ---------------------------------------------------------------- TV MODE (party TV: leaderboard + QR)
  var wakeLock = null
  function requestWake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) {
          wakeLock = l
          try { l.addEventListener('release', function () { wakeLock = null }) } catch (e) {}
        }, function () {})
      }
    } catch (e) {}
  }
  function rowKey(r) { return (r.id || '') + '|' + r.name + '|' + r.score + '|' + (r.ts || 0) }
  STATES.tv = {
    enter: function () { S.rows = null; S.all = null; S.load = 0; S.seen = null; S.fresh = {}; S.freshT = 0; music('scores'); loadTv(); requestWake() },
    update: function () {
      S.load++
      if (S.load >= 600) { S.load = 0; loadTv() } // refresh every 10 s
      if (S.freshT > 0) S.freshT--
      if (S.t % 1800 === 0) requestWake()
      // TV mode never leaves on its own (START / taps are ignored on the party TV)
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      BIG('HIGH SCORES', 128, 8, 'gold', 2)
      TC(scoresMode() + ' RANKING', 25, scoresMode() === 'GLOBAL' ? 'cyan' : 'lgray')
      box(0, 36, 157, 151, 'default')
      T('RK', 6, 43, 'red'); T('NAME', 28, 43, 'red'); TR('SCORE', 152, 43, 'red')
      var rows = S.rows
      if (!rows) { if (blink(frame, 10)) T('LOADING...', 30, 100, 'white') }
      else if (!rows.length) { T('NO SCORES', 40, 96, 'white'); T('YET! BE THE', 32, 108, 'gold'); T('FIRST!', 56, 120, 'gold') }
      else for (var i = 0; i < 10 && i < rows.length; i++) {
        var r = rows[i], y = 56 + i * 13
        var c = i === 0 ? 'gold' : i === 1 ? 'lgray' : i === 2 ? 'orange' : 'white'
        if (S.fresh[rowKey(r)] && S.freshT > 0) { if (!blink(frame, 6)) continue; c = 'cyan' }
        if (i === 0) BP.Art.drawIcon(ctx, 'crown', 4, y)
        TR(String(i + 1), 22, y, c)
        T(String(r.name || '???').toUpperCase().slice(0, 8), 26, y, c)
        TR(pad(r.score || 0, 7), 152, y, c) // 8-char name (26..90) + 7-digit score (96..152) never touch
      }
      // QR + call to action
      box(158, 36, 98, 112, 'gold')
      var qs = drawQR(162, 40, 90, true)
      if (!qs) { T('PLAY', 186, 70, 'white'); T('ON YOUR', 178, 82, 'white'); T('PHONE!', 182, 94, 'white') }
      if (blink(frame, 20)) T('SCAN TO', 180, 133, 'gold'); else T('PLAY!', 188, 133, 'gold')
      // latest submission ticker
      if (S.latest) {
        var lt = 'LATEST: ' + String(S.latest.name).toUpperCase().slice(0, 8) + ' ' + pad(S.latest.score || 0, 6)
        rect(0, 188, W, 11, 'navy')
        TC(lt, 190, S.freshT > 0 && blink(frame, 6) ? 'cyan' : 'white')
      }
      if (blink(frame, 30)) TC('PLAY ON YOUR PHONE!', 200, 'gold', true)
      var url = playUrl().replace(/^https?:\/\//, '').replace(/index\.html$/, '').toUpperCase()
      if (location.protocol === 'file:') url = 'ASK THE HOST FOR THE LINK'
      if (url.length > 31) { TC(url.slice(0, 31), 208, 'white'); TC(url.slice(31, 62), 216, 'white') }
      else TC(url, 210, 'white')
    },
  }
  function loadTv() {
    var self = S
    try {
      Promise.resolve(BP.Scores.top(50)).then(function (r) {
        if (S !== self || !Array.isArray(r)) return
        var keys = {}, fresh = {}, any = false, latest = null
        r.forEach(function (row) {
          var k = rowKey(row); keys[k] = 1
          if (self.seen && !self.seen[k]) { fresh[k] = 1; any = true }
          if (!latest || (row.ts || 0) > (latest.ts || 0)) latest = row
        })
        if (any) { self.fresh = fresh; self.freshT = 60 * 8; sfx('tally') }
        self.seen = keys
        self.rows = r.slice(0, 10)
        self.latest = latest
      }, function () { if (S === self && !self.rows) self.rows = [] })
    } catch (e) {}
    refreshHi()
  }

  // ======================================================================== AUTOPLAY BOT (QA)
  function botTick() {
    var ap = debug.autoplay
    if (!ap || fade) return
    var skill = typeof ap === 'number' ? clamp(ap, 0, 1) : 0.97
    var n = S.name
    if (n === 'title') { if (S.t % 60 === 30) { titleCursor = 0; virt.a = true } return }
    if (n === 'vs' || n === 'clear' || n === 'gameover' || n === 'ending') { if (S.t % 40 === 39) virt.a = true; return }
    if (n === 'entry') { if (S.t === 32) virt.b = true; if (S.t === 35) virt.a = true; if (S.t === 70) virt.start = true; if (S.t === 75) virt.a = true; if (S.t === 100) virt.a = true; return }
    if (n === 'scores' || n === 'howto') { if (S.t === 130) virt.start = true; if (S.t === 132) virt.a = true; return }
    if (n !== 'match' || !m || paused) return
    if (m.ctrl[m.turn] !== 'human') return
    if (m.phase === 'aim') {
      if (bot.aimT < 0) bot.aimT = planAimT(skill)
      if (m.pt >= bot.aimT) virt.a = true
    } else if (m.phase === 'power') {
      if (bot.powT < 0) bot.powT = planPowT(skill)
      if (m.pt >= bot.powT) virt.a = true
    } else { bot.aimT = -1; bot.powT = -1 }
  }
  function windDrift(tx) {
    if (!m.wind.s) return { x: 0, z: 0 }
    var n = clamp(Math.round(30 + Math.abs(tx - HAND[0].x) * 0.18), 30, 80)
    var f = (n * (n + 1)) / 2
    return { x: m.wind.ax * f, z: m.wind.az * f }
  }
  function planAimT(skill) {
    var cs = aliveCups(1)
    var react = 14 + Math.round((1 - skill) * 20)
    var thr = 0.5 + (1 - skill) * 2.5
    var best = -1, bd = 1e9
    for (var t = m.pt + react; t < m.pt + 400; t++) {
      var p = aimPos(t)
      for (var i = 0; i < cs.length; i++) {
        var dr = windDrift(cs[i].x)
        var d = Math.hypot(p.x - (cs[i].x - dr.x), p.z - (cs[i].z - dr.z))
        if (d < bd) { bd = d; best = t }
        if (d < thr) { return t + Math.round(gauss() * (1 - skill) * 6) }
      }
    }
    return best < 0 ? m.pt + 30 : best
  }
  function planPowT(skill) {
    var best = m.pt + 20, bd = 1e9
    for (var t = m.pt + 8; t < m.pt + 8 + m.pow.period; t++) {
      var d = Math.abs(powVal(t) - m.pow.sc)
      if (d < bd) { bd = d; best = t }
    }
    return Math.max(m.pt + 4, best + Math.round(gauss() * (1 - skill) * 5))
  }

  // ======================================================================== LOOP
  function tick() {
    ticks++
    if (!(paused && S && S.name === 'match')) frame++ // pause freezes the animation frame (no pause-buffered shots)
    if (DEBUG) botTick()
    curTap = readTap()
    if (curTap) lastTapTick = ticks
    if (curTap || anyPr()) lastInput = ticks
    if (fade) {
      fade.t++
      if (fade.phase === 'out' && fade.t >= FADE_T) { var fn = fade.fn; fade.phase = 'in'; fade.t = 0; fn() }
      else if (fade.phase === 'in' && fade.t >= FADE_T) {
        fade = null
        if (pendingGo) { var pg = pendingGo; pendingGo = null; go(pg.name, pg.data) }
      }
    }
    watchdog()
    if (!fade || fade.phase === 'in') {
      if (S) {
        S.t++
        var st = STATES[S.name]
        if (st && st.update) {
          try { st.update() } catch (e) { logErr(e) }
        }
      }
    }
    for (var k in virt) virt[k] = false
    try { BP.Input.update() } catch (e) {}
  }
  function render() {
    if (!ctx || !S) return
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    try {
      var st = STATES[S.name]
      if (st && st.draw) st.draw()
    } catch (e) { logErr(e) }
    if (fade) {
      var step = Math.min(4, 1 + ((fade.t / (FADE_T / 4)) | 0))
      var lvl = fade.phase === 'out' ? step : 5 - step
      if (lvl > 0) {
        if (BP.Art.fade) { try { BP.Art.fade(ctx, lvl) } catch (e) {} }
        else { ctx.globalAlpha = Math.min(1, lvl / 4); ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
      }
    }
  }
  function logErr(e) {
    var msg = String(e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)
    if (errors.indexOf(msg) < 0) { errors.push(msg); try { console.error('[BP.Game]', msg) } catch (x) {} }
  }

  var last = null, acc = 0, started = false, fpsN = 0, fpsT = 0, fps = 0
  function loop(now) {
    requestAnimationFrame(loop)
    if (last == null) { last = now; return }
    var dt = now - last
    last = now
    if (dt < 0) dt = 0
    if (dt > 250) dt = STEP // clamp big gaps (tab switch, debugger)
    if (Math.abs(dt - STEP) < 1.2) dt = STEP // vsync snap at 60 Hz
    acc += dt
    var n = 0
    while (acc >= STEP - 0.01 && n < 8) { tick(); acc -= STEP; n++ }
    if (n >= 8) acc = 0
    fpsN++; fpsT += dt
    if (fpsT >= 1000) { fps = Math.round((fpsN * 1000) / fpsT); fpsN = 0; fpsT = 0 }
    render()
  }

  function onHide() {
    if (S && S.name === 'match' && m && !paused && m.phase !== 'end' && m.phase !== 'done') doPause()
    try { BP.Audio.pause() } catch (e) {}
  }
  function onShow() {
    last = null
    if (S && S.name === 'tv') requestWake()
    if (!(S && S.name === 'match' && paused)) { try { BP.Audio.resume() } catch (e) {} }
  }

  function start(cv) {
    if (started) return
    started = true
    canvas = cv || document.getElementById('screen')
    if (!canvas) { canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.appendChild(canvas) }
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }) } catch (e) { ctx = null }
    if (!ctx) ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    try { BP.Art.init() } catch (e) { logErr(e) }
    try { BP.Input.init(canvas) } catch (e) { logErr(e) }
    try {
      var p = BP.Scores && BP.Scores.init && BP.Scores.init()
      Promise.resolve(p).then(refreshHi, refreshHi)
    } catch (e) { refreshHi() }
    document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); else onShow() })
    window.addEventListener('blur', onHide)
    window.addEventListener('focus', onShow)
    setState(TVMODE ? 'tv' : 'title')
    requestAnimationFrame(loop)
  }

  // ======================================================================== DEBUG
  var debug = {
    get state() { return S ? S.name : 'boot' },
    get phase() { return m ? m.phase : null },
    get score() { return run ? run.score : 0 },
    get stage() { return run ? run.stage : m ? m.stage : 0 },
    get round() { return run ? run.loop + 1 : 1 },
    get cupsPlayer() { return m ? alive(0) : null },
    get cupsCpu() { return m ? alive(1) : null },
    get cups() { return m ? [alive(0), alive(1)] : null },
    get turn() { return m ? (m.turn === 0 ? 'player' : 'cpu') : null },
    get ballsLeft() { return m ? m.balls : null },
    get buzz() { return run ? run.buzz : 0 },
    get streak() { return run ? run.streak : 0 },
    get onFire() { return !!(run && run.streak >= 3) },
    get redemption() { return !!(m && m.redemption) },
    get overtime() { return !!(m && m.overtime) },
    get demo() { return !!(m && m.demo) },
    get paused() { return paused },
    get hi() { return hi },
    get shots() { return run ? run.shots : 0 },
    get makes() { return run ? run.makes : 0 },
    get ticks() { return ticks },
    get cpuAcc() { return run && run.cpuShots ? Math.round(100 * run.cpuMakes / run.cpuShots) : 0 },
    get cpuShotsN() { return run ? run.cpuShots : 0 },
    get cpuMakesN() { return run ? run.cpuMakes : 0 },
    get shotLog() { return shotLog.slice(-12) },
    get runTick0() { return run ? run.tick0 : -1 },
    get fps() { return fps },
    get wind() { return m ? m.wind.s : 0 },
    get errors() { return errors.slice() },
    get ball() { return m && m.ball ? { x: +m.ball.x.toFixed(1), y: +m.ball.y.toFixed(1), z: +m.ball.z.toFixed(1) } : null },
    get notes() { return notes.slice() },
    get cpuStats() { return JSON.parse(JSON.stringify(cpuStats)) },
  }
  var debugTools = {
    autoplay: false,
    qr: QR,
    playUrl: playUrl,
    step: function (n) { for (var i = 0; i < (n || 1); i++) tick() },
    press: function (b) { virt[b] = true },
    render: function () { render() },
    // QA: leave only n cups alive on a side (0 = hero, 1 = cpu)
    setCups: function (side, n) { if (!m) return; m.sides[side].cups.forEach(function (c, i) { c.alive = i < n; c.hitT = 99 }) },
    go: function (name, data) { fade = null; pendingGo = null; setState(name, data || {}) },
    // QA: jump straight into a match (stage 0-4, loop 0+, starting buzz)
    startAt: function (stg, loop, buzz) {
      fade = null; newRun(); run.stage = stg || 0; run.loop = loop || 0; run.buzz = buzz || 0
      startStage()
    },
  }
  if (DEBUG) { for (var dk in debugTools) debug[dk] = debugTools[dk] }
  else { try { Object.freeze(debug) } catch (e) {} }

  BP.Game = { start: start, debug: debug }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(document.getElementById('screen')) })
  else setTimeout(function () { start(document.getElementById('screen')) }, 0)
})()
