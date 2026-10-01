// UI capture: deterministic 3x screenshots of every screen / in-match UI state + phone page shots.
// node beer-pong/tools/ui-capture.mjs <outDir>          (run `node beer-pong/build.mjs` first)
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] || "/tmp/ui"
const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null
fs.mkdirSync(OUT, { recursive: true })
const FILE = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const browser = await chromium.launch()
const errors = []
async function open(q, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 900, height: 900 } })
  const page = await ctx.newPage()
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
  await page.goto(FILE + q)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  await page.waitForTimeout(80)
  return page
}
async function shot(page, name, n = 0, press = null) {
  if (ONLY && !ONLY.test(name)) { if (n || press) await step(page, n, press); return }
  const data = await page.evaluate(([n, press]) => {
    const d = BP.Game.debug
    if (press) d.press(press)
    if (n) d.step(n)
    d.render()
    const c = document.getElementById("screen"), o = document.createElement("canvas")
    o.width = 768; o.height = 720
    const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720)
    return o.toDataURL()
  }, [n, press])
  fs.writeFileSync(join(OUT, name + ".png"), Buffer.from(data.split(",")[1], "base64"))
}
const step = (page, n, press) => page.evaluate(([n, press]) => { const d = BP.Game.debug; if (press) d.press(press); if (n) d.step(n) }, [n, press])
const st = (page) => page.evaluate(() => { const d = BP.Game.debug; return { s: d.state, ph: d.phase, turn: d.turn, streak: d.streak } })
async function until(page, fn, max = 4000) {
  for (let i = 0; i < max; i++) { const s = await st(page); if (fn(s)) return s; await step(page, 1) }
  return st(page)
}
const ev = (page, fn, arg) => page.evaluate(fn, arg)

// ---------- title / howto
let p = await open("?debug&seed=4")
await shot(p, "01-title", 60)
await step(p, 1, "down"); await step(p, 1, "down"); await step(p, 1, "a"); await step(p, 30)
for (let i = 0; i < 4; i++) { await shot(p, "02-howto" + (i + 1), 20); await step(p, 1, "a"); await step(p, 2) }
await p.close()

// ---------- vs card
p = await open("?debug&seed=4")
await ev(p, () => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.go("vs", { stage: 0 }) })
await shot(p, "03-vs-taunt", 150)
await shot(p, "03-vs-go", 50)
await p.close()

// ---------- match states, stage 0
p = await open("?debug&seed=4")
await ev(p, () => BP.Game.debug.startAt(0, 0, 0))
await shot(p, "10-ready", 20)
await until(p, (s) => s.ph === "banner")
await shot(p, "11-yourturn", 8)
await until(p, (s) => s.ph === "aim")
await shot(p, "12-aim-hint", 30)
await shot(p, "13-aim-bounce", 2, "b")
await step(p, 1, "b"); await step(p, 1)
await step(p, 1, "a")
await shot(p, "14-power", 20)
await ev(p, () => { BP.Game.debug.autoplay = 0.97 })
await until(p, (s) => s.ph === "flight")
await ev(p, () => { BP.Game.debug.autoplay = false })
await shot(p, "15-flight", 14)
await until(p, (s) => s.ph === "result")
await shot(p, "16-result", 4)
await ev(p, () => BP.Game.debug.ui("call", [["SWISH!", "white"], ["HEATING UP!", "orange"], ["ISLAND!", "white"]]))
await ev(p, () => BP.Game.debug.ui("popup", "+150"))
await shot(p, "17-callout-swish", 10)
await ev(p, () => BP.Game.debug.ui("call", [["ON FIRE!", "red"]]))
await shot(p, "18-callout-onfire", 10)
await ev(p, () => BP.Game.debug.ui("call", [["WIDE LEFT!", "lgray"]]))
await shot(p, "19-callout-miss", 10)
// CPU turn
await ev(p, () => { BP.Game.debug.autoplay = 0.5 })
await until(p, (s) => s.turn === "cpu" && s.ph === "aim", 6000)
await ev(p, () => { BP.Game.debug.autoplay = false })
await shot(p, "20-cpu-aim", 20)
await until(p, (s) => s.turn === "cpu" && s.ph === "result", 6000)
await ev(p, () => BP.Game.debug.ui("say", "make"))
await shot(p, "21-speech", 1)
// player aim with chirp
await until(p, (s) => s.turn === "player" && s.ph === "aim", 6000)
await ev(p, () => BP.Game.debug.ui("chirp", "NATE: AIRBALL!"))
await shot(p, "22-aim-chirp", 12)
// miss X: low-skill bot until a missed result
await ev(p, () => { BP.Game.debug.autoplay = 0.1 })
for (let i = 0; i < 12; i++) {
  await until(p, (s) => s.ph === "result" && s.turn === "player", 6000)
  const u = await ev(p, () => BP.Game.debug.ui("state"))
  if (u && u.missX) { await shot(p, "23-miss-x", 6); break }
  await until(p, (s) => s.ph !== "result", 400)
}
await ev(p, () => { BP.Game.debug.autoplay = false })
// pause / quit
await until(p, (s) => s.turn === "player" && s.ph === "aim", 6000)
await step(p, 8)
await shot(p, "24-pause", 12, "start")
await step(p, 1, "down"); await step(p, 2)
await shot(p, "25-quit", 14, "a")
await p.close()

