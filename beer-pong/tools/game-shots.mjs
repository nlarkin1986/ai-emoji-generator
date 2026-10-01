// Captures a series of game screens deterministically for visual review.
// node beer-pong/tools/game-shots.mjs <outdir> [--mobile]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { writeFileSync, mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp"; mkdirSync(out, { recursive: true })
const url = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?seed=5"
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const errs = []
page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) })
await page.goto(url); await page.waitForTimeout(600)
// pause the real loop so captures are exact
await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0 })
await page.waitForTimeout(100)
async function shot(name, fn, arg) {
  const data = await page.evaluate(([fn, arg]) => {
    const g = BP.Game.debug; (new Function("g", "arg", fn))(g, arg); g.render()
    const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = 768; o.height = 720
    const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL()
  }, [fn, arg])
  writeFileSync(join(out, name + ".png"), Buffer.from(data.split(",")[1], "base64"))
}
const steps = JSON.parse(process.argv[3] || "null") || [
  ["vs", "g.go('title'); g.startAt(0,0,0); g.go('vs',{stage:0}); g.step(150)"],
  ["vs4", "g.startAt(4,0,2); g.go('vs',{stage:4}); g.step(200)"],
  ["howto1", "g.go('howto'); g.step(20)"],
  ["howto3", "g.go('howto'); g.step(5); g.press('a'); g.step(5); g.press('a'); g.step(5)"],
  ["scores", "g.go('scores',{}); g.step(30)"],
  ["m_aim", "g.startAt(2,0,3); g.step(70)"],
  ["m_flight", "g.autoplay=0.99; g.startAt(0,0,0); for(let i=0;i<400&&g.phase!=='flight';i++) g.step(1); g.step(30)"],
  ["m_sink", "for(let i=0;i<300&&g.phase!=='result';i++) g.step(1); g.step(3)"],
  ["m_sink2", "g.step(14)"],
  ["m_cpu", "for(let i=0;i<900&&!(g.turn==='cpu'&&g.phase==='aim');i++) g.step(1); g.step(20)"],
  ["m_cpuflight", "for(let i=0;i<400&&g.phase!=='flight';i++) g.step(1); g.step(40)"],
  ["m_late", "g.step(1500)"],
  ["clear", "g.autoplay=false; g.go('clear',{}); g.step(150)"],
  ["gameover", "g.go('gameover',{}); g.step(80)"],
  ["entry", "g.go('entry',{}); g.step(20); g.press('right'); g.step(2); g.press('a'); g.step(2)"],
  ["demo", "g.go('demo',{}); g.step(400)"],
  ["tv", "g.go('tv',{}); g.step(30)"],
]
for (const [n, f] of steps) await shot(n, f)
// contact sheet (3 columns, 1.5x) for quick review
const names = steps.map((s) => s[0])
for (let sheet = 0; sheet * 9 < names.length; sheet++) {
  const group = names.slice(sheet * 9, sheet * 9 + 9)
  const imgs = group.map((n) => "data:image/png;base64," + require("node:fs").readFileSync(join(out, n + ".png")).toString("base64"))
  const data = await page.evaluate(async (imgs) => {
    const o = document.createElement("canvas"); o.width = 384 * 3 + 8; o.height = 360 * Math.ceil(imgs.length / 3) + 8; const x = o.getContext("2d"); x.fillStyle = "#444"; x.fillRect(0, 0, o.width, o.height); x.imageSmoothingEnabled = false
    for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i]; await im.decode(); x.drawImage(im, (i % 3) * 386 + 2, ((i / 3) | 0) * 362 + 2, 384, 360) }
    return o.toDataURL()
  }, imgs)
  writeFileSync(join(out, "sheet" + sheet + ".png"), Buffer.from(data.split(",")[1], "base64"))
}
console.log(errs.length ? errs.join("\n") : "no errors")
await browser.close()
