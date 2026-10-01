// Capture gameplay features by stepping: miss feedback, gimmicks per stage, callouts, CPU fire. Also palette count per stage.
import { chromium, FILE, cshot, hookErrors, sleep } from "./judge3-lib.mjs"
const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 800, height: 700 } })).newPage(); const errs = []; hookErrors(page, errs)
await page.goto(FILE + "?debug&seed=11"); await sleep(800)
const colors = async () => page.evaluate(() => { const c = document.getElementById("screen"); const d = c.getContext("2d").getImageData(0, 0, 256, 240).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size })
const out = {}
for (const [stg, loop] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1], [4, 1], [0, 2]]) {
  await page.evaluate(([s, l]) => { const d = BP.Game.debug; d.autoplay = 0.35; d.startAt(s, l, 0) }, [stg, loop])
  let shots = 0, lastCall = "", maxC = 0, snaps = 0, missSnaps = 0
  const seenTexts = new Set()
  for (let i = 0; i < 900; i++) {
    const r = await page.evaluate(() => { const d = BP.Game.debug; d.step(4); d.render(); return { st: d.state, ph: d.phase, turn: d.turn, log: d.shotLog.length ? d.shotLog[d.shotLog.length - 1].res : "", cpuFire: d.cpuStatsN, wind: d.wind } })
    if (r.st !== "match") break
    if (i % 25 === 0) { const n = await colors(); if (n > maxC) maxC = n }
    if (r.ph === "resolve" || r.ph === "result" || r.ph === "after") {
      if (r.log !== lastCall) { lastCall = r.log; if (/miss/.test(r.log) && missSnaps < 2 && r.turn === "player") { await page.evaluate(() => { BP.Game.debug.step(6); BP.Game.debug.render() }); await cshot(page, `f-miss-${loop}-${stg}-${missSnaps++}`) } }
    }
    if (i % 150 === 75 && snaps < 3) await cshot(page, `f-play-${loop}-${stg}-${snaps++}`)
  }
  out[`L${loop}S${stg}`] = { maxColors: maxC }
}
console.log(JSON.stringify(out))
// phases seen
console.log(errs.join("\n") || "no errs")
await b.close()
