// How long does the CLEAR screen hold after a very fast stage win while the player mashes A?
import { chromium, FILE, cshot, dbg, sleep } from "./judge3-lib.mjs"
const b = await chromium.launch(); const page = await (await b.newContext()).newPage()
await page.goto(FILE + "?debug"); await sleep(800)
await page.keyboard.press("Enter"); await sleep(1500); await page.keyboard.press("z"); await page.evaluate(() => { BP.Game.debug.autoplay = 1 })
for (let i = 0; i < 100 && (await dbg(page)).phase !== "aim"; i++) await sleep(100)
await page.evaluate(() => BP.Game.debug.setCups(1, 1))
const t0 = Date.now(); let tc = 0
while (Date.now() - t0 < 90000) { const d = await dbg(page); if (d.state === "clear" && !tc) { tc = Date.now(); console.log("clear after", (tc - t0) / 1000, "s") } if (tc) { await page.evaluate(() => { BP.Game.debug.autoplay = false }); await page.keyboard.press("z") } if (tc && d.state !== "clear") { console.log("left clear after", (Date.now() - tc) / 1000, "s of mashing A ->", d.state); break } if (tc && Date.now() - tc > 15000 && Date.now() - tc < 15400) await cshot(page, "fastclear-hold"); await sleep(200) }
await b.close()
