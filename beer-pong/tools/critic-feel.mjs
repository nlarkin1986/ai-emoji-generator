// Critic pass 2: redemption/overtime/bounce captures + pacing/difficulty metrics from simulated runs.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const OUT = "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/critic"
const FILE = "file:///home/user/ai-emoji-generator/public/beerpong/index.html"
const browser = await chromium.launch()
async function open(q) {
  const page = await browser.newPage()
  await page.goto(FILE + q)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  return page
}
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
// run in-page until predicate (string fn of d) true
const until = (page, pred, max = 20000) => page.evaluate(([pred, max]) => {
  const d = BP.Game.debug, f = new Function("d", "return " + pred)
  for (let i = 0; i < max; i++) { if (f(d)) return { ok: true, i, s: d.state, ph: d.phase, cups: d.cups } ; d.step(1) }
  return { ok: false, s: d.state, ph: d.phase, cups: d.cups }
}, [pred, max])

// ---- redemption: hero has 1 cup, bad shooter -> CPU eventually sinks it
let p = await open("?debug&seed=31")
await p.evaluate(() => { BP.Game.debug.startAt(4, 0, 0); BP.Game.debug.autoplay = 0.01 })
await until(p, "d.phase==='aim'")
await p.evaluate(() => { BP.Game.debug.setCups(0, 1) })
let r = await until(p, "d.redemption || d.state!=='match'", 60000)
console.log("redemption", r)
if (r.ok) {
  await shot(p, "g01-redemption-callout", 3)
  await shot(p, "g01b-redemption-callout", 30)
  await until(p, "d.phase==='banner'")
  await shot(p, "g02-redemption-banner", 10)
  await p.evaluate(() => { BP.Game.debug.setCups(1, 1); BP.Game.debug.autoplay = 1 })
  r = await until(p, "d.overtime || d.state!=='match'", 4000)
  console.log("ot", r)
  await shot(p, "g04-overtime-callout", 4)
  await until(p, "d.phase==='banner'")
  await shot(p, "g05-overtime-banner", 10)
  await until(p, "d.phase==='aim'")
  await shot(p, "g06-overtime-aim", 20)
}
await p.close()

// ---- bounce shot
p = await open("?debug&seed=8")
await p.evaluate(() => { BP.Game.debug.startAt(0, 0, 0) })
await until(p, "d.phase==='aim'")
await shot(p, "o01-bounce-toggle", 10, "b")
await p.evaluate(() => { BP.Game.debug.autoplay = 1 })
await until(p, "d.phase==='flight'")
for (let i = 0; i < 5; i++) await shot(p, "o02-bounce-flight-" + i, 10)
await until(p, "d.phase==='result'")
await shot(p, "o03-bounce-result", 8)
await p.close()

// ---- pacing + difficulty: full runs at several skill levels, phase time accounting
const res = []
for (const skill of [0.35, 0.6, 0.8, 0.95]) {
  for (const seed of [1, 2, 3]) {
    p = await open(`?debug&seed=${seed}`)
    const out = await p.evaluate((skill) => {
      const d = BP.Game.debug
      d.autoplay = skill
      d.press("a"); d.step(2)
      const ph = {}, st = {}
      let t = 0, maxStage = 0, matches = 0, prevState = "", humanShots = 0, cpuShots = 0
      while (t < 60 * 60 * 25) {
        d.step(1); t++
        const s = d.state
        st[s] = (st[s] || 0) + 1
        if (s === "match") { const k = d.turn + ":" + d.phase; ph[k] = (ph[k] || 0) + 1 }
        if (s !== prevState && s === "match") matches++
        maxStage = Math.max(maxStage, d.stage + (d.round - 1) * 5)
        prevState = s
        if (s === "entry" || s === "ending") break
      }
      return { skill, ticks: t, min: +(t / 3600).toFixed(1), score: d.score, stageReached: maxStage + 1, matches, shots: d.shots, makes: d.makes, cpuShots: d.cpuShotsN, cpuMakes: d.cpuMakesN, st, ph }
    }, skill)
    res.push(out)
    await p.close()
  }
}
for (const o of res) {
  const ph = o.ph, sum = (pre) => Object.keys(ph).filter((k) => k.startsWith(pre)).reduce((a, k) => a + ph[k], 0)
  const human = sum("player:"), cpu = sum("cpu:")
  console.log(`skill ${o.skill} min ${o.min} score ${o.score} reached ${o.stageReached} acc ${o.shots ? Math.round(100 * o.makes / o.shots) : 0}% (${o.makes}/${o.shots}) cpu ${o.cpuShots ? Math.round(100 * o.cpuMakes / o.cpuShots) : 0}% | match ${(o.st.match / 60).toFixed(0)}s vs ${(o.st.vs / 60 || 0).toFixed(0)}s clear ${((o.st.clear || 0) / 60).toFixed(0)}s | player-turn ${(human / 60).toFixed(0)}s (aim ${((ph["player:aim"] || 0) / 60).toFixed(0)} pow ${((ph["player:power"] || 0) / 60).toFixed(0)} flight ${((ph["player:flight"] || 0) / 60).toFixed(0)} result ${((ph["player:result"] || 0) / 60).toFixed(0)} banner ${((ph["player:banner"] || 0) / 60).toFixed(0)}) cpu-turn ${(cpu / 60).toFixed(0)}s`)
}
fs.writeFileSync(join(OUT, "feel.json"), JSON.stringify(res, null, 1))
await browser.close()
