// Phase 4: leaderboard reliability (online, offline->restore), TV mode on 1920x1080
import { chromium, open, shot, st, tapNes, btn, sleep, dev, waitState, BASE } from "./qa-lib.mjs"
await dev("/__dev/reset"); await dev("/__dev/net?down=0")
const browser = await chromium.launch()

const { ctx, page, logs } = await open(browser, "pixel7", BASE, {})
const server = () => fetch("http://localhost:8791/api/beerpong/scores?limit=10", { headers: { "x-dev-bypass": "1" } }).then(r => r.json()).then(j => j.top.map(e => e.name + ":" + e.score))
const GX = 28, GY = 104, GCW = 20, GCH = 18
const cell = (ch) => { const G = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ0123", "456789.-! "]; for (let r = 0; r < 4; r++) { const c = G[r].indexOf(ch); if (c >= 0) return [GX + c * GCW + 4, GY + r * GCH + 4] } }
async function runTo(name, skill) {
  await tapNes(page, 120, 112); await sleep(600); const tStart = Date.now()
  await page.evaluate((k) => { BP.Game.debug.autoplay = k }, skill)
  for (let i = 0; i < 500; i++) { const s = await page.evaluate(() => { const d = BP.Game.debug; for (let j = 0; j < 120 && d.state !== 'gameover'; j++) d.step(1); return d.state }); if (s === "gameover") break }
  await page.evaluate(() => { BP.Game.debug.autoplay = false })
  await sleep(Math.max(900, 30000 - (Date.now() - tStart))); await tapNes(page, 128, 200); await waitState(page, "entry"); await sleep(400)
  for (let i = 0; i < 9; i++) { await btn(page, "b"); await sleep(120) }
  for (const ch of name) { const [x, y] = cell(ch); await tapNes(page, x, y); await sleep(300) }
  const score = await page.evaluate(() => BP.Game.debug.score)
  const t = Date.now(); await btn(page, "start")
  await waitState(page, "scores", 12000)
  return { score, secsToBoard: (Date.now() - t) / 1000 }
}
await sleep(800)
const r1 = await runTo("ONLINE", 0.6); await sleep(1300); await shot(page, "p4-board-online")
console.log("online", r1, await page.evaluate(() => BP.Scores.status()), "server:", await server())
await sleep(1500); await tapNes(page, 128, 120); await waitState(page, "title")
// open TV
const tvc = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const tv = await tvc.newPage(); await tv.goto(BASE + "?tv"); await sleep(2500); await tv.screenshot({ path: (await import("./qa-lib.mjs")).OUT + "/p4-tv-1.png" })
// offline
await dev("/__dev/net?down=1")
const r2 = await runTo("OFFLINE", 0.6); await sleep(1300); await shot(page, "p4-board-offline")
console.log("offline submit", r2, await page.evaluate(() => BP.Scores.status()), "server:", await server())
await sleep(1500); await tapNes(page, 128, 120); await waitState(page, "title")
await dev("/__dev/net?down=0")
const t0 = Date.now()
let delivered = null
for (let i = 0; i < 24; i++) { // phone idles on title 120 s
  await sleep(5000)
  const list = await server(); const s = await page.evaluate(() => [BP.Game.debug.state, BP.Scores.status().pending])
  if (!delivered && list.some((x) => x.startsWith("OFFLINE"))) { delivered = (Date.now() - t0) / 1000; console.log("delivered after", delivered, "s; phone state", s) ; break }
  if (i % 4 === 0) console.log("t+", (Date.now() - t0) / 1000, "phone", s, "server", list)
}
await tv.screenshot({ path: (await import("./qa-lib.mjs")).OUT + "/p4-tv-2.png" })
await sleep(11000)
await tv.screenshot({ path: (await import("./qa-lib.mjs")).OUT + "/p4-tv-3.png" })
console.log("tv state", await tv.evaluate(() => BP.Game.debug.state), "logs", logs)
await ctx.close(); await tvc.close(); await browser.close()
