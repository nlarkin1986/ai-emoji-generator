import { chromium, canvasShot, hookErrors, FILE, OUT } from "./judge-common.mjs"
const browser = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] })
const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 } })
const page = await ctx.newPage()
const errors = []; hookErrors(page, errors)
await page.goto(FILE + "?seed=4")
await page.waitForTimeout(800)
// audio state right after first gesture
await page.evaluate(() => { window.__st = []; window.addEventListener('keydown', () => { window.__st.push(BP.Audio._state().ctx) }) })
await page.keyboard.press("x")
await page.waitForTimeout(50)
console.log("ctx state during first keydown:", await page.evaluate(() => window.__st), "after:", await page.evaluate(() => BP.Audio._state()))
// Space scroll check
await page.keyboard.press("Space"); console.log("scrollY", await page.evaluate(() => scrollY))
// mash through a game: start, get a score, lose -> game over -> mash A
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('gameover') })
const log = []
for (let i = 0; i < 60; i++) {
  await page.keyboard.down("z"); await page.waitForTimeout(30); await page.keyboard.up("z"); await page.waitForTimeout(40)
  const s = await page.evaluate(() => BP.Game.debug.state); if (log[log.length - 1] !== s) log.push(s)
}
console.log("mash path:", log.join(" > "))
await page.waitForTimeout(1500)
console.log("submitted local:", await page.evaluate(() => localStorage.getItem('bp_scores')))
// second run: name prefilled -> one A submits?
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('entry') })
await page.waitForTimeout(100)
await page.keyboard.press("z"); await page.waitForTimeout(400)
console.log("after single A on entry w/ saved name:", await page.evaluate(() => BP.Game.debug.state))
// blur mid-flight
await page.evaluate(() => { const d = BP.Game.debug; d.go('title'); d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 2000 && d.phase !== 'flight'; i++) d.step(1); d.step(10); d.autoplay = false })
const b0 = await page.evaluate(() => BP.Game.debug.ball)
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(1500)
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(300)
console.log("ball before/after hide", JSON.stringify(b0), JSON.stringify(await page.evaluate(() => BP.Game.debug.ball)), "paused", await page.evaluate(() => BP.Game.debug.paused), await page.evaluate(() => BP.Audio._state()))
await canvasShot(page, "after-hide")
await page.keyboard.press("Enter"); await page.waitForTimeout(400)
console.log("after resume", await page.evaluate(() => [BP.Game.debug.paused, BP.Game.debug.phase, JSON.stringify(BP.Audio._state())]))
// resize storm mid-game
for (const [w, h] of [[400, 800], [1200, 500], [320, 480], [1024, 800]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150) }
await page.screenshot({ path: OUT + "/after-resize.png" })
console.log("errors", errors, await page.evaluate(() => BP.Game.debug.errors))
await browser.close()
