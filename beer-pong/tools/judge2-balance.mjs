import { chromium, FILE, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch()
for (const skill of [0.3, 0.5, 0.7, 0.85]) {
  const res = []
  for (let r = 0; r < 4; r++) {
    const page = await (await b.newContext()).newPage()
    await page.goto(FILE + "?debug&seed=" + (r * 31 + Math.round(skill * 100))); await sleep(400)
    const out = await page.evaluate((skill) => {
      const d = BP.Game.debug; d.startAt(0, 0, 0); d.autoplay = skill
      let t = 0, stageT = {}, lastStage = -1
      while (t < 60 * 60 * 60) { d.step(60); t += 60; const s = d.round * 10 + d.stage; if (d.state === "match" && s !== lastStage) { stageT[s] = t; lastStage = s } if (d.state === "gameover" || d.state === "entry" || d.state === "ending") break }
      return { state: d.state, round: d.round, stage: d.stage + 1, score: d.score, shots: d.shots, makes: d.makes, cpuAcc: d.cpuAcc, mins: +(t / 3600).toFixed(1), stageT }
    }, skill)
    res.push(out); await page.close()
  }
  console.log("skill", skill, res.map((o) => `R${o.round}S${o.stage} ${o.score}pts ${o.makes}/${o.shots} cpu${o.cpuAcc}% ${o.mins}min`).join(" | "))
}
await b.close()
