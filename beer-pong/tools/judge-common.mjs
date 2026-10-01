import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
const require = createRequire(import.meta.url)
const gRoot = execSync("npm root -g").toString().trim()
export const { chromium, devices } = require(join(gRoot, "playwright"))
export const OUT = "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/judge"
export const FILE = "file:///home/user/ai-emoji-generator/public/beerpong/index.html"
export const DEV = "http://localhost:8787/beerpong/"
export async function canvasShot(page, name, s = 3) {
  const data = await page.evaluate((s) => { const c = document.getElementById("screen"); const o = document.createElement("canvas"); o.width = 256 * s; o.height = 240 * s; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL() }, s)
  const fs = await import("node:fs"); fs.writeFileSync(join(OUT, name + ".png"), Buffer.from(data.split(",")[1], "base64"))
}
export function hookErrors(page, errors) {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`) })
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`))
}
export const dbg = (page) => page.evaluate(() => { const d = BP.Game.debug; return { state: d.state, phase: d.phase, score: d.score, stage: d.stage, cups: d.cups, turn: d.turn, buzz: d.buzz, streak: d.streak, paused: d.paused, errors: d.errors, fps: d.fps, ticks: d.ticks } })
