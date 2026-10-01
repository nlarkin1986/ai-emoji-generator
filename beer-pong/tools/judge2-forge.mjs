// Forged-score attempts against the devserver API (plain HTTP, no browser).
const API = "http://localhost:8811/api/beerpong"
const SALT = "SBP-1989-PARTYSOFT"
const F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"]
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
const tok = async () => (await (await fetch(API + "/run", { method: "POST" })).json()).token
const post = async (p, label) => { p.sum = sum(p); const r = await fetch(API + "/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }); console.log(label, r.status, (await r.text()).slice(0, 160)) }
const rid = () => "forge" + Math.random().toString(36).slice(2, 12)
const base = (o) => ({ v: 1, id: rid(), name: "HAX", ts: Date.now(), ...o })
// 1. no token
await post(base({ score: 999999, stage: 4, round: 2, shots: 200, makes: 110, durationMs: 300000 }), "no-token 999999:")
// 2. instant, R1 stage 5, abuse lag=120000
let t = await tok()
await post(base({ score: 175000, stage: 4, round: 1, shots: 160, makes: 60, durationMs: 100000, token: t, lag: 120000 }), "instant R1S5 175k (lag abuse):")
t = await tok()
await post(base({ score: 175000, stage: 4, round: 1, shots: 160, makes: 60, durationMs: 100000, token: t, lag: 0 }), "instant R1S5 175k (lag 0):")
// 3. token reuse
// 4. R2: wait for token to age
const t2 = await tok(); const t3 = await tok()
const waitS = +(process.argv[2] || 66)
console.log("waiting", waitS, "s (real wall clock) ...")
await new Promise((r) => setTimeout(r, waitS * 1000))
await post(base({ score: 640000, stage: 4, round: 2, shots: 300, makes: 110, durationMs: 200000, token: t2, lag: 120000 }), `R2 640k after ${waitS}s:`)
await post(base({ score: 640000, stage: 4, round: 2, shots: 300, makes: 110, durationMs: 200000, token: t2, lag: 120000 }), "token reuse:")
await post(base({ score: 300000, stage: 4, round: 2, shots: 120, makes: 100, durationMs: 200000, token: t3, lag: 120000 }), "R2 300k:")
console.log(await (await fetch(API + "/scores?limit=5")).text())
