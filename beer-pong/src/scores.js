/* BP.Scores — shared party leaderboard with graceful offline fallback.
 *
 * Backends, in detection order:
 *   1. claude.ai Artifact db (window.claude.use('db')), collection "scores", one doc per run.
 *   2. Same-origin HTTP API  GET/POST /api/beerpong/scores  (Next.js route + Vercel KV / Upstash).
 *   3. localStorage only ("LOCAL" table).
 * Every submit is ALSO saved locally (bp_scores, top 50). A global submit that fails transiently
 * (offline, timeout, 429, 5xx) is queued in bp_pending and retried on the next init/submit/top
 * and on the browser 'online' event, so no party score is lost on flaky wifi.
 * No method ever rejects; every network call has a ~4 s timeout.
 *
 * Anti-cheat is a speed bump only: names are sanitised, numbers clamped, and each run summary
 * carries an FNV-1a checksum salted with a STATIC string that ships in this file — anyone reading
 * the source can forge it. The server additionally applies plausible() (mirrored below) and a
 * per-IP rate limit. Keep SALT / checksum() / plausible() identical to the route.ts versions.
 *
 * submit(entry): entry = {name, score, stage, round, cups, accuracy, shots, makes, durationMs}
 *   stage = 0-based stage index reached, round = 1-based loop (Round 2 = 2),
 *   shots/makes = whole-run totals for the player, durationMs = whole-run play time (all optional
 *   except score, but please send them).
 * -> {rank, top, mode, id, queued?, rejected?}; the caller's row in `top` has `you: true`.
 */
