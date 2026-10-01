import { chromium, DEV, hookErrors, sleep, dbg, cshot, pshot } from "./judge3-lib.mjs"
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV + "?debug"); await sleep(800)
await page.mouse.click(500, 400); await sleep(300) // gesture -> audio
await page.evaluate(() => { BP.Game.debug.startAt(0, 0, 0) })
for (let i = 0; i < 100; i++) { const d = await dbg(page); if (d.phase === "aim" && d.turn === "player") break; await sleep(100) }
for (let i = 0; i < 40 && (await dbg(page)).phase === "aim"; i++) { await page.keyboard.press("z"); await sleep(150) }
await sleep(300)
for (let i = 0; i < 40 && (await dbg(page)).phase === "power"; i++) { await page.keyboard.press("z"); await sleep(100) }
for (let i = 0; i < 50 && (await dbg(page)).phase !== "flight"; i++) await sleep(20); await sleep(150)
const before = await page.evaluate(() => ({ ph: BP.Game.debug.phase, ball: BP.Game.debug.ball, t: BP.Game.debug.ticks, au: BP.Audio._state() }))
// simulate tab hidden
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")) })
await sleep(3000)
const mid = await page.evaluate(() => ({ ph: BP.Game.debug.phase, ball: BP.Game.debug.ball, paused: BP.Game.debug.paused, t: BP.Game.debug.ticks, au: BP.Audio._state() }))
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")) })
await sleep(600)
const after = await page.evaluate(() => ({ ph: BP.Game.debug.phase, ball: BP.Game.debug.ball, paused: BP.Game.debug.paused, au: BP.Audio._state() }))
await cshot(page, "hide-after")
await page.keyboard.press("Enter"); await sleep(800)
const res = await page.evaluate(() => ({ ph: BP.Game.debug.phase, ball: BP.Game.debug.ball, paused: BP.Game.debug.paused, au: BP.Audio._state() }))
console.log(JSON.stringify({ before, mid, after, res }, null, 0))
// blur only (alt-tab): window blur
await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await sleep(300)
console.log("after blur paused:", (await dbg(page)).paused)
await page.keyboard.press("Enter"); await sleep(300)
// resize storm
for (const [w, h] of [[400, 800], [1400, 500], [320, 480], [900, 300], [1000, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(250); await pshot(page, `resize-${w}x${h}`) }
const geo = await page.evaluate(() => { const r = document.getElementById("screen").getBoundingClientRect(); return [r.width, r.height, scrollX, scrollY, document.documentElement.scrollWidth, innerWidth] })
console.log("resize ok", geo, (await dbg(page)).state, errs)
// Space scroll check on a tiny viewport
await page.setViewportSize({ width: 300, height: 250 }); for (let i = 0; i < 5; i++) await page.keyboard.press("Space"); console.log("scrollY after space", await page.evaluate(() => [scrollY, document.documentElement.scrollHeight]))
await b.close()
