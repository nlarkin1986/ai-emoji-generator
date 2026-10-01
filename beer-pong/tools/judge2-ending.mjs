// Autoplay a full run to the ending with simulated wall time; verify submission as round 2.
import { chromium, DEV, cshot, hookErrors, dbg, sleep } from "./judge2-lib.mjs"
const skill = +(process.argv[2] || 0.97)
await fetch("http://localhost:8811/__dev/reset", { method: "POST" })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1024, height: 900 } })
await ctx.addInitScript(() => { const r = Date.now; window.__skew = 0; Date.now = () => r() + window.__skew })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
const reqs = []; page.on("request", (r) => { if (r.url().includes("/api/")) reqs.push(r.method() + " " + r.url() + " " + (r.postData() || "").slice(0, 400)) })
page.on("response", async (r) => { if (r.url().includes("/api/beerpong/scores") && r.request().method() === "POST") reqs.push("RESP " + (await r.text()).slice(0, 300)) })
await page.goto(DEV + "?debug"); await sleep(1200)
await page.evaluate((s) => { BP.Game.debug.autoplay = s }, skill)
let last = "", shotsTaken = {}, simMs = 0
const seen = new Set()
for (let i = 0; i < 4000; i++) {
  const st = await page.evaluate(() => { BP.Game.debug.step(120); window.__skew += 2000; return BP.Game.debug.state })
  simMs += 2000
  if (i % 3 === 0) await fetch("http://localhost:8811/__dev/clock?advance=6000", { method: "POST" })
  const d = await dbg(page)
  const tag = d.state + ":" + d.round + ":" + d.stage
  if (tag !== last) { console.log(Math.round(simMs / 1000) + "s", tag, "score", d.score, "cups", JSON.stringify(d.cups), "buzz", d.buzz); last = tag }
  if (!seen.has(d.state + d.stage + d.round) && ["vs", "clear", "ending", "gameover", "entry", "scores"].includes(d.state)) { seen.add(d.state + d.stage + d.round); await page.evaluate(() => BP.Game.debug.render()); await cshot(page, `e-${d.state}-r${d.round}s${d.stage}`) }
  if (d.state === "ending") { for (let k = 0; k < 6; k++) { await page.evaluate(() => { BP.Game.debug.step(150); BP.Game.debug.render() }); await cshot(page, "e-ending-" + k) } }
  if ((d.state === "scores" || d.state === "title") && seen.has("ending4" + 2)) { await sleep(1500); await page.evaluate(() => BP.Game.debug.render()); await cshot(page, "e-final-" + d.state); break }
}
await sleep(2000)
console.log(await dbg(page))
console.log(reqs.join("\n"))
console.log(await (await fetch("http://localhost:8811/api/beerpong/scores")).text())
console.log(errs.join("\n") || "no console errors")
await b.close()
