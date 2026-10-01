// Browser tests for beer-pong/src/scores.js (BP.Scores) using Playwright + the devserver.
// Run: node beer-pong/tools/scores-browser.test.mjs
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { execSync, spawn } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const scoresSrc = readFileSync(join(here, "..", "src", "scores.js"), "utf8")

// Fake artifact db (subset of db.d.ts) — injected before scores.js when wanted.
const FAKE_DB = `
window.__dbDocs = {}; window.__dbMode = 'rw';
function q(filters, ord, lim) {
  return {
    where: function (f, op, v) { return q(filters.concat([[f, op, v]]), ord, lim) },
    orderBy: function (f, d) { return q(filters, [f, d || 'asc'], lim) },
    limit: function (n) { return q(filters, ord, n) },
    get: function () {
      var docs = Object.keys(window.__dbDocs).map(function (k) { return window.__dbDocs[k] })
      docs = docs.filter(function (d) { return filters.every(function (f) { return f[1] === '>' ? d[f[0]] > f[2] : true }) })
      if (ord) docs.sort(function (a, b) { return ord[1] === 'desc' ? b[ord[0]] - a[ord[0]] : a[ord[0]] - b[ord[0]] })
      if (lim) docs = docs.slice(0, lim)
      var snaps = docs.map(function (d) { return { id: d.id, exists: true, data: function () { return d } } })
      return Promise.resolve({ docs: snaps, size: snaps.length, empty: !snaps.length })
    },
  }
}
var coll = q([], null, 0)
coll.doc = function (id) { return { id: id, set: function (data) {
  if (window.__dbMode === 'ro') return Promise.reject({ code: 'invalid_argument', message: 'no write' })
  if (window.__dbMode === 'flaky') return Promise.reject({ code: 'unavailable', message: 'x' })
  window.__dbDocs[id] = JSON.parse(JSON.stringify(data)); return Promise.resolve() } } }
window.__fakeDb = { collection: function (p) { if (p !== 'scores') throw new TypeError('bad'); return coll } }
window.claude = { use: function (n) { return Promise.resolve(n === 'db' && window.__dbAvail !== false ? window.__fakeDb : null) } }
`
const harness = (pre = "") => `<!doctype html><meta charset=utf-8><title>scores test</title><script>window.BP={};window.__adv=function(ms){return fetch('/__dev/clock?advance='+(ms||3600000),{method:'POST'})};${pre}</script><script>${scoresSrc}</script>`

function startServer(port, extra = []) {
  const p = spawn(process.execPath, [join(here, "devserver.mjs"), "--port", String(port), ...extra], { stdio: ["ignore", "pipe", "inherit"] })
  return new Promise((res) => p.stdout.on("data", (d) => { if (String(d).includes("dev server")) res(p) }))
}
const ctl = (port, path) => fetch(`http://localhost:${port}${path}`, { method: "POST" })
const serverTop = async (port) => (await (await fetch(`http://localhost:${port}/api/beerpong/scores?limit=100`, { headers: { "x-dev-bypass": "1" } })).json()).top

const PORT = 8811, PORT503 = 8812, PORTSLOW = 8813
const servers = await Promise.all([startServer(PORT), startServer(PORT503, ["--unconfigured"]), startServer(PORTSLOW, ["--latency", "6000"])])
const browser = await chromium.launch()
const errors = []
async function open(port, pre = "", ctx, cookie = true) {
  ctx = ctx || (await browser.newContext())
  // the Next app / devserver set bp_api=1 on the game page; the harness is fulfilled by Playwright
  if (cookie) await ctx.addCookies([{ name: "bp_api", value: "1", url: `http://localhost:${port}` }])
  const page = await ctx.newPage()
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()) })
  page.on("pageerror", (e) => errors.push(e.message))
  const url = `http://localhost:${port}/beerpong/__scores_harness.html`
  await page.route(url, (r) => r.fulfill({ contentType: "text/html", body: harness(pre) }))
  await page.goto(url)
  return page
}
const ev = (page, fn, arg) => page.evaluate(fn, arg)
const legit = (o = {}) => ({ name: "ace", score: 1000, stage: 1, round: 1, cups: 2, accuracy: 55.55, shots: 30, makes: 12, durationMs: 200000, ...o })
// In-page: start a run, let (server) time pass, submit. Mirrors what the game does.
const PLAY = `window.__play = async function (e) { await BP.Scores.startRun(); await window.__adv(); return BP.Scores.submit(e) };`
const waitFor = async (page, fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await new Promise((r) => setTimeout(r, 200)) } return false }

