import { chromium, DEV, cshot, hookErrors, dbg, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1024, height: 900 } })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV + "?debug"); await sleep(1200)
await page.evaluate(() => { BP.Game.debug.startAt(4, 1, 0); BP.Game.debug.autoplay = 0.99 })
for (let i = 0; i < 600; i++) {
  const s = await page.evaluate(() => { BP.Game.debug.step(30); return BP.Game.debug.state })
  if (s === "ending") break
}
await page.evaluate(() => { BP.Game.debug.autoplay = false })
const ts = [20, 100, 200, 200, 300, 400, 400, 400, 600, 400]
for (let k = 0; k < ts.length; k++) { await page.evaluate((n) => { BP.Game.debug.step(n); BP.Game.debug.render() }, ts[k]); await cshot(page, "end-" + k); console.log(k, (await dbg(page)).state) }
for (let k = 0; k < 10; k++) { await page.evaluate(() => { BP.Game.debug.step(300) }); const d = await dbg(page); console.log(d.state); if (d.state !== "ending") break }
await page.evaluate(() => { BP.Game.debug.step(60); BP.Game.debug.render() }); await cshot(page, "end-after")
console.log(await dbg(page), errs)
await b.close()
