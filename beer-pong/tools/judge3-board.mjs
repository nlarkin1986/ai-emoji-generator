// Populate the 8824 board with 14 valid stage-1 entries, then: TV mode shots + a low-score run (rank strip) on a phone.
import { chromium, devices, DEV, cshot, pshot, hookErrors, dbg, sleep } from "./judge3-lib.mjs"
const B = "http://localhost:8824", API = B + "/api/beerpong"
const SALT = "SBP-1989-PARTYSOFT", F = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"]
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return ("0000000" + h.toString(16)).slice(-8) }
const sum = (p) => fnv(SALT + "|" + F.map((k) => (p[k] == null ? "" : String(p[k]))).join("|"))
await fetch(B + "/__dev/reset", { method: "POST" })
const names = ["ALICE", "BOB", "CARLOS", "DANA", "EVE", "FRANK", "GINA", "HAL", "IVY", "JAKE", "KIM", "LEO", "MIA", "NED"]
for (let i = 0; i < names.length; i++) {
  const token = (await (await fetch(API + "/run", { method: "POST" })).json()).token
  await fetch(B + "/__dev/clock?advance=11000", { method: "POST" })
  const p = { v: 1, id: "seed" + i + Math.random().toString(36).slice(2, 8), name: names[i], score: 9000 - i * 500, stage: 0, round: 1, cups: 3, accuracy: 50, shots: 10, makes: 5, durationMs: 60000, ts: Date.now(), token }
  p.sum = sum(p); const r = await fetch(API + "/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }); if (!(await r.json()).ok) console.log("seed fail", i)
}
const b = await chromium.launch()
for (const [w, h, tag] of (process.argv[2] ? [] : [[1920, 1080, "tv-1080"], [1080, 1920, "tv-portrait"]])) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = []; hookErrors(page, errs)
  await page.goto(DEV + "?tv"); await sleep(2500); await pshot(page, tag); console.log(tag, errs)
  await page.close()
}
// phone: quit at once -> score 0 -> rank 15
const ctx = await b.newContext({ ...devices["iPhone SE"], hasTouch: true, isMobile: true })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV + "?debug"); await sleep(1000)
await page.evaluate(() => { BP.Game.debug.startAt(0, 0, 0); BP.Game.debug.step(5); BP.Game.debug.go("entry") }); await sleep(800)
await sleep(1200); await page.keyboard.press("z"); await sleep(300); await page.keyboard.press("Enter"); await sleep(300); await page.keyboard.press("z"); await sleep(400); await cshot(page, "rank-confirm"); await sleep(700); await page.keyboard.press("z"); await sleep(3000)
await cshot(page, "rankstrip"); await sleep(400); await cshot(page, "rankstrip2"); await pshot(page, "rankstrip-page")
console.log(JSON.stringify(await dbg(page)), errs)
await b.close()
