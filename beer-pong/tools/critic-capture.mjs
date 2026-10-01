// Critic capture: deterministic frame-by-frame screenshots of every screen/state at 3x.
// usage: node beer-pong/tools/critic-capture.mjs
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const OUT = "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/critic"
fs.mkdirSync(OUT, { recursive: true })
const FILE = "file:///home/user/ai-emoji-generator/public/beerpong/index.html"

const browser = await chromium.launch()
const errors = []
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
  await page.goto(FILE + q)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
  // freeze the RAF-driven loop: we step manually
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  await page.waitForTimeout(100)
  return page
}
// step n ticks (optionally pressing a button on the first), render, save at 3x
async function shot(page, name, n = 0, press = null) {
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
const step = (page, n, press) => page.evaluate(([n, press]) => { const d = BP.Game.debug; if (press) d.press(press); d.step(n) }, [n, press])
const st = (page) => page.evaluate(() => { const d = BP.Game.debug; return { s: d.state, ph: d.phase, cups: d.cups, turn: d.turn, score: d.score, streak: d.streak, buzz: d.buzz, red: d.redemption, ot: d.overtime } })
async function until(page, fn, max = 3000) {
  for (let i = 0; i < max; i++) {
    const s = await st(page)
    if (fn(s)) return s
    await step(page, 1)
  }
  return st(page)
}

// ---------- title, attract, howto
let p = await open("?debug&seed=7")
await shot(p, "a01-title", 30)
await shot(p, "a02-title-ball", 50)
await shot(p, "a03-title-splash", 20)
// attract -> scores -> demo
await step(p, 1250)
await shot(p, "a04-attract-scores", 10)
await step(p, 500)
await shot(p, "a05-demo-start", 60)
await until(p, (s) => s.ph === "flight")
await shot(p, "a06-demo-flight", 20)
await p.close()

p = await open("?debug&seed=7")
await step(p, 20)
await step(p, 1, "down"); await step(p, 1, "down"); await step(p, 1, "a")
await step(p, 40)
for (let i = 0; i < 4; i++) { await shot(p, "b0" + i + "-howto", 30); await step(p, 1, "a") }
await p.close()

// ---------- VS card + full match flow with seeded autoplay off (manual timing)
p = await open("?debug&seed=11")
await step(p, 20); await step(p, 1, "a"); await step(p, 20)
await shot(p, "c01-vs-slide", 20)
await shot(p, "c02-vs-taunt", 100)
await shot(p, "c03-vs-go", 100)
await until(p, (s) => s.s === "match")
await shot(p, "c04-ready", 10)
await shot(p, "c05-go", 30)
await until(p, (s) => s.ph === "banner")
await shot(p, "c06-yourturn", 10)
await until(p, (s) => s.ph === "aim")
await shot(p, "c07-aim", 20)
await shot(p, "c08-aim2", 17)
await step(p, 1, "a")
await shot(p, "c09-power", 12)
await shot(p, "c10-power2", 9)
// use the bot's planner for a good throw
await p.evaluate(() => { BP.Game.debug.autoplay = 0.97 })
await until(p, (s) => s.ph === "throw")
await shot(p, "c11-throw", 2)
await until(p, (s) => s.ph === "flight")
await p.evaluate(() => { BP.Game.debug.autoplay = false })
for (let i = 0; i < 6; i++) await shot(p, "c12-flight-" + i, 8)
await until(p, (s) => s.ph === "result")
await shot(p, "c13-result-0", 0)
await shot(p, "c14-result-3", 3)
await shot(p, "c15-result-10", 7)
await shot(p, "c16-result-25", 15)
await shot(p, "c17-result-45", 20)
console.log("after shot1", await st(p))
await p.evaluate(() => { BP.Game.debug.autoplay = 0.99 })
// keep playing until heating up / on fire
let s = await st(p)
let k = 0
while (k++ < 40) {
  s = await until(p, (q) => q.ph === "result" || q.s !== "match", 4000)
  if (s.s !== "match") break
  if (s.streak === 2) { await shot(p, "d01-heatingup", 4); }
  if (s.streak === 3) { await shot(p, "d02-onfire", 4); break }
  await until(p, (q) => q.ph !== "result", 400)
}
// fire throw
s = await until(p, (q) => q.ph === "flight" && q.turn === "player", 4000)
await shot(p, "d03-fireball-flight", 14)
await shot(p, "d04-fireball-flight2", 10)
console.log("fire", await st(p))
await p.close()

// ---------- CPU turn, drink anim, balls back, re-rack
p = await open("?debug&seed=21")
await p.evaluate(() => BP.Game.debug.startAt(0, 0, 0))
await p.evaluate(() => { BP.Game.debug.autoplay = 0.2 })
s = await until(p, (q) => q.turn === "cpu" && q.ph === "banner", 4000)
await shot(p, "e01-cpu-banner", 6)
await until(p, (q) => q.ph === "aim")
await shot(p, "e02-cpu-aim", 10)
await until(p, (q) => q.ph === "flight")
await shot(p, "e03-cpu-flight", 18)
// fish for a CPU make -> drink
for (let i = 0; i < 30; i++) {
  s = await until(p, (q) => q.ph === "result", 3000)
  const cups = s.cups
  if (s.turn === "cpu" && cups[0] < 6) { await shot(p, "e04-cpu-sink", 2); await shot(p, "e05-drink", 26); await shot(p, "e06-drink2", 14); break }
  await until(p, (q) => q.ph !== "result", 400)
}
console.log("cpu", await st(p))
await p.close()

// balls back + rerack via skilled autoplay
p = await open("?debug&seed=5")
await p.evaluate(() => { BP.Game.debug.startAt(1, 0, 0); BP.Game.debug.autoplay = 1 })
let gotBB = false, gotRR = false
for (let i = 0; i < 60 && !(gotBB && gotRR); i++) {
  s = await until(p, (q) => q.ph === "result" || q.ph === "banner" || q.s !== "match", 4000)
  if (s.s !== "match") break
  const calls = await p.evaluate(() => 0)
  if (s.ph === "result") {
    const txt = await p.evaluate(() => { try { return JSON.stringify(BP.Game.debug.notes) } catch (e) { return "" } })
    void txt
  }
  // inspect callouts by peeking the canvas is hard; instead shoot every result of the hero
  if (s.ph === "result" && s.turn === "player") { await shot(p, "f-res-" + String(i).padStart(2, "0"), 6) }
  if (s.ph === "banner" && s.cups[1] <= 3 && !gotRR) { await shot(p, "f-rerack-banner", 2); gotRR = true }
  await until(p, (q) => q.ph !== s.ph, 400)
}
console.log("bb", await st(p))
await p.close()

// ---------- redemption + overtime + game over
p = await open("?debug&seed=3")
await p.evaluate(() => { BP.Game.debug.startAt(0, 0, 3) })
await until(p, (q) => q.ph === "aim")
await p.evaluate(() => { BP.Game.debug.setCups(0, 1); BP.Game.debug.setCups(1, 2); BP.Game.debug.autoplay = 0 })
// miss deliberately until CPU turn and hope CPU sinks; force by many retries
for (let i = 0; i < 60; i++) {
  s = await until(p, (q) => q.red || q.s !== "match" || q.ph === "end", 600)
  if (s.red || s.s !== "match" || s.ph === "end") break
}
s = await st(p)
console.log("red?", s)
if (s.red) {
  await shot(p, "g01-redemption-callout", 4)
  await until(p, (q) => q.ph === "banner")
  await shot(p, "g02-redemption-banner", 8)
  await until(p, (q) => q.ph === "aim")
  await shot(p, "g03-redemption-aim", 10)
}
await p.close()

// overtime via direct: hero in redemption sinking
p = await open("?debug&seed=4")
await p.evaluate(() => { BP.Game.debug.startAt(0, 0, 0) })
await until(p, (q) => q.ph === "aim")
await p.evaluate(() => { BP.Game.debug.setCups(0, 1); BP.Game.debug.autoplay = 0 })
for (let i = 0; i < 80; i++) { s = await until(p, (q) => q.red || q.s !== "match", 500); if (s.red || s.s !== "match") break }
if (s.red) {
  await p.evaluate(() => { BP.Game.debug.setCups(1, 1); BP.Game.debug.autoplay = 1 })
  for (let i = 0; i < 20; i++) { s = await until(p, (q) => q.ot || q.s !== "match", 500); if (s.ot || s.s !== "match") break }
  if (s.ot) { await shot(p, "g04-overtime-callout", 6); await until(p, (q) => q.ph === "banner"); await shot(p, "g05-overtime-banner", 8); await until(p, (q) => q.ph === "aim"); await shot(p, "g06-overtime-aim", 10) }
}
console.log("ot", await st(p))
await p.close()

// ---------- all stages + round 2 (aim frame + backdrop)
for (const [stg, loop] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [2, 1], [3, 1]]) {
  p = await open("?debug&seed=9")
  await p.evaluate(([a, b]) => BP.Game.debug.startAt(a, b, 2), [stg, loop])
  await until(p, (q) => q.ph === "aim")
  await shot(p, `h-stage${stg}-r${loop + 1}-aim`, 25)
  await p.evaluate(() => { BP.Game.debug.autoplay = 0.97 })
  await until(p, (q) => q.ph === "flight")
  await shot(p, `h-stage${stg}-r${loop + 1}-flight`, 22)
  await p.close()
}
// VS cards for stage 4 & round 2
p = await open("?debug&seed=9")
await p.evaluate(() => { BP.Game.debug.startAt(4, 0, 0); BP.Game.debug.go("vs", { stage: 4 }) })
await shot(p, "h-vs-stage5", 160)
await p.close()

