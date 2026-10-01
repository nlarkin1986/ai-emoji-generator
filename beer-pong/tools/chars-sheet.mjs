// Character sprite sheet + in-game captures.   node beer-pong/tools/chars-sheet.mjs [outdir]
// (run `node beer-pong/build.mjs` first).  Writes sheet.png (5x, neutral), sheet1x.png, scene_s*.png, game_s*.png
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp/chars"
const only = process.argv[3] || "all" // all | sheet | game
fs.mkdirSync(out, { recursive: true })
const url = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
const errs = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()) })
page.on("pageerror", (e) => errs.push("pageerror " + e.message))
await page.goto(url + "?debug&seed=4&fast")
await page.waitForTimeout(700)
const save = (name, dataUrl) => { const f = join(out, name); fs.writeFileSync(f, Buffer.from(dataUrl.split(",")[1], "base64")); console.log("wrote", f) }

if (only !== "game") {
  const sheets = await page.evaluate(() => {
    const A = BP.Art; A.init()
    const WHO = ["hero", "chad", "tank", "sky", "brody", "kegmaster"]
    const FR = [["idle", 0], ["idle", 32], ["aim", 0], ["throw", 0], ["cheer", 0], ["cheer", 16], ["drink", 0], ["drink", 10], ["sad", 0], ["walk", 0], ["walk", 8]]
    const CW = 44, CH = 58
    function sheet(flipAll, bg) {
      const c = document.createElement("canvas"); c.width = FR.length * CW; c.height = WHO.length * CH
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false
      x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height)
      WHO.forEach((w, r) => FR.forEach(([p, t], i) => {
        x.fillStyle = (r + i) & 1 ? bg : "#2c6cd8"; x.fillRect(i * CW, r * CH, CW, CH)
        x.fillStyle = "#183c5c"; x.fillRect(i * CW, r * CH + 54, CW, 1)
        A.drawPlayer(x, w, p, i * CW + 22, r * CH + 55, t, flipAll)
      }))
      return c
    }
    function up(c, s) { const o = document.createElement("canvas"); o.width = c.width * s; o.height = c.height * s; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL() }
    const a = sheet(false, "#3cbcfc"), b = sheet(true, "#3cbcfc")
    // bounds report
    const rep = []
    return { s5: up(a, 5), s5f: up(b, 5), s1: up(a, 2), rep }
  })
  save("sheet.png", sheets.s5); save("sheet_flipped.png", sheets.s5f); save("sheet2x.png", sheets.s1)
  // detail: 10x close-ups (row 1 idle of all six, row 2 = DETAIL pose for all six)
  const det = await page.evaluate((pose) => {
    const A = BP.Art, WHO = ["hero", "chad", "tank", "sky", "brody", "kegmaster"], c = document.createElement("canvas")
    c.width = 6 * 40; c.height = 2 * 54; const x = c.getContext("2d"); x.fillStyle = "#3cbcfc"; x.fillRect(0, 0, c.width, c.height)
    WHO.forEach((w, i) => { A.drawPlayer(x, w, "idle", i * 40 + 20, 53, 0); A.drawPlayer(x, w, pose[0], i * 40 + 20, 107, +pose[1] || 0) })
    const o = document.createElement("canvas"); o.width = c.width * 8; o.height = c.height * 8; const ox = o.getContext("2d"); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL()
  }, (process.env.DETAIL || "drink").split(":"))
  save("detail.png", det)
  // bounds: every sprite drawn where the game draws it (hero x=16, CPU x=240, feet 228) must stay on the 256x240 screen
  const bounds = await page.evaluate(() => {
    const A = BP.Art, WHO = ["hero", "chad", "tank", "sky", "brody", "kegmaster"], P = { idle: [0, 32], aim: [0], throw: [0], cheer: [0, 16], drink: [0, 10], sad: [0], walk: [0, 8] }
    const c = document.createElement("canvas"); c.width = 320; c.height = 240; const x = c.getContext("2d", { willReadFrequently: true }), bad = [], ext = {}
    for (const w of WHO) for (const p in P) for (const t of P[p]) for (const px of w === "hero" ? [16] : [240]) {
      x.clearRect(0, 0, 320, 240); A.drawPlayer(x, w, p, px + 32, 228, t)
      const d = x.getImageData(0, 0, 320, 240).data; let x0 = 999, x1 = -1, y0 = 999, y1 = -1
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const X = (i / 4) % 320 - 32, Y = (i / 4 / 320) | 0; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y) }
      const k = w + ":" + p + t; ext[k] = [x0, x1, y0, y1, x1 - x0 + 1, y1 - y0 + 1]
      if (x0 < 0 || x1 > 255 || y1 !== 227 && !(p === "cheer" && t)) bad.push(k + " " + ext[k])
    }
    let mw = 0, mh = 0; for (const k in ext) { mw = Math.max(mw, ext[k][4]); mh = Math.max(mh, ext[k][5]) }
    return { bad, mw, mh, hand: ext["hero:throw0"], cpuHand: ext["chad:throw0"] }
  })
  console.log("bounds:", JSON.stringify(bounds))
  // heads: 16x close-up of the top 24 rows (idle, cheer, sad) for every character, hero-facing (unmirrored)
  const heads = await page.evaluate(() => {
    const A = BP.Art, WHO = ["hero", "chad", "tank", "sky", "brody", "kegmaster"], c = document.createElement("canvas")
    c.width = 6 * 30; c.height = 3 * 24; const x = c.getContext("2d"); x.fillStyle = "#3cbcfc"; x.fillRect(0, 0, c.width, c.height)
    WHO.forEach((w, i) => [["idle", 0], ["cheer", 16], ["sad", 0]].forEach(([p, t], j) => {
      x.save(); x.beginPath(); x.rect(i * 30, j * 24, 30, 24); x.clip(); A.drawPlayer(x, w, p, i * 30 + 15, j * 24 + 50, t, w !== "hero"); x.restore() }))
    const o = document.createElement("canvas"); o.width = c.width * 10; o.height = c.height * 10; const ox = o.getContext("2d"); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL()
  })
  save("heads.png", heads)
  // scenes: each stage, hero + that stage's CPU in paired poses, drawn with the real background/table
  const scenes = await page.evaluate(() => {
    const A = BP.Art, WHO = ["chad", "tank", "sky", "brody", "kegmaster"]
    const PAIRS = [["aim", "idle", 0], ["throw", "drink", 0], ["cheer", "sad", 0], ["sad", "cheer", 16], ["drink", "throw", 0], ["idle", "aim", 32]]
    const res = []
    for (let s = 0; s < 5; s++) {
      const c = document.createElement("canvas"); c.width = 256 * 3; c.height = 92 * PAIRS.length * 3
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false
      const f = document.createElement("canvas"); f.width = 256; f.height = 240; const fx = f.getContext("2d"); fx.imageSmoothingEnabled = false
      PAIRS.forEach((pp, i) => {
        A.drawBackground(fx, s, 100, 0)
        A.drawPlayer(fx, "hero", pp[0], 16, 228, pp[2], false)
        A.drawPlayer(fx, WHO[s], pp[1], 240, 228, pp[2], false)
        A.drawTable(fx, s)
        x.drawImage(f, 0, 148, 256, 92, 0, i * 276, 768, 276)
      })
      res.push(c.toDataURL())
    }
    return res
  })
  scenes.forEach((d, s) => save(`scene_s${s}.png`, d))
}
if (only !== "sheet") {
  for (let s = 0; s < 5; s++) {
    await page.evaluate((st) => { BP.Game.debug.startAt(st, 0, 0); BP.Game.debug.autoplay = 0.9 }, s)
    await page.waitForTimeout(1800)
    const d = await page.evaluate(() => { const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = 768; o.height = 720; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL() })
    save(`game_s${s}.png`, d)
  }
}
console.log(errs.length ? "CONSOLE:\n" + errs.join("\n") : "no console errors")
await browser.close()
