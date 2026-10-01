import { chromium, canvasShot, hookErrors, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 800 } })
const errors = []; hookErrors(page, errors)
await page.goto(FILE + "?seed=3")
await page.waitForTimeout(500)
for (let s = 0; s < 5; s++) {
  await page.evaluate((s) => { const d = BP.Game.debug; d.startAt(s, 0, 2); d.autoplay = 0.97; d.step(200) }, s)
  // step until flight
  await page.evaluate(() => { const d = BP.Game.debug; for (let i = 0; i < 400 && d.phase !== 'flight'; i++) d.step(1); d.step(25); d.render() })
  await canvasShot(page, "st" + s + "-flight")
}
// sink callout + on fire
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(1, 0, 0); d.autoplay = 1; let n = 0; for (let i = 0; i < 6000; i++) { d.step(1); if (d.streak >= 3 && d.phase === 'flight') { n++; if (n > 30) break } } d.render() })
await canvasShot(page, "onfire-flight")
await page.evaluate(() => { const d = BP.Game.debug; for (let i = 0; i < 300 && d.phase !== 'result'; i++) d.step(1); d.step(10); d.render() })
await canvasShot(page, "onfire-result")
// stage clear
await page.evaluate(() => { const d = BP.Game.debug; d.setCups(1, 1); for (let i = 0; i < 4000 && d.state !== 'clear'; i++) d.step(1); d.step(200); d.render() })
await canvasShot(page, "clear-tally")
// redemption: player 1 cup, cpu to sink
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 0.0; d.setCups(0, 1); for (let i = 0; i < 20000 && !d.redemption; i++) d.step(1); d.step(30); d.render() })
await canvasShot(page, "redemption")
await page.evaluate(() => { const d = BP.Game.debug; for (let i = 0; i < 20000 && d.state !== 'gameover'; i++) d.step(1); d.step(120); d.render() })
await canvasShot(page, "gameover")
console.log(await page.evaluate(() => BP.Game.debug.state), errors)
await browser.close()
