import { chromium, DEV, pshot, cshot, hookErrors, sleep, OUT } from "./judge2-lib.mjs"
import { createRequire } from "node:module"
import fs from "node:fs"
const req = createRequire(OUT + "/../qrdec/node_modules/")
const jsQR = req("jsqr"), { PNG } = req("pngjs")
const b = await chromium.launch()
for (const [w, h] of [[1920, 1080], [1280, 720], [1080, 1920]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
  await page.goto(DEV + "?tv"); await sleep(2500)
  await pshot(page, `tv-${w}x${h}`)
  const png = PNG.sync.read(fs.readFileSync(`${OUT}/tv-${w}x${h}.png`))
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  const wl = await page.evaluate(() => !!navigator.wakeLock)
  console.log(w, h, "QR:", code ? code.data : "NOT DECODED", "wakeLock api:", wl, errs)
  await ctx.close()
}
await b.close()
