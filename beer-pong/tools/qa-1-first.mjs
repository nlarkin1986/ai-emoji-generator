// Phase 1: first impression on every device + center tap + audio unlock
import { chromium, open, shot, st, audioState, tapAt, sleep, rect, DEV } from "./qa-lib.mjs"
const browser = await chromium.launch()
for (const d of Object.keys(DEV)) {
  const { ctx, page, logs } = await open(browser, d)
  await sleep(1200)
  await shot(page, `p1-${d}-title`)
  const a0 = await audioState(page)
  const vp = page.viewportSize()
  const scr = await rect(page, "#screen")
  const mode = await page.evaluate(() => BP.Shell.state.mode)
  // a guest taps the center of the phone
  await tapAt(page, vp.width / 2, vp.height / 2)
  await sleep(150)
  const a1 = await audioState(page)
  const s1 = await st(page)
  await sleep(1200)
  const s2 = await st(page)
  await shot(page, `p1-${d}-aftercentertap`)
  console.log(d, JSON.stringify({ vp, mode, scr, audioBefore: a0 && a0.ctx, audioAfter: a1 && a1.ctx, after150: s1.state, after1350: s2.state, logs }))
  await ctx.close()
}
await browser.close()
