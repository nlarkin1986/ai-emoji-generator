// Tally the human-side miss reasons (rim vs clean) and make rate at several bot skill levels (stage 1)
import { chromium, FILE, sleep } from "./judge3-lib.mjs"
const b = await chromium.launch()
const page = await (await b.newContext()).newPage()
await page.goto(FILE + "?debug&seed=5"); await sleep(800)
for (const skill of [0.2, 0.35, 0.5, 0.7]) {
  const r = await page.evaluate((skill) => {
    const d = BP.Game.debug; d.autoplay = skill
    const tally = { make: 0, rim: 0, clean: 0 }, seen = new Set(); let games = 0, wins = 0, cpuS = 0, cpuM = 0
    for (let g = 0; g < 6; g++) {
      d.startAt(0, 0, 0); games++
      for (let i = 0; i < 20000 && d.state === "match"; i++) {
        d.step(2)
        for (const s of d.shotLog) { const k = JSON.stringify(s); if (seen.has(k) || !s.res) continue; seen.add(k); if (s.side === 1 || s.who === "cpu") continue; if (/^sink/.test(s.res)) tally.make++; else if (/^miss r[1-9]/.test(s.res)) tally.rim++; else tally.clean++ }
      }
      if (d.state === "clear") wins++
      cpuS += d.cpuShotsN; cpuM += d.cpuMakesN
    }
    return { skill, tally, wins, games, cpuAcc: Math.round(100 * cpuM / Math.max(1, cpuS)), sample: d.shotLog.slice(-2) }
  }, skill)
  console.log(JSON.stringify(r))
}
await b.close()
