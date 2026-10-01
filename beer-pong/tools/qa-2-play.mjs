// Phase 2: genuine touch-only first match on iPhone 13 portrait, human-ish timing
import { chromium, open, shot, st, tapNes, btn, sleep, dev } from "./qa-lib.mjs"
await dev("/__dev/reset")
const browser = await chromium.launch()
const { ctx, page, logs } = await open(browser, process.argv[2] || "iphone13")
const tag = process.argv[2] || "iphone13"
const T0 = Date.now(), el = () => ((Date.now() - T0) / 1000).toFixed(1)
await sleep(1500)
await tapNes(page, 120, 112) // tap "1 PLAYER"
await sleep(2500); await shot(page, `p2-${tag}-vs`)
console.log(el(), await st(page))
let shots = 0, lastPhase = "", taps = 0, cpuWait = 0, snaps = {}
const rnd = (a, b) => a + Math.random() * (b - a)
while (Date.now() - T0 < 240000) {
  const s = await st(page)
  if (s.state === "vs") { await sleep(500); continue }
  if (s.state !== "match") { console.log(el(), "left match ->", s.state, s.score); break }
  const key = s.turn + ":" + s.phase
  if (key !== lastPhase) { lastPhase = key; if (!snaps[key] || snaps[key] < 2) { snaps[key] = (snaps[key] || 0) + 1; await shot(page, `p2-${tag}-${s.turn}-${s.phase}-${snaps[key]}`) } }
  if (s.turn === "cpu") { cpuWait += 200; await sleep(200); continue }
  if (s.phase === "aim") {
    await sleep(rnd(600, 1800))
    if ((await st(page)).phase !== "aim") continue
    if (taps++ % 2) await btn(page, "a"); else await tapNes(page, 128, 180) // tap on canvas or A
    await sleep(rnd(250, 700)) // power bar
    if ((await st(page)).phase === "power") { await btn(page, "a"); shots++ }
    await sleep(300)
  } else await sleep(150)
}
const s = await st(page)
console.log(el(), "throws", shots, "cpuWait(s)", cpuWait / 1000, JSON.stringify(s), "logs", logs)
await shot(page, `p2-${tag}-end`)
await ctx.close(); await browser.close()
