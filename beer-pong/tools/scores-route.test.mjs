// Unit tests for src/app/api/beerpong/{scores,run}/route.ts (+ _lib.ts) with an in-memory fake KV.
// Run: node beer-pong/tools/scores-route.test.mjs   (Node >= 22.18 strips TS types natively)
import assert from "node:assert/strict"
import { createFakeKv } from "./scores-fakekv.mjs"
import { loadRoutes } from "./scores-tshooks.mjs"

const kv = createFakeKv()
globalThis.__BEERPONG_STORE__ = kv
console.error = () => {} // the route logs expected store errors
let skew = 0
const realNow = Date.now
Date.now = () => realNow() + skew
const advance = (ms) => { skew += ms }
const { scores: route, run: runRoute } = await loadRoutes()

// --- mirror of the client payload builder (checksum must match scores.js) ---
const SALT = "SBP-1989-PARTYSOFT"
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"]
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
const URL0 = "http://x/api/beerpong/scores"
const mint = async (ip = "5.5.5.5") => (await (await runRoute.POST(new Request("http://x/api/beerpong/run", { method: "POST", headers: { "x-forwarded-for": ip } }))).json()).token
let n = 0
// A legit-looking run summary with a fresh token whose age already covers durationMs.
async function run(o = {}) {
  const p = { v: 1, id: "test-" + String(++n).padStart(4, "0"), name: "ACE", score: 1000, stage: 0, round: 1, cups: 3, accuracy: 50, shots: 20, makes: 10, durationMs: 120000, ...o }
  if (!("token" in o)) { p.token = await mint(); advance(p.durationMs || 0) }
  p.ts = o.ts ?? Date.now()
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k]
  p.sum = o.sum ?? sum(p)
  return p
}
const resign = (p) => { p.sum = sum(p); return p }

