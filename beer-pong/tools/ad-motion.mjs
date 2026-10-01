// AD: frame-by-frame strips of the hero throw, hero sad (after CPU make), and 1x/2x "phone-size" crops.
// node beer-pong/tools/ad-motion.mjs <outDir>
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] || "/tmp/ad"; fs.mkdirSync(OUT, { recursive: true })
const FILE = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const b = await chromium.launch(); const p = await (await b.newContext()).newPage()
await p.goto(FILE + "?debug&fast&seed=4")
await p.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
await p.evaluate(() => { window.requestAnimationFrame = () => 0 })
const r = await p.evaluate(() => {
  const d = BP.Game.debug, c = document.getElementById("screen")
  const crop = (r, k) => { d.render(); const o = document.createElement("canvas"); o.width = r[2] * k; o.height = r[3] * k; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, r[0], r[1], r[2], r[3], 0, 0, o.width, o.height); return o }
  const sheet = (cs, gap = 3) => { const o = document.createElement("canvas"); o.width = cs.reduce((a, b) => a + b.width + gap, 0); o.height = Math.max(...cs.map((c) => c.height)); const x = o.getContext("2d"); x.fillStyle = "#222"; x.fillRect(0, 0, o.width, o.height); let px = 0; for (const cc of cs) { x.drawImage(cc, px, 0); px += cc.width + gap } return o.toDataURL() }
  const out = {}
  d.startAt(0, 0, 0)
  for (let i = 0; i < 3000 && !(d.phase === "aim" && d.turn === "player"); i++) d.step(1)
  d.autoplay = 0.99
  // run to power, then frame-by-frame through throw
  for (let i = 0; i < 3000 && d.phase !== "power"; i++) d.step(1)
  const fr = []
  for (let i = 0; i < 3000 && d.phase !== "flight"; i++) d.step(1)
  d.step(-0) ; // at flight start
  // rewind not possible; capture from here + also previous? just capture 16 frames from flight start
  for (let i = 0; i < 16; i++) { fr.push(crop([0, 168, 48, 64], 4)); d.step(2) }
  out.throw = sheet(fr)
  // sad: wait for CPU make
  d.autoplay = 0.05
  const sad = []
  for (let k = 0; k < 20000; k++) { const before = d.cups[0]; d.step(1); if (d.cups[0] < before) break }
  for (let i = 0; i < 14; i++) { sad.push(crop([0, 160, 48, 72], 4)); d.step(5) }
  out.sad = sad.length ? sheet(sad) : null
  return out
})
for (const k in r) if (r[k]) fs.writeFileSync(join(OUT, "motion-" + k + ".png"), Buffer.from(r[k].split(",")[1], "base64"))
console.log("ok", Object.keys(r)); await b.close()
