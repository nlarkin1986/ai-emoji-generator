// Phase 5: robustness — hide mid-throw, rotate, mashing, double-tap/long-press/two-finger, scroll/zoom/selection
import { chromium, open, shot, st, tapNes, tapAt, btn, sleep, dev, waitState, rect, touch, hold, nes, audioState } from "./qa-lib.mjs"
const browser = await chromium.launch()
const { ctx, page, logs, cdp } = await open(browser, "iphone13")
const glitch = () => page.evaluate(() => JSON.stringify({ sx: scrollX, sy: scrollY, scale: visualViewport ? visualViewport.scale : 1, sel: String(getSelection()), mode: BP.Shell.state.mode, s: BP.Game.debug.state, ph: BP.Game.debug.phase, paused: BP.Game.debug.paused, audio: BP.Audio._state().ctx, err: BP.Game.debug.errors.length }))
const hide = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event(h ? 'blur' : 'focus')) }, h)
await sleep(800)
// double tap / long press / two-finger on title BEFORE starting
const scr = await rect(page, "#screen")
await tapAt(page, scr.x + 20, scr.y + 20); await sleep(80); await tapAt(page, scr.x + 20, scr.y + 20) // double tap corner (not menu)
await sleep(300); console.log("title double-tap ->", await glitch())
await sleep(2500)
await page.evaluate(() => BP.Game.debug.go('title')); await sleep(800)
// long-press on menu "HOW TO PLAY"
const hp = await nes(page, 120, 136); await hold(cdp, hp.x, hp.y, 900); await sleep(400); console.log("long-press howto ->", await glitch())
await page.evaluate(() => BP.Game.debug.go('title')); await sleep(800)
// two-finger tap
const a1 = await nes(page, 60, 60), a2 = await nes(page, 200, 200)
await touch(cdp, "touchStart", [{ ...a1, id: 1 }, { ...a2, id: 2 }]); await sleep(60); await touch(cdp, "touchEnd", []); await sleep(400)
console.log("two-finger ->", await glitch())
// swipe/drag on pad and on blank area below pad
const vp = page.viewportSize()
await touch(cdp, "touchStart", [{ x: vp.width / 2, y: vp.height - 10 }]); for (let i = 0; i < 10; i++) { await touch(cdp, "touchMove", [{ x: vp.width / 2, y: vp.height - 10 - i * 40 }]); await sleep(16) } await touch(cdp, "touchEnd", [])
console.log("swipe ->", await glitch())
// into a match
await page.evaluate(() => BP.Game.debug.startAt(0)); await sleep(300)
await page.waitForFunction(() => BP.Game.debug.phase === 'aim' && BP.Game.debug.turn === 'player', null, { timeout: 15000 })
await sleep(500); await btn(page, "a"); await sleep(200) // lock aim -> power
console.log("power?", await glitch())
await hide(true); await sleep(1500); console.log("hidden mid-power ->", await glitch(), await page.evaluate(() => BP.Audio._state()))
await hide(false); await sleep(600); console.log("visible again ->", await glitch(), await page.evaluate(() => BP.Audio._state())); await shot(page, "p5-after-hide")
await tapNes(page, 128, 60); await sleep(300); console.log("tap off-menu while paused ->", await glitch())
await tapNes(page, 128, 115); await sleep(300); console.log("tap RESUME ->", await glitch(), await page.evaluate(() => BP.Audio._state()))
await btn(page, "a")
// hide during flight
await page.waitForFunction(() => BP.Game.debug.phase === 'aim' && BP.Game.debug.turn === 'player', null, { timeout: 30000 })
await sleep(400); await btn(page, "a"); await sleep(400); await btn(page, "a")
await page.waitForFunction(() => BP.Game.debug.phase === 'flight', null, { timeout: 5000 })
const b0 = await page.evaluate(() => BP.Game.debug.ball)
await hide(true); await sleep(1000); const b1 = await page.evaluate(() => BP.Game.debug.ball)
console.log("hidden in flight: ball", b0, b1, await glitch())
await hide(false); await btn(page, "start"); await sleep(300); console.log("START resumes ->", await glitch())
// rotate mid-aim
await page.waitForFunction(() => BP.Game.debug.phase === 'aim' && BP.Game.debug.turn === 'player', null, { timeout: 30000 })
await page.setViewportSize({ width: 844, height: 390 }); await sleep(700)
console.log("rotated ->", await glitch(), await rect(page, "#screen")); await shot(page, "p5-rotated-aim")
await btn(page, "a"); await sleep(300); await btn(page, "a"); await sleep(300); console.log("landscape A works ->", await glitch())
await page.setViewportSize({ width: 390, height: 664 }); await sleep(700); console.log("rotated back ->", await glitch())
// mash everything for 8 s in match
const targets = ["a", "b", "start", "select", "up", "down", "left", "right"]
for (let i = 0; i < 120; i++) { const t = targets[i % targets.length]; await btn(page, t); if (i % 5 === 0) await tapNes(page, Math.random() * 256, Math.random() * 240) }
await sleep(300); console.log("after mash match ->", await glitch()); await shot(page, "p5-after-mash")
// mash every screen: gameover -> entry
await page.evaluate(() => { BP.Game.debug.setCups(0, 0) }) // not a legit path; just try
await page.evaluate(() => BP.Game.debug.go('gameover')); await sleep(200)
for (let i = 0; i < 40; i++) { await btn(page, i % 2 ? "a" : "start"); await sleep(40) }
await sleep(500); console.log("after mash on gameover ->", await glitch()); await shot(page, "p5-gameover-mash")
await sleep(1000)
console.log("final", await glitch(), "logs", logs, await page.evaluate(() => BP.Game.debug.errors))
await ctx.close(); await browser.close()
