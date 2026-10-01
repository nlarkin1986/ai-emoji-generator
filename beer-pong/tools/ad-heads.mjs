// AD: 16x gridded head close-ups (sprite-local coords) for hero + chad, idle and sad, unmirrored and in-game facing.
// node beer-pong/tools/ad-heads.mjs <outDir>
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
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(FILE + "?debug&fast&seed=4"); await p.waitForTimeout(600)
const d = await p.evaluate(() => {
  const A = BP.Art, K = 16, list = [["hero", "idle", 0], ["hero", "sad", 0], ["hero", "drink", 0], ["chad", "idle", 0], ["chad", "sad", 0], ["kegmaster", "idle", 0]]
  const W = 34, H = 26, o = document.createElement("canvas"); o.width = list.length * (W * K + 8); o.height = H * K + 20
  const ox = o.getContext("2d"); ox.imageSmoothingEnabled = false; ox.fillStyle = "#222"; ox.fillRect(0, 0, o.width, o.height)
  list.forEach(([w, pose, t], i) => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#3cbcfc"; x.fillRect(0, 0, 64, 64)
    A.drawPlayer(x, w, pose, 32, 63, t, w === "hero" ? false : false)
    const X0 = i * (W * K + 8)
    ox.drawImage(c, 15, 10, W, H, X0, 20, W * K, H * K)
    ox.strokeStyle = "rgba(0,0,0,.25)"; for (let gx = 0; gx <= W; gx++) { ox.beginPath(); ox.moveTo(X0 + gx * K + .5, 20); ox.lineTo(X0 + gx * K + .5, 20 + H * K); ox.stroke() }
    for (let gy = 0; gy <= H; gy++) { ox.beginPath(); ox.moveTo(X0, 20 + gy * K + .5); ox.lineTo(X0 + W * K, 20 + gy * K + .5); ox.stroke() }
    ox.fillStyle = "#fff"; ox.font = "14px monospace"; ox.fillText(w + " " + pose, X0 + 4, 14)
  })
  return o.toDataURL()
})
fs.writeFileSync(join(OUT, "heads16.png"), Buffer.from(d.split(",")[1], "base64")); console.log("ok"); await b.close()
