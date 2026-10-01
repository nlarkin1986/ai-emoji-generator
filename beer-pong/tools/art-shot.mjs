// Screenshot the art contact sheet panels.  node beer-pong/tools/art-shot.mjs [outdir] [panel[:query] ...]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp"
const panels = process.argv.slice(3).length ? process.argv.slice(3) : ["s0", "s1", "s2", "s3", "s4", "chars", "misc"]
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()) })
page.on("pageerror", (e) => errs.push("pageerror " + e.message))
for (const p of panels) {
  const [name, extra] = p.split(":")
  const url = pathToFileURL(join(here, "artsheet.html")).href + "?panel=" + name + (extra ? "&" + extra : "")
  await page.goto(url)
  await page.waitForFunction(() => window.DONE === true, null, { timeout: 10000 }).catch(() => {})
  const scale = name === "all" ? 2 : name === "chars" ? 3 : 3
  const data = await page.evaluate((s) => { const c = document.getElementById("c"); const o = document.createElement("canvas"); o.width = c.width * s; o.height = c.height * s; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL() }, scale)
  const f = join(out, (p.replace(/[:=&]/g, "_")) + ".png")
  fs.writeFileSync(f, Buffer.from(data.split(",")[1], "base64"))
  console.log("wrote", f)
}
console.log(errs.length ? errs.join("\n") : "no console errors")
await browser.close()
