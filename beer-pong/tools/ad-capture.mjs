// AD review captures: per-stage flight/sink/fire/miss/cpu/drink at 3x + native 1x frames + character crops + motion strips.
// node beer-pong/tools/ad-capture.mjs <outDir>     (run `node beer-pong/build.mjs` first)
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] || "/tmp/ad"
fs.mkdirSync(OUT, { recursive: true })
const FILE = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const browser = await chromium.launch()
const errors = []
async function open(q) {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage()
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(FILE + q)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  await page.waitForTimeout(80)
  return page
}
// grab canvas region r=[x,y,w,h] at scale k
const grab = (page, k = 3, r = [0, 0, 256, 240]) => page.evaluate(([k, r]) => {
  BP.Game.debug.render()
  const c = document.getElementById("screen"), o = document.createElement("canvas")
  o.width = r[2] * k; o.height = r[3] * k
  const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, r[0], r[1], r[2], r[3], 0, 0, o.width, o.height)
  return o.toDataURL()
}, [k, r])
const save = (name, d) => fs.writeFileSync(join(OUT, name + ".png"), Buffer.from(d.split(",")[1], "base64"))
const shot = async (page, name) => save(name, await grab(page))
const ev = (page, fn, arg) => page.evaluate(fn, arg)
const st = (page) => ev(page, () => { const d = BP.Game.debug; return { s: d.state, ph: d.phase, turn: d.turn, streak: d.streak, fire: d.onFire, cups: d.cups } })
const step = (page, n) => ev(page, (n) => BP.Game.debug.step(n), n)
async function until(page, fn, max = 6000) {
  return ev(page, ([src, max]) => {
    const d = BP.Game.debug, f = new Function("s", "return " + src)
    for (let i = 0; i < max; i++) { const s = { s: d.state, ph: d.phase, turn: d.turn, streak: d.streak, fire: d.onFire }; if (f(s)) return true; d.step(1) }
    return false
  }, [fn, max])
}

// a sheet that stitches several data-urls horizontally
async function strip(page, name, urls, gap = 4) {
  const d = await page.evaluate(async ([urls, gap]) => {
    const ims = []; for (const u of urls) { const im = new Image(); im.src = u; await im.decode(); ims.push(im) }
    const o = document.createElement("canvas"); o.width = ims.reduce((a, b) => a + b.width + gap, 0); o.height = Math.max(...ims.map((i) => i.height))
    const x = o.getContext("2d"); x.fillStyle = "#222"; x.fillRect(0, 0, o.width, o.height); let px = 0
    for (const im of ims) { x.drawImage(im, px, 0); px += im.width + gap }
    return o.toDataURL()
  }, [urls, gap])
  save(name, d)
}

for (let sg = 0; sg < 5; sg++) {
  const p = await open("?debug&fast&seed=" + (4 + sg))
  await ev(p, (sg) => BP.Game.debug.startAt(sg, 0, 0), sg)
  await until(p, "s.ph==='aim'&&s.turn==='player'")
  await step(p, 30)
  save(`s${sg}-1x`, await grab(p, 1))
  // character crops 1x / 2x (hero at x~16, cpu at x~240, feet 228)
  save(`s${sg}-hero-1x`, await grab(p, 1, [0, 168, 48, 64])); save(`s${sg}-cpu-1x`, await grab(p, 1, [208, 168, 48, 64]))
  // throw motion strip: hero region every 3 frames from lock to release
  await ev(p, () => { BP.Game.debug.autoplay = 0.99 })
  const fr = []
  for (let i = 0; i < 14; i++) { fr.push(await grab(p, 3, [0, 168, 56, 64])); await step(p, 3) }
  await strip(p, `s${sg}-motion-hero`, fr)
  await until(p, "s.ph==='flight'")
  await step(p, 10); await shot(p, `s${sg}-flight`)
  await until(p, "s.ph==='result'")
  await step(p, 3); await shot(p, `s${sg}-sink-a`)
  await step(p, 14); await shot(p, `s${sg}-sink-b`)
  // cpu reaction frames (drink) crops over result
  const cf = []
  for (let i = 0; i < 10; i++) { cf.push(await grab(p, 3, [200, 160, 56, 72])); await step(p, 6) }
  await strip(p, `s${sg}-motion-cpu-react`, cf)
  // keep sinking until on fire
  await until(p, "s.fire || s.s!=='match'", 20000)
  const f = await st(p)
  if (f.fire) {
    await until(p, "s.ph==='aim'&&s.turn==='player'", 3000); await step(p, 20); await shot(p, `s${sg}-fire-aim`)
    await until(p, "s.ph==='flight'"); await step(p, 8); await shot(p, `s${sg}-fire-flight`)
  }
  // CPU turn: aim, throw, flight, result
  await ev(p, () => { BP.Game.debug.autoplay = 0.5 })
  if (await until(p, "s.turn==='cpu'&&s.ph==='aim'", 20000)) {
    await step(p, 25); await shot(p, `s${sg}-cpu-aim`)
    const cm = []
    for (let i = 0; i < 12; i++) { cm.push(await grab(p, 3, [196, 160, 60, 72])); await step(p, 3) }
    await strip(p, `s${sg}-motion-cpu-throw`, cm)
    await until(p, "s.ph==='flight'"); await step(p, 8); await shot(p, `s${sg}-cpu-flight`)
    await until(p, "s.ph==='result'"); await step(p, 10); await shot(p, `s${sg}-cpu-result`)
    const hf = []
    for (let i = 0; i < 10; i++) { hf.push(await grab(p, 3, [0, 160, 56, 72])); await step(p, 6) }
    await strip(p, `s${sg}-motion-hero-react`, hf)
  }
  // miss: weak bot
  await ev(p, () => { BP.Game.debug.autoplay = 0.05 })
  for (let i = 0; i < 12; i++) {
    if (!(await until(p, "s.ph==='result'&&s.turn==='player'", 8000))) break
    const u = await ev(p, () => BP.Game.debug.ui("state"))
    if (u && u.missX) { await step(p, 4); await shot(p, `s${sg}-miss`); break }
    await until(p, "s.ph!=='result'", 400)
  }
  // speech box
  await ev(p, () => { BP.Game.debug.autoplay = false; BP.Game.debug.ui("say", "make") })
  await step(p, 1); await shot(p, `s${sg}-speech`)
  await p.close()
}
// clear screens per stage + game over
for (const sg of [0, 2, 4]) {
  const p = await open("?debug&fast&seed=4")
  await ev(p, (sg) => { const d = BP.Game.debug; d.startAt(sg, 0, 0); d.setCups(1, 1); d.autoplay = 0.99; for (let i = 0; i < 60 * 900 && d.state !== "clear"; i++) d.step(1); d.autoplay = false }, sg)
  await step(p, 120); await shot(p, `clear-s${sg}`)
  await p.close()
}
// demo attract mid flight
{
  const p = await open("?debug&fast&seed=4")
  await ev(p, () => BP.Game.debug.go("demo"))
  await until(p, "s.ph==='flight'"); await step(p, 10); await shot(p, "demo-flight")
  await p.close()
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors", "->", OUT)
await browser.close()
