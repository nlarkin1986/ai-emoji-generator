// End-to-end flow test with real input events (keyboard + touch).
// node beer-pong/tools/game-e2e.mjs
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const base = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const browser = await chromium.launch()
let fails = 0
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++ }
const dbg = (p) => p.evaluate(() => JSON.parse(JSON.stringify(BP.Game.debug)))
async function waitFor(p, fn, ms = 15000, arg) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(100) }
  return false
}
function trackErrors(p) { const e = []; p.on("pageerror", (x) => e.push(x.message)); p.on("console", (m) => { if (m.type() === "error") e.push(m.text()) }); return e }

// ---------- 1. desktop keyboard: attract cycle, start, pause, blur auto-pause
{
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage()
  const errs = trackErrors(page)
  await page.goto(base + "?debug&seed=9&fast")
  ok(await waitFor(page, () => BP.Game.debug.state === "title"), "boots to title")
  ok(await waitFor(page, () => BP.Game.debug.state === "scores", 14000), "idle title -> attract high scores")
  ok(await waitFor(page, () => BP.Game.debug.state === "demo", 9000), "attract scores -> demo play")
  await page.waitForTimeout(2500)
  const d1 = await dbg(page)
  ok(d1.demo && d1.phase, "demo match is running (" + d1.phase + ")")
  await page.keyboard.press("x")
  ok(await waitFor(page, () => BP.Game.debug.state === "title", 3000), "any key in demo -> title")
  await page.waitForTimeout(300)
  await page.keyboard.press("Enter")
  ok(await waitFor(page, () => BP.Game.debug.state === "match" && BP.Game.debug.phase === "aim", 6000), "START -> match aim")
  await page.waitForTimeout(300); await page.keyboard.press("Space"); await page.waitForTimeout(400)
  ok((await dbg(page)).phase === "power", "Space locks aim -> power")
  await page.keyboard.press("Enter"); await page.waitForTimeout(200)
  ok((await dbg(page)).paused, "Enter pauses")
  const ph = (await dbg(page)).phase; await page.waitForTimeout(600)
  ok((await dbg(page)).phase === ph, "paused state frozen")
  await page.keyboard.press("Enter"); await page.waitForTimeout(200)
  ok(!(await dbg(page)).paused, "Enter resumes")
  await page.waitForTimeout(200); await page.keyboard.press("Space")
  ok(await waitFor(page, () => BP.Game.debug.phase === "flight", 2000), "Space locks power -> flight")
  ok(await waitFor(page, () => BP.Game.debug.phase !== "flight", 7000), "ball flight resolves")
  await page.evaluate(() => window.dispatchEvent(new Event("blur")))
  await page.waitForTimeout(200)
  ok((await dbg(page)).paused, "window blur auto-pauses")
  await page.waitForTimeout(300)
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("z"); await page.waitForTimeout(400)
  await page.keyboard.press("z"); await page.waitForTimeout(300)
  ok((await dbg(page)).state === "match" && (await dbg(page)).paused, "QUIT confirm defaults to NO (mash-safe)")
  await page.keyboard.press("z"); await page.waitForTimeout(400)
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("z")
  ok(await waitFor(page, () => BP.Game.debug.state === "gameover", 3000), "pause QUIT -> YES -> game over")
  // mash A from GAME OVER at ~10 Hz for 4 s: must never submit
  for (let i = 0; i < 40; i++) { await page.keyboard.press("z"); await page.waitForTimeout(100) }
  ok((await dbg(page)).state === "entry", "mashing A on game over/entry never submits (still in entry)")
  ok(errs.length === 0, "no console errors (desktop) " + errs.join(" | "))
}