let passed = 0
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok  ", name) } catch (e) { console.log("FAIL", name); throw e } }

try {
  await t("global: init/startRun/submit/rank/top/best", async () => {
    const page = await open(PORT, PLAY)
    const r = await ev(page, async (e) => {
      await BP.Scores.init()
      const mode = BP.Scores.mode()
      const a = await __play(e[0]), b = await __play(e[1]), c = await __play(e[2])
      return { mode, a, b, c, top: await BP.Scores.top(10), best: await BP.Scores.best(), local: JSON.parse(localStorage.bp_scores).length }
    }, [legit({ name: "nick♥", score: 5000 }), legit({ name: "<b>bob</b>", score: 7000 }), legit({ name: "", score: 100 })])
    assert.equal(r.mode, "global")
    assert.equal(r.a.mode, "global", JSON.stringify(r.a)); assert.equal(r.a.rank, 1); assert.equal(r.b.rank, 1); assert.equal(r.c.rank, 3)
    assert.ok(r.b.top.find((e) => e.you && e.name === "BBOBB"))
    assert.deepEqual(r.top.map((e) => e.name), ["BBOBB", "NICK♥", "PLAYER"])
    assert.equal(r.best, 7000); assert.equal(r.local, 3)
    assert.equal((await serverTop(PORT)).length, 3)
  })

  await t("works without startRun (token pre-armed at init / after each submit)", async () => {
    const page = await open(PORT)
    const r = await ev(page, async (e) => { await BP.Scores.init(); await new Promise((r) => setTimeout(r, 300)); await __adv(); const a = await BP.Scores.submit(e[0]); await new Promise((r) => setTimeout(r, 300)); await __adv(); const b = await BP.Scores.submit(e[1]); return [a.mode, b.mode] }, [legit({ name: "NORUN1" }), legit({ name: "NORUN2" })])
    assert.deepEqual(r, ["global", "global"])
  })

  await t("console forgeries rejected -> local", async () => {
    const page = await open(PORT, PLAY)
    const r = await ev(page, async () => {
      await BP.Scores.init()
      const lead = await __play({ score: 9999999, round: 9, stage: 4, makes: 5000, shots: 5000, durationMs: 86400000 })
      // plausible-looking but the token is fresh (no real time passed)
      await BP.Scores.startRun()
      const quick = await BP.Scores.submit({ name: 'HAX', score: 600000, round: 2, stage: 4, makes: 110, shots: 120, durationMs: 1200000 })
      return { lead, quick }
    })
    assert.equal(r.lead.mode, "local"); assert.equal(r.lead.rejected, "bad_round")
    assert.equal(r.quick.mode, "local"); assert.equal(r.quick.rejected, "token_too_young")
    assert.ok(!(await serverTop(PORT)).some((e) => e.score >= 600000))
  })

  await t("implausible score rejected -> local result", async () => {
    const page = await open(PORT, PLAY)
    const r = await ev(page, (e) => __play(e), legit({ score: 9_999_999, makes: 3 }))
    assert.equal(r.mode, "local"); assert.equal(r.rejected, "score_too_high"); assert.equal(r.rank, 1)
    assert.ok(!(await serverTop(PORT)).some((e) => e.score === 9_999_999))
  })

  await t("network drop -> queued (mode local), merged into top, delivered on next load", async () => {
    const ctx = await browser.newContext()
    let page = await open(PORT, PLAY, ctx)
    await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await __adv() })
    await ctl(PORT, "/__dev/net?down=1")
    const r = await ev(page, async (e) => { const s = await BP.Scores.submit(e); return { s, top: await BP.Scores.top(10), st: BP.Scores.status() } }, legit({ name: "WIFI", score: 6000 }))
    assert.equal(r.s.queued, true); assert.equal(r.s.mode, "local")
    assert.ok(r.top.some((e) => e.name === "WIFI")); assert.equal(r.st.pending, 1)
    assert.ok(!(await serverTop(PORT)).some((e) => e.name === "WIFI"))
    await ctl(PORT, "/__dev/net?down=0")
    await ctl(PORT, "/__dev/clock?advance=" + 5 * 3600000) // delivered hours later: token still valid
    page = await open(PORT, "", ctx) // new page load, same localStorage
    await ev(page, () => BP.Scores.init())
    assert.ok(await waitFor(page, () => BP.Scores.status().pending === 0, 5000))
    assert.equal((await serverTop(PORT)).filter((e) => e.name === "WIFI").length, 1)
  })

  await t("background retry timer delivers the queue with no further calls (~15 s)", async () => {
    const page = await open(PORT, PLAY)
    await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await __adv() })
    await ctl(PORT, "/__dev/net?down=1")
    const r = await ev(page, (e) => BP.Scores.submit(e), legit({ name: "TIMER", score: 333 }))
    assert.equal(r.queued, true)
    await ctl(PORT, "/__dev/net?down=0")
    const t0 = Date.now()
    assert.ok(await waitFor(page, () => BP.Scores.status().pending === 0, 20000), "not delivered by timer")
    assert.ok(Date.now() - t0 > 8000, "delivered too early?")
    assert.equal((await serverTop(PORT)).filter((e) => e.name === "TIMER").length, 1)
  })

  await t("phone offline (navigator.onLine=false): no requests, no console spam; delivered on 'online'", async () => {
    const ctx = await browser.newContext()
    const page = await open(PORT, PLAY, ctx)
    await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await __adv() })
    let hits = 0; page.on("request", (rq) => { if (rq.url().includes("/api/")) hits++ })
    const before = errors.length
    await ctx.setOffline(true)
    const r = await ev(page, (e) => BP.Scores.submit(e), legit({ name: "PLANE", score: 444 }))
    assert.equal(r.queued, true); assert.equal(r.mode, "local")
    await ev(page, () => { window.dispatchEvent(new Event("pageshow")); document.dispatchEvent(new Event("visibilitychange")) })
    await new Promise((r) => setTimeout(r, 500))
    assert.equal(hits, 0); assert.equal(errors.length, before)
    await ctx.setOffline(false) // fires 'online'
    assert.ok(await waitFor(page, () => BP.Scores.status().pending === 0, 5000))
    assert.equal((await serverTop(PORT)).filter((e) => e.name === "PLANE").length, 1)
  })

  await t("visibilitychange -> visible flushes immediately; never double-submits", async () => {
    const page = await open(PORT, PLAY)
    await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await __adv() })
    await ctl(PORT, "/__dev/net?down=1")
    await ev(page, (e) => BP.Scores.submit(e), legit({ name: "VIS", score: 555 }))
    await ctl(PORT, "/__dev/net?down=0")
    await ev(page, () => { for (let i = 0; i < 3; i++) { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("online")) } })
    assert.ok(await waitFor(page, () => BP.Scores.status().pending === 0, 3000))
    assert.equal((await serverTop(PORT)).filter((e) => e.name === "VIS").length, 1)
  })

  await t("API down at page load -> degraded; scores queued then delivered", async () => {
    await ctl(PORT, "/__dev/net?down=1")
    const page = await open(PORT, PLAY)
    const r = await ev(page, async () => { await BP.Scores.init(); return BP.Scores.status() })
    assert.equal(r.mode, "local"); assert.equal(r.backend, "http"); assert.equal(r.degraded, true)
    await ctl(PORT, "/__dev/net?down=0")
    const s = await ev(page, async (e) => { await BP.Scores.startRun(); await __adv(); return BP.Scores.submit(e) }, legit({ name: "LATE", score: 777 }))
    assert.equal(s.mode, "global", JSON.stringify(s))
  })

  await t("server 500 (KV down) -> queued, delivered on next submit", async () => {
    const page = await open(PORT, PLAY)
    await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await __adv() })
    await ctl(PORT, "/__dev/kv?fail=1")
    const a = await ev(page, (e) => BP.Scores.submit(e), legit({ name: "KVDOWN", score: 50 }))
    assert.equal(a.queued, true); assert.equal(a.mode, "local")
    await ctl(PORT, "/__dev/kv?fail=0")
    const b = await ev(page, async (e) => { const r = await __play(e); await new Promise((r) => setTimeout(r, 500)); return { r, st: BP.Scores.status() } }, legit({ name: "KVUP", score: 60 }))
    assert.equal(b.r.mode, "global"); assert.equal(b.st.pending, 0)
    const names = (await serverTop(PORT)).map((e) => e.name)
    assert.ok(names.includes("KVDOWN") && names.includes("KVUP"))
  })

  await t("503 unconfigured -> local mode, startRun no-op", async () => {
    const page = await open(PORT503)
    const r = await ev(page, async (e) => { await BP.Scores.init(); const sr = await BP.Scores.startRun(); const s = await BP.Scores.submit(e); return { sr, mode: BP.Scores.mode(), s, top: await BP.Scores.top(), best: await BP.Scores.best(), pend: BP.Scores.status().pending } }, legit({ score: 4321 }))
    assert.equal(r.sr, false); assert.equal(r.mode, "local"); assert.equal(r.s.mode, "local"); assert.equal(r.s.rank, 1); assert.equal(r.top[0].score, 4321); assert.equal(r.best, 4321); assert.equal(r.pend, 0)
  })

  await t("slow server -> init gives up in ~4 s", async () => {
    const page = await open(PORTSLOW)
    const r = await ev(page, async () => { const t0 = performance.now(); await BP.Scores.init(); return { ms: performance.now() - t0, mode: BP.Scores.mode() } })
    assert.equal(r.mode, "local"); assert.ok(r.ms < 5000, String(r.ms))
  })

  await t("file:// -> local mode, no fetch", async () => {
    const dir = join(tmpdir(), "bp-scores-test"); mkdirSync(dir, { recursive: true })
    const f = join(dir, "h.html"); writeFileSync(f, harness())
    const page = await (await browser.newContext()).newPage()
    page.on("pageerror", (e) => errors.push(e.message))
    let fetched = 0; page.on("request", (rq) => { if (rq.url().includes("/api/")) fetched++ })
    await page.goto(pathToFileURL(f).href)
    const r = await ev(page, async () => { await BP.Scores.init(); const sr = await BP.Scores.startRun(); const a = await BP.Scores.submit({ name: "file", score: 10 }); const b = await BP.Scores.submit({ name: "file2", score: 20 }); return { sr, mode: BP.Scores.mode(), a, b, best: await BP.Scores.best() } })
    assert.equal(r.sr, false); assert.equal(r.mode, "local"); assert.equal(r.b.rank, 1); assert.equal(r.best, 20); assert.equal(fetched, 0)
  })

  await t("artifact db: global via claude.use('db') (no tokens needed)", async () => {
    let apiHits = 0
    const page = await open(PORT, FAKE_DB)
    page.on("request", (rq) => { if (rq.url().includes("/api/")) apiHits++ })
    const r = await ev(page, async (e) => {
      await BP.Scores.init()
      const sr = await BP.Scores.startRun()
      const a = await BP.Scores.submit(e[0]), b = await BP.Scores.submit(e[1])
      const forged = await BP.Scores.submit({ score: 9999999, round: 9, stage: 4, makes: 5000, shots: 5000, durationMs: 86400000 })
      return { sr, mode: BP.Scores.mode(), st: BP.Scores.status(), a, b, forged, top: await BP.Scores.top(5), docs: Object.keys(window.__dbDocs).length }
    }, [legit({ name: "db1", score: 300 }), legit({ name: "db2", score: 900 })])
    assert.equal(r.sr, false); assert.equal(r.mode, "global"); assert.equal(r.st.backend, "db"); assert.equal(r.docs, 2)
    assert.equal(r.a.rank, 1); assert.equal(r.b.rank, 1); assert.deepEqual(r.top.map((e) => e.name), ["DB2", "DB1"])
    assert.equal(r.forged.mode, "local"); assert.equal(apiHits, 0)
  })

  await t("artifact db: read-only viewer -> local; flaky -> queued then delivered", async () => {
    const page = await open(PORT, FAKE_DB + "window.__dbMode='ro';")
    const r = await ev(page, async (e) => { await BP.Scores.init(); return BP.Scores.submit(e) }, legit({ score: 10 }))
    assert.equal(r.mode, "local"); assert.equal(r.rejected, "invalid_argument")
    const p2 = await open(PORT, FAKE_DB + "window.__dbMode='flaky';")
    const q = await ev(p2, async (e) => {
      await BP.Scores.init(); const s = await BP.Scores.submit(e)
      window.__dbMode = 'rw'; await BP.Scores.submit(Object.assign({}, e, { name: 'next', score: 5 }))
      await new Promise((r) => setTimeout(r, 300))
      return { s, pend: BP.Scores.status().pending, docs: Object.values(window.__dbDocs).map((d) => d.name) }
    }, legit({ name: "flaky", score: 77 }))
    assert.equal(q.s.queued, true); assert.equal(q.s.mode, "local"); assert.equal(q.pend, 0); assert.ok(q.docs.includes("FLAKY") && q.docs.includes("NEXT"))
  })

  await t("artifact: use('db') -> null falls through to HTTP; hung use() times out", async () => {
    const page = await open(PORT, FAKE_DB + "window.__dbAvail=false;")
    assert.equal(await ev(page, async () => { await BP.Scores.init(); return BP.Scores.status().backend }), "http")
    const p2 = await open(PORT, "window.claude={use:function(){return new Promise(function(){})}};")
    const r = await ev(p2, async () => { const t0 = performance.now(); await BP.Scores.init(); return { ms: performance.now() - t0, b: BP.Scores.status().backend } })
    assert.equal(r.b, "http"); assert.ok(r.ms > 2900 && r.ms < 4500, String(r.ms))
  })

  await t("never rejects on garbage input", async () => {
    const page = await open(PORT)
    const r = await ev(page, async () => {
      const out = []
      out.push(await BP.Scores.submit(undefined)); out.push(await BP.Scores.submit({ score: "abc", name: 42 })); out.push(await BP.Scores.submit({ score: 1e12, stage: -5 }))
      out.push(await BP.Scores.top("x")); out.push(await BP.Scores.top(1000)); out.push(await BP.Scores.startRun())
      return out.map((o) => (Array.isArray(o) ? "list" + o.length : typeof o === "boolean" ? "bool" : o.mode + ":" + o.rank + ":" + (o.rejected || "")))
    })
    assert.deepEqual(r.slice(0, 3).map((x) => x.replace(/:\d+:/, ":N:")), ["local:N:missing_stats", "local:N:missing_stats", "local:N:missing_stats"])
    assert.equal(r[5], "bool")
  })

  await t("static host (no bp_api cookie) -> local, never fetches the API", async () => {
    const ctx = await browser.newContext()
    let hits = 0
    const page = await open(PORT, "", ctx, false)
    page.on("request", (rq) => { if (rq.url().includes("/api/")) hits++ })
    const r = await ev(page, async () => { await BP.Scores.init(); await BP.Scores.startRun(); await BP.Scores.submit({ name: "gh", score: 5 }); return BP.Scores.mode() })
    assert.equal(r, "local"); assert.equal(hits, 0)
  })

  await t("real devserver page sets the cookie (built game -> global)", async () => {
    const page = await (await browser.newContext()).newPage()
    await page.goto(`http://localhost:${PORT}/beerpong/`)
    const r = await page.evaluate(async () => { await BP.Scores.init(); return { mode: BP.Scores.mode(), c: document.cookie } })
    assert.equal(r.mode, "global"); assert.match(r.c, /bp_api=1/)
  })

  // Only genuine network failures (simulated wifi drop) may log; HTTP errors are "soft" (200 + ok:false).
  const unexpected = errors.filter((e) => !/net::ERR_EMPTY_RESPONSE/.test(e))
  assert.deepEqual(unexpected, [], "no console errors/warnings besides simulated network drops")
} finally {
  await browser.close()
  servers.forEach((s) => s.kill())
}
console.log(`\n${passed} browser tests passed`)
