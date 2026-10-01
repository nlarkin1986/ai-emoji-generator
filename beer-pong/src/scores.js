/* BP.Scores — shared party leaderboard with graceful offline fallback.
 *
 * Backends, in detection order:
 *   1. claude.ai Artifact db (window.claude.use('db')), collection "scores", one doc per run.
 *   2. Same-origin HTTP API  /api/beerpong/{run,scores}  (Next.js routes + Vercel KV / Upstash).
 *      Only probed when the page was served by that app (cookie bp_api=1, or ?api), so static
 *      copies / file:// never log 404s.
 *   3. localStorage only ("LOCAL" table).
 * Every submit is ALSO saved locally (bp_scores, top 50). A global submit that fails transiently
 * (offline, timeout, 429, 5xx) is queued in bp_pending (with its run token) and retried with
 * backoff (15 s -> 60 s) while the queue is non-empty, plus on 'online', tab-visible and pageshow.
 * Entries carry a client id; the server accepts an identical retry once and ignores duplicates.
 * No method ever rejects; every network call has a ~4 s timeout.
 *
 * API (SPEC section 3 + startRun):
 *   init()            Promise; detects the backend.
 *   mode()            'global' | 'local'
 *   startRun()        call when a run starts (leaving the title). Fetches a signed run token from
 *                     the server (global HTTP mode only; no-op otherwise). Promise<boolean>, never rejects.
 *   top(n=10)         Promise<[{id,name,score,stage,round,ts}]>
 *   best()            Promise<number>
 *   submit(entry)     entry = {name, score, stage, round, cups, accuracy, shots, makes, durationMs}
 *                       stage = 0-based stage reached (0..4), round = 1..30 (3+ = GAUNTLET),
 *                       shots/makes = whole-run player totals, durationMs = real play time (ms).
 *                     -> {rank, top, mode, id, queued?, rejected?}. mode is 'global' only when the
 *                       score is on the shared board; queued/rejected results are 'local' with the
 *                       on-device table. The caller's row in `top` has `you: true`.
 *
 * Anti-cheat: names sanitised, numbers clamped, plausible() (mirrored from the server), a run
 * token whose age must cover the claimed play time, and an FNV-1a checksum with a STATIC salt
 * (a speed bump only — anyone reading this file can compute it). Keep SALT / checksum() /
 * plausible() identical to src/app/api/beerpong/_lib.ts.
 */
