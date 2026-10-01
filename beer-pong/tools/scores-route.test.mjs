// Unit tests for src/app/api/beerpong/scores/route.ts with an in-memory fake KV.
// Run: node beer-pong/tools/scores-route.test.mjs   (Node >= 22.18 strips TS types natively)
import assert from "node:assert/strict"
import { createFakeKv } from "./scores-fakekv.mjs"

const kv = createFakeKv()
globalThis.__BEERPONG_STORE__ = kv
const quiet = console.error; console.error = () => {} // route logs expected store errors
const route = await import("../../src/app/api/beerpong/scores/route.ts")

// --- mirror of the client payload builder (checksum must match scores.js) ---
const SALT = "SBP-1989-PARTYSOFT"
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts"]
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
let n = 0
const run = (o = {}) => { const p = { v: 1, id: "test-" + String(++n).padStart(4, "0"), name: "ACE", score: 1000, stage: 0, round: 1, cups: 3, accuracy: 50, shots: 20, makes: 10, durationMs: 120000, ts: Date.now(), ...o }; p.sum = o.sum ?? sum(p); return p }

const URL0 = "http://x/api/beerpong/scores"
const post = (body, ip = "1.1.1.1") => route.POST(new Request(URL0, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }))
const get = (q = "") => route.GET(new Request(URL0 + q))
const del = (q = "", key) => route.DELETE(new Request(URL0 + q, { method: "DELETE", headers: key ? { "x-admin-key": key } : {} }))
const J = async (r) => ({ status: r.status, cc: r.headers.get("cache-control"), body: await r.json() })

let passed = 0
const t = async (name, fn) => { try { kv.resetRateLimits(); await fn(); passed++; console.log("ok  ", name) } catch (e) { console.log("FAIL", name); throw e } }

