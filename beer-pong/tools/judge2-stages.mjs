import { chromium, DEV, cshot, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch(); const page = await (await b.newContext()).newPage()
await page.goto(DEV + "?debug&seed=3"); await sleep(800)
for (let s = 0; s < 5; s++) {
  await page.evaluate((s) => { const d = BP.Game.debug; d.startAt(s, 0, 2); d.autoplay = 0.99 }, s)
  let k = 0
  for (let i = 0; i < 400 && k < 2; i++) {
    const ph = await page.evaluate(() => { BP.Game.debug.step(3); return BP.Game.debug.phase + "|" + (BP.Game.debug.ball ? BP.Game.debug.ball.x : "") + "|" + BP.Game.debug.turn })
    const [p, x, t] = ph.split("|")
    if (p === "flight" && +x > 110 && +x < 150 && t === "player" && k === 0) { await page.evaluate(() => BP.Game.debug.render()); await cshot(page, `st${s + 1}-flight`); k++ }
    if (p === "result" && k === 1) { await page.evaluate(() => { BP.Game.debug.step(4); BP.Game.debug.render() }); await cshot(page, `st${s + 1}-result`); k++ }
  }
}
// on fire
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(1, 0, 0); d.autoplay = 1 })
for (let i = 0; i < 600; i++) { const f = await page.evaluate(() => { BP.Game.debug.step(2); return BP.Game.debug.onFire && BP.Game.debug.phase === "flight" }); if (f) { await page.evaluate(() => { BP.Game.debug.step(12); BP.Game.debug.render() }); await cshot(page, "onfire"); break } }
await b.close()