BP.Scores = (function () {
  'use strict'
  var API = '/api/beerpong/scores', RUN_API = '/api/beerpong/run'
  var SALT = 'SBP-1989-PARTYSOFT'
  var K_SCORES = 'bp_scores', K_PENDING = 'bp_pending'
  var TIMEOUT = 4000, DB_WAIT = 3000, LOCAL_KEEP = 50, PENDING_KEEP = 30
  var MAX_SCORE = 9999999

  var backend = null      // 'db' | 'http' | null
  var dbns = null         // artifact db namespace
  var degraded = false    // global backend currently unreachable
  var cache = null        // last good global top list
  var globalBest = 0      // best global score ever seen this session
  var initP = null, flushP = null, lastFlush = 0, lastError = null
  var run = { token: null, tokenAt: 0, start: 0 }, armP = null, armRetry = null
  var retryTimer = null, retryFails = 0

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
  function num(v) { if (v === null || v === undefined || v === '') return null; v = Number(v); return isFinite(v) ? v : null }
  function int(v, lo, hi, d) { v = num(v); if (v === null) return d; v = Math.round(v); return Math.max(lo, Math.min(hi, v)) }
  function rid() {
    var s = Date.now().toString(36) + '-'
    try { var a = new Uint32Array(2); window.crypto.getRandomValues(a); return s + a[0].toString(36) + a[1].toString(36) } catch (e) { }
    return s + Math.random().toString(36).slice(2, 12)
  }
  function online() { try { return navigator.onLine !== false } catch (e) { return true } }

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
  var SUM_FIELDS = ['v', 'id', 'name', 'score', 'stage', 'round', 'cups', 'accuracy', 'shots', 'makes', 'durationMs', 'ts', 'token', 'lag']
  function checksum(p) {
    return fnv1a(SALT + '|' + SUM_FIELDS.map(function (k) { return p[k] === undefined || p[k] === null ? '' : String(p[k]) }).join('|'))
  }

  // Plausibility ceiling — identical to _lib.ts. Returns null when OK, else a reason.
  //   round in 1..30 (multiplier = round), stage in 0..4, S = (round-1)*5 + stage + 1
  //   makes <= shots; (S-1)*3 <= makes <= S*10+10; score <= (makes*1500 + S*15000)*round + 10000
  //   S*20000 <= durationMs <= 3 h; shots <= durationMs/700 + 20
  function plausible(p) {
    if (p.makes == null || p.shots == null || p.durationMs == null) return 'missing_stats'
    if (!(p.round % 1 === 0 && p.round >= 1 && p.round <= 30)) return 'bad_round'
    if (!(p.stage >= 0 && p.stage <= 4)) return 'bad_stage'
    var S = (p.round - 1) * 5 + p.stage + 1
    if (p.makes > p.shots) return 'makes_gt_shots'
    if (p.makes > S * 10 + 10) return 'too_many_makes'
    if (p.makes < (S - 1) * 3) return 'too_few_makes'
    if (p.score > (p.makes * 1500 + S * 15000) * p.round + 10000) return 'score_too_high'
    if (p.durationMs < S * 20000) return 'too_short'
    if (p.durationMs > 3 * 3600000) return 'too_long'
    if (p.shots > p.durationMs / 700 + 20) return 'too_fast'
    return null
  }

  function buildPayload(e, tok) {
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
    if (tok && tok.token) { p.token = tok.token; p.lag = Math.max(0, Math.round(tok.lag || 0)) }
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
  function enqueue(p) { var a = pending().filter(function (x) { return x && x.id !== p.id }); a.push(p); setPending(a); scheduleRetry() }
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
  function req(method, path, body) {
    var ctl = null; try { ctl = new AbortController() } catch (e) { }
    var opts = { method: method, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'x-bp-soft': '1' } }
    if (ctl) opts.signal = ctl.signal
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body) }
    var p = fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        // soft errors arrive as 200 {ok:false, status} (see _lib.ts soften())
        return { status: r.status === 200 && j && j.ok === false && j.status ? j.status : r.status, json: j }
      }, function () { return { status: r.status, json: null } })
    })
    return timeout(p, TIMEOUT, { status: 0, json: null }).then(function (r) {
      if (r.status === 0 && ctl) { try { ctl.abort() } catch (e) { } }
      return r
    })
  }
  function unconfigured(r) { return r.status === 503 && r.json && r.json.error === 'leaderboard_unconfigured' }
  function transient(r) { return r.status === 0 || r.status === 429 || (r.status >= 500 && !unconfigured(r)) }

  // ---------------------------------------------------------- run token ----
  // Single-flight token fetch. Keeps the previous token if the fetch fails.
  function arm() {
    if (backend !== 'http' || !online()) return Promise.resolve(false)
    if (armP) return armP
    armP = req('POST', RUN_API).then(function (r) {
      armP = null
      if (r.status === 200 && r.json && r.json.ok && typeof r.json.token === 'string') {
        run.token = r.json.token; run.tokenAt = Date.now(); return true
      }
      if (unconfigured(r)) backend = null
      return false
    })
    return armP
  }
  // During the first 2 minutes of a run, keep retrying a failed token fetch every 10 s.
  function armWithRetry(startedAt) {
    if (armRetry) { clearTimeout(armRetry); armRetry = null }
    return arm().then(function (ok) {
      if (!ok && backend === 'http' && !run.token && run.start === startedAt && Date.now() - startedAt < 120000) {
        armRetry = setTimeout(function () { armRetry = null; if (run.start === startedAt) armWithRetry(startedAt) }, 10000)
      }
      return ok || !!run.token
    })
  }
  function takeToken() {
    if (!run.token) return null
    var t = { token: run.token, lag: run.start && run.tokenAt > run.start ? run.tokenAt - run.start : 0 }
    run.token = null; run.tokenAt = 0
    return t
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
    if (backend === 'http') return req('GET', API + '?limit=' + n).then(function (r) {
      if (r.status === 200 && r.json && Array.isArray(r.json.top)) return sortList(clean(r.json.top))
      if (unconfigured(r)) backend = null
      return null
    })
    return Promise.resolve(null)
  }
  // -> {status:'ok', rank, top} | {status:'retry'} | {status:'rejected', reason}
  function push(p) {
    var why = plausible(p)
    if (why) return Promise.resolve({ status: 'rejected', reason: why })
    if (backend === 'http') {
      if (!online()) return Promise.resolve({ status: 'retry', reason: 'offline' }) // no request, no console noise
      return req('POST', API, p).then(function (r) {
        var j = r.json || {}
        if (r.status === 200 && j.ok) { degraded = false; return { status: 'ok', rank: j.rank, top: clean(j.top) } }
        if (unconfigured(r)) return { status: 'rejected', reason: j.error }
        if (transient(r)) return { status: 'retry', reason: j.error || ('http_' + r.status) }
        return { status: 'rejected', reason: j.reason || j.error || ('http_' + r.status) }
      })
    }
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
    return Promise.resolve({ status: 'retry', reason: 'no_backend' })
  }

  // Deliver queued scores, oldest first. Single-flight; stops at the first transient failure.
  // -> Promise<boolean> queue empty
  function flush() {
    if (flushP) return flushP
    if (!pending().length) return Promise.resolve(true)
    lastFlush = Date.now()
    var start = backend ? Promise.resolve() : redetect()
    flushP = start.then(function next() {
      var item = pending()[0]
      if (!item) return true
      if (!backend) return false
      return push(item).then(function (r) {
        if (r.status === 'retry') { lastError = r.reason; return false }
        setPending(pending().filter(function (x) { return x && x.id !== item.id }))
        if (r.status === 'ok') { cache = r.top; seeBest(r.top) } else lastError = r.reason
        return next()
      })
    }).then(function (empty) { flushP = null; return empty }, function () { flushP = null; return false })
    return flushP
  }
  // Background retry while the queue is non-empty: 15 s, 30 s, then every 60 s.
  function scheduleRetry() {
    if (retryTimer || !pending().length) return
    var delay = Math.min(60000, 15000 * Math.pow(2, retryFails))
    retryTimer = setTimeout(function () {
      retryTimer = null
      ;(online() ? flush() : Promise.resolve(false)).then(function (empty) {
        retryFails = empty ? 0 : retryFails + 1
        scheduleRetry()
      })
    }, delay)
  }
  function kick() { flush().then(function (empty) { if (empty) retryFails = 0; else scheduleRetry() }) }

  // --------------------------------------------------------- detection ----
  // HTTP probe: list -> global; definitive 'unconfigured'/404 -> local; transient -> http but degraded
  // (scores are queued and delivered when the API comes back).
  function probeHttp() {
    backend = 'http'
    return req('GET', API + '?limit=10').then(function (r) {
      if (r.status === 200 && r.json && Array.isArray(r.json.top)) { degraded = false; return sortList(clean(r.json.top)) }
      if (transient(r)) { degraded = true; return null }
      backend = null; return null
    })
  }
  function redetect() {
    if (backend || !canHttp() || !online()) return Promise.resolve()
    return probeHttp().then(function (l) { if (l) { cache = l; seeBest(l); arm() } })
  }
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
      if (list || !canHttp()) return list
      return probeHttp()
    }).then(function (list) {
      if (list) { cache = list; seeBest(list) }
    })
  }

  function init() {
    if (!initP) {
      initP = detect().catch(function () { backend = null }).then(function () {
        try {
          // network may not be fully usable the instant 'online' fires: try now and again shortly
          window.addEventListener('online', function () { kick(); setTimeout(kick, 1500) })
          window.addEventListener('pageshow', kick)
          document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') kick() })
        } catch (e) { }
        if (backend === 'http' && !degraded) arm() // pre-arm a token in case startRun() is never reached
        kick() // background; init does not wait for the queue
      })
    }
    return initP
  }

  // ------------------------------------------------------------ public ----
  function startRun() {
    var startedAt = Date.now()
    run.start = startedAt
    return init().then(function () { return backend === 'http' ? armWithRetry(startedAt) : false })
      .catch(function () { return false })
  }

  function top(n) {
    n = int(n, 1, 100, 10)
    return init().then(function () {
      if (!backend) return localList().slice(0, n)
      if (pending().length && Date.now() - lastFlush > 15000) kick()
      return fetchTop(n).then(function (list) {
        if (list) { degraded = false; if (!cache || n >= cache.length) cache = list; seeBest(list); return mergedGlobal(list).slice(0, n) }
        if (!backend) return localList().slice(0, n)
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
    var p = null, local = []
    var localResult = function (extra) {
      var res = { rank: rankIn(local, p), top: withYou(local.slice(0, 10), p.id), mode: 'local', id: p.id }
      for (var k in extra) res[k] = extra[k]
      return res
    }
    return init().then(function () {
      // No token yet (wifi was down at run start)? One last try; the server allows a capped lag.
      return backend === 'http' && !run.token ? arm() : null
    }).then(function () {
      var tok = backend === 'http' ? takeToken() : null
      try { p = buildPayload(entry, tok) } catch (e) { p = buildPayload({}, tok) }
      local = saveLocal(p)
      if (backend === 'http') arm() // pre-arm the next run's token in the background
      if (!backend) return localResult({})
      return push(p).then(function (r) {
        if (r.status === 'ok') {
          kick() // deliver older queued scores in the background
          cache = r.top; seeBest(r.top)
          return { rank: r.rank, top: withYou(mergedGlobal(r.top).slice(0, 10), p.id), mode: 'global', id: p.id }
        }
        lastError = r.reason
        if (r.status === 'retry') { enqueue(p); return localResult({ queued: true }) }
        return localResult({ rejected: r.reason })
      })
    }).catch(function () {
      if (!p) { try { p = buildPayload(entry) } catch (e) { p = buildPayload({}) } local = saveLocal(p) }
      return localResult({})
    })
  }

  return {
    init: init,
    mode: function () { return backend && !degraded ? 'global' : 'local' },
    startRun: startRun,
    top: top,
    best: best,
    submit: submit,
    // extras (not in SPEC; handy for UI / QA)
    sanitizeName: sanitizeName,
    plausible: plausible,
    status: function () { return { mode: backend && !degraded ? 'global' : 'local', backend: backend, degraded: degraded, pending: pending().length, hasToken: !!run.token, lastError: lastError } },
    _checksum: checksum,
  }
})()
