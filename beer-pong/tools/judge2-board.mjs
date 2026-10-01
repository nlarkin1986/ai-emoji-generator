import { chromium, DEV, cshot, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch(); const page = await (await b.newContext()).newPage()
await page.goto(DEV + "?debug"); await sleep(800)
await page.evaluate(() => BP.Game.debug.go("scores", { board: true, hlRank: 0, myRank: 123, myName: "WWWWWWWW", myScore: 1234567, myStage: 4, myRound: 2, label: "GLOBAL RANKING" }))
await sleep(1500); await page.evaluate(() => { for (let i = 0; i < 16; i++) { BP.Game.debug.step(1); if (Math.floor(BP.Game.debug.ticks / 8) % 2 === 0) break } BP.Game.debug.render() }); await cshot(page, "board-rank123", 4)
await page.evaluate(() => BP.Game.debug.go("scores", { board: true, hlRank: 0, myRank: 19, myName: "MOBIPH", myScore: 125, myStage: 0, myRound: 1, label: "GLOBAL RANKING" }))
await sleep(1500); await cshot(page, "board-rank19", 4)
await b.close()
