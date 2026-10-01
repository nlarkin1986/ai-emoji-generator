// Per-stage balance probe: plays N matches at each stage with the autoplay bot at a given skill.
// node beer-pong/tools/game-balance.mjs --skill 0.6 --n 12 [--buzz 0] [--loop 0]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const skill = +opt("--skill", 0.6), N = +opt("--n", 10), buzz = +opt("--buzz", 0), loop = +opt("--loop", 0)
const url = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?debug&seed=" + opt("--seed", "7")
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const errs = []
page.on("pageerror", (e) => errs.push(e.message))
await page.goto(url); await page.waitForTimeout(500)
for (let st = 0; st < 5; st++) {
  let wins = 0, ticks = 0, sh = 0, mk = 0, cs = 0, cm = 0, red = 0
  for (let i = 0; i < N; i++) {
    const r = await page.evaluate(([st, skill, buzz, loop]) => {
      const g = BP.Game.debug; g.autoplay = skill; g.startAt(st, loop, buzz)
      const t0 = g.ticks; let sawRed = false
      while (g.state === 'match' && g.ticks - t0 < 60 * 60 * 15) { g.step(30); if (g.redemption) sawRed = true }
      const res = { state: g.state, ticks: g.ticks - t0, shots: g.shots, makes: g.makes, cs: g.cpuShotsN, cm: g.cpuMakesN, red: sawRed }
      g.autoplay = false
      return res
    }, [st, skill, buzz, loop])
    if (r.state === 'clear') wins++
    ticks += r.ticks; sh += r.shots; mk += r.makes; cs += r.cs; cm += r.cm; red += r.red ? 1 : 0
  }
  console.log(`stage ${st}: win ${wins}/${N}  avg match ${(ticks / N / 60).toFixed(0)}s  player acc ${Math.round(100 * mk / sh)}%  cpu acc ${Math.round(100 * cm / cs)}%  redemptions ${red}`)
}
console.log(errs.length ? errs.join("\n") : "no errors")
await browser.close()
