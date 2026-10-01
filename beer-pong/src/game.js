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
  var CUP_R = 4, RIM_H = 10, BALL_R = 2, GRAV = 0.1
  var HAND = [{ x: 28, y: 3, z: 0 }, { x: 228, y: 3, z: 0 }]
  var PX = [16, 240], FEET = 228
  var TWO_PI = Math.PI * 2

  var STAGES = [
    { name: 'BACKYARD BASH', who: 'chad', cpu: 'CHAD', acc: 0.25, aim: 34, pow: 16, bounce: 0, wind: false, band: 'dblue', stars: 1,
      taunt: ['NICE HAT, ROOKIE.', 'THIS IS MY YARD!'] },
    { name: 'FRAT BASEMENT', who: 'tank', cpu: 'TANK', acc: 0.35, aim: 46, pow: 22, bounce: 0.05, wind: false, band: 'dred', stars: 2,
      taunt: ['TANK NO MISS.', 'TANK ONLY DRINK.'] },
    { name: 'ROOFTOP', who: 'sky', cpu: 'SKY', acc: 0.42, aim: 24, pow: 12, bounce: 0.08, wind: true, band: 'purple', stars: 3,
      taunt: ['FEEL THAT BREEZE?', 'THE WIND IS MINE.'] },
    { name: 'BEACH BONFIRE', who: 'brody', cpu: 'BRO-DY', acc: 0.48, aim: 30, pow: 14, bounce: 0.1, wind: false, band: 'dgreen', stars: 4,
      taunt: ["SURF'S UP, BRO.", 'CUPS GOING DOWN.'] },
    { name: 'CHAMPIONSHIP', who: 'kegmaster', cpu: 'KEGMASTER', acc: 0.55, aim: 40, pow: 18, bounce: 0.18, wind: false, band: 'dred', stars: 5,
      taunt: ['KNEEL BEFORE THE', 'KEGMASTER, PEON!'] },
  ]

  // ---------------------------------------------------------------- url flags
  var Q
  try { Q = new URLSearchParams(location.search) } catch (e) { Q = { has: function () { return false }, get: function () { return null } } }
  var FAST = Q.has('fast'), TVMODE = Q.has('tv')
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
  function tap() {
    try { var p = BP.Input.pointer(); return p && p.tapped ? p : null } catch (e) { return null }
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
  var bot = { aimT: -1, powT: -1, plannedFor: null }

  function setState(name, data) {
    S = { name: name, t: 0 }
    if (data) for (var k in data) S[k] = data[k]
    var st = STATES[name]
    if (st && st.enter) st.enter()
  }
  function go(name, data) {
    if (fade) return
    fade = { phase: 'out', t: 0, fn: function () { setState(name, data) } }
  }

  function refreshHi() {
    try {
      Promise.resolve(BP.Scores.best()).then(function (v) { v = +v || 0; if (v > hi) hi = v }, function () {})
    } catch (e) {}
  }

  // ======================================================================== RACKS
  function buildRack(side, rows) {
    var cups = [], dir = side === 1 ? -1 : 1, backX = side === 1 ? 218 : 38
    for (var r = 0; r < rows; r++) {
      var n = rows - r
      for (var i = 0; i < n; i++) {
        cups.push({ x: backX + dir * r * 7, z: (i - (n - 1) / 2) * 8, alive: true, hitT: 99 })
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
      if (Math.hypot(o.x - c.x, o.z - c.z) < 9) return true
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
        y = BALL_R; vy = -vy * 0.55; vx *= 0.88; vz *= 0.88; bounced = true
        continue
      }
      if (vy < 0 && y < RIM_H - 1 && (bounced || !needBounce)) return { x: x, z: z, ok: true, n: i + 1 }
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
      var n = clamp(Math.round((fastArc ? 26 : 30) + dist * (fastArc ? 0.15 : 0.18)), 30, 80)
      var ax = tx, az = tz, v = directV(p0, ax, RIM_H - 1, az, n)
      if (wind && (wind.ax || wind.az)) {
        for (var it = 0; it < 6; it++) {
          var L = simLand(p0, v, false, wind)
          ax += tx - L.x; az += tz - L.z
          v = directV(p0, ax, RIM_H - 1, az, n)
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
      fire: side === 0 && !m.demo && run && run.streak >= 3, tx: tx, tz: tz,
    }
    m.trail = []
    sfx('throw')
    sfx('whoosh')
  }

  function stepBall() {
    var b = m.ball, tgt = 1 - b.side
    b.t++
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
        if (d < CUP_R && b.y < RIM_H - 1.5 && b.y > 0) { resolveSink(c); return }
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
        } else if (b.y < RIM_H - 1 && b.y > -1 && d >= CUP_R && d < CUP_R + BALL_R) {
          var n2x = dx / d, n2z = dz / d
          var vn2 = b.vx * n2x + b.vz * n2z
          if (vn2 < 0) { b.vx -= 1.4 * vn2 * n2x; b.vz -= 1.4 * vn2 * n2z; sfx('rim') }
          b.x = c.x + n2x * (CUP_R + BALL_R); b.z = c.z + n2z * (CUP_R + BALL_R)
        }
      }
      // ---- table
      if (b.y < BALL_R && b.y > -5 && b.vy < 0 && onTable(b.x, b.z)) {
        b.y = BALL_R
        if (b.vy < -0.4) {
          b.vy = -b.vy * 0.55; b.vx *= 0.88; b.vz *= 0.88
          b.bounces++
          sfx('bounce')
          if (b.bshot && b.bounces === 1) { b.vz += gauss() * 0.04; b.vx += gauss() * 0.03 }
          puff(b.x, sy(0, b.z), 'white', 3)
        } else { b.vy = 0; b.rolling = true }
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
    // trail
    if (b.t % 2 === 0) { m.trail.push({ x: b.x, y: sy(b.y, b.z) }); if (m.trail.length > 40) m.trail.shift() }
    if (b.fire && b.t % 1 === 0) {
      part(b.x + rr2(-1, 1), sy(b.y, b.z) + rr2(-1, 1), rr2(-0.3, 0.3) - b.vx * 0.2, rr2(-0.6, -0.1), vrnd() < 0.5 ? 'orange' : 'yellow', 10 + ((vrnd() * 8) | 0), 0)
    }
    // ---- out / failsafe
    var speed = Math.abs(b.vx) + Math.abs(b.vz) + Math.abs(b.vy)
    if ((b.floor && b.t - b.floorT > 16) || b.floor >= 3 || b.x < -10 || b.x > 266 ||
        (b.rolling && speed < 0.08) || b.t > 330) resolveMiss()
  }

  // ======================================================================== FX
  function rr2(a, b) { return a + (b - a) * vrnd() }
  function part(x, y, vx, vy, c, life, g) { if (m.parts.length < 160) m.parts.push({ x: x, y: y, vx: vx, vy: vy, c: c, life: life, g: g == null ? 0.12 : g }) }
  function puff(x, y, c, n) { for (var i = 0; i < n; i++) part(x, y, rr2(-0.8, 0.8), rr2(-1, -0.2), c, 10 + ((vrnd() * 6) | 0), 0.08) }
  function splash(x, y, big) {
    var n = big ? 22 : 14
    for (var i = 0; i < n; i++) part(x, y - 2, rr2(-1.4, 1.4), rr2(-2.6, -0.6), vrnd() < 0.7 ? 'beer' : 'white', 18 + ((vrnd() * 14) | 0))
  }
  function callouts(list) { m.calls = list.map(function (c) { return { text: c[0], c: c[1] || 'white', t: 0 } }) }
  function popup(x, y, txt, c) { m.pops.push({ x: x, y: y, text: txt, c: c || 'yellow', t: 0 }) }
  function setPose(side, p, dur, delay) { m.poses[side] = { p: p, t: dur || 0, delay: delay || 0 } }

  // ======================================================================== RUN / MATCH SETUP
  function newRun() {
    run = { score: 0, disp: 0, stage: 0, loop: 0, buzz: 0, streak: 0, shots: 0, makes: 0, cups: 0, stShots: 0, stMakes: 0,
      hints: 0, best: 0, cpuShots: 0, cpuMakes: 0, t0: Date.now(), tick0: ticks }
  }
  function roundMult() { return run && run.loop > 0 ? 2 : 1 }
  function cpuAcc(stg, loop) { return Math.min(0.75, STAGES[stg].acc + 0.12 * loop) }

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
    }
    if (n === 10) { m.sides[0].form = 10; m.sides[1].form = 10 }
    tempo(1)
    if (!demo) music('stage' + stg, true)
    m.phase = 'ready'; m.pt = 0
  }

  function rollWind() {
    if (!m.st.wind) { m.wind = { ax: 0, az: 0, s: 0, ang: 0 }; return }
    var s = ri(4) // 0..3
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
    var side = m.turn
    setPose(side, 'aim', 0)
    setupAim(side)
    setupPow()
    if (m.ctrl[side] === 'cpu') m.plan = cpuPlan(side)
    else m.plan = null
    bot.aimT = -1; bot.powT = -1
  }

  // ---------------------------------------------------------------- aim + power models
  function speedMul() {
    if (!run) return 1
    var s = (1 + 0.07 * m.stage) * (m.loop > 0 ? 1.25 : 1) * (1 + 0.12 * run.buzz)
    if (run.streak >= 3) s *= 0.7
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
      ax: Math.max(9, (x1 - x0) / 2 + 5), az: Math.max(10, (z1 - z0) / 2 + 5),
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
    var sm = 1 + 0.05 * m.stage + (m.loop > 0 ? 0.25 : 0)
    m.pow = { period: Math.round(58 / sm), sc: 0.66, bw: Math.max(0.04, 0.066 - 0.004 * m.stage - (m.loop > 0 ? 0.01 : 0)) }
  }
  function powVal(t) {
    var p = m.pow.period, u = (t % p) / p
    return u < 0.5 ? u * 2 : 2 - u * 2
  }
  function powErr(v) {
    var dp = v - m.pow.sc, bw = m.pow.bw, a = Math.abs(dp)
    return a <= bw ? dp * 12 : (dp < 0 ? -1 : 1) * (bw * 12 + (a - bw) * 58)
  }

  function cpuPlan(side) {
    var st = m.st
    var acc = side === 0 ? 0.45 : cpuAcc(m.stage, m.loop)
    var cs = aliveCups(1 - side)
    var c = cs[ri(cs.length)]
    var bounce = st.bounce > 0 && cs.length >= 2 && rnd() < st.bounce
    var make = rnd() < acc
    var tx = c.x, tz = c.z, dirX = side === 0 ? 1 : -1, longShort = 0
    if (make) { tx += gauss() * 0.4; tz += gauss() * 0.4 }
    else {
      for (var k = 0; k < 16; k++) {
        var along = rnd() < 0.65
        var dd = rr(5.6, 11)
        var sgn = rnd() < 0.5 ? -1 : 1
        var cx = c.x + (along ? sgn * dd : gauss() * 2), cz = c.z + (along ? gauss() * 2 : sgn * dd)
        var ok = true
        for (var j = 0; j < cs.length; j++) if (Math.hypot(cs[j].x - cx, cs[j].z - cz) < 5.4) { ok = false; break }
        if (ok || k === 15) { tx = cx; tz = cz; longShort = along ? sgn * dirX : 0; break }
      }
    }
    var pv = m.pow.sc + (make ? rr(-0.6, 0.6) * m.pow.bw : longShort > 0 ? m.pow.bw + rr(0.05, 0.2) : longShort < 0 ? -m.pow.bw - rr(0.05, 0.25) : rr(-0.8, 0.8) * m.pow.bw)
    // crosshair shows the point the CPU aims at (upwind compensation visible)
    var ax = tx - m.wind.ax * 1600, az = tz - m.wind.az * 1600
    var at = st.aim + ri(10)
    if (side === 0) at = 30 + ri(10)
    var start = aimPos(0)
    return { tx: tx, tz: tz, ax: ax, az: az, sx: start.x, sz: start.z, pv: clamp(pv, 0.04, 0.98), bounce: bounce, aimT: at, powT: (side === 0 ? 14 : st.pow) }
  }

  // ======================================================================== RESOLUTION
  function resolveSink(c) {
    var b = m.ball, side = b.side, vic = 1 - side
    var island = !hasNeighbor(c, vic) && alive(vic) > 1
    var bounced = b.bounces > 0
    var clean = b.rim === 0 && !bounced
    c.alive = false; c.hitT = 0
    var removed = 1, extra = null
    if (bounced) { extra = nearestAlive(c, vic); if (extra) { extra.alive = false; extra.hitT = -8; removed = 2 } }
    var cx = c.x, cyy = sy(0, c.z)
    m.ball = null
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
    if (human) {
      var mult = run.streak >= 3 ? 3 : run.streak === 2 ? 2 : 1
      var rm = roundMult()
      var pts = 100 * mult * removed
      if (clean) { pts += 50; calls.push(['SWISH!', 'white']) }
      else if (bounced) { pts += 200; calls.push(['BOUNCE!', 'gold']) }
      else { pts += 25; calls.push(['RATTLED IN!', 'yellow']) }
      if (island) { pts += 250; calls.push(['ISLAND!', 'cyan']) }
      pts *= rm
      run.score += pts
      run.makes++; run.stMakes++
      run.cups += removed
      popup(cx, cyy - 22, '+' + pts, mult > 1 ? 'orange' : 'yellow')
      var before = run.streak
      run.streak++
      if (run.streak === 2) { calls.push(['HEATING UP!', 'orange']); sfx('heatingUp') }
      if (run.streak === 3) { calls.push(['ON FIRE!', 'red']); sfx('onFire'); music('fire') }
      void before
    } else {
      if (clean) calls.push(['SWISH!', 'white'])
      else if (bounced) calls.push(['BOUNCE!', 'gold'])
      else calls.push(['RATTLED IN!', 'yellow'])
      if (vic === 0 && !m.demo) {
        run.cpuMakes++
        run.buzz = Math.min(5, run.buzz + removed)
        m.lost += removed
        sfx('drink')
      }
    }
    var left = alive(vic)
    // ---- match-ending checks
    if (left === 0) {
      if (m.demo) { m.over = 'demo'; calls.unshift([side === 0 ? 'HERO WINS!' : m.sides[1].name + ' WINS!', 'gold']); return finishResolve(calls, 150) }
      if (side === 0) {
        if (m.redemption) {
          m.redemption = false; m.redUsed = true; m.overtime = true; m.otBanner = true
          run.score += 2000 * roundMult()
          popup(128, 120, '+' + 2000 * roundMult(), 'gold')
          calls.unshift(['OVERTIME!', 'orange'])
          sfx('redemption')
          m.pendingOT = true
          return finishResolve(calls, 110)
        }
        m.over = 'win'
        calls.unshift(['YOU WIN!', 'gold'])
        sfx('win'); music(null)
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
    // balls back
    if (!m.redemption && m.balls === 0 && m.made >= 2) {
      m.balls = 2; m.made = 0; m.ballsBack = true
      calls.push(['BALLS BACK!', 'lgreen'])
      sfx('ballsBack')
      if (human) { run.score += 300 * roundMult(); popup(HAND[0].x + 20, 150, '+' + 300 * roundMult(), 'lgreen') }
    }
    finishResolve(calls, 52)
  }

  function resolveMiss() {
    var b = m.ball, side = b.side
    var rim = b.rim > 0
    m.ball = null
    m.lastSank = false
    m.balls--
    sfx('miss')
    if (rim) sfx('boo')
    setPose(side, 'sad', 34)
    var calls = [[rim ? 'SPIN OUT!' : 'MISS', rim ? 'orange' : 'gray']]
    if (m.ctrl[side] === 'human') {
      if (run.streak >= 3) { calls.push(['FIRE OUT', 'gray']); music('stage' + m.stage) }
      run.streak = 0
    }
    if (m.redemption && side === 0) {
      m.over = 'lose'
      calls = [['GAME OVER', 'red']]
      sfx('lose'); music(null)
      setPose(1, 'cheer', 999); setPose(0, 'sad', 999)
      return finishResolve(calls, 160)
    }
    finishResolve(calls, 34)
  }

  function finishResolve(calls, dur) {
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
    var base = 0.15 + (alive(0) === 1 || alive(1) === 1 ? 0.3 : 0) + (run && run.streak >= 3 && !M.demo ? 0.3 : 0)
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
    if (M.st.wind && M.wind.s && frame % 3 === 0 && M.windParts.length < 18) {
      M.windParts.push({ x: M.wind.ax > 0 ? -4 : M.wind.ax < 0 ? 260 : vrnd() * 256, y: 30 + vrnd() * 140, life: 200 })
    }
    for (var wi = M.windParts.length - 1; wi >= 0; wi--) {
      var wp = M.windParts[wi]
      wp.x += M.wind.ax * 1400 + (M.wind.ax === 0 ? 0 : 0); wp.y += M.wind.az * 500 + Math.sin((frame + wi * 9) * 0.1) * 0.2; wp.life--
      if (wp.life <= 0 || wp.x < -8 || wp.x > 264) M.windParts.splice(wi, 1)
    }
    // score roll-up
    if (run && !M.demo && run.disp < run.score) run.disp = Math.min(run.score, run.disp + Math.max(5, Math.ceil((run.score - run.disp) / 6)))

    if (M.hitstop > 0) { M.hitstop--; return }

    var side = M.turn, human = M.ctrl[side] === 'human'
    var tp = tap()
    switch (M.phase) {
      case 'ready':
        // match start: brief READY / GO overlay
        if (M.pt === 1) { M.banner = 'READY?'; M.bannerC = 'white' }
        if (M.pt >= (FAST ? 10 : 50)) { startTurn(0) }
        break
      case 'banner':
        if (M.pt >= (FAST ? 14 : 44) || (!M.demo && M.pt > 10 && okPr() && side === 0)) { M.banner = ''; beginThrow() }
        break
      case 'aim':
        if (human) {
          if (run && run.hints < 4) run.hintOn = true
          var bt = tp && inR(tp, IX, IY + IH + 1, IW, 12)
          if (pr('b') || pr('select') || bt) {
            if (alive(1 - side) >= 2 || M.bounce) { M.bounce = !M.bounce; sfx(M.bounce ? 'select' : 'cancel') } else sfx('error')
          } else if (pr('a') && M.pt > 6) {
            M.lockAim = aimPos(M.pt)
            M.phase = 'power'; M.pt = 0
            sfx('aimLock')
          }
        } else {
          var P = M.plan
          if (pr('a') && !M.demo && M.pt > 4) M.pt = Math.max(M.pt, P.aimT)
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
          if (pr('a') && !M.demo && M.pt > 2) M.pt = Math.max(M.pt, P2.powT)
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
            var err = powErr(M.lockPow) * (M.bounce ? 1.5 : 1)
            var dir = side === 0 ? 1 : -1
            var tx = M.lockAim.x + dir * err, tz = M.lockAim.z
            if (run && run.buzz) { tx += gauss() * 0.2 * run.buzz; tz += gauss() * 0.2 * run.buzz }
            if (run && !M.demo) { run.shots++; run.stShots++ }
            launch(side, tx, tz, M.bounce, false)
          } else {
            if (run && !M.demo) run.cpuShots++
            launch(side, M.plan.tx, M.plan.tz, M.plan.bounce, true)
          }
          M.phase = 'flight'; M.pt = 0
        }
        break
      case 'flight':
        if (M.ball) stepBall()
        if (!M.ball && M.phase === 'flight') { /* resolved elsewhere */ }
        break
      case 'result':
        if (M.pt >= M.resT || (M.pt > 12 && human && !M.over && !M.demo && pr('a') && false)) afterResult()
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
    // wind particles
    if (M.windParts.length) M.windParts.forEach(function (w) { rect(w.x, w.y, 2, 1, 'lgray') })
    // players
    for (var s = 0; s < 2; s++) {
      var ps = M.poses[s], pose = ps.delay > 0 && ps.p === 'drink' ? 'idle' : ps.p
      if (ps.delay > 0 && ps.p !== 'drink') pose = ps.p
      if (ps.delay > 0 && (ps.p === 'sad')) pose = 'idle'
      A.drawPlayer(ctx, M.sides[s].who, pose, PX[s], FEET, frame, false)
    }
    A.drawTable(ctx, M.stage)
    // shadow of ball
    var b = M.ball
    if (b) {
      if (onTable(b.x, b.z) && b.y >= -1) A.drawShadow(ctx, R(b.x), R(sy(0, b.z)))
      else if (b.y < 0 || !onTable(b.x, b.z)) A.drawShadow(ctx, R(b.x), R(sy(FLOOR_H, b.z)))
    }
    // trail
    var fire = b && b.fire
    for (var i = 0; i < M.trail.length; i++) {
      if (i % 2 === 1 && !fire) continue
      A.drawTrailDot(ctx, R(M.trail[i].x), R(M.trail[i].y), !!fire)
    }
    // painter: cups + ball by z
    var list = []
    for (var sd = 0; sd < 2; sd++) {
      M.sides[sd].cups.forEach(function (c) {
        if (c.alive || (c.hitT >= 0 && c.hitT < 22)) list.push({ z: c.z, c: c })
        else if (c.hitT < 0) list.push({ z: c.z, c: c })
      })
    }
    if (b) list.push({ z: b.z + 0.6, b: b })
    list.sort(function (p, q) { return p.z - q.z })
    for (var k = 0; k < list.length; k++) {
      var it = list[k]
      if (it.c) {
        var c = it.c
        A.drawCup(ctx, R(c.x), R(sy(0, c.z)), c.alive || c.hitT < 0 ? 'full' : 'hit', c.alive ? 0 : Math.max(0, c.hitT))
      } else {
        A.drawBall(ctx, R(it.b.x), R(sy(it.b.y, it.b.z)), !!it.b.fire, frame)
      }
    }
    // splash anims
    for (var sd2 = 0; sd2 < 2; sd2++) {
      M.sides[sd2].cups.forEach(function (c) {
        if (!c.alive && c.hitT >= 0 && c.hitT < 24) A.drawSplash(ctx, R(c.x), R(sy(0, c.z) - 10), c.hitT)
      })
    }
    // particles
    M.parts.forEach(function (p) { rect(p.x, p.y, 1, 1, p.c) })
    // popups
    M.pops.forEach(function (p) { T(p.text, p.x - p.text.length * 4, p.y - p.t * 0.5, p.c, true) })
    ctx.restore()

    // aim inset + meter
    var ph = M.phase
    if (ph === 'aim' || ph === 'power' || ph === 'throw' || ph === 'flight') drawInset()
    // callouts
    drawCallouts()
    // banner
    if ((ph === 'banner' || ph === 'ready') && M.banner) {
      var txt = M.banner
      if (ph === 'ready' && M.pt > 30) txt = 'GO!'
      var w = Math.max(96, txt.length * 16 + 24)
      box(128 - w / 2, 112, w, 32, M.redemption ? 'gold' : 'default')
      BIG(txt, 128, 120, ph === 'ready' && M.pt > 30 ? 'gold' : M.bannerC, 2)
      if (ph === 'banner' && !M.redemption && (M.turn === 1 || M.demo || true)) {
        for (var bi = 0; bi < M.balls; bi++) A.drawIcon(ctx, 'ball', 128 - M.balls * 5 + bi * 10, 148)
      }
    }
    if (showHud !== false) drawHUD()
    if (M.demo) {
      if (blink(frame, 24)) { box(84, 108, 88, 20, 'dim'); TC('DEMO PLAY', 114, 'gold') }
      if (blink(frame, 30)) TC('PUSH START', 220, 'white', true)
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
    if (side === 0) return { x: icx + z * 2, y: IY + 8 + (TX1 - x) * 2 }
    return { x: icx - z * 2, y: IY + 8 + (x - TX0) * 2 }
  }
  function drawInset() {
    var M = m, A = BP.Art, side = M.turn, human = M.ctrl[side] === 'human'
    box(IX, IY, IW, IH, M.bounce ? 'gold' : side === 1 ? 'red' : 'default')
    ctx.save()
    ctx.beginPath(); ctx.rect(IX + 3, IY + 3, IW - 6, IH - 6); ctx.clip()
    rect(IX + 3, IY + 3, IW - 6, IH - 6, 'black')
    var icx = IX + IW / 2
    // table surface (top-down)
    rect(icx - 29, IY + 8, 58, IH, 'dred')
    rect(icx - 29, IY + 8, 58, 1, 'white')
    rect(icx - 29, IY + 8, 1, IH, 'white')
    rect(icx + 28, IY + 8, 1, IH, 'white')
    rect(icx, IY + 9, 1, IH, 'red')
    // cups
    var cs = M.sides[1 - side].cups
    cs.forEach(function (c) {
      var p = insetXY(side, c.x, c.z)
      A.drawCupTop(ctx, R(p.x), R(p.y), c.alive ? 'full' : 'gone')
    })
    // wind arrow
    if (M.wind.s) drawWindArrow(side)
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
      if (M.phase === 'aim' || blink(frame, 4)) A.drawCrosshair(ctx, R(q.x), R(q.y), frame)
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
    if (!human) T(M.sides[side].name.slice(0, 9), IX + 4, IY + IH - 11, 'red', true)
    // bounce toggle button
    if (human && (M.phase === 'aim')) {
      box(IX, IY + IH + 1, IW, 12, M.bounce ? 'gold' : 'dim')
      if (M.bounce) TC(blink(frame, 10) ? 'BOUNCE ON' : '', IY + IH + 3, 'gold')
      else T('B:BOUNCE', IX + 13, IY + IH + 3, 'lgray')
      if (M.bounce && !blink(frame, 10)) TC('B:BOUNCE', IY + IH + 3, 'yellow')
    }
    // power meter
    var mx = IX + IW + 3, my = IY, mw = 16, mh = IH
    box(mx, my, mw, mh, 'default')
    var fx = mx + 4, fy = my + 4, fw = mw - 8, fh = mh - 8
    rect(fx, fy, fw, fh, 'dgray')
    var sc = M.pow.sc, bw = M.pow.bw
    var y0 = fy + fh * (1 - (sc + bw)), y1 = fy + fh * (1 - (sc - bw))
    rect(fx, y0, fw, y1 - y0, 'green')
    rect(fx, fy + fh * (1 - sc), fw, 1, 'lgreen')
    var v = 0, show = false
    if (M.phase === 'power') {
      show = true
      v = human ? powVal(M.pt) : M.plan.pv * clamp(M.pt / M.plan.powT, 0, 1)
    } else if (M.phase === 'throw' || M.phase === 'flight') { v = M.lockPow; show = true }
    if (show) {
      var hh = fh * v
      var inZone = Math.abs(v - sc) <= bw
      rect(fx, fy + fh - hh, fw, hh, inZone ? 'lgreen' : v > sc ? 'red' : 'orange')
      if (M.phase === 'power' || blink(frame, 4)) rect(fx - 2, R(fy + fh - hh) - 1, fw + 4, 2, 'white')
    }
    // hint for first-timers
    if (human && run && run.hints < 4 && !M.demo) {
      var hint = M.phase === 'aim' ? 'TAP OR A: LOCK AIM' : M.phase === 'power' ? 'TAP IN THE GREEN!' : ''
      if (hint && blink(frame, 20)) {
        var hw = hint.length * 8 + 8
        rect(128 - hw / 2, IY + IH + (M.phase === 'aim' ? 16 : 3), hw, 10, 'black')
        TC(hint, IY + IH + (M.phase === 'aim' ? 17 : 4), 'yellow')
      }
    }
  }
  function drawWindArrow(side) {
    var M = m
    var dx = Math.cos(M.wind.ang), dz = Math.sin(M.wind.ang)
    // to inset screen direction
    var sx = side === 0 ? dz : -dz, syy = side === 0 ? -dx : dx
    var cx = IX + IW - 14, cy = IY + IH - 14, L = 4 + M.wind.s * 2
    for (var i = -L; i <= L; i++) rect(cx + sx * i, cy + syy * i, 1, 1, 'cyan')
    var hx = cx + sx * L, hy = cy + syy * L
    for (var j = 1; j <= 3; j++) {
      rect(hx - sx * j - syy * j, hy - syy * j + sx * j, 1, 1, 'cyan')
      rect(hx - sx * j + syy * j, hy - syy * j - sx * j, 1, 1, 'cyan')
    }
    T(String(M.wind.s), IX + IW - 26, IY + IH - 26 + 1, 'cyan')
  }

  function drawHUD() {
    var M = m, A = BP.Art
    rect(0, 0, W, 24, 'black')
    var score = M.demo ? 0 : run.disp
    T('1P', 8, 0, 'red')
    T(pad(score, 6), 32, 0, 'white')
    T('HI', 168, 0, 'red')
    T(pad(Math.max(hi, run ? run.score : 0), 6), 192, 0, 'white')
    var stl = (M.loop > 0 ? 'R' + (M.loop + 1) + ' ' : '') + 'ST' + (M.stage + 1)
    T(stl, 128 - stl.length * 4, 0, 'gold')
    // cups rows
    var n0 = M.sides[0].cups.length, sp0 = n0 > 6 ? 5 : 7
    M.sides[0].cups.forEach(function (c, i) { A.drawIcon(ctx, c.alive ? 'cup' : 'cupEmpty', 6 + i * sp0, 8) })
    var n1 = M.sides[1].cups.length, sp1 = n1 > 6 ? 5 : 7
    M.sides[1].cups.forEach(function (c, i) { A.drawIcon(ctx, c.alive ? 'cup' : 'cupEmpty', 242 - (n1 - 1 - i) * sp1, 8) })
    var nm = M.overtime ? 'OVERTIME' : M.redemption ? 'REDEMPTION' : M.st.name
    if (M.overtime || M.redemption) { if (blink(frame, 12)) TC(nm, 8, 'gold') } else TC(nm, 8, 'lgray')
    // row 3: balls, buzz, fire, wind
    var bl = M.redemption ? 1 : M.balls
    if (M.turn === 0 || M.demo) {
      for (var i = 0; i < Math.min(bl, 4); i++) A.drawIcon(ctx, 'ball', 6 + i * 9, 16)
    } else {
      for (var j = 0; j < Math.min(bl, 4); j++) A.drawIcon(ctx, 'ball', 242 - j * 9, 16)
    }
    if (!M.demo) {
      T('BUZZ', 44, 16, 'beer')
      for (var k = 0; k < 5; k++) A.drawIcon(ctx, k < run.buzz ? 'mugFull' : 'mug', 78 + k * 9, 16)
      var st = run.streak
      if (st >= 3) { if (blink(frame, 6)) T('ON FIRE', 128, 16, 'red'); A.drawIcon(ctx, 'fire', 186, 16) }
      else if (st === 2) T('HEAT UP', 128, 16, 'orange')
      else for (var f = 0; f < 3; f++) if (f < st) A.drawIcon(ctx, 'fire', 128 + f * 9, 16)
    }
    if (M.st.wind) {
      A.drawIcon(ctx, 'wind', 196, 16)
      var wdx = Math.cos(M.wind.ang)
      if (M.wind.s) A.drawIcon(ctx, wdx > 0.3 ? 'arrowR' : wdx < -0.3 ? 'arrowL' : 'wind', 205, 16)
      T(String(M.wind.s), 214, 16, 'cyan')
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
      if (p) {
        for (var i = 0; i < 3; i++) if (inR(p, 72, 124 + i * 14 - 3, 112, 14)) choose = i
        if (choose < 0 && S.t > 10) choose = titleCursor
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
        bx = { x: x, y: sy(h, z), z: z + 0.6 }
        list.push({ z: z + 0.6, b: bx })
        A.drawShadow(ctx, R(x), R(sy(0, z)))
      }
      list.sort(function (p, q) { return p.z - q.z })
      list.forEach(function (it) {
        if (it.c) A.drawCup(ctx, R(it.c.x), R(sy(0, it.c.z)), it.c === target && ph >= 70 && ph < 92 ? 'hit' : 'full', ph - 70)
        else A.drawBall(ctx, R(it.b.x), R(it.b.y), false, frame)
      })
      if (ph >= 70 && ph < 94) A.drawSplash(ctx, R(target.x), R(sy(0, target.z) - 10), ph - 70)
      if (ph === 70) { /* silent on title */ }
      // logo + menu
      A.drawLogo(ctx, 128, 26, frame)
      box(64, 114, 128, 52, 'default')
      for (var i = 0; i < 3; i++) {
        var yy = 124 + i * 14
        T(MENU[i], 88, yy, i === titleCursor ? 'white' : 'lgray')
        if (i === titleCursor && blink(frame, 16)) T('▶', 74, yy, 'red')
      }
      if (blink(frame, 30)) TC('PUSH START', 172, 'white', true)
      T('HI ' + pad(hi, 6), 8, 4, 'white', true)
      TC('© 1989 PARTY SOFT', 231, 'white', true)
    },
  }

  function startRun() {
    newRun()
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
      var lim = S.board ? 40 : 10
      if (S.t > lim && (okPr() || pr('b') || tap())) { sfx('cancel'); go('title') }
      if (S.board && S.t > 900) go('title')
      if (!S.board && S.t > 1800) go('title')
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      drawScoreTable(S.rows, S.hlRank, S.t)
      if (S.board && S.myRank > 10) {
        box(16, 196, 224, 16, 'gold')
        if (blink(frame, 8)) drawScoreRow(S.myRank, { name: S.myName, score: S.myScore, stage: S.myStage, round: S.myRound }, 200, 'gold')
      }
      if (S.attract) { if (blink(frame, 30)) TC('PUSH START', 220, 'white') }
      else if (S.t > 40 && blink(frame, 30)) TC('PUSH A', 222, 'lgray')
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
  function drawScoreTable(rows, hl, t) {
    BIG('HIGH SCORES', 128, 12, 'gold', 2)
    var mode = 'LOCAL'
    try { mode = BP.Scores.mode() === 'global' ? 'GLOBAL' : 'LOCAL' } catch (e) {}
    TC(mode + ' RANKING', 34, mode === 'GLOBAL' ? 'cyan' : 'lgray')
    box(8, 46, 240, 146, 'default')
    T('RK', 18, 54, 'red'); T('NAME', 46, 54, 'red'); TR('SCORE', 184, 54, 'red'); T('STG', 200, 54, 'red')
    if (!rows) { if (blink(frame, 10)) TC('LOADING...', 110, 'white'); return }
    if (!rows.length) { TC('NO SCORES YET!', 100, 'white'); TC('BE THE FIRST!', 116, 'gold'); return }
    for (var i = 0; i < 10; i++) {
      var y = 68 + i * 12
      var r = rows[i]
      if (!r) { TR(String(i + 1), 34, y, 'dgray'); T('.  --------', 34, y, 'dgray'); continue }
      var c = i === 0 ? 'gold' : i === 1 ? 'lgray' : i === 2 ? 'orange' : 'white'
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
  var HOWTO = [
    { title: 'AIM', lines: ['THE CROSSHAIR', 'SWEEPS OVER THE', 'CUPS. PRESS A OR', 'TAP TO LOCK IT.', '', 'HIT THE BEER', 'DEAD CENTER FOR', 'A SWISH!'] },
    { title: 'POWER', lines: ['PRESS A AGAIN', 'WHEN THE BAR IS', 'IN THE GREEN.', 'LOW = SHORT', 'HIGH = LONG', '', 'B: BOUNCE SHOT.', 'HARDER, BUT IT', 'TAKES 2 CUPS!'] },
    { title: 'RULES', lines: ['2 BALLS A TURN. SINK BOTH', 'FOR BALLS BACK!', '', '2 IN A ROW: HEATING UP', '3 IN A ROW: ON FIRE! X3', '', 'LOSE A CUP: +1 BUZZ.', 'BUZZ MAKES YOUR AIM SHAKY.', '', 'LOSE YOUR LAST CUP? SINK', 'ALL OF THEIRS IN A ROW', 'FOR REDEMPTION + OVERTIME!'] },
    { title: 'SCORING', lines: ['CUP ........... 100', 'SWISH ......... +50', 'RATTLED IN .... +25', 'BOUNCE SHOT .. +200', 'ISLAND CUP ... +250', 'BALLS BACK ... +300', 'HEATING UP ..... X2', 'ON FIRE ........ X3', 'STAGE CLEAR  BONUS!', 'PERFECT ...... 5000', 'ROUND 2 ........ X2'] },
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
      box(4, 36, 248, 180, 'default')
      if (S.page === 0 || S.page === 1) {
        // drawn example
        var ex = 14, ey = 50, ew = 90, eh = 82
        box(ex, ey, ew, eh, 'default')
        ctx.save(); ctx.beginPath(); ctx.rect(ex + 3, ey + 3, ew - 6, eh - 6); ctx.clip()
        rect(ex + 3, ey + 3, ew - 6, eh - 6, 'black')
        var icx = ex + ew / 2
        rect(icx - 29, ey + 8, 58, eh, 'dred'); rect(icx - 29, ey + 8, 58, 1, 'white')
        S.demoRack.forEach(function (c) { A.drawCupTop(ctx, R(icx + c.z * 2), R(ey + 8 + (TX1 - c.x) * 2), 'full') })
        if (S.page === 0) {
          var tt = frame
          A.drawCrosshair(ctx, R(icx + 13 * Math.sin(tt * 0.06)), R(ey + 8 + 14 + 12 * Math.sin(tt * 0.042 + 1)), frame)
        } else A.drawCrosshair(ctx, R(icx), R(ey + 8 + 14), frame)
        ctx.restore()
        if (S.page === 1) {
          var mx = ex + ew + 4, fh = eh - 8
          box(mx, ey, 16, eh, 'default')
          rect(mx + 4, ey + 4, 8, fh, 'dgray')
          rect(mx + 4, ey + 4 + fh * (1 - 0.74), 8, fh * 0.16, 'green')
          var u = (frame % 66) / 66, v = u < 0.5 ? u * 2 : 2 - u * 2
          var inZ = Math.abs(v - 0.66) <= 0.08
          rect(mx + 4, ey + 4 + fh * (1 - v), 8, fh * v, inZ ? 'lgreen' : v > 0.66 ? 'red' : 'orange')
          rect(mx + 2, ey + 3 + fh * (1 - v), 12, 2, 'white')
        }
        var tx = S.page === 1 ? 130 : 112
        pg.lines.forEach(function (l, i) { T(l, tx, 50 + i * 11, i === pg.lines.length - 1 ? 'gold' : 'white') })
        if (S.page === 0) {
          A.drawPlayer(ctx, 'hero', 'aim', 60, 206, frame)
          T('A', 92, 176, 'red'); T('= LOCK', 104, 176, 'white')
          T('TAP SCREEN WORKS TOO!', 40, 194, 'lgray')
        } else {
          A.drawPlayer(ctx, 'hero', 'throw', 60, 206, frame)
          T('B', 92, 168, 'red'); T('= BOUNCE ON/OFF', 104, 168, 'white')
        }
      } else if (S.page === 2) {
        pg.lines.forEach(function (l, i) { T(l, 16, 46 + i * 12, l.indexOf('FIRE') >= 0 ? 'orange' : l.indexOf('BUZZ') >= 0 ? 'beer' : l.indexOf('REDEMPTION') >= 0 ? 'gold' : 'white') })
        A.drawIcon(ctx, 'ball', 226, 46); A.drawIcon(ctx, 'ball', 236, 46)
        A.drawIcon(ctx, 'fire', 226, 94); A.drawIcon(ctx, 'mugFull', 226, 118)
      } else {
        pg.lines.forEach(function (l, i) { T(l, 52, 46 + i * 14, i === 6 || i === 7 ? 'orange' : 'white') })
        A.drawIcon(ctx, 'cup', 36, 46); A.drawIcon(ctx, 'star', 36, 60)
      }
      if (blink(frame, 30)) TC(S.page < HOWTO.length - 1 ? 'A: NEXT   B: BACK' : 'A: DONE   B: BACK', 222, 'lgray')
    },
  }

  // ---------------------------------------------------------------- VS CARD
  STATES.vs = {
    enter: function () {
      run.stage = S.stage
      S.dur = FAST ? 24 : 230
      music('vs', true)
    },
    update: function () {
      if (S.t > 8 && (okPr() || tap())) { if (S.t < S.dur - 50) { S.t = S.dur - 50; sfx('confirm') } else S.t = S.dur }
      if (S.t === S.dur - 50 && !FAST) sfx('confirm')
      if (S.t >= S.dur) startStage()
    },
    draw: function () {
      var A = BP.Art, st = STAGES[run.stage], t = S.t
      rect(0, 0, W, H, 'black')
      // stripes band
      rect(0, 52, W, 72, st.band)
      for (var i = 0; i < 6; i++) rect(0, 56 + i * 12, W, 1, 'black')
      var hdr = (run.loop > 0 ? 'ROUND ' + (run.loop + 1) + '  ' : '') + 'STAGE ' + (run.stage + 1)
      TC(hdr, 12, 'white')
      TC(st.name, 26, 'gold')
      var slide = Math.max(0, 40 - t) * 3
      ctx.save(); ctx.translate(R(20 - slide), 56); ctx.scale(2, 2); A.drawPortrait(ctx, 'hero', 0, 0); ctx.restore()
      ctx.save(); ctx.translate(R(172 + slide), 56); ctx.scale(2, 2); A.drawPortrait(ctx, st.who, 0, 0); ctx.restore()
      if (t > 36) BIG('VS', 128, 76, blink(frame, 6) ? 'red' : 'white', 3)
      TR('YOU', 84, 128, 'white'); T(st.cpu, 172, 128, 'red')
      // skill stars
      T('SKILL', 172, 140, 'lgray')
      for (var s = 0; s < 5; s++) A.drawIcon(ctx, 'star', 172 + s * 9, 150 - 0) // drawn below, colored by text
      for (var s2 = st.stars + Math.min(0, 0); s2 < 5; s2++) rect(172 + s2 * 9, 150, 8, 8, 'black')
      if (run.loop > 0) T('+' + run.loop, 218, 140, 'red')
      T('BUZZ', 20, 140, 'beer')
      for (var k = 0; k < 5; k++) A.drawIcon(ctx, k < run.buzz ? 'mugFull' : 'mug', 20 + k * 9, 150)
      if (t > 50) {
        box(16, 164, 224, 34, 'dim')
        var shown = Math.min(st.taunt[0].length + st.taunt[1].length, ((t - 50) / 2) | 0)
        T(st.cpu + ':', 24, 170, 'red')
        T(st.taunt[0].slice(0, shown), 24 + 0, 180, 'white')
        if (shown > st.taunt[0].length) T(st.taunt[1].slice(0, shown - st.taunt[0].length), 24, 189, 'white')
        if (t % 2 === 0 && shown < st.taunt[0].length + st.taunt[1].length && !FAST) sfx('letter')
      }
      if (t > S.dur - 50) BIG('GO!', 128, 208, 'gold', 2)
      else if (t > 40) { if (blink(frame, 12)) BIG('READY?', 128, 208, 'white', 2) }
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
    paused = true; pauseSel = 0
    sfx('pause')
    try { BP.Audio.pause() } catch (e) {}
  }
  function unpause() {
    paused = false
    try { BP.Audio.resume() } catch (e) {}
    sfx('pause')
  }
  function updatePause() {
    var p = tap()
    if (pr('start')) { unpause(); return }
    if (pr('up') || pr('down') || pr('select')) { pauseSel = 1 - pauseSel; sfx('select') }
    var choose = -1
    if (p) {
      if (inR(p, 80, 110, 96, 12)) choose = 0
      else if (inR(p, 80, 124, 96, 12)) choose = 1
      else choose = -2
    } else if (pr('a')) choose = pauseSel
    if (choose === -2) return
    if (choose === 0) unpause()
    else if (choose === 1) {
      paused = false
      try { BP.Audio.resume() } catch (e) {}
      sfx('cancel')
      music(null)
      go('gameover', { quit: true })
    }
  }
  function drawPause() {
    box(72, 84, 112, 60, 'default')
    BIG('PAUSE', 128, 92, 'white', 2)
    T('RESUME', 104, 112, pauseSel === 0 ? 'white' : 'lgray')
    T('QUIT', 104, 126, pauseSel === 1 ? 'white' : 'lgray')
    if (blink(frame, 16)) T('▶', 88, 112 + pauseSel * 14, 'red')
  }

  // ---------------------------------------------------------------- STAGE CLEAR TALLY
  STATES.clear = {
    enter: function () {
      music('clear', true)
      var rm = roundMult()
      var left = alive(0)
      var acc = run.stShots ? Math.round((100 * run.stMakes) / run.stShots) : 0
      S.lines = [
        { l: 'CLEAR BONUS', v: 1000 * (run.stage + 1) * rm },
        { l: 'CUPS LEFT  ' + left + '×200', v: 200 * left * rm },
        { l: 'ACCURACY ' + acc + '%', v: acc * 10 * rm },
      ]
      if (m.lost === 0 && !m.overtime) S.lines.push({ l: 'PERFECT!', v: 5000 * rm, gold: true })
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
      if ((skip && S.wait > 10) || S.wait > (FAST ? 30 : 200)) nextStage()
    },
    draw: function () {
      if (m) drawMatch(false)
      else rect(0, 0, W, H, 'black')
      S.confetti.forEach(function (c) { rect(c.x, c.y, 2, 2, c.c) })
      rect(0, 0, W, 24, 'black')
      T('1P', 8, 0, 'red'); T(pad(run.disp, 6), 32, 0, 'white')
      T('HI', 168, 0, 'red'); T(pad(Math.max(hi, run.score), 6), 192, 0, 'white')
      TC('STAGE ' + (run.stage + 1) + ' CLEAR!', 10, 'gold')
      box(20, 34, 216, 112, 'gold')
      BIG('YOU WIN!', 128, 42, 'gold', 2)
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
        var nxt = run.stage >= 4 ? 'ROUND ' + (run.loop + 2) + ' NEXT!' : 'NEXT: ' + STAGES[run.stage + 1].name
        if (blink(frame, 16)) TC(nxt, 150, 'white', true)
      }
    },
  }
  function nextStage() {
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
        if (run && run.score > 0) go('entry')
        else go('title')
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
  var GX = 28, GY = 104, GCW = 20, GCH = 18
  STATES.entry = {
    enter: function () {
      music('entry', true)
      var last = ''
      try { last = localStorage.getItem('bp_name') || '' } catch (e) {}
      S.nm = String(last).toUpperCase().replace(/[^A-Z0-9 .!\-]/g, '').slice(0, 8)
      S.cx = 0; S.cy = S.nm ? 4 : 0; S.end = !!S.nm
      S.sent = false
    },
    update: function () {
      if (S.sent) return
      var p = tap()
      if (p) {
        var hit = cellAt(p.x, p.y)
        if (hit) { S.cx = hit.cx; S.cy = hit.cy; S.end = hit.end; activate() }
        return
      }
      if (pr('start')) { finishEntry(); return }
      if (pr('b')) { delLetter(); return }
      if (pr('left')) { mv(-1, 0) } else if (pr('right')) { mv(1, 0) } else if (pr('up')) { mv(0, -1) } else if (pr('down')) { mv(0, 1) }
      if (pr('a')) activate()
      if (S.t > 60 * 60) finishEntry()
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      BIG('NAME ENTRY', 128, 8, 'gold', 2)
      TC('SCORE ' + pad(run ? run.score : 0, 6), 30, 'white')
      // name slots
      for (var i = 0; i < 8; i++) {
        var x = 64 + i * 16
        rect(x, 66, 12, 2, i === S.nm.length ? (blink(frame, 8) ? 'red' : 'black') : 'gray')
        if (S.nm[i] && S.nm[i] !== ' ') BIG(S.nm[i], x + 6, 48, 'white', 2)
      }
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
      if (S.sent) { box(64, 100, 128, 32, 'gold'); if (blink(frame, 8)) TC('SENDING...', 112, 'white') }
      TC('A:ADD  B:DEL  START:END', 212, 'lgray')
      TC('OR TAP THE LETTERS', 224, 'gray')
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
  function activate() {
    if (S.cy === 4) { if (S.end) finishEntry(); else delLetter(); return }
    if (S.nm.length >= 8) { sfx('error'); S.cy = 4; S.end = true; return }
    S.nm += GRID[S.cy][S.cx]
    sfx('letter')
    if (S.nm.length >= 8) { S.cy = 4; S.end = true }
  }
  function delLetter() {
    if (!S.nm.length) { sfx('error'); return }
    S.nm = S.nm.slice(0, -1); sfx('cancel')
  }
  function finishEntry() {
    var nm = S.nm.trim()
    if (!nm) nm = 'PLAYER'
    try { localStorage.setItem('bp_name', nm) } catch (e) {}
    sfx('confirm')
    S.sent = true
    var entry = {
      name: nm, score: run.score, stage: run.stage, round: run.loop + 1, cups: run.cups,
      accuracy: run.shots ? Math.round((100 * run.makes) / run.shots) : 0,
      shots: run.shots, makes: run.makes, durationMs: Date.now() - run.t0,
    }
    var done = false
    function show(res) {
      if (done) return
      done = true
      var rank = res && +res.rank ? +res.rank : 0
      var rows = res && Array.isArray(res.top) ? res.top : null
      var hl = 0
      if (rows) {
        for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].you) { hl = i + 1; break }
        if (!hl) for (var j = 0; j < rows.length; j++) if (rows[j].name === entry.name && +rows[j].score === entry.score) { hl = j + 1; break }
      }
      if (!rank) rank = hl
      if (entry.score > hi) hi = entry.score
      refreshHi()
      go('scores', { board: true, hlRank: hl, myRank: hl ? 0 : rank, myName: entry.name, myScore: entry.score, myStage: entry.stage, myRound: entry.round, preRows: rows })
    }
    try { Promise.resolve(BP.Scores.submit(entry)).then(show, function () { show(null) }) } catch (e) { show(null) }
    setTimeout(function () { show(null) }, 6000)
  }

  // ---------------------------------------------------------------- TV MODE
  STATES.tv = {
    enter: function () { S.rows = null; S.load = 0; music('scores'); loadTv() },
    update: function () {
      S.load++
      if (S.load >= 600) { S.load = 0; loadTv() }
      if (pr('start')) go('title')
    },
    draw: function () {
      rect(0, 0, W, H, 'black')
      drawScoreTable(S.rows, 0, S.t)
      if (blink(frame, 24)) TC('PLAY ON YOUR PHONE!', 198, 'gold', true)
      var url = ''
      try { url = (location.host + location.pathname).replace(/index\.html$/, '') } catch (e) {}
      if (!url || location.protocol === 'file:') url = 'ASK THE HOST FOR THE LINK'
      url = url.toUpperCase()
      if (url.length > 31) { TC(url.slice(0, 31), 212, 'white'); TC(url.slice(31, 62), 222, 'white') }
      else TC(url, 214, 'white')
    },
  }
  function loadTv() {
    var self = S
    try { Promise.resolve(BP.Scores.top(10)).then(function (r) { if (S === self) self.rows = Array.isArray(r) ? r : [] }, function () {}) } catch (e) {}
    refreshHi()
  }

  // ======================================================================== AUTOPLAY BOT (QA)
  function botTick() {
    var ap = debug.autoplay
    if (!ap || fade) return
    var skill = typeof ap === 'number' ? clamp(ap, 0, 1) : 0.97
    var n = S.name
    if (n === 'title') { if (S.t % 60 === 30) { titleCursor = 0; virt.a = true } return }
    if (n === 'vs' || n === 'clear' || n === 'gameover') { if (S.t % 40 === 39) virt.a = true; return }
    if (n === 'entry') { if (S.t === 40) virt.start = true; return }
    if (n === 'scores' || n === 'howto') { if (S.t === 70) virt.start = true; if (S.t === 72) virt.a = true; return }
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
    for (var t = m.pt + 4; t < m.pt + 300; t++) {
      if (Math.abs(powVal(t) - m.pow.sc) < 0.015) return Math.max(m.pt + 4, t + Math.round(gauss() * (1 - skill) * 5))
    }
    return m.pt + 20
  }

  // ======================================================================== LOOP
  function tick() {
    ticks++
    frame++
    botTick()
    if (fade) {
      fade.t++
      if (fade.phase === 'out' && fade.t >= FADE_T) { fade.fn(); fade.phase = 'in'; fade.t = 0 }
      else if (fade.phase === 'in' && fade.t >= FADE_T) fade = null
    }
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
        ctx.globalAlpha = Math.min(1, lvl / 4)
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
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
    if (!(S && S.name === 'match' && paused)) { try { BP.Audio.resume() } catch (e) {} }
  }

  function start(cv) {
    if (started) return
    started = true
    canvas = cv || document.getElementById('screen')
    if (!canvas) { canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.appendChild(canvas) }
    ctx = canvas.getContext('2d')
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
    autoplay: false,
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
    get runTick0() { return run ? run.tick0 : -1 },
    get fps() { return fps },
    get wind() { return m ? m.wind.s : 0 },
    get errors() { return errors.slice() },
    get ball() { return m && m.ball ? { x: +m.ball.x.toFixed(1), y: +m.ball.y.toFixed(1), z: +m.ball.z.toFixed(1) } : null },
    step: function (n) { for (var i = 0; i < (n || 1); i++) tick() },
    press: function (b) { virt[b] = true },
  }

  BP.Game = { start: start, debug: debug, STAGES: STAGES }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(document.getElementById('screen')) })
  else setTimeout(function () { start(document.getElementById('screen')) }, 0)
})()
