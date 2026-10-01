import { chromium, FILE, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] }); const page = await (await b.newContext()).newPage()
await page.goto(FILE + "?debug&seed=9"); await sleep(500)
await page.evaluate(() => { BP.Game.debug.autoplay = 0.8 })
for (let k = 0; k < 6; k++) {
  const r = await page.evaluate(() => { for (let i = 0; i < 60 * 60 * 5 / 120; i++) { BP.Game.debug.step(120); BP.Game.debug.render() } if (window.gc) gc(); return { heap: Math.round(performance.memory.usedJSHeapSize / 1e5) / 10, st: BP.Game.debug.state, err: BP.Game.debug.errors.length, notes: BP.Game.debug.notes.slice(-3) } })
  console.log((k + 1) * 5, "game-min", JSON.stringify(r))
}
await b.close()
