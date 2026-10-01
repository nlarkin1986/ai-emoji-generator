// QA helpers (mobile QA tester) — touch-only driving of SUPER BEER PONG.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
import { mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
export const { chromium, devices } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
export const OUT = "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/qa"
mkdirSync(OUT, { recursive: true })
export const BASE = "http://localhost:8791/beerpong/"
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const DEV = {
  "iphone13": devices["iPhone 13"], "iphone13L": devices["iPhone 13 landscape"], "se": devices["iPhone SE"],
  "pixel7": devices["Pixel 7"], "s9": devices["Galaxy S9+"], "ipadmini": devices["iPad Mini"],
}
export async function open(browser, dev, url = BASE, opts = {}) {
  const ctx = await browser.newContext({ ...DEV[dev], ...opts })
  const page = await ctx.newPage()
  const logs = []
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.type() + ": " + m.text()) })
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message))
  await page.goto(url)
  await page.waitForFunction(() => window.BP && BP.Game && BP.Game.debug.state !== "boot")
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, logs, cdp }
}
export const st = (page) => page.evaluate(() => { const d = BP.Game.debug; return { state: d.state, phase: d.phase, turn: d.turn, score: d.score, cups: d.cups, stage: d.stage, paused: d.paused, errors: d.errors } })
export async function rect(page, sel) { return page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }, sel) }
// NES pixel -> client coords
export async function nes(page, x, y) { const r = await rect(page, "#screen"); return { x: r.x + (x + 0.5) * r.w / 256, y: r.y + (y + 0.5) * r.h / 240 } }
export async function tapAt(page, x, y) { await page.touchscreen.tap(x, y) }
export async function tapNes(page, x, y) { const p = await nes(page, x, y); await tapAt(page, p.x, p.y) }
const SEL = { a: "#sA", b: "#sB", start: "#pSt", select: "#pSel" }
export async function btn(page, b) {
  if (SEL[b]) { const r = await rect(page, SEL[b]); return tapAt(page, r.cx, r.cy) }
  const r = await rect(page, "#dpad"); const o = r.w * 0.33
  const d = { up: [0, -o], down: [0, o], left: [-o, 0], right: [o, 0] }[b]
  return tapAt(page, r.cx + d[0], r.cy + d[1])
}
// CDP touch helpers (hold / multi)
export async function touch(cdp, type, points) { await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) }) }
export async function hold(cdp, x, y, ms) { await touch(cdp, "touchStart", [{ x, y }]); await sleep(ms); await touch(cdp, "touchEnd", []) }
export async function shot(page, name) { const p = join(OUT, name + ".png"); await page.screenshot({ path: p }); return p }
export async function waitState(page, s, ms = 15000) { await page.waitForFunction((s) => BP.Game.debug.state === s, s, { timeout: ms }) }
export const audioState = (page) => page.evaluate(() => (BP.Audio && BP.Audio._state ? BP.Audio._state() : null))
export const dev = (path) => fetch("http://localhost:8791" + path, { method: "POST" }).then((r) => r.json())
