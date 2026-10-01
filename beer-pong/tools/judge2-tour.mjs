import { chromium, DEV, cshot, pshot, hookErrors, dbg, key, sleep, OUT } from "./judge2-lib.mjs"
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV); await sleep(1500)
await pshot(page, "t01-title-page"); await cshot(page, "t01-title")
console.log(await dbg(page))
// first press: does Z on title start immediately?
await key(page, "ArrowDown"); await sleep(200); await key(page, "ArrowDown"); await sleep(200)
await key(page, "z"); await sleep(1200); await cshot(page, "t02-howto"); console.log("howto", (await dbg(page)).state)
for (let i = 0; i < 3; i++) { await key(page, "ArrowRight"); await sleep(500); await cshot(page, "t02-howto-p" + (i + 2)) }
await key(page, "Enter"); await sleep(1200); console.log("after howto start", (await dbg(page)).state)
await key(page, "ArrowDown"); await sleep(200); await key(page, "z"); await sleep(1500); await cshot(page, "t03-scores"); console.log("scores?", (await dbg(page)).state)
await key(page, "z"); await sleep(1200); console.log("after scores", (await dbg(page)).state)
// start game
await key(page, "ArrowUp"); await key(page, "ArrowUp"); await sleep(200)
let st = await dbg(page); console.log("title cursor?", st.state)
await key(page, "Enter"); await sleep(900); await cshot(page, "t04-vs"); console.log((await dbg(page)).state)
await key(page, "z"); await sleep(1500)
let n = 0, shots = 0
const t0 = Date.now()
while (Date.now() - t0 < 150000) {
  const d = await dbg(page)
  if (d.state !== "match") { console.log("state", d.state, d.score); await cshot(page, "t-state-" + d.state + "-" + (n++)); if (d.state === "gameover" || d.state === "entry") break; await key(page, "z"); await sleep(1500); continue }
  if (d.turn === "player" && d.phase === "aim") {
    await sleep(300 + Math.random() * 900)
    if (shots === 1) await cshot(page, "t05-aim")
    await key(page, "z"); await sleep(250 + Math.random() * 600)
    if (shots === 1) await cshot(page, "t06-power")
    await key(page, "z"); shots++
    await sleep(350); if (shots === 2) await cshot(page, "t07-flight")
    await sleep(500); if (shots === 2) await cshot(page, "t08-flight2")
  } else { await sleep(200); if (d.turn === "cpu" && Math.random() < 0.03) await cshot(page, "t09-cpu-" + shots) }
}
const d = await dbg(page); console.log("end", d, "shots", shots)
await cshot(page, "t10-end")
console.log(errs.join("\n") || "no errors")
await b.close()
