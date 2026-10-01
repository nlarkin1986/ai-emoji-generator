// Screenshot / smoke-test helper for the team.
// node beer-pong/tools/shot.mjs [--url QUERY] [--mobile] [--landscape] [--wait ms] [--keys "a,a,start"] [--out file.png] [--scale N]
// Builds nothing — run `node beer-pong/build.mjs` first. Prints console errors and BP.Game.debug.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const gRoot = execSync("npm root -g").toString().trim()
const { chromium, devices } = require(join(gRoot, "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const has = (k) => args.includes(k)
const file = join(here, "..", "..", "public", "beerpong", "index.html")
const url = pathToFileURL(file).href + (opt("--url", "") || "")
const out = opt("--out", join(process.env.SCRATCH || "/tmp", "shot.png"))
const browser = await chromium.launch()
const ctxOpts = has("--mobile") ? { ...devices[has("--landscape") ? "iPhone 13 landscape" : "iPhone 13"], hasTouch: true } : { viewport: { width: 1024, height: 900 } }
const ctx = await browser.newContext(ctxOpts)
const page = await ctx.newPage()
const errors = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`) })
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`))
await page.goto(url)
await page.waitForTimeout(+opt("--wait", 1500))
const keymap = { a: "z", b: "x", start: "Enter", select: "Shift", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }
for (const k of (opt("--keys", "") || "").split(",").filter(Boolean)) {
  if (/^\d+$/.test(k)) { await page.waitForTimeout(+k); continue }
  if (k === "tap") { await page.locator("#screen").tap().catch(() => page.locator("#screen").click()); await page.waitForTimeout(150); continue }
  await page.keyboard.down(keymap[k] || k); await page.waitForTimeout(60); await page.keyboard.up(keymap[k] || k); await page.waitForTimeout(150)
}
await page.waitForTimeout(300)
if (has("--canvas")) {
  const data = await page.evaluate((s) => { const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = 256 * s; o.height = 240 * s; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL() }, +opt("--scale", 3))
  const fs = await import("node:fs"); fs.writeFileSync(out, Buffer.from(data.split(",")[1], "base64"))
} else await page.screenshot({ path: out })
const dbg = await page.evaluate(() => { try { return JSON.stringify(window.BP && BP.Game && BP.Game.debug) } catch (e) { return String(e) } })
console.log("screenshot:", out)
console.log("debug:", dbg)
console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
