// Game soak test: autoplay bot (with a skill level) plays many runs fast-forwarded via BP.Game.debug.step.
// node beer-pong/tools/game-soak.mjs [--skill 0.6] [--minutes 30] [--seed 1] [--fast]
// Reports per-run stage reached / score / duration (game time), state-stall detection, console errors.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const skill = +opt("--skill", 0.6), minutes = +opt("--minutes", 20), seed = opt("--seed", "1")
const file = join(here, "..", "..", "public", "beerpong", "index.html")
const url = pathToFileURL(file).href + `?seed=${seed}` + (args.includes("--fast") ? "&fast" : "")
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 600, height: 600 } })).newPage()
const errors = []
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push("pageerror " + e.message))
await page.goto(url)
await page.waitForTimeout(800)
await page.evaluate((s) => { BP.Game.debug.autoplay = s; try { localStorage.clear() } catch (e) {} }, skill)
const totalTicks = minutes * 3600
let t = 0, lastKey = "", sameFor = 0, maxStall = 0, stallAt = ""
const runs = []
let cur = null
let prevState = ""
while (t < totalTicks) {
  const d = await page.evaluate(() => { BP.Game.debug.step(120); const g = BP.Game.debug; return { state: g.state, phase: g.phase, score: g.score, stage: g.stage, round: g.round, cups: g.cups, shots: g.shots, makes: g.makes, ticks: g.ticks, buzz: g.buzz, r0: g.runTick0, cpuAcc: g.cpuAcc, errors: g.errors } })
  t += 120
  const key = d.state + "/" + d.phase + "/" + JSON.stringify(d.cups) + "/" + d.score + "/" + d.shots
  if (key === lastKey) { sameFor += 120; if (sameFor > maxStall) { maxStall = sameFor; stallAt = key } } else sameFor = 0
  lastKey = key
  if (d.r0 >= 0 && (!cur || cur.start !== d.r0)) { cur = { start: d.r0, stages: [] }; runs.push(cur) }
  if (cur && d.state === "match") cur.lastStage = d.stage + (d.round - 1) * 5, cur.score = d.score, cur.shots = d.shots, cur.makes = d.makes, cur.cpuAcc = d.cpuAcc
  if (cur && d.state === "gameover" && prevState !== "gameover") { cur.end = d.ticks; cur.score = d.score }
  prevState = d.state
  if (d.errors.length) { errors.push(...d.errors); break }
}
for (const r of runs) {
  const dur = r.end ? ((r.end - r.start) / 60).toFixed(0) + "s" : "(unfinished)"
  console.log(`run: reached stage ${r.lastStage + 1}  score ${r.score}  acc ${r.shots ? Math.round(100 * r.makes / r.shots) : 0}% (${r.makes}/${r.shots})  time ${dur}  cpuAcc ${r.cpuAcc}%`)
}
console.log(`max stall: ${(maxStall / 60).toFixed(1)}s at ${stallAt}`)
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no errors")
await browser.close()
