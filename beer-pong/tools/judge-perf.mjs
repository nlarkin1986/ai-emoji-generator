import { chromium, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)
await page.goto(FILE + "?seed=2"); await page.waitForTimeout(500)
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 })
for (let s = 0; s < 5; s++) {
  const r = await page.evaluate((s) => { const d = BP.Game.debug; d.startAt(s, 0, 0); d.step(120); const t0 = performance.now(); for (let i = 0; i < 60; i++) d.render(); const tr = (performance.now() - t0) / 60; const t1 = performance.now(); d.step(60); return { render: +tr.toFixed(2), tick: +((performance.now() - t1) / 60).toFixed(3) } }, s)
  console.log("stage", s, "6x throttled ms/frame", JSON.stringify(r))
}
const h = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0)
await page.evaluate(() => { const d = BP.Game.debug; d.autoplay = 0.9; d.step(20000) })
const h2 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0)
console.log("heap MB", (h / 1e6).toFixed(1), "->", (h2 / 1e6).toFixed(1))
await browser.close()
