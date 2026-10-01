import { chromium, DEV, sleep, hookErrors, cshot } from "./judge2-lib.mjs"
const P = (p) => fetch("http://localhost:8811" + p, { method: "POST" })
const b = await chromium.launch(); const ctx = await b.newContext()
await ctx.addInitScript(() => { const r = Date.now; window.__skew = 0; Date.now = () => r() + window.__skew })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV + "?debug"); await sleep(800)
await page.keyboard.press("Enter"); await sleep(1500) // real startRun -> token
await page.evaluate(() => { BP.Game.debug.autoplay = 0.97 })
// play stage 1 for real-ish via steps, add skew
for (let i = 0; i < 200; i++) { const s = await page.evaluate(() => { BP.Game.debug.step(120); window.__skew += 2000; return BP.Game.debug.state + BP.Game.debug.stage }); if (s === "vs1") break }
await P("/__dev/clock?advance=400000")
await page.evaluate(() => { BP.Game.debug.autoplay = false; BP.Game.debug.go("gameover") })
await P("/__dev/net?down=1")
await sleep(1500); await page.keyboard.press("Enter"); await sleep(1200)
for (const k of ["z", "Enter"]) { await page.keyboard.press(k); await sleep(500) }
const t0 = Date.now(); await page.keyboard.press("z")
let st = ""; for (let i = 0; i < 100; i++) { st = await page.evaluate(() => BP.Game.debug.state); if (st === "scores") break; await sleep(100) }
console.log("net down: entry->", st, "after", Date.now() - t0, "ms", JSON.stringify(await page.evaluate(() => BP.Scores.status())))
await sleep(500); await cshot(page, "net-down-board")
await P("/__dev/net?down=0"); await sleep(25000)
console.log("after net up 25s:", JSON.stringify(await page.evaluate(() => BP.Scores.status())), (await (await fetch("http://localhost:8811/api/beerpong/scores?limit=50")).json()).top.filter((e) => e.name === "PLAYER" || e.name.startsWith("A")).length, errs)
await b.close()
