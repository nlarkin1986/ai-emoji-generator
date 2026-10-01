import { chromium, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const res = []
for (const skill of [0.3, 0.6, 0.8, 0.9, 0.97]) {
  for (let g = 0; g < 4; g++) {
    const page = await browser.newPage()
    await page.goto(FILE + "?seed=" + (g * 7 + 1))
    await page.waitForTimeout(300)
    const r = await page.evaluate(async (skill) => {
      const d = BP.Game.debug
      d.autoplay = skill
      let maxStage = 0, maxRound = 1, t0 = d.ticks, sawMatch = false, info = null
      for (let i = 0; i < 400; i++) {
        d.step(300)
        await new Promise(r => setTimeout(r, 0))
        if (d.state === 'match') sawMatch = true
        if (d.state === 'match' || d.state === 'clear') { maxStage = Math.max(maxStage, d.stage + (d.round - 1) * 5) }
        if (d.state === 'gameover' && !info) info = { score: d.score, stage: d.stage, round: d.round, shots: d.shots, makes: d.makes, cpuAcc: d.cpuAcc, ticks: d.ticks - t0 }
        if (info && (d.state === 'title' || d.state === 'scores')) break
      }
      return info || { stuck: d.state, phase: d.phase, score: d.score, stage: d.stage, round: d.round, makes: d.makes, shots: d.shots, ticks: d.ticks - t0, errors: d.errors }
    }, skill)
    res.push({ skill, ...r })
    console.log(JSON.stringify({ skill, ...r }))
    await page.close()
  }
}
await browser.close()