// ---------- 2. mobile touch: tap to start, tap-tap to throw, name entry by tapping
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], hasTouch: true })
  const page = await ctx.newPage()
  const errs = trackErrors(page)
  await page.goto(base + "?debug&seed=3&fast")
  await waitFor(page, () => BP.Game.debug.state === "title")
  const box = await page.locator("#screen").boundingBox()
  const tapAt = async (x, y) => { await page.touchscreen.tap(box.x + (x / 256) * box.width, box.y + (y / 240) * box.height); await page.waitForTimeout(120) }
  await page.waitForTimeout(300)
  await tapAt(128, 108 + 3)
  ok(await waitFor(page, () => BP.Game.debug.state === "match" && BP.Game.debug.phase === "aim", 6000), "tap menu item -> match")
  await page.waitForTimeout(300)
  await tapAt(40, 200)
  ok((await dbg(page)).phase === "power", "tap locks aim")
  await page.waitForTimeout(300)
  await tapAt(40, 200)
  ok(await waitFor(page, () => BP.Game.debug.phase === "flight" || BP.Game.debug.shots > 0), "tap locks power -> throw")
  ok((await dbg(page)).shots === 1, "one shot counted")
  // jump to name entry with a score
  await page.evaluate(() => { const g = BP.Game.debug; g.startAt(0, 0, 0); g.autoplay = 0.99; g.step(60 * 20); g.autoplay = false; g.go("entry") })
  await page.waitForTimeout(300)
  await page.waitForTimeout(600) // entry input lock
  await tapAt(128, 30) // tap off-grid: must not type anything
  const cell = (ch) => { const rows = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ0123", "456789.-! "]; for (let r = 0; r < 4; r++) { const c = rows[r].indexOf(ch); if (c >= 0) return [28 + c * 20 + 4, 98 + r * 18 + 4] } }
  for (const ch of "NICK") await tapAt(...cell(ch))
  const nm = await page.evaluate(() => "x")
  void nm
  await tapAt(28 + 124 + 12, 98 + 72 + 4)
  await page.waitForTimeout(400)
  ok((await dbg(page)).state === "entry", "END opens OK? confirm (no instant submit)")
  await tapAt(118, 150)
  ok(await waitFor(page, () => BP.Game.debug.state === "scores", 8000), "tap YES submits -> leaderboard")
  await tapAt(128, 120); await page.waitForTimeout(300)
  ok((await dbg(page)).state === "scores", "leaderboard holds a 2 s input lock")
  await page.waitForTimeout(1800)
  const top = await page.evaluate(() => BP.Scores.top(10))
  ok(top.some((r) => r.name === "NICK"), "score saved with tapped name NICK (off-grid tap ignored)")
  await page.waitForTimeout(800)
  await tapAt(128, 120)
  ok(await waitFor(page, () => BP.Game.debug.state === "title", 4000), "tap leaderboard -> title")
  ok(errs.length === 0, "no console errors (mobile) " + errs.join(" | "))
}

// ---------- 3. TV mode
{
  const page = await (await browser.newContext()).newPage()
  const errs = trackErrors(page)
  await page.goto(base + "?tv")
  ok(await waitFor(page, () => BP.Game.debug.state === "tv"), "?tv boots into TV leaderboard")
  ok(errs.length === 0, "no console errors (tv)")
}
// ---------- 4. landscape phone: center tap on the title must not jump into HIGH SCORES
{
  const page = await (await browser.newContext({ ...devices["iPhone 13 landscape"], hasTouch: true })).newPage()
  const errs = trackErrors(page)
  await page.goto(base + "?debug&seed=4")
  await waitFor(page, () => BP.Game.debug.state === "title"); await page.waitForTimeout(500)
  const box = await page.locator("#screen").boundingBox()
  const tapAt = async (x, y) => { await page.touchscreen.tap(box.x + (x / 256) * box.width, box.y + (y / 240) * box.height); await page.waitForTimeout(150) }
  await tapAt(128, 124)
  ok((await dbg(page)).state === "title", "tap on non-selected menu row only moves the cursor")
  await tapAt(128, 210)
  ok(await waitFor(page, () => BP.Game.debug.state === "scores", 3000), "tap elsewhere confirms the highlighted row")
  ok(errs.length === 0, "no console errors (landscape)")
}
// ---------- 5. production build hides QA hooks
{
  const page = await (await browser.newContext()).newPage()
  await page.goto(base)
  await waitFor(page, () => BP.Game.debug.state === "title")
  const d = await page.evaluate(() => ({ step: typeof BP.Game.debug.step, ap: "autoplay" in BP.Game.debug, startAt: typeof BP.Game.debug.startAt, frozen: Object.isFrozen(BP.Game.debug) }))
  ok(d.step === "undefined" && !d.ap && d.startAt === "undefined" && d.frozen, "no ?debug: debug is read-only state only")
}
console.log(fails ? `${fails} FAILURES` : "ALL PASS")
await browser.close()
