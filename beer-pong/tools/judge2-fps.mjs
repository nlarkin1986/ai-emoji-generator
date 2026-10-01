// Simulated display refresh rates: rAF driven by a virtual clock at N Hz. Measure logic ticks per virtual second.
import { chromium, FILE, hookErrors, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch()
for (const hz of [30, 50, 59.94, 60, 75, 90, 119.88, 120, 144, 165, 240, 360]) {
  const ctx = await b.newContext({ viewport: { width: 800, height: 700 } })
  await ctx.addInitScript((hz) => {
    let cbs = [], vt = 0, id = 0
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return ++id }
    window.__frame = (n) => { for (let i = 0; i < n; i++) { vt += 1000 / hz * (1 + (Math.random() - 0.5) * 0.02); const c = cbs; cbs = []; c.forEach((f) => f(vt)) } return vt }
  }, hz)
  const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
  await page.goto(FILE + "?debug&seed=7"); await sleep(500)
  const r = await page.evaluate((hz) => { window.__frame(5); const t0 = BP.Game.debug.ticks; const v0 = window.__frame(0); const vt = window.__frame(Math.round(hz * 20)); return { ticks: BP.Game.debug.ticks - t0, secs: (vt - v0) / 1000 } }, hz)
  console.log(String(hz).padEnd(7), "ticks/s =", (r.ticks / r.secs).toFixed(2), errs.length ? errs : "")
  await ctx.close()
}
await b.close()
