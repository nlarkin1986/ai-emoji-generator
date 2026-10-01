// Full legit autoplay run against the devserver with real checkpoints (server clock advanced in step with game time).
// Plays R1 -> R2 -> ENDING -> GAUNTLET until game over, then name entry + submit. Logs every API call.
import { chromium, DEV, cshot, hookErrors, dbg, sleep } from "./judge3-lib.mjs"
const skill = +(process.argv[2] || 0.97), tagp = process.argv[3] || "L"
const maxRound = +(process.argv[4] || 4)
const B = "http://localhost:8823"
if (!process.argv.includes("--noreset")) await fetch(B + "/__dev/reset", { method: "POST" })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1024, height: 900 } })
await ctx.addInitScript(() => { const r = Date.now; window.__skew = 0; Date.now = () => r() + window.__skew })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
const reqs = []
page.on("request", (r) => { if (r.url().includes("/api/") && r.method() === "POST") console.log("REQ " + r.url().replace(B, "") + " " + (r.postData() || "").replace(/"token":"[^"]+"/, '"token":"…"').slice(0, 220)) })
page.on("response", async (r) => { if (r.url().includes("/api/") && r.request().method() === "POST") console.log("RES " + r.status() + " " + (await r.text().catch(() => "")).replace(/"token":"[^"]+"/, '"token":"…"').slice(0, 200)) })
await page.goto(B + "/beerpong/?debug"); await sleep(1200)
await page.evaluate((s) => { BP.Game.debug.autoplay = s }, skill)
let last = "", simMs = 0, stageStart = 0, stageScore0 = 0
const seen = new Set(), perStage = []
for (let i = 0; i < 6000; i++) {
  await page.evaluate(() => { BP.Game.debug.step(60); window.__skew += 1000 })
  simMs += 1000
  await fetch(B + "/__dev/clock?advance=1000", { method: "POST" })
  if (i % 2 === 0) await sleep(15)
  for (let w = 0; w < 90; w++) { const st = await page.evaluate(() => BP.Scores.status()); if (!st.cpPending) break; await sleep(1000) }
  const d = await dbg(page)
  const tag = d.state + ":" + d.round + ":" + d.stage
  if (tag !== last) {
    console.log(Math.round(simMs / 1000) + "s", tag, "score", d.score, "cups", JSON.stringify(d.cups), "buzz", d.buzz)
    if (d.state === "vs") { stageStart = simMs; stageScore0 = d.score }
    if (d.state === "clear") perStage.push({ r: d.round, s: d.stage + 1, secs: Math.round((simMs - stageStart) / 1000), pts: d.score - stageScore0 })
    last = tag
  }
  if (process.argv.includes("--assist") && d.round === 2 && d.stage === 4 && d.state === "match" && !seen.has("assist")) { seen.add("assist"); await page.evaluate(() => BP.Game.debug.setCups(1, 1)) }
  if (d.state === "ending" && !seen.has("endshots")) { seen.add("endshots"); for (let k = 0; k < 8; k++) { await page.evaluate(() => { BP.Game.debug.step(120); BP.Game.debug.render() }); await fetch(B + "/__dev/clock?advance=2000", { method: "POST" }); await cshot(page, tagp + "-ending-" + k) } }
  if (d.round > maxRound && d.state === "match" && !seen.has("kill")) { seen.add("kill"); await page.evaluate(() => { BP.Game.debug.autoplay = 0.05 }) }
  const k = d.state + d.stage + d.round
  if (!seen.has(k) && ["vs", "clear", "ending", "gameover", "entry", "scores"].includes(d.state)) { seen.add(k); await page.evaluate(() => BP.Game.debug.render()); await cshot(page, `${tagp}-${d.state}-r${d.round}s${d.stage}`) }
  if (d.state === "scores" && (seen.has("kill") || seen.has("ending4" + 2))) { await sleep(2500); await page.evaluate(() => BP.Game.debug.render()); await cshot(page, tagp + "-final-board"); break }
}
for (let w = 0; w < 150; w++) { const st = await page.evaluate(() => BP.Scores.status()); if (!st.pending) break; await sleep(1000) }
await page.evaluate(() => BP.Game.debug.render()); await cshot(page, tagp + "-final-board2")
console.log("perStage", JSON.stringify(perStage))
console.log(JSON.stringify(await dbg(page)))
console.log("status", JSON.stringify(await page.evaluate(() => BP.Scores.status())))
console.log(reqs.join("\n"))
console.log(await (await fetch(B + "/api/beerpong/scores?admin=1", { headers: { "x-admin-key": "dev" } })).text())
console.log(errs.join("\n") || "no console errors/warnings")
await b.close()
