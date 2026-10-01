// Phase 7: how long does one game (run) last for weak / average / good players, in real seconds (ticks/60)
import { chromium, open, sleep } from "./qa-lib.mjs"
const browser = await chromium.launch()
const { ctx, page } = await open(browser, "pixel7")
for (const skill of [0.15, 0.3, 0.5, 0.7]) {
  const res = []
  for (let k = 0; k < 4; k++) {
    const r = await page.evaluate((sk) => {
      const d = BP.Game.debug; d.startAt(0); d.autoplay = sk; const t0 = d.ticks; let stage1 = null
      while (d.state !== 'gameover' && d.ticks - t0 < 60 * 60 * 30) { d.step(60); if (stage1 === null && d.stage > 0) stage1 = d.ticks - t0 }
      d.autoplay = false
      return { min: +((d.ticks - t0) / 3600).toFixed(1), firstMatchMin: stage1 ? +(stage1 / 3600).toFixed(1) : null, stage: d.stage + 1, score: d.score, acc: d.shots ? Math.round(100 * d.makes / d.shots) : 0 }
    }, skill)
    res.push(r)
  }
  console.log("skill", skill, JSON.stringify(res))
}
await ctx.close(); await browser.close()
