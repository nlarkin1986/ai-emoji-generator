import { chromium, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(FILE + "?seed=2"); await page.waitForTimeout(500)
const r = await page.evaluate(() => {
  const pal = new Set(Object.values(BP.Art.PAL).map(c => c.toUpperCase()))
  const cv = document.getElementById('screen'), x = cv.getContext('2d')
  const bad = {}, all = new Set()
  const per=[]; const grab = () => { const fr=new Set(); const d = x.getImageData(0, 0, 256, 240).data; for (let i = 0; i < d.length; i += 4) { const h = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(); all.add(h); fr.add(h); if (!pal.has(h)) bad[h] = (bad[h] || 0) + 1 }; per.push(fr.size) }
  const dbg = BP.Game.debug
  grab()
  for (let s = 0; s < 5; s++) { dbg.startAt(s, 0, 0); dbg.autoplay = 0.97; for (let k = 0; k < 8; k++) { dbg.step(37); dbg.render(); grab() } }
  dbg.go('title'); dbg.step(5); dbg.go('scores'); dbg.step(5); dbg.render(); grab()
  // fade frame
  dbg.go('title'); dbg.press('a'); dbg.step(3); dbg.render(); grab()
  return { per, palSize: pal.size, distinct: all.size, badCount: Object.keys(bad).length, bad: Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, 10) }
})
console.log(JSON.stringify(r))
await browser.close()