BP.Scores = (function () {
  'use strict'
  var API = '/api/beerpong/scores'
  var SALT = 'SBP-1989-PARTYSOFT'
  var K_SCORES = 'bp_scores', K_PENDING = 'bp_pending'
  var TIMEOUT = 4000, DB_WAIT = 3000, LOCAL_KEEP = 50, PENDING_KEEP = 30
  var MAX_SCORE = 9999999

  var backend = null      // 'db' | 'http' | null
  var dbns = null         // artifact db namespace
  var degraded = false    // global backend currently unreachable and nothing cached
  var cache = null        // last good global top list
  var globalBest = 0      // best global score ever seen this session
  var initP = null, flushP = null, lastFlush = 0, lastError = null

  // ------------------------------------------------------------- utils ----
  function lsGet(k, d) { try { var v = JSON.parse(window.localStorage.getItem(k)); return v == null ? d : v } catch (e) { return d } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* private mode / full */ } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function timeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false
      var t = setTimeout(function () { if (!done) { done = true; resolve(fallback) } }, ms)
      Promise.resolve(p).then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v) } },
        function () { if (!done) { done = true; clearTimeout(t); resolve(fallback) } })
    })
  }
  function num(v) { v = Number(v); return isFinite(v) ? v : null }
  function int(v, lo, hi, d) { v = num(v); if (v === null) return d; v = Math.round(v); return Math.max(lo, Math.min(hi, v)) }
  function rid() {
    var s = Date.now().toString(36) + '-'
    try { var a = new Uint32Array(2); window.crypto.getRandomValues(a); return s + a[0].toString(36) + a[1].toString(36) } catch (e) { }
    return s + Math.random().toString(36).slice(2, 12)
  }

  var BAD = /FUCK|SHIT|CUNT|NIGG|FAGG|NAZI|HITLER|KKK|WHORE|SLUT|BITCH|PUSSY|RAPIST/
  function sanitizeName(raw) {
    var s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9 .\-!♥]/g, '')
      .replace(/ +/g, ' ').trim().slice(0, 8).trim()
    if (!s || BAD.test(s.replace(/[^A-Z]/g, ''))) return 'PLAYER'
    return s
  }

  function fnv1a(str) {
    var h = 0x811c9dc5
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return ('0000000' + h.toString(16)).slice(-8)
  }
  var SUM_FIELDS = ['v', 'id', 'name', 'score', 'stage', 'round', 'cups', 'accuracy', 'shots', 'makes', 'durationMs', 'ts']
  function checksum(p) {
    return fnv1a(SALT + '|' + SUM_FIELDS.map(function (k) { return p[k] === undefined || p[k] === null ? '' : String(p[k]) }).join('|'))
  }

  // Generous ceiling — see route.ts for the formula. Returns null when OK, else a reason.
  function plausible(p) {
    var R = Math.max(1, p.round), S = (R - 1) * 5 + p.stage + 1, cleared = Math.max(0, S - 2)
    var makesEff = p.makes != null ? p.makes : S * 25
    if (p.score > (makesEff * 3000 + S * 16000) * R + 10000) return 'score_too_high'
    if (p.makes != null && p.shots != null && p.makes > p.shots) return 'makes_gt_shots'
    if (p.shots != null && p.durationMs != null && p.shots > p.durationMs / 400 + 20) return 'too_fast'
    if (p.makes != null && p.makes < cleared * 3) return 'too_few_makes'
    if (p.durationMs != null && p.durationMs < cleared * 5000) return 'too_short'
    return null
  }

  function buildPayload(e) {
    e = e || {}
    var p = {
      v: 1, id: rid(), name: sanitizeName(e.name),
      score: int(e.score, 0, MAX_SCORE, 0), stage: int(e.stage, 0, 999, 0), round: int(e.round, 0, 999, 1),
    }
    var cups = int(e.cups, 0, 9999, null); if (cups !== null) p.cups = cups
    var acc = num(e.accuracy); if (acc !== null) p.accuracy = Math.round(Math.max(0, Math.min(100, acc)) * 10) / 10
    var shots = int(e.shots, 0, 100000, null); if (shots !== null) p.shots = shots
    var makes = int(e.makes, 0, 100000, null); if (makes !== null) p.makes = makes
    var dur = int(e.durationMs, 0, 86400000, null); if (dur !== null) p.durationMs = dur
    p.ts = Date.now()
    p.sum = checksum(p)
    return p
  }

  function norm(o) {
    if (!o || typeof o !== 'object') return null
    var score = num(o.score); if (score === null) return null
    return { id: String(o.id || ''), name: sanitizeName(o.name), score: score, stage: int(o.stage, 0, 999, 0), round: int(o.round, 0, 999, 1), ts: num(o.ts) || 0 }
  }
  function sortList(a) { return a.sort(function (x, y) { return y.score - x.score || x.ts - y.ts }) }
  function clean(list) { var out = []; for (var i = 0; i < (list || []).length; i++) { var e = norm(list[i]); if (e) out.push(e) } return out }
  function rankIn(list, p) { var r = 1; for (var i = 0; i < list.length; i++) if (list[i].score > p.score) r++; return r }
  function withYou(list, id) { return list.map(function (e) { var c = norm(e); if (id && e.id === id) c.you = true; return c }) }
  function seeBest(list) { for (var i = 0; i < list.length; i++) if (list[i].score > globalBest) globalBest = list[i].score }

  // ------------------------------------------------------------- local ----
  function localList() { return sortList(clean(lsGet(K_SCORES, []))) }
  function saveLocal(p) {
    var a = localList().filter(function (e) { return e.id !== p.id })
    a.push(norm(p)); sortList(a)
    lsSet(K_SCORES, a.slice(0, LOCAL_KEEP))
    return a
  }
  function pending() { var a = lsGet(K_PENDING, []); return Array.isArray(a) ? a : [] }
  function setPending(a) { lsSet(K_PENDING, a.slice(-PENDING_KEEP)) }
  function enqueue(p) { var a = pending().filter(function (x) { return x && x.id !== p.id }); a.push(p); setPending(a) }
  // Global list as the player should see it: last good list + their not-yet-delivered scores.
  function mergedGlobal(list, extra) {
    var seen = {}, out = []
    var all = (list || []).concat(clean(pending()), extra ? [norm(extra)] : [])
    for (var i = 0; i < all.length; i++) { var e = all[i]; if (!e || (e.id && seen[e.id])) continue; if (e.id) seen[e.id] = 1; out.push(e) }
    return sortList(out)
  }

  // -------------------------------------------------------------- http ----
  // Only probe the API where it can exist: the Next app (and devserver) set cookie bp_api=1 on the
  // game page; ?api forces it. On static hosts / file:// / artifacts we never fetch, so no 404s
  // ("Failed to load resource") ever reach the console.
  function canHttp() {
    try {
      return /^https?:$/.test(window.location.protocol) && typeof fetch === 'function' &&
        (/(^|;\s*)bp_api=1/.test(document.cookie) || /[?&]api(\b|=|&|$)/.test(window.location.search))
    } catch (e) { return false }
  }
  // Resolves {status, json}; status 0 = network error / timeout. Never rejects.
  function req(method, query, body) {
    var ctl = null; try { ctl = new AbortController() } catch (e) { }
    var opts = { method: method, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'x-bp-soft': '1' } }
    if (ctl) opts.signal = ctl.signal
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body) }
    var p = fetch(API + (query || ''), opts).then(function (r) {
      return r.json().then(function (j) {
        // soft errors arrive as 200 {ok:false, status} (see route.ts soften())
        return { status: r.status === 200 && j && j.ok === false && j.status ? j.status : r.status, json: j }
      }, function () { return { status: r.status, json: null } })
    })
    return timeout(p, TIMEOUT, { status: 0, json: null }).then(function (r) {
      if (r.status === 0 && ctl) { try { ctl.abort() } catch (e) { } }
      return r
    })
  }

  // ---------------------------------------------------------------- db ----
  function dbTop(n) {
    return timeout(dbns.collection('scores').orderBy('score', 'desc').limit(n).get().then(function (snap) {
      return sortList(clean(snap.docs.map(function (d) { return d.data() })))
    }), TIMEOUT, null)
  }

  // ------------------------------------------------------- global ops ----
  // -> list or null (failed)
  function fetchTop(n) {
    if (backend === 'db') return dbTop(n)
    if (backend === 'http') return req('GET', '?limit=' + n).then(function (r) {
      return r.status === 200 && r.json && Array.isArray(r.json.top) ? sortList(clean(r.json.top)) : null
    })
    return Promise.resolve(null)
  }
  // -> {status:'ok', rank, top} | {status:'retry'} | {status:'rejected', reason}
  function push(p) {
    var why = plausible(p)
    if (why) return Promise.resolve({ status: 'rejected', reason: why })
    if (backend === 'http') return req('POST', '', p).then(function (r) {
      var j = r.json || {}
      if (r.status === 200 && j.ok) return { status: 'ok', rank: j.rank, top: clean(j.top) }
      if (r.status === 503 && j.error === 'leaderboard_unconfigured') return { status: 'rejected', reason: j.error }
      if (r.status === 0 || r.status === 429 || r.status >= 500) return { status: 'retry', reason: j.error || ('http_' + r.status) }
      return { status: 'rejected', reason: j.error || ('http_' + r.status) }
    })
    if (backend === 'db') {
      var doc = { id: p.id, name: p.name, score: p.score, stage: p.stage, round: p.round, ts: p.ts }
      ;['cups', 'accuracy', 'shots', 'makes', 'durationMs'].forEach(function (k) { if (p[k] != null) doc[k] = p[k] })
      var write = function () { return dbns.collection('scores').doc(p.id).set(doc) } // fixed id => retry-safe
      var fail = {}
      return timeout(write().catch(function (e) {
        var code = e && e.code
        if (code === 'unavailable') return sleep(300 + Math.random() * 700).then(write)
        throw e
      }).then(function () { return 'ok' }, function (e) { return { code: (e && e.code) || 'unavailable' } }), TIMEOUT, fail).then(function (w) {
        if (w === fail) return { status: 'retry', reason: 'timeout' }
        if (w !== 'ok') {
          var c = w.code
          if (c === 'unavailable' || c === 'resource_exhausted') return { status: 'retry', reason: c }
          return { status: 'rejected', reason: c } // view-only viewer, quota, revoked...
        }
        return Promise.all([
          dbTop(10),
          timeout(dbns.collection('scores').where('score', '>', p.score).limit(1000).get().then(function (s) { return s.size }), TIMEOUT, null),
        ]).then(function (r) {
          var top = r[0] || mergedGlobal(cache, p)
          return { status: 'ok', rank: r[1] != null ? r[1] + 1 : rankIn(top, p), top: top }
        })
      })
    }
    return Promise.resolve({ status: 'rejected', reason: 'no_backend' })
  }

  // Deliver queued scores, oldest first. Single-flight; stops at the first transient failure.
  function flush() {
    if (!backend || flushP) return flushP || Promise.resolve()
    var q = pending(); if (!q.length) return Promise.resolve()
    lastFlush = Date.now()
    flushP = (function next() {
      var item = pending()[0]
      if (!item) return Promise.resolve()
      return push(item).then(function (r) {
        if (r.status === 'retry') { lastError = r.reason; return }
        setPending(pending().filter(function (x) { return x && x.id !== item.id }))
        if (r.status === 'ok') { cache = r.top; seeBest(r.top) } else lastError = r.reason
        return next()
      })
    })().then(function () { flushP = null }, function () { flushP = null })
    return flushP
  }

  // --------------------------------------------------------- detection ----
  function detect() {
    var hasClaude = false
    try { hasClaude = !!(window.claude && typeof window.claude.use === 'function') } catch (e) { }
    var step = Promise.resolve(null)
    if (hasClaude) {
      step = timeout(Promise.resolve().then(function () { return window.claude.use('db') }), DB_WAIT, null).then(function (ns) {
        if (!ns) return null
        dbns = ns; backend = 'db'
        return dbTop(10).then(function (list) {
          if (list) return list
          backend = null; dbns = null; return null
        })
      })
    }
    return step.then(function (list) {
      if (list) return list
      if (!canHttp()) return null
      backend = 'http'
      return fetchTop(10).then(function (l) { if (!l) backend = null; return l })
    }).then(function (list) {
      if (list) { cache = list; seeBest(list) }
    })
  }

  function init() {
    if (!initP) {
      initP = detect().catch(function () { backend = null }).then(function () {
        try { window.addEventListener('online', function () { flush() }) } catch (e) { }
        flush() // background; init does not wait for the queue
      })
    }
    return initP
  }

  // ------------------------------------------------------------ public ----
  function top(n) {
    n = int(n, 1, 100, 10)
    return init().then(function () {
      if (!backend) return localList().slice(0, n)
      if (pending().length && Date.now() - lastFlush > 15000) flush()
      return fetchTop(n).then(function (list) {
        if (list) { degraded = false; if (!cache || n >= cache.length) cache = list; seeBest(list); return mergedGlobal(list).slice(0, n) }
        if (cache) return mergedGlobal(cache).slice(0, n)
        degraded = true
        return localList().slice(0, n)
      })
    }).catch(function () { return localList().slice(0, n) })
  }

  function best() {
    return init().then(function () {
      var l = localList(), lb = l.length ? l[0].score : 0
      if (!backend) return lb
      return fetchTop(1).then(function (list) {
        if (list) seeBest(list)
        var pb = 0; clean(pending()).forEach(function (e) { if (e.score > pb) pb = e.score })
        return Math.max(lb, globalBest, pb)
      })
    }).catch(function () { var l = localList(); return l.length ? l[0].score : 0 })
  }

  function submit(entry) {
    var p
    try { p = buildPayload(entry) } catch (e) { p = buildPayload({}) }
    var local = saveLocal(p)
    var localResult = function (extra) {
      var res = { rank: rankIn(local, p), top: withYou(local.slice(0, 10), p.id), mode: 'local', id: p.id }
      for (var k in extra) res[k] = extra[k]
      return res
    }
    return init().then(function () {
      if (!backend) return localResult({})
      return push(p).then(function (r) {
        if (r.status !== 'retry') flush() // deliver older queued scores in the background
        if (r.status === 'ok') {
          degraded = false; cache = r.top; seeBest(r.top)
          return { rank: r.rank, top: withYou(mergedGlobal(r.top).slice(0, 10), p.id), mode: 'global', id: p.id }
        }
        lastError = r.reason
        if (r.status === 'retry') {
          enqueue(p)
          var m = mergedGlobal(cache)
          return { rank: rankIn(m, p), top: withYou(m.slice(0, 10), p.id), mode: 'global', id: p.id, queued: true }
        }
        return localResult({ rejected: r.reason })
      })
    }).catch(function () { return localResult({}) })
  }

  return {
    init: init,
    mode: function () { return backend && !degraded ? 'global' : 'local' },
    top: top,
    best: best,
    submit: submit,
    // extras (not in SPEC; handy for UI / QA)
    sanitizeName: sanitizeName,
    plausible: plausible,
    status: function () { return { mode: backend && !degraded ? 'global' : 'local', backend: backend, pending: pending().length, lastError: lastError } },
    _checksum: checksum,
  }
})()
