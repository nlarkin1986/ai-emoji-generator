// AD helper: tile PNGs into one sheet with nearest-neighbour scaling.
// node beer-pong/tools/ad-sheet.mjs <out.png> <scale> <cols> <img...>
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const [out, scale, cols, ...files] = process.argv.slice(2)
const urls = files.map((f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64"))
const b = await chromium.launch(); const p = await b.newPage()
const d = await p.evaluate(async ([urls, k, cols]) => {
  const ims = []; for (const u of urls) { const im = new Image(); im.src = u; await im.decode(); ims.push(im) }
  const cw = Math.max(...ims.map((i) => i.width)) * k + 4, ch = Math.max(...ims.map((i) => i.height)) * k + 4, rows = Math.ceil(ims.length / cols)
  const o = document.createElement("canvas"); o.width = cw * Math.min(cols, ims.length); o.height = ch * rows
  const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.fillStyle = "#222"; x.fillRect(0, 0, o.width, o.height)
  ims.forEach((im, i) => x.drawImage(im, (i % cols) * cw + 2, ((i / cols) | 0) * ch + 2, im.width * k, im.height * k))
  return o.toDataURL()
}, [urls, +scale, +cols])
fs.writeFileSync(out, Buffer.from(d.split(",")[1], "base64")); await b.close(); console.log("wrote", out)
