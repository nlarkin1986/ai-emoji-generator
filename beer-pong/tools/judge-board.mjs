import { chromium, devices, canvasShot, hookErrors } from "./judge-common.mjs"
const URL = "http://localhost:8799/beerpong/"
const post = (p) => fetch("http://localhost:8799" + p, { method: "POST", headers: { "x-dev-bypass": "1" } }).then(r => r.text())
await post("/__dev/reset")
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 800, height: 800 } })
const page = await ctx.newPage()
const errors = []; hookErrors(page, errors)
await page.goto(URL); await page.waitForTimeout(800)
// seed 12 plausible scores via the client API
const seeded = await page.evaluate(async () => {
  const out = []
  for (let i = 0; i < 12; i++) out.push(await BP.Scores.submit({ name: "P" + i, score: 5000 + i * 1000, stage: 2, round: 1, cups: 20, accuracy: 60, shots: 40, makes: 24, durationMs: 400000 }))
  return out.map(r => [r.rank, r.mode, r.rejected || ""])
})
console.log("seeded", JSON.stringify(seeded))
// cheat attempt from console
const cheat = await page.evaluate(async () => (await BP.Scores.submit({ name: "HAX", score: 9999999, stage: 4, round: 9, makes: 5000, shots: 5000, durationMs: 86400000 })))
console.log("cheat", cheat.rank, cheat.mode, cheat.rejected)
// game run ending with low score -> name entry -> rank > 10
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.go('gameover') })
await page.evaluate(() => { /* fake score */ })
await page.evaluate(() => { const d = BP.Game.debug; d.press('a') })
// Need a nonzero score: play one sink with autoplay
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('gameover') })
await page.waitForTimeout(1200)
await page.keyboard.press("Enter"); await page.waitForTimeout(800)
console.log("state", await page.evaluate(() => BP.Game.debug.state))
await page.keyboard.press("Enter"); await page.waitForTimeout(2000)
await canvasShot(page, "board-rank-gt10")
console.log("state2", await page.evaluate(() => BP.Game.debug.state))
// offline: net down then submit
await post("/__dev/net?down=1")
await page.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 1; for (let i = 0; i < 3000 && d.score === 0; i++) d.step(1); d.autoplay = false; d.go('entry') })
await page.waitForTimeout(300)
const t0 = Date.now()
await page.keyboard.press("Enter")
for (let i = 0; i < 100; i++) { if (await page.evaluate(() => BP.Game.debug.state) === 'scores') break; await page.waitForTimeout(100) }
console.log("offline submit -> scores in ms", Date.now() - t0, await page.evaluate(() => JSON.stringify(BP.Scores.status())))
await page.waitForTimeout(600)
await canvasShot(page, "board-offline")
await post("/__dev/net?down=0")
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(1500)
console.log("after online", await page.evaluate(() => JSON.stringify(BP.Scores.status())))
console.log(await (await fetch("http://localhost:8799/api/beerpong/scores?limit=20")).text().then(t => JSON.parse(t).top.map(e => e.name + ":" + e.score).join(" ")))
// TV mode
const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await tv.goto(URL + "?tv"); await tv.waitForTimeout(1500)
await tv.screenshot({ path: "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/judge/tv-full.png" })
await page.evaluate(async () => BP.Scores.submit({ name: "NEWGUY", score: 99000, stage: 4, round: 1, cups: 30, accuracy: 70, shots: 60, makes: 40, durationMs: 900000 }))
await tv.waitForTimeout(11000)
const tvTop = await tv.evaluate(() => BP.Game.debug.state)
await canvasShot(tv, "tv-after-refresh")
console.log("tv state", tvTop)
console.log(errors)
await browser.close()
