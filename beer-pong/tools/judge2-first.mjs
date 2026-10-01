import { chromium, devices, DEV, hookErrors, sleep, dbg } from "./judge2-lib.mjs"
const b = await chromium.launch()
for (const delay of [50, 150, 300, 600]) {
  const page = await (await b.newContext()).newPage()
  await page.goto(DEV, { waitUntil: "load" }); await sleep(delay)
  await page.keyboard.press("Enter"); await sleep(700)
  console.log("Enter after", delay, "ms ->", (await dbg(page)).state, JSON.stringify(await page.evaluate(() => BP.Audio._state())))
  await page.close()
}
// touch: mute button tap
const ctx = await b.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true }); const page = await ctx.newPage()
await page.goto(DEV); await sleep(800)
const bx = await page.locator("#bMute").boundingBox(); await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await sleep(300)
console.log("after mute tap:", JSON.stringify(await page.evaluate(() => [BP.Audio._state(), localStorage.getItem("bp_mute"), BP.Game.debug.state])))
await page.reload(); await sleep(800)
console.log("after reload:", JSON.stringify(await page.evaluate(() => [BP.Audio._state(), BP.Game.debug.state])))
await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await sleep(300)
console.log("unmute tap:", JSON.stringify(await page.evaluate(() => [BP.Audio._state(), BP.Game.debug.state])))
await b.close()
