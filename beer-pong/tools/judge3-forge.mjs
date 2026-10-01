// Forged-score attempts against a devserver (plain HTTP). Uses /__dev/clock to simulate waiting.
const B = process.argv[2] || "http://localhost:8824"
const API = B + "/api/beerpong"
const SALT = "SBP-1989-PARTYSOFT"
const F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"]
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
const J = { "content-type": "application/json" }
const adv = (ms) => fetch(B + "/__dev/clock?advance=" + ms, { method: "POST" })
const tok = async () => (await (await fetch(API + "/run", { method: "POST" })).json()).token
const cp = async (token, c, label) => { const r = await fetch(API + "/run/checkpoint", { method: "POST", headers: J, body: JSON.stringify({ token, ...c }) }); const j = await r.json(); if (label) console.log(label, r.status, JSON.stringify(j).replace(/"token":"[^"]+"/, '"token":"…"')); return j }
const post = async (p, label) => { p.sum = sum(p); const r = await fetch(API + "/scores", { method: "POST", headers: J, body: JSON.stringify(p) }); const t = await r.text(); console.log(label, r.status, t.replace(/"top":\[.*\]/, '"top":[…]').slice(0, 200)); return t }
const rid = () => "forge" + Math.random().toString(36).slice(2, 12)
const base = (o) => ({ v: 1, id: rid(), name: "HAX", ts: Date.now(), cups: 0, accuracy: 100, ...o })
await fetch(B + "/__dev/reset", { method: "POST" })

console.log("--- 1. no token")
await post(base({ score: 999999, stage: 4, round: 2, shots: 200, makes: 110, durationMs: 300000 }), "no-token:")
console.log("--- 2. died-in-stage-1 forge, 10 s after a fresh token, at the ceiling")
let t = await tok(); await adv(10_500)
await post(base({ score: 45200, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: t }), "S1 45,200 @10s:")
t = await tok(); await adv(10_500)
await post(base({ score: 45201, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: t }), "S1 45,201 @10s:")
console.log("--- 3. skip checkpoints (claim R2S5 with chain start)")
t = await tok(); await adv(600_000)
await post(base({ score: 300000, stage: 4, round: 2, shots: 150, makes: 70, durationMs: 600000, token: t }), "skip:")
console.log("--- 4. fast checkpoint (5 s)")
t = await tok(); await adv(5000)
await cp(t, { round: 1, stage: 0, score: 3000, makes: 6, shots: 10 }, "cp@5s:")
console.log("--- 5. inflated delta at 41 s")
await adv(36000)
await cp(t, { round: 1, stage: 0, score: 35201, makes: 13, shots: 13 }, "cp 35,201:")
const ok1 = await cp(t, { round: 1, stage: 0, score: 35200, makes: 13, shots: 13 }, "cp 35,200:")
console.log("--- 6. fork: same token, different data / replay identical")
await cp(t, { round: 1, stage: 0, score: 1000, makes: 3, shots: 6 }, "fork:")
await cp(t, { round: 1, stage: 0, score: 35200, makes: 13, shots: 13 }, "identical replay:")
console.log("--- 7. S==st instant submit right after a checkpoint (0 s)")
await post(base({ score: 35200 + 27000, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: ok1.token }), "S==st +27,000 @0s:")
await post(base({ score: 35200 + 27000, stage: 0, round: 1, shots: 13, makes: 13, durationMs: 60000, token: ok1.token }), "reuse used token, new id:")
console.log("--- 8. ceiling chain through R1+R2 (+ gauntlet R3..R4), 40 s per stage")
t = await tok()
let sc = 0, mk = 0, sh = 0, secs = 0, rows = []
for (let S = 1; S <= 20; S++) {
  const round = Math.ceil(S / 5), stage = (S - 1) % 5
  await adv(40_000); secs += 40
  sc += (13 * 1400 + 17000) * round; mk += 13; sh += 13
  const j = await cp(t, { round, stage, score: sc, makes: mk, shots: sh })
  if (!j.ok) { console.log("chain broke at", S, JSON.stringify(j)); break }
  t = j.token
  if (S === 10 || S === 15 || S === 20) rows.push({ S, round, secs, sc })
  if (S === 10) { // fork the R2 champion state into a submit (S == st) with the instant slack
    await post(base({ score: sc + 17000 * 2 + 10000, stage: 4, round: 2, shots: sh, makes: mk, durationMs: secs * 1000, token: t }), `R2 champion forge after ${secs}s server time:`)
    break
  }
}
console.log(JSON.stringify(rows))
console.log("--- 9. odd values")
t = await tok(); await adv(11000)
await post(base({ score: 1000.5, stage: 0, round: 1, shots: 10, makes: 3, durationMs: 60000, token: t }), "float score:")
await post(base({ score: -5, stage: 0, round: 1, shots: 10, makes: 3, durationMs: 60000, token: t }), "negative:")
await post(base({ name: "<script>", score: 100, stage: 0, round: 1, shots: 10, makes: 3, durationMs: 60000, token: t }), "html name:")
console.log("--- board")
console.log(await (await fetch(API + "/scores?limit=10")).text())
