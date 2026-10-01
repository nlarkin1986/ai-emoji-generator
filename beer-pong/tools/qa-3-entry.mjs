// Phase 3: fast-forward to game over, name entry by tapping letters and by D-pad, leaderboard, second guest
import { chromium, open, shot, st, tapNes, btn, sleep, dev, waitState } from "./qa-lib.mjs"
await dev("/__dev/reset")
const browser = await chromium.launch()
const { ctx, page, logs } = await open(browser, "iphone13")
const ff = async (skill) => { // autoplay until gameover
  await page.evaluate((k) => { BP.Game.debug.autoplay = k }, skill)
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => { const d = BP.Game.debug; for (let j = 0; j < 120 && d.state !== 'gameover'; j++) d.step(1); return d.state })
    if (s === "gameover") break
  }
  await page.evaluate(() => { BP.Game.debug.autoplay = false })
}
await sleep(1000)
await tapNes(page, 120, 112); await sleep(800)
await ff(0.55)
console.log("at gameover", await st(page))
await sleep(1500); await shot(page, "p3-gameover")
await tapNes(page, 128, 180); await waitState(page, "entry"); await sleep(600)
await shot(page, "p3-entry-empty")
// guest 1: taps letters N I C K then END
const GX = 28, GY = 104, GCW = 20, GCH = 18
const cell = (ch) => { const G = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ0123", "456789.-! "]; for (let r = 0; r < 4; r++) { const c = G[r].indexOf(ch); if (c >= 0) return [GX + c * GCW + 4, GY + r * GCH + 4] } }
let t0 = Date.now()
for (const ch of "NICK") { const [x, y] = cell(ch); await tapNes(page, x, y); await sleep(700) }
const nm1 = await page.evaluate(() => 0)
await shot(page, "p3-entry-nick")
await tapNes(page, GX + 124 + 8, GY + 4 * GCH + 3); // END
const tTap = (Date.now() - t0) / 1000
await sleep(300); await shot(page, "p3-entry-sending")
await waitState(page, "scores", 10000); await sleep(1200)
await shot(page, "p3-board-1")
console.log("tap-entry secs", tTap, await page.evaluate(() => BP.Scores.status()))
await sleep(1000)
await tapNes(page, 128, 120); await waitState(page, "title"); await sleep(800)
// guest 2 on same phone
await tapNes(page, 120, 112); await sleep(800)
await ff(0.4)
await sleep(1000)
await tapNes(page, 128, 120)  // tap center of game over (mashing)
await waitState(page, "entry"); await sleep(400)
await shot(page, "p3-entry-prefilled")
// guest 2 mashes center of screen twice (tipsy, thinks it continues)
await tapNes(page, 128, 120); await sleep(250); await tapNes(page, 128, 120); await sleep(400)
await shot(page, "p3-entry-after-mash")
// now D-pad entry: delete with B until empty, then type "AMY" via D-pad
t0 = Date.now()
for (let i = 0; i < 9; i++) { await btn(page, "b"); await sleep(220) }
// cursor position after prefill: go up to grid
const nav = async (d, n) => { for (let i = 0; i < n; i++) { await btn(page, d); await sleep(260) } }
await nav("up", 1); await shot(page, "p3-entry-dpad-up")
console.log("cursor after up", await page.evaluate(() => 0))
// read cursor from screen is not exposed; do it from known state: after up from DEL row cursor is row3 col2 -> go up 3 to row0 col2 (C), left 2 -> A
await nav("up", 3); await nav("left", 2); await btn(page, "a"); await sleep(260) // A
await nav("down", 1); await nav("right", 2); await btn(page, "a"); await sleep(260) // M (row1 col2)
await nav("down", 1); await nav("right", 2); await btn(page, "a"); await sleep(260) // Y (row2 col4)
await shot(page, "p3-entry-dpad-amy")
await btn(page, "start")
const tPad = (Date.now() - t0) / 1000
await waitState(page, "scores", 10000); await sleep(1200)
await shot(page, "p3-board-2")
console.log("dpad-entry secs", tPad, "top:", JSON.stringify(await page.evaluate(() => fetch('/api/beerpong/scores?limit=10').then(r => r.json()).then(j => j.top.map(e => e.name + ':' + e.score)))))
console.log("logs", logs, (await st(page)).errors)
await ctx.close(); await browser.close()
