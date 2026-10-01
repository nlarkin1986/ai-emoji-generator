import { chromium, devices, hookErrors, canvasShot, dbg, DEV, OUT } from "./judge-common.mjs"
const which = process.argv[2] || "iPhone 13"
const tag = which.replace(/\W+/g, "_")
const browser = await chromium.launch()
const dev = devices[which]
const ctx = await browser.newContext({ ...dev, hasTouch: true })
const page = await ctx.newPage()
const errors = []; hookErrors(page, errors)
await page.goto(DEV)
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/m-${tag}-title.png` })
const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } }, sel)
const info = await page.evaluate(() => {
  const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  return { vp: [innerWidth, innerHeight], scr: q('#scr'), A: q('#sA'), B: q('#sB'), st: q('#pSt'), sel: q('#pSel'), dpad: q('#dpad'), mute: q('#bMute'), cls: document.body.className, docH: document.documentElement.scrollHeight }
})
console.log(which, JSON.stringify(info))
const tapEl = async (sel) => { const b = await box(sel); await page.touchscreen.tap(b.x, b.y) }
// canvas tap helper (game coords)
const tapGame = async (gx, gy) => { const r = await box('#screen'); await page.touchscreen.tap(r.x - r.w / 2 + (gx + 0.5) * r.w / 256, r.y - r.h / 2 + (gy + 0.5) * r.h / 240) }
// start: tap "1 PLAYER" on canvas
await tapGame(120, 110)
await page.waitForTimeout(400)
console.log("after tap 1P:", (await dbg(page)).state, JSON.stringify(await page.evaluate(() => BP.Audio._state())))
// skip vs
for (let i = 0; i < 30; i++) { const d = await dbg(page); if (d.state === "match") break; await tapEl('#sA'); await page.waitForTimeout(300) }
for (let i = 0; i < 40; i++) { const d = await dbg(page); if (d.phase === "aim") break; await page.waitForTimeout(100) }
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/m-${tag}-aim.png` })
// play a few throws with A button
for (let k = 0; k < 3; k++) {
  for (let i = 0; i < 60; i++) { const d = await dbg(page); if (d.phase === "aim" && d.turn === "player") break; await page.waitForTimeout(100) }
  await page.waitForTimeout(300 + Math.random() * 600); await tapEl('#sA')
  await page.waitForTimeout(200 + Math.random() * 500); await tapEl('#sA')
  await page.waitForTimeout(300)
}
console.log("after throws", JSON.stringify(await dbg(page)))
// pause via START button
await tapEl('#pSt'); await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/m-${tag}-pause.png` })
console.log("paused?", (await dbg(page)).paused)
// select QUIT via tap on canvas
await tapGame(110, 128); await page.waitForTimeout(800)
console.log("after quit tap", (await dbg(page)).state)
for (let i = 0; i < 30; i++) { const d = await dbg(page); if (d.state === "gameover") break; await page.waitForTimeout(200) }
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/m-${tag}-gameover.png` })
await tapGame(128, 120); await page.waitForTimeout(800)
console.log("after gameover tap", (await dbg(page)).state, (await dbg(page)).score)
await page.screenshot({ path: `${OUT}/m-${tag}-entry.png` })
// type name by tapping letters: J U D G E
const GRID = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789.-! ']
const t0 = Date.now()
for (const ch of "JUDGE") { for (let r = 0; r < 4; r++) { const c = GRID[r].indexOf(ch); if (c >= 0) { await tapGame(28 + c * 20 + 4, 104 + r * 18 + 4); await page.waitForTimeout(120) } } }
await page.screenshot({ path: `${OUT}/m-${tag}-entry-typed.png` })
await tapGame(28 + 124 + 8, 104 + 72 + 4) // END
console.log("entry ms", Date.now() - t0)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/m-${tag}-board.png` })
console.log("final", JSON.stringify(await dbg(page)), JSON.stringify(await page.evaluate(() => BP.Scores.status())))
console.log("errors", errors)
await browser.close()
