// Frame-rate independence test: runs the real rAF loop at simulated 30/60/144/240 Hz displays with the
// autoplay bot and the same seed; checks tick rate ≈ 60/s and identical gameplay (shot logs).
// node beer-pong/tools/game-fps.mjs [--secs 25]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const secs = +(args[args.indexOf("--secs") + 1] || 25) || 25
const url = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?seed=42&fast"
const browser = await chromium.launch()
const results = {}
await Promise.all([30, 60, 144, 240].map(async (hz) => {
  const page = await (await browser.newContext()).newPage()
  const errs = []
  page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) })
  await page.addInitScript((hz) => {
    // virtual display clock: rAF fires at exactly `hz`, timestamps advance by 1000/hz (with tiny jitter)
    let t = 0; const q = []
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length }
    window.__hz = hz
    setInterval(() => { const cbs = q.splice(0); t += 1000 / hz + (Math.random() - 0.5) * 0.3; for (const cb of cbs) cb(t) }, 1000 / hz)
    window.__vt = () => t
  }, hz)
  await page.goto(url)
  await page.waitForTimeout(300)
  await page.evaluate(() => { BP.Game.debug.autoplay = 0.9 })
  await page.waitForTimeout(secs * 1000)
  const r = await page.evaluate(() => ({ ticks: BP.Game.debug.ticks, vt: window.__vt(), log: BP.Game.debug.shotLog, state: BP.Game.debug.state, score: BP.Game.debug.score }))
  results[hz] = { ...r, errs }
}))
const base = JSON.stringify(results[60].log.slice(0, 6))
for (const hz of [30, 60, 144, 240]) {
  const r = results[hz]
  const rate = (r.ticks / (r.vt / 1000)).toFixed(2)
  const n = Math.min(r.log.length, results[60].log.length, 6)
  const same = JSON.stringify(r.log.slice(0, n)) === JSON.stringify(results[60].log.slice(0, n))
  console.log(`${hz} Hz: ticks/s=${rate}  shots=${r.log.length}  state=${r.state} score=${r.score}  first ${n} shots identical to 60Hz: ${same}  errors=${r.errs.length}`)
}
void base
await browser.close()
