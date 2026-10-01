// Portrait contact sheet + live VS cards + in-match speech box.
// node beer-pong/tools/portraits-sheet.mjs [outdir] [prefix]
// Builds first, then writes:
//   <prefix>sheet.png      all 6 x (64 + 32) portraits at 4x on black
//   <prefix>vs<N>.png      live VS card for stage N (0..4) at 3x
//   <prefix>speech<N>.png  match frame + speech box with portrait (game layout) at 3x
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/portraits"
const prefix = process.argv[3] || ""
const only = process.env.ONLY || "" // e.g. ONLY=sheet to skip the VS/speech captures
fs.mkdirSync(out, { recursive: true })
if (!process.env.NOBUILD) execSync("node " + join(here, "..", "build.mjs"), { stdio: "inherit" })
const base = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const WHO = ["hero", "chad", "tank", "sky", "brody", "kegmaster"]
const browser = await chromium.launch()
const errs = []
const save = (name, data) => { const f = join(out, prefix + name + ".png"); fs.writeFileSync(f, Buffer.from(data.split(",")[1], "base64")); console.log("wrote", f) }
async function newPage(q) {
  const page = await browser.newPage({ viewport: { width: 800, height: 760 } })
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()) })
  page.on("pageerror", (e) => errs.push("pageerror " + e.message))
  await page.goto(base + q)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state === "title", null, { timeout: 15000 })
  return page
}

// ---- 1. sheet
{
  const page = await newPage("?debug&seed=4&fast")
  const data = await page.evaluate((WHO) => {
    const A = BP.Art, S = 4, cw = 6 * 70 + 6, ch = 64 + 32 + 16 + 8
    const c = document.createElement("canvas"); c.width = cw; c.height = ch
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false
    x.fillStyle = "#000"; x.fillRect(0, 0, cw, ch)
    WHO.forEach((w, i) => { A.drawPortrait(x, w, 6 + i * 70, 4, 64); A.drawPortrait(x, w, 6 + i * 70, 76, 32); A.drawPortrait(x, w, 40 + i * 70, 76) })
    A.drawPortrait(x, "nobody", 6, 112 - 2, 8) // unknown -> fallback, must not throw
    const o = document.createElement("canvas"); o.width = cw * S; o.height = ch * S
    const ox = o.getContext("2d"); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, o.width, o.height)
    return o.toDataURL()
  }, WHO)
  save("sheet", data)
  // 1:1 sheet too (how it reads at native size)
  const d1 = await page.evaluate((WHO) => {
    const A = BP.Art, cw = 6 * 70 + 6, ch = 64 + 32 + 12
    const c = document.createElement("canvas"); c.width = cw; c.height = ch
    const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, cw, ch)
    WHO.forEach((w, i) => { A.drawPortrait(x, w, 6 + i * 70, 4, 64); A.drawPortrait(x, w, 6 + i * 70, 72, 32) })
    return c.toDataURL()
  }, WHO)
  save("sheet1x", d1)
  // per-character zoom: 64 at 6x + 32 at 6x side by side
  for (const w of WHO) {
    const dz = await page.evaluate((w) => {
      const A = BP.Art, c = document.createElement("canvas"); c.width = 100; c.height = 64
      const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 100, 64)
      A.drawPortrait(x, w, 0, 0, 64); A.drawPortrait(x, w, 68, 0, 32)
      const o = document.createElement("canvas"); o.width = 600; o.height = 384
      const ox = o.getContext("2d"); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, 600, 384); return o.toDataURL()
    }, w)
    save("zoom_" + w, dz)
  }
  await page.close()
}

const grab = (page, s) => page.evaluate((s) => {
  const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = c.width * s; o.height = c.height * s
  const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL()
}, s)

if (only !== "sheet") {
  // ---- 2. VS cards (non-fast so the portraits finish sliding in)
  const page = await newPage("?debug&seed=4")
  for (let s = 0; s < 5; s++) {
    await page.evaluate((s) => { BP.Game.debug.startAt(s, 0, 0); BP.Game.debug.go("vs", { stage: s }) }, s)
    await page.waitForTimeout(2300)
    save("vs" + s, await grab(page, 3))
  }
  // ---- 3. speech box over a live match frame (same coordinates as game.js drawMatch)
  const names = ["NATE", "TANK", "SKY", "BRO-DY", "KEGMASTER"]
  for (let s = 0; s < 5; s++) {
    await page.evaluate((s) => BP.Game.debug.startAt(s, 0, 0), s)
    await page.waitForTimeout(1500)
    const d = await page.evaluate(([s, who, name]) => {
      const c = document.getElementById("screen"), ctx = c.getContext("2d"), A = BP.Art
      A.drawBox(ctx, 4, 26, 248, 40, "red"); A.drawPortrait(ctx, who, 8, 30)
      A.text(ctx, name + ":", 46, 33, "red"); A.text(ctx, "TOO EASY, BRO!", 46, 47, "white")
      const o = document.createElement("canvas"); o.width = 768; o.height = 720
      const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL()
    }, [s, WHO[s + 1], names[s]])
    save("speech" + s, d)
  }
  await page.close()
}
console.log(errs.length ? "CONSOLE:\n" + errs.join("\n") : "no console errors")
await browser.close()
