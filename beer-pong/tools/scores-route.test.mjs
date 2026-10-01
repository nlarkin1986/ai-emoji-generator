// Unit tests for src/app/api/beerpong/{scores,run,run/checkpoint}/route.ts (+ _lib.ts) with an
// in-memory fake KV and a fake clock.
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
const { scores: route, run: runRoute, checkpoint: cpRoute } = await loadRoutes()

// --- mirror of the client payload signing (checksum must match scores.js) ---
const SALT = "SBP-1989-PARTYSOFT"
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"]
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
const resign = (p) => { p.sum = sum(p); return p }
const URL0 = "http://x/api/beerpong/scores"
const J = async (r) => ({ status: r.status, cc: r.headers.get("cache-control"), body: await r.json() })
const mint = async (ip = "5.5.5.5") => (await (await runRoute.POST(new Request("http://x/api/beerpong/run", { method: "POST", headers: { "x-forwarded-for": ip } }))).json()).token
const cp = async (token, c, ip = "5.5.5.5") => J(await cpRoute.POST(new Request("http://x/api/beerpong/run/checkpoint", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ token, ...c }) })))
const cpReason = async (token, c) => { const r = await cp(token, c); return r.body.ok ? "ok" : r.body.reason || r.body.error }

let n = 0
/**
 * Play a legit run on the fake clock: one checkpoint per cleared stage (gap ms apart), then the
 * final summary. Per completed stage: dM makes, dSh shots, score = fill * (dM*1400 + 15000) * round;
 * the unfinished last stage: fill * (dM*1400 + 2000) * round. Gaps satisfy the server-time minimums.
 * o.score/makes/shots/... override the final summary (forgery tests); o.skip = no checkpoints.
 */
async function run(o = {}) {
  const { stage = 0, round = 1, dM = 6, dSh = 10, fill = 0.5, skip = false } = o
  const { gap = Math.max(40_000, 30_000 + 2_000 * dSh) + 5_000, finalGap = 10_000 + 3_000 * dSh + 5_000 } = o
  const S = (round - 1) * 5 + stage + 1
  let token = "token" in o ? o.token : await mint()
  let score = 0, makes = 0, shots = 0
  const stageScore = (r, bonus = 15000) => Math.floor((dM * 1400 + bonus) * r * fill)
  for (let k = 0; k < S - 1 && !skip; k++) {
    const r = Math.floor(k / 5) + 1
    advance(gap); score += stageScore(r); makes += dM; shots += dSh
    const res = await cp(token, { round: r, stage: k % 5, score, makes, shots })
    assert.equal(res.body.ok, true, "checkpoint " + k + " " + JSON.stringify(res.body)); token = res.body.token
  }
  if (!skip) { advance(finalGap); score += stageScore(round, 2000); makes += dM; shots += dSh }
  const p = { v: 1, id: "test-" + String(++n).padStart(5, "0"), name: "ACE", score, stage, round, cups: 3, accuracy: 50, shots, makes, durationMs: Math.max(S * 20_000, (S - 1) * gap + finalGap), token, ...o }
  for (const k of ["dM", "dSh", "fill", "gap", "finalGap", "skip"]) delete p[k]
  p.ts = o.ts ?? Date.now()
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k]
  return resign(p)
}

