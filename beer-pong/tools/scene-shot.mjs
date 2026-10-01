// Scene/crowd review captures from the BUILT game (deterministic, rAF paused, 3x nearest-neighbour).
// node beer-pong/tools/scene-shot.mjs <outdir> [prefix]     (run `node beer-pong/build.mjs` first)
// Writes <prefix>s0..s4 (live match per stage), title, sink, fire, clear, crowd (2x crop strips) + a sheet.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { writeFileSync, mkdirSync, readFileSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || "/tmp"; mkdirSync(out, { recursive: true })
const pre = process.argv[3] || ""
const url = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?seed=4&fast&debug"
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const errs = []
page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()) })
await page.goto(url); await page.waitForTimeout(600)
await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
await page.waitForTimeout(100)
async function shot(name, fn, crop) {
  const data = await page.evaluate(([fn, crop]) => {
    const g = BP.Game.debug; (new Function("g", fn))(g); g.render()
    const c = document.getElementById("screen"), k = crop ? 4 : 3, r = crop || [0, 0, 256, 240]
    const o = document.createElement("canvas"); o.width = r[2] * k; o.height = r[3] * k
    const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, r[0], r[1], r[2], r[3], 0, 0, o.width, o.height); return o.toDataURL()
  }, [fn, crop])
  writeFileSync(join(out, pre + name + ".png"), Buffer.from(data.split(",")[1], "base64"))
  return pre + name
}
const names = []
for (let s = 0; s < 5; s++) names.push(await shot("s" + s, `g.autoplay=0.5; g.startAt(${s},0,0); for(let i=0;i<2400&&!(g.turn==='cpu'&&g.phase==='flight');i++) g.step(1); g.step(12)`))
names.push(await shot("crowd0", `g.startAt(0,0,0); g.step(180)`, [0, 120, 256, 112]))
names.push(await shot("crowd1", `g.startAt(1,0,0); g.step(181)`, [0, 120, 256, 112]))
names.push(await shot("sink", `g.autoplay=0.99; g.startAt(0,0,0); for(let i=0;i<600&&g.phase!=='result';i++) g.step(1); g.step(4)`))
names.push(await shot("sink2", `g.step(8)`))
names.push(await shot("title", `g.autoplay=false; g.go('title'); g.step(90)`))
names.push(await shot("clear", `g.startAt(3,0,0); g.go('clear',{}); g.step(150)`))
names.push(await shot("cheer", `g.autoplay=0.99; g.startAt(2,0,0); for(let i=0;i<600&&g.phase!=='result';i++) g.step(1); g.step(20)`))
// fx contact sheet from artsheet
const p2 = await browser.newPage()
await p2.goto(pathToFileURL(join(here, "artsheet.html")).href + "?panel=fx")
await p2.waitForFunction(() => window.DONE === true, null, { timeout: 10000 }).catch(() => {})
const fx = await p2.evaluate(() => { const c = document.getElementById("c"); const o = document.createElement("canvas"); o.width = 768; o.height = 720; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL() })
writeFileSync(join(out, pre + "fx.png"), Buffer.from(fx.split(",")[1], "base64"))
await p2.goto(pathToFileURL(join(here, "artsheet.html")).href + "?panel=misc")
await p2.waitForFunction(() => window.DONE === true, null, { timeout: 10000 }).catch(() => {})
const misc = await p2.evaluate(() => { const c = document.getElementById("c"); const o = document.createElement("canvas"); o.width = 768; o.height = 720; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720); return o.toDataURL() })
writeFileSync(join(out, pre + "misc.png"), Buffer.from(misc.split(",")[1], "base64"))
// sheet of the 5 stages (1.5x)
const imgs = [0, 1, 2, 3, 4].map((s) => "data:image/png;base64," + readFileSync(join(out, pre + "s" + s + ".png")).toString("base64"))
imgs.push("data:image/png;base64," + readFileSync(join(out, pre + "title.png")).toString("base64"))
const sheet = await page.evaluate(async (imgs) => {
  const o = document.createElement("canvas"); o.width = 384 * 3 + 8; o.height = 360 * 2 + 6; const x = o.getContext("2d"); x.fillStyle = "#444"; x.fillRect(0, 0, o.width, o.height); x.imageSmoothingEnabled = false
  for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i]; await im.decode(); x.drawImage(im, (i % 3) * 386 + 2, ((i / 3) | 0) * 362 + 2, 384, 360) }
  return o.toDataURL()
}, imgs)
writeFileSync(join(out, pre + "sheet.png"), Buffer.from(sheet.split(",")[1], "base64"))
console.log("wrote", names.length + 3, "images to", out)
console.log(errs.length ? errs.join("\n") : "no console errors")
await browser.close()
