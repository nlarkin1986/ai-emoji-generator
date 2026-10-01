import { chromium, devices, DEV, pshot, cshot, hookErrors, dbg, sleep } from "./judge3-lib.mjs"
const which = process.argv[2] || "iPhone 13", land = process.argv[3] === "land"
const tag = (which + (land ? "-L" : "")).replace(/\W+/g, "_")
const b = await chromium.launch()
let dev = devices[which + (land ? " landscape" : "")] || devices[which]
const ctx = await b.newContext({ ...dev, hasTouch: true, isMobile: true })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV); await sleep(1200)
await pshot(page, `m-${tag}-1title`)
const geo = await page.evaluate(() => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display === "none" ? "hidden" : [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  return { vp: [innerWidth, innerHeight], screen: q("#screen"), A: q("#sA"), B: q("#sB"), st: q("#pSt"), sel: q("#pSel"), dpad: q("#dpad"), top: q("#top"), mute: q("#bMute"), docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, dev: BP.Input.device && BP.Input.device() }
})
console.log(tag, JSON.stringify(geo))
const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, l: r.x, t: r.y } }, sel)
const tapEl = async (sel) => { const r = await box(sel); await page.touchscreen.tap(r.x, r.y) }
const tapGame = async (gx, gy) => { const r = await box("#screen"); const s = Math.min(r.w / 256, r.h / 240); await page.touchscreen.tap(r.x + (gx + 0.5 - 128) * s, r.y + (gy + 0.5 - 120) * s) }
// title: tap on 1 PLAYER row (cursor already there) -> confirm
await tapGame(120, 110); await sleep(500)
let d = await dbg(page)
console.log("after first tap:", d.state, JSON.stringify(await page.evaluate(() => BP.Audio._state())))
await pshot(page, `m-${tag}-2vs`)
for (let i = 0; i < 30 && (await dbg(page)).state !== "match"; i++) { await tapGame(128, 200); await sleep(300) }
for (let i = 0; i < 60; i++) { d = await dbg(page); if (d.phase === "aim" && d.turn === "player") break; await sleep(100) }
await sleep(300); await pshot(page, `m-${tag}-3aim`)
// throw using canvas taps (A) twice, then using the A button
for (let k = 0; k < 4; k++) {
  for (let i = 0; i < 150; i++) { d = await dbg(page); if (d.phase === "aim" && d.turn === "player") break; await sleep(100) }
  if (k % 2) { await sleep(400 + Math.random() * 600); await tapGame(128, 150); await sleep(250 + Math.random() * 500); await tapGame(128, 150) }
  else { await sleep(400 + Math.random() * 600); await tapEl("#sA"); await sleep(250 + Math.random() * 500); await tapEl("#sA") }
  await sleep(500)
  if (k === 0) await pshot(page, `m-${tag}-4flight`)
}
console.log("after throws", JSON.stringify(await dbg(page)))
await tapEl("#pSt"); await sleep(400); await pshot(page, `m-${tag}-5pause`)
console.log("paused?", (await dbg(page)).paused)
await tapGame(110, 128); await sleep(400) // move to QUIT
await tapGame(110, 128); await sleep(400) // confirm QUIT -> yes/no (default NO)
await cshot(page, `m-${tag}-5quit`)
await tapGame(76 + 18, 130); await sleep(300); await tapGame(76 + 18, 130); await sleep(1200)
console.log("after quit", (await dbg(page)).state)
for (let i = 0; i < 30 && (await dbg(page)).state !== "gameover"; i++) await sleep(200)
await sleep(1000); await pshot(page, `m-${tag}-6gameover`)
await tapGame(128, 120); await sleep(1200)
console.log("after gameover tap", (await dbg(page)).state)
await pshot(page, `m-${tag}-7entry`)
const GRID = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ0123", "456789.-! "]
for (const ch of "MOB" + which.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "")) { for (let r = 0; r < 4; r++) { const c = GRID[r].indexOf(ch); if (c >= 0) { await tapGame(28 + c * 20 + 4, 104 + r * 18 + 4); await sleep(150) } } }
await pshot(page, `m-${tag}-8typed`)
await tapGame(28 + 124 + 8, 104 + 72 + 4); await sleep(500) // END -> confirm
await pshot(page, `m-${tag}-9confirm`)
await tapGame(76 + 16 + 18 + 4, 148); await sleep(400) // YES
await tapGame(76 + 16 + 18 + 4, 148); await sleep(2500)
await pshot(page, `m-${tag}-10board`)
console.log("final", (await dbg(page)).state, JSON.stringify(await page.evaluate(() => BP.Scores.status ? BP.Scores.status() : null)))
console.log("errors", errs)
await b.close()
