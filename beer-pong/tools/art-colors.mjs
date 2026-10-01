// NES color-budget test: renders match frames for every stage from the built game and counts distinct colors.
// node beer-pong/tools/art-colors.mjs [maxColors=25]     (run `node beer-pong/build.mjs` first)
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const MAX = +(process.argv[2] || 25)
const browser = await chromium.launch()
let fail = 0
for (let s = 0; s < 5; s++) {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?seed=" + (3 + s) + "&fast&debug")
  await page.waitForTimeout(600)
  await page.evaluate((st) => { BP.Game.debug.startAt(st, 0, 2); BP.Game.debug.autoplay = 0.9 }, s)
  let worst = 0, worstList = [], union = new Set()
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => {
      const c = document.getElementById("screen"), d = c.getContext("2d").getImageData(0, 0, 256, 240).data, set = new Set()
      for (let i = 0; i < d.length; i += 4) set.add(((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, "0"))
      const names = {}; for (const k in BP.Art.PAL) { const h = BP.Art.PAL[k].slice(1).toLowerCase(); if (!names[h]) names[h] = k }
      return [...set].map((h) => names[h] || "#" + h)
    })
    r.forEach((x) => union.add(x))
    if (r.length > worst) { worst = r.length; worstList = r }
  }
  const ok = worst <= MAX; if (!ok) fail++
  console.log(`stage ${s}: max ${worst} colors/frame (union ${union.size}) ${ok ? "OK" : "OVER"}\n   ${worstList.sort().join(" ")}`)
  await page.close()
}
await browser.close()
process.exit(fail ? 1 : 0)
