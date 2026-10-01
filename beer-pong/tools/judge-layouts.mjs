import { chromium, devices, OUT, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
for (const n of ["iPhone SE landscape", "iPad Mini", "Pixel 5"]) {
  const ctx = await browser.newContext({ ...devices[n], hasTouch: true })
  const p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(700)
  await p.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.step(120) })
  await p.waitForTimeout(300)
  const tag = n.replace(/\W+/g, "_")
  await p.screenshot({ path: `${OUT}/lay-${tag}.png` })
  console.log(n, await p.evaluate(() => { const r = document.getElementById('scr').getBoundingClientRect(); return [innerWidth, innerHeight, Math.round(r.width), Math.round(r.height), document.body.className, BP.Shell.state.s] }))
  await ctx.close()
}
await browser.close()
