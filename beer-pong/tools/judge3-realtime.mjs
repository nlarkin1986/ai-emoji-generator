// Real-time (no clock tricks) run on 8824: clear stage 1 with the bot, lose stage 2, enter name, check global landing.
import { chromium, cshot, hookErrors, dbg, sleep } from "./judge3-lib.mjs"
const B = "http://localhost:8824"
await fetch(B + "/__dev/reset", { method: "POST" })
const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 900, height: 800 } })).newPage(); const errs = []; hookErrors(page, errs)
page.on("response", async (r) => { if (r.url().includes("/api/") && r.request().method() === "POST") console.log(Math.round(performance.now() / 1000) + "s RES", r.url().replace(B, ""), (await r.text().catch(() => "")).replace(/"token":"[^"]+"/, '"token":"…"').replace(/"top":\[.*\]/, "top").slice(0, 160)) })
await page.goto(B + "/beerpong/?debug"); await sleep(1000)
await page.evaluate(() => { BP.Game.debug.autoplay = 0.97 })
let last = ""
const t0 = Date.now()
while (Date.now() - t0 < 400000) {
  const d = await dbg(page); const tag = d.state + ":" + d.stage
  if (tag !== last) { console.log(Math.round((Date.now() - t0) / 1000) + "s", tag, d.score); last = tag; if (d.state === "scores") break }
  if (d.state === "match" && d.stage === 1) await page.evaluate(() => { BP.Game.debug.autoplay = 0.01 })
  await sleep(500)
}
await sleep(3000); await cshot(page, "rt-board")
console.log(JSON.stringify(await page.evaluate(() => BP.Scores.status())))
console.log(await (await fetch(B + "/api/beerpong/scores?admin=1", { headers: { "x-admin-key": "dev" } })).text())
console.log(errs)
await b.close()
