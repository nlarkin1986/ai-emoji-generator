// BP.Input — keyboard, on-screen NES pad (multi-touch), canvas tap, Gamepad API.
// Owner: UX agent. Contract: SPEC.md §3.
//   pressed(btn) is true for exactly ONE fixed tick after the button goes down — even if it was pressed and
//   released between two ticks (events never arrive mid-tick, so an edge set by an event is seen by the next
//   tick and cleared by update() at the end of that tick).
BP.Input = (function () {
  'use strict'
  var W = window, D = document
  var BTNS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']

  // ---- key maps: physical code first, then e.key fallback (old browsers / odd virtual keyboards) ----
  var CODE = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right',
    KeyZ: 'a', Space: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', Backspace: 'b',
    Enter: 'start', NumpadEnter: 'start', KeyP: 'start', Escape: 'start',
    ShiftLeft: 'select', ShiftRight: 'select', Tab: 'select'
  }
  var KEY = {
    arrowup: 'up', up: 'up', w: 'up', arrowdown: 'down', down: 'down', s: 'down', arrowleft: 'left', left: 'left', a: 'left',
    arrowright: 'right', right: 'right', d: 'right', z: 'a', ' ': 'a', spacebar: 'a', j: 'a', x: 'b', k: 'b', backspace: 'b',
    enter: 'start', p: 'start', escape: 'start', esc: 'start', shift: 'select', tab: 'select'
  }

  var held = {}, edge = {}
  var keys = {}      // key id -> btn   (keyboard)
  var touches = {}   // pointer id -> {kind:'canvas'|'dpad'|'btn', group, btns:[]}
  var gp = {}        // btn -> bool    (gamepad)
  var ptr = null     // {x,y,down,tapped}
  var canvas = null, attached = false, hasPad = false, tick = 0
  var device = 'keyboard'
  var rumbleOn = true
  try { rumbleOn = W.localStorage.getItem('bp_rumble') !== '0' } catch (e) {}

  function shell() { return (W.BP && BP.Shell) || null }
  function unlock() { try { if (BP.Audio && BP.Audio.unlock) BP.Audio.unlock() } catch (e) {} }
  function vibrate(ms) { if (!rumbleOn) return; try { if (navigator.vibrate) navigator.vibrate(ms) } catch (e) {} }
  function $(id) { return D.getElementById(id) }

  // ---- combine all sources; a false->true transition queues an edge ----
  var lastVis = ''
  function recompute() {
    var t = {}, k, id, i
    for (k in keys) t[keys[k]] = true
    for (id in touches) { var b = touches[id].btns; for (i = 0; i < b.length; i++) t[b[i]] = true }
    for (k in gp) if (gp[k]) t[k] = true
    for (i = 0; i < BTNS.length; i++) {
      var n = BTNS[i], v = !!t[n]
      if (v && !held[n]) edge[n] = true
      held[n] = v
    }
    paint()
  }
  // pressed-state visuals on the on-screen pad (mirrors every input source, so keyboard/gamepad light it up too)
  var els = null
  function paint() {
    var vis = (held.up ? 'u' : '') + (held.down ? 'd' : '') + (held.left ? 'l' : '') + (held.right ? 'r' : '') +
      (held.a ? 'A' : '') + (held.b ? 'B' : '') + (held.start ? 'S' : '') + (held.select ? 'E' : '')
    if (vis === lastVis) return
    lastVis = vis
    if (!els) {
      els = { dpad: $('dpad'), btn: {} }
      var list = D.querySelectorAll('[data-btn]')
      for (var i = 0; i < list.length; i++) (els.btn[list[i].getAttribute('data-btn')] = els.btn[list[i].getAttribute('data-btn')] || []).push(list[i])
    }
    if (els.dpad) {
      var c = els.dpad.classList
      c.toggle('u', !!held.up); c.toggle('d', !!held.down); c.toggle('l', !!held.left); c.toggle('r', !!held.right)
    }
    for (var b in els.btn) for (var j = 0; j < els.btn[b].length; j++) els.btn[b][j].classList.toggle('on', !!held[b])
  }

  // ---- geometry: which control is under a client point ----
  function rectOf(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    if (!r.width || !r.height) return null
    var cs = W.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return null
    return r
  }
  function padOn() { var s = shell(); return s ? s.padVisible() : !!rectOf($('dpad')) }
  function inRect(r, x, y, slop) { return r && x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop }
  var BTN_IDS = { a: 'sA', b: 'sB', select: 'pSel', start: 'pSt' }
  var GROUP = { a: 'ab', b: 'ab', select: 'ss', start: 'ss' }
  // nearest face button whose (generously enlarged) hit area contains the point
  function hitButton(x, y, group) {
    var best = null, bestD = 1e9
    for (var b in BTN_IDS) {
      if (group && GROUP[b] !== group) continue
      var r = rectOf($(BTN_IDS[b])); if (!r) continue
      var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2
      // ellipse with ~35% slop (min 14px) around the visual button
      var rx = r.width / 2 + Math.max(14, r.width * 0.35), ry = r.height / 2 + Math.max(14, r.height * 0.35)
      if (b === 'select' || b === 'start') { rx = r.width / 2 + Math.max(10, r.height * 0.6); ry = r.height / 2 + Math.max(16, r.height) }
      var dx = (x - cx) / rx, dy = (y - cy) / ry, dd = dx * dx + dy * dy
      if (dd <= 1 && dd < bestD) { bestD = dd; best = b }
    }
    return best
  }
  // D-pad: direction from the pad centre. 60° cardinal sectors + 30° diagonal sectors (two dirs), small dead centre.
  function dpadDirs(x, y) {
    var r = rectOf($('dpad')); if (!r) return []
    var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, dx = x - cx, dy = y - cy
    var dead = r.width * 0.08
    if (dx * dx + dy * dy < dead * dead) return []
    var out = [], ax = Math.abs(dx), ay = Math.abs(dy), T = 0.5774 // tan 30°
    if (ax > ay * T) out.push(dx < 0 ? 'left' : 'right')
    if (ay > ax * T) out.push(dy < 0 ? 'up' : 'down')
    return out
  }
  function canvasPoint(x, y) {
    var r = canvas.getBoundingClientRect()
    // account for any letterboxing (object-fit style) inside the element box
    var s = Math.min(r.width / 256, r.height / 240), w = 256 * s, h = 240 * s
    var ox = r.left + (r.width - w) / 2, oy = r.top + (r.height - h) / 2
    return { x: Math.max(0, Math.min(255, Math.floor((x - ox) / s))), y: Math.max(0, Math.min(239, Math.floor((y - oy) / s))), inside: x >= ox && x < ox + w && y >= oy && y < oy + h }
  }
  function classify(x, y, target) {
    if (canvas) { var cr = canvas.getBoundingClientRect(); if (inRect(cr, x, y, 0)) return { kind: 'canvas' } }
    if (!padOn()) return null
    var dr = rectOf($('dpad'))
    if (dr && inRect(dr, x, y, Math.max(12, dr.width * 0.2))) return { kind: 'dpad' }
    var b = hitButton(x, y)
    if (b) return { kind: 'btn', btn: b, group: GROUP[b] }
    return null
  }

  // ---- pointer lifecycle (shared by Pointer Events and the Touch Events fallback) ----
  function down(id, x, y, isTouch, target) {
    var c = classify(x, y, target)
    unlock()
    if (isTouch) {
      device = 'touch'
      var sh = shell()
      if (sh && !sh.state.pad && !sh.state.tv) sh.setPad(true, false) // touchscreen laptop: reveal the pad
    }
    if (!c) return false
    var t = { kind: c.kind, group: c.group, btns: [] }
    if (c.kind === 'canvas') {
      var p = canvasPoint(x, y)
      ptr = { x: p.x, y: p.y, down: true, tapped: true }
      t.btns = ['a']
    } else if (c.kind === 'dpad') t.btns = dpadDirs(x, y)
    else t.btns = [c.btn]
    touches[id] = t
    recompute()
    if (isTouch && c.kind !== 'canvas') vibrate(9)
    return true
  }
  function move(id, x, y) {
    var t = touches[id]; if (!t) return false
    var prev = t.btns.join()
    if (t.kind === 'dpad') t.btns = dpadDirs(x, y)
    else if (t.kind === 'btn') { var b = hitButton(x, y, t.group); t.btns = b ? [b] : [] } // slide B<->A, SELECT<->START
    else if (t.kind === 'canvas' && ptr) { var p = canvasPoint(x, y); ptr.x = p.x; ptr.y = p.y }
    if (t.btns.join() !== prev) { recompute(); if (t.kind === 'btn' && t.btns.length && device === 'touch') vibrate(6) }
    return true
  }
  function up(id) {
    var t = touches[id]; if (!t) return false
    if (t.kind === 'canvas' && ptr) ptr.down = false
    delete touches[id]
    recompute()
    return true
  }
  function releaseAll() {
    keys = {}; touches = {}; gp = {}
    if (ptr) ptr.down = false
    recompute()
  }

  function isUI(target) {
    for (var el = target; el && el !== D; el = el.parentNode) {
      if (el.hasAttribute && el.hasAttribute('data-ui')) return true
      if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
    }
    return false
  }

  // ---- keyboard ----
  function keyInfo(e) {
    var code = e.code || '', k = (e.key || '').toLowerCase()
    var btn = CODE[code] || KEY[k] || null
    if (!code && e.keyCode) { // very old browsers
      btn = btn || { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 32: 'a', 90: 'a', 88: 'b', 13: 'start', 16: 'select' }[e.keyCode] || null
    }
    return { id: code || k || String(e.keyCode), btn: btn, mute: code === 'KeyM' || (!code && k === 'm'), fs: code === 'KeyF' || (!code && k === 'f') }
  }
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    var t = e.target
    if (t && t !== D.body && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    var ki = keyInfo(e)
    if (ki.mute) {
      e.preventDefault()
      if (!e.repeat) { var sh = shell(); if (sh) sh.toggleMute(); else { unlock(); try { BP.Audio.toggleMute() } catch (x) {} } }
      return
    }
    if (ki.fs) { e.preventDefault(); if (!e.repeat) { var s2 = shell(); if (s2) s2.toggleFullscreen() } return }
    if (!ki.btn) return
    e.preventDefault() // Space/arrows/Tab/Backspace never scroll, navigate or move focus
    unlock()
    device = 'keyboard'
    if (keys[ki.id]) return // auto-repeat (or a duplicate keydown) never makes a new edge
    keys[ki.id] = ki.btn
    recompute()
  }
  function onKeyUp(e) {
    var ki = keyInfo(e)
    if (ki.btn || ki.mute || ki.fs) e.preventDefault()
    if (keys[ki.id]) { delete keys[ki.id]; recompute() }
    else if (ki.btn && (e.key === 'Shift')) { // Shift keyup can report the other side's code
      for (var k in keys) if (keys[k] === 'select' && /^Shift/.test(k)) delete keys[k]
      recompute()
    }
  }

  // ---- gamepad (polled once per tick from update()) ----
  function pollPads() {
    if (!hasPad || !navigator.getGamepads) return
    var list
    try { list = navigator.getGamepads() } catch (e) { return }
    if (!list) return
    var n = {}, any = false
    for (var i = 0; i < list.length; i++) {
      var g = list[i]; if (!g || g.connected === false) continue
      var B = g.buttons || [], A = g.axes || []
      var pb = function (j) { var b = B[j]; return !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5) }
      if (pb(0) || pb(3)) n.a = true            // south / north  -> A
      if (pb(1) || pb(2)) n.b = true            // east  / west   -> B
      if (pb(8)) n.select = true
      if (pb(9)) n.start = true
      if (pb(12)) n.up = true
      if (pb(13)) n.down = true
      if (pb(14)) n.left = true
      if (pb(15)) n.right = true
      var ax = +A[0] || 0, ay = +A[1] || 0, DZ = 0.5
      if (ax < -DZ) n.left = true; if (ax > DZ) n.right = true
      if (ay < -DZ) n.up = true; if (ay > DZ) n.down = true
      if (g.mapping !== 'standard' && A.length > 9) { // many non-standard pads report the hat on axis 9
        var hat = +A[9]
        if (hat >= -1.05 && hat <= 1.05 && Math.abs(hat - 1.2857) > 0.1) {
          var dir = Math.round((hat + 1) * 3.5) // 0=up,1=up-right,...,7=up-left
          if (dir === 7 || dir === 0 || dir === 1) n.up = true
          if (dir >= 1 && dir <= 3) n.right = true
          if (dir >= 3 && dir <= 5) n.down = true
          if (dir >= 5 && dir <= 7) n.left = true
        }
      }
    }
    var changed = false
    for (var k = 0; k < BTNS.length; k++) { var b = BTNS[k]; if (!!n[b] !== !!gp[b]) changed = true; if (n[b]) any = true }
    if (changed) {
      gp = n
      if (any) { device = 'gamepad'; unlock() }
      recompute()
    }
  }

  // ---- event wiring (attached at load so the very first press is never lost; init() just binds the canvas) ----
  function attach() {
    if (attached) return
    attached = true
    var opt = { passive: false, capture: true }
    W.addEventListener('keydown', onKeyDown, true)
    W.addEventListener('keyup', onKeyUp, true)

    if (W.PointerEvent) {
      W.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (isUI(e.target)) { unlock(); return }
        if (down(e.pointerId, e.clientX, e.clientY, e.pointerType !== 'mouse', e.target)) {
          if (e.cancelable) e.preventDefault()
          try { if (e.pointerType !== 'mouse' && e.target && e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId) } catch (x) {}
        } else if (e.pointerType === 'mouse' && !isUI(e.target)) { if (e.cancelable) e.preventDefault() }
      }, opt)
      W.addEventListener('pointermove', function (e) { if (move(e.pointerId, e.clientX, e.clientY) && e.cancelable) e.preventDefault() }, opt)
      var end = function (e) { up(e.pointerId) }
      W.addEventListener('pointerup', end, true)
      W.addEventListener('pointercancel', end, true)
      // Touch events still need cancelling: no iOS magnifier/callout, no double-tap zoom, no scroll/bounce.
      W.addEventListener('touchstart', function (e) { if (!isUI(e.target) && e.cancelable) e.preventDefault() }, opt)
      W.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault() }, opt)
      W.addEventListener('touchend', function (e) { if (!isUI(e.target) && e.cancelable) e.preventDefault() }, opt)
    } else {
      // Touch Events fallback (old iOS) + mouse
      var tdown = function (e) {
        if (isUI(e.target)) { unlock(); return }
        var any = false
        for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; if (down('t' + t.identifier, t.clientX, t.clientY, true, e.target)) any = true }
        if (e.cancelable) e.preventDefault()
        return any
      }
      var tmove = function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; move('t' + t.identifier, t.clientX, t.clientY) } if (e.cancelable) e.preventDefault() }
      var tend = function (e) { for (var i = 0; i < e.changedTouches.length; i++) up('t' + e.changedTouches[i].identifier); if (!isUI(e.target) && e.cancelable) e.preventDefault() }
      W.addEventListener('touchstart', tdown, opt)
      W.addEventListener('touchmove', tmove, opt)
      W.addEventListener('touchend', tend, opt)
      W.addEventListener('touchcancel', tend, opt)
      W.addEventListener('mousedown', function (e) { if (e.button !== 0 || isUI(e.target)) return; if (down('m', e.clientX, e.clientY, false, e.target)) e.preventDefault() }, true)
      W.addEventListener('mousemove', function (e) { move('m', e.clientX, e.clientY) }, true)
      W.addEventListener('mouseup', function () { up('m') }, true)
    }
    // no context menu / long-press menu, no iOS pinch, no double-click selection or drag
    W.addEventListener('contextmenu', function (e) { if (!isUI(e.target)) e.preventDefault() }, true)
    W.addEventListener('gesturestart', function (e) { e.preventDefault() }, opt)
    W.addEventListener('gesturechange', function (e) { e.preventDefault() }, opt)
    W.addEventListener('dblclick', function (e) { e.preventDefault() }, opt)
    W.addEventListener('selectstart', function (e) { e.preventDefault() }, opt)
    W.addEventListener('dragstart', function (e) { e.preventDefault() }, opt)
    // never leave a button stuck down
    W.addEventListener('blur', releaseAll)
    D.addEventListener('visibilitychange', function () { if (D.hidden) releaseAll() })
    W.addEventListener('pagehide', releaseAll)
    W.addEventListener('gamepadconnected', function () { hasPad = true })
    W.addEventListener('gamepaddisconnected', function () { gp = {}; recompute() })
    try { var l = navigator.getGamepads && navigator.getGamepads(); if (l) for (var i = 0; i < l.length; i++) if (l[i]) hasPad = true } catch (e) {}
    if (!canvas) canvas = $('screen')
    try { var sh = shell(); if (sh && sh.state.coarse) device = 'touch' } catch (e) {}
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', attach); else attach()

  return {
    init: function (c) {
      if (c) canvas = c
      attach()
      return this
    },
    // Called by the game once per fixed tick, at the END of the tick.
    update: function () {
      for (var i = 0; i < BTNS.length; i++) edge[BTNS[i]] = false
      if (ptr) ptr.tapped = false
      pollPads() // gamepad edges land here and are seen by the next tick
      if ((++tick % 30) === 0) { var sh = shell(); if (sh) sh.syncUI() } // reflect mute changes made elsewhere
    },
    pressed: function (b) { return !!edge[b] },
    held: function (b) { return !!held[b] },
    anyPressed: function () { for (var i = 0; i < BTNS.length; i++) if (edge[BTNS[i]]) return true; return false },
    pointer: function () { return ptr },
    rumble: function (ms) { vibrate(Math.max(1, ms | 0 || 30)) },
    // extras (optional for the game)
    setRumble: function (on) { rumbleOn = !!on; try { W.localStorage.setItem('bp_rumble', rumbleOn ? '1' : '0') } catch (e) {} },
    rumbleEnabled: function () { return rumbleOn },
    device: function () { return device }, // 'touch' | 'keyboard' | 'gamepad' — e.g. show "TAP" vs "PUSH START"
    isTouch: function () { return device === 'touch' },
    release: releaseAll
  }
})()
