import { chromium, FILE } from "./judge-common.mjs"
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(FILE); await page.waitForTimeout(500)
const r = await page.evaluate(async () => {
  const L = BP.Audio._list(), out = {}
  for (const m of L.music) {
    const info = BP.Audio._info(m)
    const buf = await BP.Audio._renderOffline(m, 8)
    const d = buf.getChannelData(0); let pk = 0, ss = 0, clip = 0
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; ss += d[i] * d[i]; if (a >= 0.999) clip++ }
    out[m] = { bpm: info.bpm, bars: info.bars, loopSec: +info.loopSec.toFixed(1), loop: info.loop, warn: info.warn && info.warn.length, key: info.key, peak: +pk.toFixed(2), rms: +Math.sqrt(ss / d.length).toFixed(3), clip }
  }
  const sf = {}
  for (const s of L.sfx) { const buf = await BP.Audio._renderOffline('sfx:' + s, 2); const d = buf.getChannelData(0); let pk = 0, last = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; if (a > 0.01) last = i } sf[s] = [+pk.toFixed(2), +(last / 44100).toFixed(2)] }
  return { out, sf, sfxCount: L.sfx.length }
})
console.log(JSON.stringify(r.out, null, 0).replace(/},/g, "},\n"))
console.log(JSON.stringify(r.sf))
await browser.close()
