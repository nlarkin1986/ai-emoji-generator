// 90 s random "monkey" test (judge-style): random keys + random taps at ~8 Hz on desktop and phone.
// Checks: no console errors, canvas keeps changing (never frozen), states visited.
// node beer-pong/tools/game-monkey.mjs [--secs 90]
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const secs = +(args[args.indexOf("--secs") + 1] || 90) || 90
const base = pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href
const browser = await chromium.launch()
let fails = 0
async function monkey(label, ctxOpts, touch) {
  const page = await (await browser.newContext(ctxOpts)).newPage()
  const errs = []
  page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) })
  await page.goto(base)
  await page.waitForTimeout(800)
  const box = await page.locator("#screen").boundingBox()
  const keys = ["z", "x", "Enter", "Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "z", "z", "Enter"]
  const states = {}, hashes = []
  let frozen = 0, lastHash = "", t0 = Date.now(), n = 0
  while (Date.now() - t0 < secs * 1000) {
    if (touch || Math.random() < 0.3) {
      const x = box.x + Math.random() * box.width, y = box.y + Math.random() * box.height
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y)
    } else await page.keyboard.press(keys[(Math.random() * keys.length) | 0])
    await page.waitForTimeout(60 + Math.random() * 120)
    if (++n % 20 === 0) {
      const d = await page.evaluate(() => {
        const c = document.getElementById("screen").getContext("2d").getImageData(0, 0, 256, 240).data
        let h = 0; for (let i = 0; i < c.length; i += 97) h = (h * 31 + c[i]) | 0
        return { s: BP.Game.debug.state, h }
      })
      states[d.s] = (states[d.s] || 0) + 1
      if (String(d.h) === lastHash) frozen++; else frozen = 0
      lastHash = String(d.h)
      if (frozen >= 4) { errs.push("canvas frozen in " + d.s); break }
    }
  }
  const ok = errs.length === 0
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${n} inputs, states ${JSON.stringify(states)} ${errs.join(" | ")}`)
}
await Promise.all([
  monkey("desktop keyboard+mouse", { viewport: { width: 1024, height: 900 } }, false),
  monkey("iPhone 13 touch", { ...devices["iPhone 13"], hasTouch: true }, true),
  monkey("iPhone 13 landscape touch", { ...devices["iPhone 13 landscape"], hasTouch: true }, true),
])
console.log(fails ? fails + " FAILURES" : "ALL PASS")
await browser.close()