const post = (body, ip = "1.1.1.1", h = {}) => route.POST(new Request(URL0, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json", ...h }, body: typeof body === "string" ? body : JSON.stringify(body) }))
const get = (q = "", h = {}) => route.GET(new Request(URL0 + q, { headers: h }))
const del = (q = "", key) => route.DELETE(new Request(URL0 + q, { method: "DELETE", headers: key ? { "x-admin-key": key } : {} }))
const J = async (r) => ({ status: r.status, cc: r.headers.get("cache-control"), body: await r.json() })
const reason = async (p) => { const r = await J(await post(p)); return r.status === 200 ? "ok" : r.body.reason || r.body.error }

let passed = 0
const t = async (name, fn) => { try { kv.resetRateLimits(); await fn(); passed++; console.log("ok  ", name) } catch (e) { console.log("FAIL", name); throw e } }

await t("GET empty", async () => { const r = await J(await get()); assert.equal(r.status, 200); assert.deepEqual(r.body.top, []); assert.equal(r.cc, "no-store") })
await t("run token issued", async () => { const tok = await mint(); assert.match(tok, /^[\w-]+\.[\w-]+$/) })
await t("POST valid -> rank 1", async () => {
  const r = await J(await post(await run({ name: "nick!", score: 5000 })))
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.rank, 1)
  assert.equal(r.body.top[0].name, "NICK!"); assert.deepEqual(Object.keys(r.body.top[0]).sort(), ["id", "name", "round", "score", "stage", "ts"])
})
await t("POST lower -> rank 2, higher -> rank 1", async () => {
  assert.equal((await J(await post(await run({ score: 3000 })))).body.rank, 2)
  assert.equal((await J(await post(await run({ score: 9000 })))).body.rank, 1)
})
await t("tie ranks equal, earlier ts listed first", async () => {
  const a = await run({ name: "TIEA", score: 4000, ts: Date.now() - 5000 }), b = await run({ name: "TIEB", score: 4000 })
  await post(b); const r = await J(await post(a)); assert.equal(r.body.rank, 3)
  const names = r.body.top.map((e) => e.name); assert.ok(names.indexOf("TIEA") < names.indexOf("TIEB"))
})
await t("identical retry accepted once (idempotent), not duplicated", async () => {
  const p = await run({ score: 1234 }); assert.equal((await post(p)).status, 200)
  const before = await kv.zcard("beerpong:scores")
  advance(3_600_000); assert.equal((await post(p)).status, 200) // e.g. offline queue retry an hour later
  assert.equal(await kv.zcard("beerpong:scores"), before)
})
await t("token reuse for a different entry -> token_used; duplicate id -> duplicate_id", async () => {
  const p = await run({ score: 2222 }); await post(p)
  assert.equal(await reason(resign({ ...p, id: "other-id-1", score: 2223 })), "token_used")
  const q = await run({ score: 3333 }); q.id = p.id; resign(q)
  assert.equal(await reason(q), "duplicate_id")
})
await t("token checks: missing / forged / too young / expired / lag cap", async () => {
  assert.equal(await reason(await run({ token: undefined })), "no_token")
  const good = await mint(); advance(200_000)
  const [pl, sig] = good.split(".")
  const forged = Buffer.from(JSON.stringify({ iat: Date.now() - 10_000_000, n: "a".repeat(24) })).toString("base64url") + "." + sig
  assert.equal(await reason(await run({ token: forged })), "bad_token")
  assert.equal(await reason(await run({ token: pl + ".AAAA" })), "bad_token")
  // durationMs claims 10 min but the token is only ~2 min old
  const young = await mint(); advance(120_000)
  assert.equal(await reason(await run({ token: young, durationMs: 600_000, shots: 40, makes: 12 })), "token_too_young")
  // stage 4 round 2 needs >= 200 s of real time even if durationMs is small... (durationMs also checked)
  const y2 = await mint(); advance(30_000)
  assert.equal(await reason(await run({ token: y2, round: 2, stage: 4, makes: 60, shots: 70, durationMs: 1_000_000, score: 1000 })), "token_too_young")
  // late token (wifi down at run start): lag covers the gap, capped at 120 s
  const late = await mint(); advance(60_000)
  assert.equal(await reason(await run({ token: late, durationMs: 150_000, lag: 90_000 })), "ok")
  const late2 = await mint(); advance(10_000)
  assert.equal(await reason(await run({ token: late2, durationMs: 300_000, lag: 290_000 })), "token_too_young")
  const old = await mint(); advance(8 * 86_400_000)
  assert.equal(await reason(await run({ token: old })), "token_expired")
})
await t("lead's console forgery is rejected", async () => {
  const forged = await run({ score: 9_999_999, round: 9, stage: 4, makes: 5000, shots: 5000, durationMs: 86_400_000 })
  const r = await J(await post(forged)); assert.equal(r.status, 400) // round 9 out of range
  const f2 = await run({ score: 9_999_999, round: 2, stage: 4, makes: 110, shots: 120, durationMs: 3 * 3_600_000 })
  assert.equal(await reason(f2), "score_too_high")
  const f3 = await run({ score: 9_999_999, round: 4, stage: 4, makes: 200, shots: 220, durationMs: 3_000_000 })
  assert.equal(await reason(f3), "score_too_high") // (200*1500 + 20*15000)*4 + 10000 = 2,410,000
})
await t("name sanitising", async () => {
  const cases = [["  héllo wörld <script>", "HLLO WRL"], ["", "PLAYER"], ["@@@", "PLAYER"], ["a♥b", "A♥B"], ["fuckface", "PLAYER"], ["  x   y  ", "X Y"], ["ABCDEFGHIJ", "ABCDEFGH"]]
  for (const [inp, want] of cases) {
    assert.equal((await post(await run({ name: inp, score: 10 }))).status, 200, inp)
    assert.ok((await J(await get("?limit=100"))).body.top.some((e) => e.name === want), `${inp} -> ${want}`)
  }
})
await t("validation errors", async () => {
  assert.equal((await post("not json")).status, 400)
  for (const o of [{ score: -1 }, { score: 10_000_000 }, { score: 12.5 }, { id: "x" }, { round: 31 }, { round: 0 }, { stage: 5 }, { makes: undefined }, { shots: undefined }, { durationMs: undefined }])
    assert.equal((await post(await run(o))).status, 400, JSON.stringify(o))
  assert.equal((await post(resign({ ...(await run()), v: 2 }))).status, 400)
  assert.equal((await post("x".repeat(5000))).status, 413)
})
await t("checksum", async () => {
  const p = await run({ score: 2000 }); p.score = 2001
  const r = await J(await post(p)); assert.equal(r.status, 400); assert.equal(r.body.error, "bad_checksum")
  const q = await run(); delete q.sum; assert.equal((await post(q)).status, 400)
})
await t("plausibility rejects", async () => {
  const bad = [
    [{ score: 30_000, makes: 3, shots: 10 }, "score_too_high"], // (3*1500+15000)+10000 = 29500
    [{ makes: 30, shots: 20 }, "makes_gt_shots"],
    [{ makes: 21, shots: 30 }, "too_many_makes"], // S=1 -> <= 20
    [{ stage: 4, makes: 11, shots: 30, durationMs: 300_000, score: 100 }, "too_few_makes"], // S=5 -> >= 12
    [{ durationMs: 19_000 }, "too_short"],
    [{ durationMs: 3 * 3_600_000 + 1 }, "too_long"],
    [{ shots: 200, makes: 10, durationMs: 120_000 }, "too_fast"], // 120000/700+20 = 191
  ]
  for (const [o, why] of bad) assert.equal(await reason(await run(o)), why, JSON.stringify(o))
})
await t("plausibility accepts legit maxima (<=1500/make, <=15000/stage, Round 2 x2)", async () => {
  const ok = [
    { stage: 0, round: 1, makes: 20, shots: 20, durationMs: 20_000, score: 20 * 1500 + 15000 + 10000 },
    { stage: 4, round: 1, makes: 60, shots: 60, durationMs: 100_000, score: 60 * 1500 + 5 * 15000 },
    { stage: 0, round: 2, makes: 70, shots: 80, durationMs: 300_000, score: 2 * (70 * 1500 + 6 * 15000) },
    { stage: 4, round: 2, makes: 110, shots: 110, durationMs: 200_000, score: 2 * (110 * 1500 + 10 * 15000) }, // the ENDING
    { stage: 2, round: 4, makes: 180, shots: 220, durationMs: 1_800_000, score: 4 * (180 * 1500 + 18 * 15000) + 10000 }, // GAUNTLET round 4
    { stage: 4, round: 30, makes: 1510, shots: 1600, durationMs: 3 * 3_600_000, score: 9_999_999 },
    { stage: 4, round: 2, makes: 27, shots: 300, durationMs: 3 * 3_600_000, score: 2 * (27 * 1500 + 10 * 15000) + 10000 },
  ]
  for (const o of ok) { const r = await J(await post(await run(o))); assert.equal(r.status, 200, JSON.stringify(o) + " " + JSON.stringify(r.body)) }
})
await t("rate limit 30/min per IP (submits) and 60/min (tokens)", async () => {
  const ps = []; for (let i = 0; i < 32; i++) ps.push(await run({ score: 1 })) // (building advances the clock)
  kv.resetRateLimits()
  for (let i = 0; i < 30; i++) assert.equal((await post(ps[i], "9.9.9.9")).status, 200)
  const r = await post(ps[30], "9.9.9.9"); assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60")
  assert.equal((await post(ps[31], "8.8.8.8")).status, 200)
  kv.resetRateLimits()
  for (let i = 0; i < 60; i++) assert.ok(await mint("6.6.6.6"))
  assert.equal(await mint("6.6.6.6"), undefined)
})
await t("GET limit clamp + order", async () => {
  const a = await J(await get("?limit=3")); assert.equal(a.body.top.length, 3)
  const s = a.body.top.map((e) => e.score); assert.deepEqual(s, [...s].sort((x, y) => y - x))
  assert.ok((await J(await get("?limit=999"))).body.top.length <= 100)
  assert.ok((await J(await get("?limit=abc"))).body.top.length <= 10)
})
await t("keeps only top 500", async () => {
  for (let i = 0; i < 520; i++) { kv.resetRateLimits(); assert.equal((await post(await run({ score: 100 + i }), "7.7.7." + (i % 200))).status, 200) }
  assert.equal(await kv.zcard("beerpong:scores"), 500)
})
await t("admin: auth for DELETE and ?admin listing", async () => {
  delete process.env.BEERPONG_ADMIN_KEY
  assert.equal((await del("", "x")).status, 503)
  assert.equal((await get("?admin=1", { "x-admin-key": "x" })).status, 503)
  process.env.BEERPONG_ADMIN_KEY = "s3cret"
  assert.equal((await del("")).status, 401)
  assert.equal((await del("", "s3cre")).status, 401)
  assert.equal((await del("", "s3cret!")).status, 401)
  assert.equal((await get("?admin=1")).status, 401)
  const l = await J(await get("?admin=1", { "x-admin-key": "s3cret" }))
  assert.equal(l.status, 200); assert.equal(l.body.entries.length, 500); assert.equal(l.body.entries[0].rank, 1); assert.ok(l.body.entries[0].id)
})
await t("DELETE one id, then all", async () => {
  const p = await run({ name: "GONE", score: 30_000, makes: 20 }); assert.equal((await post(p)).status, 200)
  const r = await J(await del("?id=" + p.id, "s3cret")); assert.equal(r.body.removed, 1)
  assert.ok(!(await J(await get("?limit=100"))).body.top.some((e) => e.id === p.id))
  assert.equal((await del("", "s3cret")).status, 200)
  assert.deepEqual((await J(await get())).body.top, [])
})
await t("x-bp-soft: errors become 200 {ok:false,status}", async () => {
  const r = await post(await run({ score: 9_999_999 }), "1.1.1.1", { "x-bp-soft": "1" })
  assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.ok, false); assert.equal(b.status, 422); assert.equal(b.error, "implausible")
  assert.equal((await (await post(await run(), "1.1.1.1", { "x-bp-soft": "1" })).json()).ok, true)
})
await t("store errors -> 500", async () => {
  const p = await run(); kv.fail = true
  assert.equal((await get()).status, 500); assert.equal((await post(p)).status, 500)
  assert.equal((await runRoute.POST(new Request("http://x/api/beerpong/run", { method: "POST" }))).status, 500)
  kv.fail = false
})
await t("unconfigured -> 503", async () => {
  globalThis.__BEERPONG_STORE__ = undefined
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k]
  const g = await J(await get()); assert.equal(g.status, 503); assert.equal(g.body.error, "leaderboard_unconfigured")
  assert.equal((await post({})).status, 503)
  assert.equal((await runRoute.POST(new Request("http://x/api/beerpong/run", { method: "POST" }))).status, 503)
  const soft = await route.GET(new Request(URL0, { headers: { "x-bp-soft": "1" } }))
  assert.equal(soft.status, 200); assert.deepEqual(await soft.json(), { ok: false, error: "leaderboard_unconfigured", status: 503 })
})
console.log(`\n${passed} route tests passed`)
