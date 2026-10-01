import { chromium, FILE, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch()
const page = await (await b.newContext()).newPage()
await page.goto(FILE + "?debug&seed=5"); await sleep(400)
for (const stg of [0, 2, 4]) {
const out = await page.evaluate((stg) => {
  const d = BP.Game.debug; let S = 0, M = 0, planMake = 0, planMissMade = 0, planMakeMissed = 0, logs = 0
  for (let r = 0; r < 25; r++) {
    d.startAt(stg, 0, 0); d.autoplay = 0.2
    const seen = new Set()
    for (let t = 0; t < 60 * 60 * 8; t += 30) {
      d.step(30)
      for (const s of d.shotLog) { const k = JSON.stringify(s); if (seen.has(k)) continue; seen.add(k); if (s.plan) { logs++; if (s.plan === "make") planMake++ } }
      if (d.state !== "match") break
    }
    S += d.cpuShotsN; M += d.cpuMakesN
  }
  return { cpuShots: S, cpuMakes: M, acc: (100 * M / S).toFixed(1), planMakeFrac: (100 * planMake / logs).toFixed(1), sample: d.shotLog.slice(-3) }
}, stg)
console.log("stage", stg + 1, JSON.stringify(out))
}
await b.close()
