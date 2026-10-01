import { chromium, DEV, hookErrors, sleep, dbg, cshot, devices } from "./judge3-lib.mjs"
const b = await chromium.launch()
async function run(label, keys, touch) {
  const ctx = touch ? await b.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true }) : await b.newContext()
  const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
  let posts = 0; page.on("request", (r) => { if (r.url().includes("/api/beerpong/scores") && r.method() === "POST") posts++ })
  await page.goto(DEV + "?debug"); await sleep(800)
  // first run: sets sessionName = PREV
  for (const nameRun of [true, false]) {
    await page.evaluate(() => { BP.Game.debug.startAt(0, 0, 0); BP.Game.debug.step(30); BP.Game.debug.setCups(0, 0) })
    // let cpu sink last cup? simpler: go gameover directly
    await page.evaluate(() => BP.Game.debug.go("gameover"))
    if (nameRun) {
      await sleep(1500); await page.evaluate(() => { BP.Game.debug.go("entry") }); await sleep(800)
      for (const k of ["z", "Enter"]) { await page.keyboard.press(k); await sleep(400) }
      await page.keyboard.press("z"); await sleep(2500)
      console.log(label, "setup run ->", (await dbg(page)).state, "posts", posts)
      continue
    }
    const t0 = Date.now(); const seen = new Set()
    while (Date.now() - t0 < 9000) {
      if (touch) { const bx = await page.locator("#screen").boundingBox(); await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height * 0.5) }
      else for (const k of keys) await page.keyboard.press(k)
      await sleep(30); seen.add((await dbg(page)).state)
    }
    await cshot(page, "mash-" + label)
    console.log(label, "states", [...seen].join(">"), "final", (await dbg(page)).state, "submits", posts)
  }
  await ctx.close()
}
await run("A-only", ["z"])
await run("A+START", ["z", "Enter"])
await run("touch-center", [], true)
await b.close()
