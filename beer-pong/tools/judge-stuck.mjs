import { chromium, canvasShot, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(FILE + "?seed=2"); await page.waitForTimeout(500)
await page.evaluate(() => localStorage.setItem('bp_name', 'NICK'))
// real-time: get a score, go to gameover via the normal fade path, then press A every frame
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('gameover'); d.step(60) })
const r = await page.evaluate(async () => {
  const d = BP.Game.debug, log = []
  d.press('a'); d.step(1) // gameover -> go('entry') (fade out 12 ticks)
  for (let i = 0; i < 14; i++) { d.step(1); log.push(d.state) }
  d.press('a'); d.step(1) // press A during fade-in -> finishEntry with prefilled name
  await new Promise(r => setTimeout(r, 50))
  d.step(30)
  await new Promise(r => setTimeout(r, 7000))
  d.step(600)
  return { log: log.join(','), final: d.state }
})
console.log(JSON.stringify(r))
await page.evaluate(() => BP.Game.debug.render())
await canvasShot(page, "stuck-entry")
await browser.close()
