import { chromium, devices, hookErrors, canvasShot, DEV, OUT } from "./judge-common.mjs"
const mobile = process.argv.includes("--mobile")
const browser = await chromium.launch()
const ctx = await browser.newContext(mobile ? { ...devices["iPhone 13"], hasTouch: true } : { viewport: { width: 1024, height: 900 } })
const page = await ctx.newPage()
const errors = []; hookErrors(page, errors)
await page.goto(DEV)
await page.waitForTimeout(800)
const keys = ["z", "x", "Enter", "Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape", "p", "Tab", "Backspace", "m", "j", "k", "w", "a", "s", "d"]
const states = {}, phases = {}
let lastChange = Date.now(), lastSig = "", maxStill = 0, scrolls = 0
const t0 = Date.now()
let rnd = 12345; const R = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff }
while (Date.now() - t0 < 90000) {
  const r = R()
  if (mobile) {
    const vp = page.viewportSize()
    const x = Math.floor(R() * vp.width), y = Math.floor(R() * vp.height)
    await page.touchscreen.tap(x, y).catch(() => {})
  } else if (r < 0.75) {
    const k = keys[Math.floor(R() * keys.length)]
    if (k === "m" && R() < 0.8) continue
    await page.keyboard.down(k); await page.waitForTimeout(10 + R() * 60); await page.keyboard.up(k)
  } else {
    await page.mouse.click(100 + R() * 800, 80 + R() * 700)
  }
  await page.waitForTimeout(R() * 120)
  const d = await page.evaluate(() => { const d = BP.Game.debug; return { s: d.state, p: d.phase, t: d.ticks, e: d.errors.length, sy: window.scrollY + document.scrollingElement.scrollTop, paused: d.paused } })
  states[d.s] = (states[d.s] || 0) + 1; if (d.p) phases[d.p] = (phases[d.p] || 0) + 1
  if (d.sy) scrolls++
  const sig = d.s + d.p
  if (sig !== lastSig) { lastSig = sig; lastChange = Date.now() } else maxStill = Math.max(maxStill, Date.now() - lastChange)
}
await canvasShot(page, mobile ? "monkey-mobile-end" : "monkey-end")
const fin = await page.evaluate(() => ({ dbg: { s: BP.Game.debug.state, e: BP.Game.debug.errors }, audio: BP.Audio._state(), scores: BP.Scores.status() }))
console.log(JSON.stringify({ states, phases, maxStillMs: maxStill, scrolls, fin, errors }, null, 1))
await browser.close()
