import { chromium, canvasShot, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
let stuck = 0
for (let trial = 0; trial < 6; trial++) {
  const page = await browser.newPage()
  await page.goto(FILE + "?seed=" + trial); await page.waitForTimeout(400)
  await page.evaluate(() => localStorage.setItem('bp_name', 'NICK'))
  await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('gameover'); d.step(60) })
  // human mashes A ~10x/s
  for (let i = 0; i < 25; i++) { await page.keyboard.down('z'); await page.waitForTimeout(40); await page.keyboard.up('z'); await page.waitForTimeout(40 + trial * 7) ; if ((await page.evaluate(() => BP.Game.debug.state)) === 'entry') { } }
  await page.waitForTimeout(8000)
  const s = await page.evaluate(() => BP.Game.debug.state)
  console.log("trial", trial, "final", s)
  if (s === 'entry') { stuck++; await canvasShot(page, "stuck-entry-real") }
  await page.close()
}
console.log("stuck", stuck, "/6")
await browser.close()
