// Capture in-game frames using the built game's debug hooks.  node beer-pong/tools/art-game.mjs outdir stage [ms ms ...]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp", stage = +(process.argv[3] || 0)
const times = process.argv.slice(4).map(Number); if (!times.length) times.push(3000, 6000)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const errs = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()) })
page.on("pageerror", (e) => errs.push("pageerror " + e.message))
await page.goto(pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?seed=7&fast")
await page.waitForTimeout(800)
await page.evaluate((s) => { BP.Game.debug.startAt(s, 0, 0); BP.Game.debug.autoplay = 0.9 }, stage)
let last = 0
for (const t of times) {
  await page.waitForTimeout(t - last); last = t
  const data = await page.evaluate(() => { const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = 768; o.height = 720; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL() })
  const f = join(out, `game_s${stage}_${t}.png`); fs.writeFileSync(f, Buffer.from(data.split(",")[1], "base64")); console.log("wrote", f)
}
console.log(await page.evaluate(() => JSON.stringify({ st: BP.Game.debug.state, ph: BP.Game.debug.phase })))
console.log(errs.length ? errs.join("\n") : "no console errors")
await browser.close()