// ---------- each stage's aim (inset over the scenery) + 10-cup HUD + KEGMASTER call
for (let sg = 1; sg < 5; sg++) {
  p = await open("?debug&seed=" + (4 + sg))
  await ev(p, (sg) => BP.Game.debug.startAt(sg, sg === 4 ? 1 : 0, 2), sg)
  await until(p, (s) => s.ph === "aim" && s.turn === "player")
  await shot(p, "3" + sg + "-aim-stage" + sg, 40)
  if (sg === 4) {
    await step(p, 1, "a"); await step(p, 20); await shot(p, "35-power-stage4", 0)
    await ev(p, () => { BP.Game.debug.autoplay = 0.97 })
    await until(p, (s) => s.turn === "cpu" && s.ph === "aim", 6000)
    await shot(p, "36-keg-call", 30)
    await ev(p, () => { BP.Game.debug.autoplay = false })
  }
  await p.close()
}

// ---------- stage clear tally (real timing: the 45 s stage minimum keeps the tally up)
p = await open("?debug&seed=4")
await ev(p, () => { const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = 0.99; for (let i = 0; i < 60 * 900 && d.state !== "clear"; i++) d.step(1); d.autoplay = false })
await shot(p, "40-clear-tally", 90)
await shot(p, "41-clear-done", 330)
await p.close()

// ---------- game over / entry / scores
p = await open("?debug&seed=4")
await ev(p, () => { const d = BP.Game.debug; d.startAt(1, 0, 0); d.go("gameover") })
await shot(p, "50-gameover", 90)
await ev(p, () => BP.Game.debug.go("entry"))
await step(p, 40)
for (const k of ["a", "right", "a", "down", "a"]) { await step(p, 1, k); await step(p, 3) }
await shot(p, "51-entry", 6)
await step(p, 1, "start"); await step(p, 2); await step(p, 1, "start"); await step(p, 3)
await shot(p, "51-entry-end", 3)
await shot(p, "52-entry-confirm", 20, "a")
await ev(p, () => BP.Game.debug.go("scores", { board: true, hlRank: 2, myRank: 2, myName: "ABK", myScore: 12345, label: "LOCAL RANKING",
  preRows: [{ name: "KEGLORD", score: 99999, stage: 4, round: 2 }, { name: "ABK", score: 12345, stage: 2, round: 1 }, { name: "SAL", score: 8800, stage: 1, round: 1 }, { name: "NICK", score: 4200, stage: 0, round: 1 }] }))
await shot(p, "53-scores-board", 140)
await ev(p, () => BP.Game.debug.go("scores", { board: true, hlRank: 0, myRank: 27, myName: "ZED", myScore: 950, label: "GLOBAL RANKING",
  preRows: [{ name: "KEGLORD", score: 99999, stage: 4, round: 2 }, { name: "ABK", score: 12345, stage: 2, round: 1 }] }))
await shot(p, "54-scores-outside", 140)
await p.close()

// ---------- ending
p = await open("?debug&seed=4")
await ev(p, () => { const d = BP.Game.debug; d.startAt(4, 1, 0); d.go("ending") })
await shot(p, "60-ending", 200)
await step(p, 1, "a"); await step(p, 10)
await shot(p, "61-credits", 400)
await step(p, 1, "a"); await step(p, 2)
await shot(p, "62-theend", 80)
await step(p, 1, "a"); await step(p, 2)
await shot(p, "63-gauntlet", 120)
await p.close()

// ---------- demo + attract
p = await open("?debug&seed=4")
await ev(p, () => BP.Game.debug.go("demo"))
await until(p, (s) => s.ph === "aim")
await shot(p, "70-demo", 20)
await p.close()

// ---------- TV
p = await open("?tv&debug&seed=4")
await shot(p, "80-tv", 60)
await p.close()

// ---------- phone (iPhone 13 portrait): full page during aim
if (!ONLY || ONLY.test("90-phone")) {
  p = await open("?debug&seed=4", { ...devices["iPhone 13"], hasTouch: true })
  await ev(p, () => BP.Game.debug.startAt(2, 0, 0))
  await until(p, (s) => s.ph === "aim" && s.turn === "player")
  await step(p, 30); await ev(p, () => BP.Game.debug.render())
  await p.screenshot({ path: join(OUT, "90-phone-aim.png") })
  await step(p, 1, "a"); await step(p, 20); await ev(p, () => BP.Game.debug.render())
  await p.screenshot({ path: join(OUT, "91-phone-power.png") })
  await p.close()
}

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors", "->", OUT)
await browser.close()
