import { chromium, devices, DEV, cshot, pshot, hookErrors, dbg, sleep } from "./judge2-lib.mjs"
const mode = process.argv[2] || "desk", secs = +(process.argv[3] || 90), start = process.argv[4] || ""
const b = await chromium.launch()
const ctx = mode === "touch" ? await b.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true }) : await b.newContext({ viewport: { width: 1100, height: 600 } })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV + (start ? "?debug" : "")); await sleep(1000)
if (start) await page.evaluate((s) => { const d = BP.Game.debug; if (s === "match" || s === "pause") d.startAt(1, 0, 0); else if (s === "ending" || s === "clear" || s === "entry" || s === "gameover") { d.startAt(4, 1, 0); d.step(60); d.go(s) } else if (s === "vs") { d.startAt(0, 0, 0); d.go("vs", { stage: 0 }) } else d.go(s, s === "scores" ? { attract: false } : {}) }, start)
const KEYS = ["z", "x", "Enter", "Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "p", "Escape", "Tab", "Backspace", "m", "k", "j"]
const states = {}; let lastState = "", sameFor = 0, maxSame = 0, longest = ""
const t0 = Date.now(); let n = 0
while (Date.now() - t0 < secs * 1000) {
  const r = Math.random()
  if (mode === "touch") {
    const vp = page.viewportSize()
    if (r < 0.5) await page.touchscreen.tap(Math.random() * vp.width, Math.random() * vp.height)
    else { const sel = ["#sA", "#sB", "#pSt", "#pSel", "#dpad", "#screen"][Math.floor(Math.random() * 6)]; const bx = await page.locator(sel).boundingBox().catch(() => null); if (bx) await page.touchscreen.tap(bx.x + Math.random() * bx.width, bx.y + Math.random() * bx.height) }
  } else {
    if (r < 0.8) { const k = KEYS[Math.floor(Math.random() * KEYS.length)]; if (k === "m") continue; await page.keyboard.down(k); await sleep(Math.random() * 80); await page.keyboard.up(k) }
    else { const bx = await page.locator("#screen").boundingBox(); await page.mouse.click(bx.x + Math.random() * bx.width, bx.y + Math.random() * bx.height) }
  }
  await sleep(20 + Math.random() * 120); n++
  if (n % 10 === 0) {
    const d = await dbg(page); const k = d.state + (d.paused ? "(P)" : "")
    states[k] = (states[k] || 0) + 1
    if (k === lastState) { sameFor++; if (sameFor > maxSame) { maxSame = sameFor; longest = k } } else { sameFor = 0; lastState = k }
  }
}
const d = await dbg(page)
const scroll = await page.evaluate(() => [scrollX, scrollY, document.activeElement && document.activeElement.tagName, document.fullscreenElement ? "fs" : ""])
await pshot(page, `mk-${mode}-${start || "free"}`)
console.log(mode, start || "free", "inputs", n, "states", JSON.stringify(states), "longest-same-sample", longest, maxSame, "final", d.state, "score", d.score, "errs", d.errors.length + errs.length, errs.slice(0, 5).join(" | "), "scroll", JSON.stringify(scroll), "notes", d.notes.join(","))
await b.close()
