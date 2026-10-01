// Phase 6: tipsy mashing through game over / name entry with score > 0; first-time D-pad entry timing; misc screens
import { chromium, open, shot, st, tapNes, tapAt, btn, sleep, dev, waitState, rect } from "./qa-lib.mjs"
await dev("/__dev/reset")
const browser = await chromium.launch()
const server = () => fetch("http://localhost:8791/api/beerpong/scores?limit=10", { headers: { "x-dev-bypass": "1" } }).then(r => r.json()).then(j => j.top.map(e => e.name + ":" + e.score))
async function toGameover(page, skill = 0.5) {
  await page.evaluate(() => BP.Game.debug.startAt(0)); const t0 = Date.now()
  await page.evaluate((k) => { BP.Game.debug.autoplay = k }, skill)
  for (let i = 0; i < 500; i++) { const s = await page.evaluate(() => { const d = BP.Game.debug; for (let j = 0; j < 120 && d.state !== 'gameover'; j++) d.step(1); return d.state }); if (s === "gameover") break }
  await page.evaluate(() => { BP.Game.debug.autoplay = false })
  await sleep(Math.max(0, 22000 - (Date.now() - t0)) * 0) // plausibility not needed for stage-0 losses
  return page.evaluate(() => BP.Game.debug.score)
}
// A) fresh phone, guest mashes A at game over for 4 s
{
  const { ctx, page } = await open(browser, "pixel7")
  const sc = await toGameover(page, 0.3)
  for (let i = 0; i < 40; i++) { await btn(page, "a"); await sleep(100) }
  await shot(page, "p6-fresh-mashA")
  console.log("A) fresh mash A: score", sc, "state", (await st(page)).state)
  for (let i = 0; i < 20; i++) { await btn(page, "start"); await sleep(100) }
  await sleep(1500); console.log("   then mash START ->", (await st(page)).state, "server", await server())
  await shot(page, "p6-fresh-mashStart")
  // B) second guest same phone: mashes center of screen through game over
  await page.evaluate(() => BP.Game.debug.go('title')); await sleep(500)
  const sc2 = await toGameover(page, 0.35)
  for (let i = 0; i < 30; i++) { await tapNes(page, 128, 125); await sleep(120) }
  await shot(page, "p6-guest2-mashcenter")
  console.log("B) guest2 mash center: score", sc2, "state", (await st(page)).state, "server", await server())
  for (let i = 0; i < 10; i++) { await btn(page, "a"); await sleep(120) }
  await sleep(1500); console.log("   then mash A ->", (await st(page)).state, "server", await server())
  await ctx.close()
}
// C) first-time guest: D-pad-only name entry "SAM" (cursor starts on A)
{
  const { ctx, page } = await open(browser, "se")
  await toGameover(page, 0.3); await sleep(800); await btn(page, "a"); await waitState(page, "entry"); await sleep(500)
  await shot(page, "p6-se-entry")
  const t0 = Date.now(), nav = async (d, n) => { for (let i = 0; i < n; i++) { await btn(page, d); await sleep(300) } }
  // S = row1 col8: down1 right8 (or left 2 with wrap)
  await nav("down", 1); await nav("left", 2); await btn(page, "a"); await sleep(300)
  // A = row0 col0: up1, right2
  await nav("up", 1); await nav("right", 2); await btn(page, "a"); await sleep(300)
  // M = row1 col2: down1 right2
  await nav("down", 1); await nav("right", 2); await btn(page, "a"); await sleep(300)
  await shot(page, "p6-se-entry-sam")
  await btn(page, "start"); const secs = (Date.now() - t0) / 1000
  await waitState(page, "scores"); await sleep(1300); await shot(page, "p6-se-board")
  console.log("C) dpad entry SAM secs", secs, "server", await server())
  // SE match readability
  await page.evaluate(() => BP.Game.debug.startAt(2)); await page.waitForFunction(() => BP.Game.debug.phase === 'aim' && BP.Game.debug.turn === 'player', null, { timeout: 20000 })
  await sleep(700); await shot(page, "p6-se-aim-stage3-wind")
  await btn(page, "a"); await sleep(350); await shot(page, "p6-se-power")
  // accidental bounce toggle: tipsy tap just below the inset
  await btn(page, "b"); await sleep(100); await btn(page, "b"); await sleep(300)
  await page.waitForFunction(() => BP.Game.debug.phase === 'aim', null, { timeout: 20000 }).catch(() => {})
  await ctx.close()
}
// D) landscape center tap on title and howto pages
{
  const { ctx, page } = await open(browser, "iphone13L")
  await sleep(800); const r = await rect(page, "#screen"); await tapAt(page, r.cx, r.cy); await sleep(1000)
  console.log("D) landscape center tap ->", (await st(page)).state)
  await page.evaluate(() => BP.Game.debug.go('howto')); await sleep(600); await shot(page, "p6-L-howto1")
  await tapAt(page, r.cx, r.cy); await sleep(500); await shot(page, "p6-L-howto2")
  await ctx.close()
}
// E) iPad mini match
{
  const { ctx, page } = await open(browser, "ipadmini")
  await page.evaluate(() => BP.Game.debug.startAt(0)); await page.waitForFunction(() => BP.Game.debug.phase === 'aim' && BP.Game.debug.turn === 'player', null, { timeout: 20000 })
  await sleep(500); await shot(page, "p6-ipad-aim"); await ctx.close()
}
await browser.close()