// ---------- stage clear tally
p = await open("?debug&seed=12")
await p.evaluate(() => { BP.Game.debug.startAt(0, 0, 0) })
await until(p, (q) => q.ph === "aim")
await p.evaluate(() => { BP.Game.debug.setCups(1, 1); BP.Game.debug.autoplay = 1 })
await until(p, (q) => q.ph === "end", 4000)
await shot(p, "i01-win-end", 30)
await until(p, (q) => q.s === "clear", 600)
await p.evaluate(() => { BP.Game.debug.autoplay = false })
await shot(p, "i02-clear-tally", 90)
await shot(p, "i03-clear-done", 250)
await p.close()

// ---------- game over, name entry, YES/NO, board
p = await open("?debug&seed=13")
await p.evaluate(() => { BP.Game.debug.startAt(2, 0, 4) })
await until(p, (q) => q.ph === "aim")
await p.evaluate(() => { BP.Game.debug.go("gameover", {}) })
await shot(p, "j01-gameover", 10)
await shot(p, "j02-gameover2", 60)
await p.evaluate(() => { BP.Game.debug.go("entry", {}) })
await step(p, 40)
for (const b of ["a", "right", "right", "a", "down", "a"]) await step(p, 2, b)
await shot(p, "j03-entry", 10)
await step(p, 2, "start")
await shot(p, "j04-entry-yesno", 14)
await step(p, 2, "a")
await shot(p, "j05-sending", 3)
await until(p, (q) => q.s === "scores", 900)
await shot(p, "j06-board", 30)
await p.close()

// ---------- ending + credits
p = await open("?debug&seed=14")
await p.evaluate(() => { BP.Game.debug.startAt(4, 1, 0); BP.Game.debug.go("ending", {}) })
await shot(p, "k01-ending", 200)
await step(p, 240)
await shot(p, "k02-credits", 200)
await shot(p, "k03-credits2", 300)
await step(p, 1, "a")
await shot(p, "k04-theend", 60)
await p.close()

// ---------- pause
p = await open("?debug&seed=15")
await p.evaluate(() => { BP.Game.debug.startAt(3, 0, 0) })
await until(p, (q) => q.ph === "aim")
await step(p, 1, "start")
await shot(p, "l01-pause", 20)
await step(p, 1, "down"); await step(p, 1, "a")
await shot(p, "l02-quit-yesno", 20)
await p.close()

// ---------- TV mode
p = await open("?tv&debug")
await shot(p, "m01-tv", 60)
await p.close()

// ---------- fade mid-frame
p = await open("?debug&seed=7")
await step(p, 20); await step(p, 1, "a")
await shot(p, "n01-fade-out-1", 4)
await shot(p, "n02-fade-out-2", 3)
await shot(p, "n03-fade-out-3", 3)
await p.close()

console.log("errors", errors)
await browser.close()