await t("GET empty", async () => { const r = await J(await get()); assert.equal(r.status, 200); assert.deepEqual(r.body.top, []); assert.equal(r.cc, "no-store") })
await t("POST valid -> rank 1", async () => {
  const r = await J(await post(run({ name: "nick!", score: 5000 })))
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.rank, 1)
  assert.equal(r.body.top[0].name, "NICK!"); assert.deepEqual(Object.keys(r.body.top[0]).sort(), ["id", "name", "round", "score", "stage", "ts"])
})
await t("POST lower -> rank 2, higher -> rank 1", async () => {
  assert.equal((await J(await post(run({ score: 3000 })))).body.rank, 2)
  assert.equal((await J(await post(run({ score: 9000 })))).body.rank, 1)
})
await t("tie ranks equal, earlier ts listed first", async () => {
  const a = run({ name: "TIEA", score: 4000, ts: Date.now() - 5000 }), b = run({ name: "TIEB", score: 4000 })
  await post(b); const r = await J(await post(a)); assert.equal(r.body.rank, 3)
  const names = r.body.top.map((e) => e.name); assert.ok(names.indexOf("TIEA") < names.indexOf("TIEB"))
})
await t("idempotent resubmit (retry queue)", async () => {
  const p = run({ score: 1234 }); await post(p); const before = await kv.zcard("beerpong:scores"); await post(p)
  assert.equal(await kv.zcard("beerpong:scores"), before)
})
await t("name sanitising", async () => {
  const cases = [["  héllo wörld <script>", "HLLO WRL"], ["", "PLAYER"], ["@@@", "PLAYER"], ["a♥b", "A♥B"], ["fuckface", "PLAYER"], ["  x   y  ", "X Y"], ["ABCDEFGHIJ", "ABCDEFGH"]]
  for (const [inp, want] of cases) { const r = await J(await post(run({ name: inp, score: 10 }))); assert.equal(r.status, 200, inp); const all = await J(await get("?limit=100")); assert.ok(all.body.top.some((e) => e.name === want), `${inp} -> ${want}`) }
})
await t("validation errors", async () => {
  assert.equal((await post("not json")).status, 400)
  assert.equal((await post(run({ score: -1 }))).status, 400)
  assert.equal((await post(run({ score: 10_000_000 }))).status, 400)
  assert.equal((await post(run({ score: 12.5 }))).status, 400)
  assert.equal((await post(run({ id: "x" }))).status, 400)
  assert.equal((await post({ ...run(), v: 2 })).status, 400)
  assert.equal((await post("x".repeat(5000))).status, 413)
})
await t("checksum", async () => {
  const p = run({ score: 2000 }); p.score = 2001
  const r = await J(await post(p)); assert.equal(r.status, 400); assert.equal(r.body.error, "bad_checksum")
  const q = run(); delete q.sum; assert.equal((await post(q)).status, 400)
})
await t("plausibility rejects", async () => {
  const bad = [
    { score: 9_999_999, makes: 10 },
    { score: 500_000, makes: undefined, shots: undefined, stage: 0, round: 1 },
    { makes: 30, shots: 20 },
    { shots: 1000, durationMs: 60_000 },
    { stage: 4, makes: 2, score: 100 },
    { stage: 4, durationMs: 4000, score: 100 },
  ]
  for (const o of bad) { const r = await J(await post(run(o))); assert.equal(r.status, 422, JSON.stringify(o)); assert.equal(r.body.error, "implausible") }
})
await t("plausibility accepts generous legit maxima", async () => {
  // Round 1 perfect run to stage 4 (all ON FIRE swish island bounce shots) and Round 2 x2
  const ok = [
    { stage: 0, round: 1, makes: 6, shots: 6, durationMs: 30_000, score: 6 * 2550 + 13000 + 2000 },
    { stage: 4, round: 1, makes: 40, shots: 40, durationMs: 300_000, score: 40 * 2550 + 5 * 15000 },
    { stage: 4, round: 2, makes: 90, shots: 100, durationMs: 900_000, score: 2 * (90 * 2550 + 10 * 15000) },
    { stage: 2, round: 3, makes: 150, shots: 160, durationMs: 1_800_000, score: 3 * (150 * 2550 + 13 * 15000) },
    { stage: 3, round: 1, score: 90_000, makes: undefined, shots: undefined, durationMs: undefined, cups: undefined, accuracy: undefined },
  ]
  for (const o of ok) { const r = await J(await post(run(o))); assert.equal(r.status, 200, JSON.stringify(o) + " " + JSON.stringify(r.body)) }
})
await t("rate limit 30/min per IP", async () => {
  for (let i = 0; i < 30; i++) assert.equal((await post(run({ score: 1 }), "9.9.9.9")).status, 200)
  const r = await post(run({ score: 1 }), "9.9.9.9"); assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60")
  assert.equal((await post(run({ score: 1 }), "8.8.8.8")).status, 200)
})
await t("GET limit clamp + order", async () => {
  const a = await J(await get("?limit=3")); assert.equal(a.body.top.length, 3)
  const s = a.body.top.map((e) => e.score); assert.deepEqual(s, [...s].sort((x, y) => y - x))
  const b = await J(await get("?limit=999")); assert.ok(b.body.top.length <= 100)
  const c = await J(await get("?limit=abc")); assert.ok(c.body.top.length <= 10)
})
await t("keeps only top 500", async () => {
  for (let i = 0; i < 520; i++) { kv.resetRateLimits(); assert.equal((await post(run({ score: 100 + i }), "7.7.7." + (i % 200))).status, 200) }
  assert.equal(await kv.zcard("beerpong:scores"), 500)
})
await t("DELETE auth", async () => {
  delete process.env.BEERPONG_ADMIN_KEY
  assert.equal((await del("", "x")).status, 503)
  process.env.BEERPONG_ADMIN_KEY = "s3cret"
  assert.equal((await del("")).status, 401)
  assert.equal((await del("", "s3cre")).status, 401)
  assert.equal((await del("", "s3cret!")).status, 401)
})
await t("DELETE one id, then all", async () => {
  const p = run({ name: "GONE", score: 9_500, makes: 20 }); await post(p)
  const r = await J(await del("?id=" + p.id, "s3cret")); assert.equal(r.body.removed, 1)
  assert.ok(!(await J(await get("?limit=100"))).body.top.some((e) => e.id === p.id))
  const all = await J(await del("", "s3cret")); assert.equal(all.status, 200)
  assert.deepEqual((await J(await get())).body.top, [])
})
await t("x-bp-soft: errors become 200 {ok:false,status}", async () => {
  const r = await route.POST(new Request(URL0, { method: "POST", headers: { "x-bp-soft": "1" }, body: JSON.stringify(run({ score: 9_999_999, makes: 1 })) }))
  assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.ok, false); assert.equal(b.status, 422); assert.equal(b.error, "implausible")
  const ok = await route.POST(new Request(URL0, { method: "POST", headers: { "x-bp-soft": "1" }, body: JSON.stringify(run()) }))
  assert.equal((await ok.json()).ok, true)
})
await t("store errors -> 500", async () => {
  kv.fail = true
  assert.equal((await get()).status, 500); assert.equal((await post(run())).status, 500)
  kv.fail = false
})
await t("unconfigured -> 503", async () => {
  globalThis.__BEERPONG_STORE__ = undefined
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k]
  const g = await J(await get()); assert.equal(g.status, 503); assert.equal(g.body.error, "leaderboard_unconfigured")
  assert.equal((await post(run())).status, 503)
  const soft = await route.GET(new Request(URL0, { headers: { "x-bp-soft": "1" } }))
  assert.equal(soft.status, 200); assert.deepEqual(await soft.json(), { ok: false, error: "leaderboard_unconfigured", status: 503 })
})
console.log(`\n${passed} route tests passed`)
