import { chromium, canvasShot, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(FILE + "?seed=2"); await page.waitForTimeout(500)
const seq = await page.evaluate(() => { const d = BP.Game.debug, out = []; let last = ''; for (let i = 0; i < 4500; i++) { d.step(1); if (d.state !== last) { out.push(d.state + '@' + (d.ticks)); last = d.state } } return out })
console.log(seq.join(' '))
await page.evaluate(() => { const d = BP.Game.debug; d.go('demo'); d.step(400); d.render() })
await canvasShot(page, "attract-demo")
await browser.close()