const post = (body, ip = "1.1.1.1", h = {}) => route.POST(new Request(URL0, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json", ...h }, body: typeof body === "string" ? body : JSON.stringify(body) }))
const get = (q = "", h = {}) => route.GET(new Request(URL0 + q, { headers: h }))
const del = (q = "", key) => route.DELETE(new Request(URL0 + q, { method: "DELETE", headers: key ? { "x-admin-key": key } : {} }))
const reason = async (p) => { const r = await J(await post(p)); return r.status === 200 ? "ok" : r.body.reason || r.body.error }

let passed = 0
const t = async (name, fn) => { try { kv.resetRateLimits(); await fn(); passed++; console.log("ok  ", name) } catch (e) { console.log("FAIL", name); throw e } }

await t("GET empty", async () => { const r = await J(await get()); assert.equal(r.status, 200); assert.deepEqual(r.body.top, []); assert.equal(r.cc, "no-store") })
await t("run token issued", async () => { assert.match(await mint(), /^[\w-]+\.[\w-]+$/) })
await t("stage-1 run (no checkpoints needed) -> rank 1", async () => {
  const r = await J(await post(await run({ name: "nick!" })))
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.rank, 1)
  assert.equal(r.body.top[0].name, "NICK!"); assert.deepEqual(Object.keys(r.body.top[0]).sort(), ["id", "name", "round", "score", "stage", "ts"])
})
await t("ranks", async () => {
  assert.equal((await J(await post(await run({ fill: 0.1 })))).body.rank, 2)
  assert.equal((await J(await post(await run({ fill: 0.9 })))).body.rank, 1)
})
await t("tie ranks equal, earlier ts listed first", async () => {
  const a = await run({ name: "TIEA", fill: 0.3, ts: Date.now() - 5000 }), b = await run({ name: "TIEB", fill: 0.3 })
  await post(b); const r = await J(await post(a))
  const names = r.body.top.map((e) => e.name); assert.ok(names.indexOf("TIEA") < names.indexOf("TIEB"))
})

// ---------------------------------------------------------------- chain ----
await t("legit chained runs pass: R1 stage 4, R2 ENDING (S == checkpoints), GAUNTLET round 4", async () => {
  assert.equal(await reason(await run({ stage: 4, round: 1 })), "ok")
  assert.equal(await reason(await run({ stage: 4, round: 2, fill: 1, dM: 10, dSh: 20 })), "ok") // every stage at the per-stage score max
  // ENDING: the 10th stage was cleared + checkpointed, then submit right away (S == st)
  let token = await mint(), score = 0, makes = 0, shots = 0
  for (let k = 0; k < 10; k++) { advance(60_000); const r = Math.floor(k / 5) + 1; score += (8 * 1400 + 15000) * r; makes += 8; shots += 12; token = (await cp(token, { round: r, stage: k % 5, score, makes, shots })).body.token }
  advance(15_000) // ending sequence + name entry
  const end = resign({ v: 1, id: "ending-0001", name: "CHAMP", score: score + 5000 /* champion bonus */, stage: 4, round: 2, shots, makes, durationMs: 450_000, ts: Date.now(), token })
  assert.equal(await reason(end), "ok")
  assert.equal(await reason(await run({ stage: 2, round: 4, dM: 10, dSh: 14, fill: 0.9 })), "ok")
})
await t("judge2-forge attacks fail", async () => {
  const forge = (o) => resign({ v: 1, id: "forge" + Math.random().toString(36).slice(2, 10), name: "HAX", ts: Date.now(), ...o })
  const bad = (r) => assert.notEqual(r, "ok")
  bad(await reason(forge({ score: 999999, stage: 4, round: 2, shots: 200, makes: 110, durationMs: 300000 })))
  for (const lag of [120000, 0]) bad(await reason(forge({ score: 175000, stage: 4, round: 1, shots: 160, makes: 60, durationMs: 100000, token: await mint(), lag })))
  const t2 = await mint(); advance(66_000)
  bad(await reason(forge({ score: 640000, stage: 4, round: 2, shots: 300, makes: 110, durationMs: 200000, token: t2, lag: 120000 })))
  // the same shapes scaled inside the whole-run ceiling: rejected for lacking the checkpoint chain
  assert.equal(await reason(forge({ score: 150000, stage: 4, round: 1, shots: 160, makes: 60, durationMs: 300000 })), "no_token")
  assert.equal(await reason(forge({ score: 150000, stage: 4, round: 1, shots: 160, makes: 60, durationMs: 300000, token: await mint(), lag: 120000 })), "no_checkpoints")
  const t4 = await mint(); advance(600_000)
  assert.equal(await reason(forge({ score: 500000, stage: 4, round: 2, shots: 300, makes: 110, durationMs: 600000, token: t4 })), "no_checkpoints")
  // stage-1 sized forgery with a fresh token: still bound by the one-stage rule
  const t3 = await mint(); advance(60_000)
  bad(await reason(forge({ score: 45_200, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: t3 }))) // judge #3: was accepted at rank 1
  // a stage-1 forgery is now capped at (13*1400 + 2000) = 20,200 and needs 10 s + 3 s/shot = 49 s
  const t5 = await mint(); advance(10_500)
  assert.equal(await reason(forge({ score: 20_200, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: t5 })), "too_soon")
  const t6 = await mint(); advance(50_000)
  assert.equal(await reason(forge({ score: 20_201, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: t6 })), "stage_score_too_high")
  // S == st right after a checkpoint is only legal at the ENDING (>= 10 clears)
  const t7 = await mint(); advance(60_000)
  const c7 = await cp(t7, { round: 1, stage: 0, score: 33_200, makes: 13, shots: 13 }); assert.equal(c7.body.ok, true)
  advance(20_000)
  assert.equal(await reason(forge({ score: 33_200 + 9_000, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 90000, token: c7.body.token })), "checkpoint_mismatch")
})
await t("checkpoint rules", async () => {
  const tok = await mint()
  advance(39_000)
  const soon = await cp(tok, { round: 1, stage: 0, score: 5000, makes: 6, shots: 10 })
  assert.equal(soon.status, 425); assert.equal(soon.body.error, "too_soon"); assert.equal(soon.body.retryInMs, 11_000) // needs max(40 s, 30 s + 2 s * 10 shots)
  advance(2_000)
  assert.equal(await cpReason(tok, { round: 1, stage: 1, score: 5000, makes: 6, shots: 10 }), "out_of_order")
  assert.equal(await cpReason(tok, { round: 1, stage: 0, score: 33_201, makes: 13, shots: 20 }), "stage_score_too_high")
  assert.equal(await cpReason(tok, { round: 1, stage: 0, score: 5000, makes: 14, shots: 20 }), "stage_too_many_makes")
  assert.equal(await cpReason(tok, { round: 1, stage: 0, score: 5000, makes: 8, shots: 6 }), "makes_gt_shots")
  // the same checkpoint retried (lost response) gets the same next token; a different body is a fork
  assert.equal(await cpReason(tok, { round: 1, stage: 0, score: 33_200, makes: 13, shots: 20 }), "too_soon") // 20 shots need 70 s
  advance(30_000)
  const a = await cp(tok, { round: 1, stage: 0, score: 33_200, makes: 13, shots: 20 }); assert.equal(a.body.ok, true)
  const b = await cp(tok, { round: 1, stage: 0, score: 33_200, makes: 13, shots: 20 }); assert.equal(b.body.token, a.body.token)
  assert.equal(await cpReason(tok, { round: 1, stage: 0, score: 1000, makes: 13, shots: 20 }), "token_used")
  // a used chain link can't be submitted either
  assert.equal(await reason(resign({ v: 1, id: "fork-00001", name: "F", score: 100, stage: 0, round: 1, shots: 20, makes: 13, durationMs: 60000, ts: Date.now(), token: tok })), "token_used")
  advance(41_000)
  assert.equal(await cpReason(a.body.token, { round: 1, stage: 1, score: 30_000, makes: 20, shots: 30 }), "not_monotonic")
  assert.equal(await cpReason(a.body.token, { round: 1, stage: 1, score: 40_000, makes: 20, shots: 300 }), "too_soon") // 280 shots need 590 s
  assert.equal(await cpReason("nope.nope", { round: 1, stage: 0, score: 0, makes: 0, shots: 0 }), "bad_token")
})
await t("final submit: mismatch / too soon / delta too big / expired / lag ignored", async () => {
  const p = await run({ stage: 1 }) // 1 checkpoint, final stage index 1
  assert.equal(await reason(resign({ ...p, stage: 3, durationMs: 200_000, id: "mismatch-1" })), "checkpoint_mismatch")
  const q = await run({ stage: 1, finalGap: 5_000 }); const soon = await J(await post(q))
  assert.equal(soon.status, 425); assert.equal(soon.body.error, "too_soon")
  advance(60_000); assert.equal(await reason(q), "ok") // the same signed payload, retried later
  const big = await run({ stage: 1 }); assert.equal(await reason(resign({ ...big, score: big.score + 25_000 })), "stage_score_too_high")
  const old = await run(); advance(8 * 86_400_000); assert.equal(await reason(old), "token_expired")
  const l = await run({ finalGap: 3_000 }); l.lag = 120_000; resign(l); assert.equal((await J(await post(l))).body.error, "too_soon")
})
await t("identical retry accepted (idempotent), not duplicated", async () => {
  const p = await run(); assert.equal((await post(p)).status, 200)
  const before = await kv.zcard("beerpong:scores")
  advance(3_600_000); assert.equal((await post(p)).status, 200)
  assert.equal(await kv.zcard("beerpong:scores"), before)
})
await t("token reuse for a different entry -> token_used; duplicate id -> duplicate_id", async () => {
  const p = await run(); await post(p)
  assert.equal(await reason(resign({ ...p, id: "other-id-1", score: p.score - 1 })), "token_used")
  const q = await run(); q.id = p.id; resign(q)
  assert.equal(await reason(q), "duplicate_id")
})
await t("whole-run plausibility (pre-filter)", async () => {
  assert.equal(await reason(await run({ round: 9, stage: 4, skip: true, score: 9_999_999, makes: 5000, shots: 5000, durationMs: 86_400_000 })), "too_many_makes")
  assert.equal(await reason(await run({ skip: true, score: 30_000, makes: 3, shots: 10, durationMs: 60_000 })), "score_too_high") // (3*1400+15000)+10000
  assert.equal(await reason(await run({ skip: true, durationMs: 19_000 })), "too_short")
  assert.equal(await reason(await run({ skip: true, durationMs: 12 * 3_600_000 + 1 })), "too_long")
})
await t("name sanitising", async () => {
  const cases = [["  héllo wörld <script>", "HLLO WRL"], ["", "PLAYER"], ["@@@", "PLAYER"], ["a♥b", "A♥B"], ["fuckface", "PLAYER"], ["  x   y  ", "X Y"], ["ABCDEFGHIJ", "ABCDEFGH"]]
  for (const [inp, want] of cases) {
    assert.equal((await post(await run({ name: inp, fill: 0.01 }))).status, 200, inp)
    assert.ok((await J(await get("?limit=100"))).body.top.some((e) => e.name === want), `${inp} -> ${want}`)
  }
})
await t("validation errors", async () => {
  assert.equal((await post("not json")).status, 400)
  for (const o of [{ score: -1 }, { score: 10_000_000 }, { score: 12.5 }, { id: "x" }, { round: 31 }, { round: 0 }, { stage: 5 }, { makes: undefined }, { shots: undefined }, { durationMs: undefined }])
    assert.equal((await post(await run({ ...o, skip: true }))).status, 400, JSON.stringify(o))
  assert.equal((await post(resign({ ...(await run()), v: 2 }))).status, 400)
  assert.equal((await post("x".repeat(5000))).status, 413)
})
await t("checksum", async () => {
  const p = await run(); p.score += 1
  const r = await J(await post(p)); assert.equal(r.status, 400); assert.equal(r.body.error, "bad_checksum")
  const q = await run(); delete q.sum; assert.equal((await post(q)).status, 400)
})
await t("rate limit 30/min per IP (submits) and 120/min (tokens + checkpoints)", async () => {
  const ps = []; for (let i = 0; i < 32; i++) ps.push(await run({ fill: 0.01 }))
  kv.resetRateLimits()
  for (let i = 0; i < 30; i++) assert.equal((await post(ps[i], "9.9.9.9")).status, 200)
  const r = await post(ps[30], "9.9.9.9"); assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60")
  assert.equal((await post(ps[31], "8.8.8.8")).status, 200)
  kv.resetRateLimits()
  for (let i = 0; i < 120; i++) assert.ok(await mint("6.6.6.6"))
  assert.equal(await mint("6.6.6.6"), undefined)
})
await t("GET limit clamp + order", async () => {
  const a = await J(await get("?limit=3")); assert.equal(a.body.top.length, 3)
  const s = a.body.top.map((e) => e.score); assert.deepEqual(s, [...s].sort((x, y) => y - x))
  assert.ok((await J(await get("?limit=999"))).body.top.length <= 100)
  assert.ok((await J(await get("?limit=abc"))).body.top.length <= 10)
})
await t("keeps only top 500", async () => {
  for (let i = 0; i < 520; i++) { kv.resetRateLimits(); assert.equal((await post(await run({ fill: 0.01 + i / 2000 }), "7.7.7." + (i % 200))).status, 200) }
  assert.equal(await kv.zcard("beerpong:scores"), 500)
})
await t("admin: auth, ?admin listing with durationMs / serverMs / stagesCleared", async () => {
  delete process.env.BEERPONG_ADMIN_KEY
  assert.equal((await del("", "x")).status, 503)
  assert.equal((await get("?admin=1", { "x-admin-key": "x" })).status, 503)
  process.env.BEERPONG_ADMIN_KEY = "s3cret"
  assert.equal((await del("")).status, 401)
  assert.equal((await del("", "s3cre")).status, 401)
  assert.equal((await get("?admin=1")).status, 401)
  const p = await run({ name: "TOPDOG", stage: 3, round: 2, fill: 1 }); assert.equal((await post(p)).status, 200)
  const l = await J(await get("?admin=1", { "x-admin-key": "s3cret" }))
  assert.equal(l.status, 200); assert.equal(l.body.entries.length, 500)
  assert.equal(l.body.entries[0].rank, 1)
  const e = l.body.entries.find((x) => x.id === p.id)
  assert.equal(e.name, "TOPDOG"); assert.equal(e.stagesCleared, 8); assert.ok(Math.abs(e.serverMs - 8 * 55_000) < 2000); assert.equal(e.durationMs, p.durationMs)
  // public listing does not leak the extras
  assert.deepEqual(Object.keys((await J(await get())).body.top[0]).sort(), ["id", "name", "round", "score", "stage", "ts"])
})
await t("DELETE one id, then all", async () => {
  const p = await run({ name: "GONE", fill: 1 }); assert.equal((await post(p)).status, 200)
  assert.equal((await J(await del("?id=" + p.id, "s3cret"))).body.removed, 1)
  assert.ok(!(await J(await get("?limit=100"))).body.top.some((e) => e.id === p.id))
  assert.equal((await del("", "s3cret")).status, 200)
  assert.deepEqual((await J(await get())).body.top, [])
})
await t("x-bp-soft: errors become 200 {ok:false,status}", async () => {
  const r = await post(await run({ skip: true, score: 9_999_999 }), "1.1.1.1", { "x-bp-soft": "1" })
  assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.ok, false); assert.equal(b.status, 422)
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
  assert.equal((await cp("x", {})).status, 503)
  const soft = await route.GET(new Request(URL0, { headers: { "x-bp-soft": "1" } }))
  assert.equal(soft.status, 200); assert.deepEqual(await soft.json(), { ok: false, error: "leaderboard_unconfigured", status: 503 })
})
console.log(`\n${passed} route tests passed`)
