import { chromium, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
for (const hz of [30, 60, 144, 240]) {
  const ctx = await browser.newContext()
  await ctx.addInitScript((hz) => {
    const iv = 1000 / hz; let t = performance.now()
    window.requestAnimationFrame = (cb) => { const now = performance.now(); const next = Math.max(0, t + iv - now); t = Math.max(now, t + iv); return setTimeout(() => cb(performance.now()), next) }
  }, hz)
  const page = await ctx.newPage()
  await page.goto(FILE + "?seed=5")
  await page.waitForTimeout(500)
  const r = await page.evaluate(async () => {
    const d = BP.Game.debug
    d.autoplay = 0.9
    const t0 = d.ticks, w0 = performance.now()
    await new Promise(r => setTimeout(r, 8000))
    return { tps: (d.ticks - t0) / ((performance.now() - w0) / 1000), fps: d.fps, state: d.state, phase: d.phase, score: d.score, ticks: d.ticks }
  })
  // determinism check: step to a fixed tick count is not possible in realtime; report tick rate
  console.log(hz, JSON.stringify(r))
  await ctx.close()
}
await browser.close()
