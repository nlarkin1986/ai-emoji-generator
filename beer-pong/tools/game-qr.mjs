// Verifies the inline QR encoder: RS + format-bit test vectors (ISO 18004 / thonky "HELLO WORLD" 1-M)
// and full decode of rendered codes with jsQR (path via --jsqr, test-only dependency, not shipped).
// node beer-pong/tools/game-qr.mjs --jsqr /path/to/jsQR.js
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { readFileSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const jsqr = args.includes("--jsqr") ? readFileSync(args[args.indexOf("--jsqr") + 1], "utf8") : null
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(join(here, "..", "..", "public", "beerpong", "index.html")).href + "?debug")
await page.waitForTimeout(400)
if (jsqr) await page.addScriptTag({ content: jsqr })
const r = await page.evaluate(() => {
  const Q = BP.Game.debug.qr, out = []
  // HELLO WORLD 1-M data codewords -> known EC codewords
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
  const ec = Q._rsRem(data, Q._rsDiv(10))
  out.push(["RS vector (HELLO WORLD 1-M)", JSON.stringify(ec) === JSON.stringify([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])])
  out.push(["format bits L/mask4 = 110011000101111", Q._formatBits("L", 4).toString(2).padStart(15, "0") === "110011000101111"])
  out.push(["format bits M/mask0 = 101010000010010", Q._formatBits("M", 0).toString(2).padStart(15, "0") === "101010000010010"])
  const urls = ["HELLO", "https://example.com/beerpong/", "http://localhost:8787/beerpong/", "https://ai-emoji-generator-git-main-someone.vercel.app/beerpong/",
    "https://a-really-long-party-host-name.example.org/some/deep/path/to/the/beerpong/index.html"]
  for (const u of urls) for (const ecl of ["M", "L"]) {
    const q = Q._encode(u, ecl)
    if (!q) { out.push([`${ecl} ${u.length}ch: too long for v6 (expected for long URLs)`, true]); continue }
    if (typeof jsQR !== "function") continue
    const sc = 4, qz = 4, n = q.size, W = (n + qz * 2) * sc
    const c = document.createElement("canvas"); c.width = c.height = W
    const x = c.getContext("2d"); x.fillStyle = "#FCFCFC"; x.fillRect(0, 0, W, W); x.fillStyle = "#000"
    for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) if (q.mod[yy][xx]) x.fillRect((xx + qz) * sc, (yy + qz) * sc, sc, sc)
    const res = jsQR(x.getImageData(0, 0, W, W).data, W, W)
    out.push([`decode v${q.version}-${ecl} mask${q.mask} "${u}"`, !!res && res.data === u])
  }
  // what the TV screen actually encodes on this page
  const tvq = Q.encode(BP.Game.debug.playUrl())
  out.push([`play URL encodes (v${tvq && tvq.version}): ${BP.Game.debug.playUrl().length} chars`, !!tvq || BP.Game.debug.playUrl().length > 106])
  return out
})
// decode straight off the rendered TV screen (what a phone camera would see)
if (jsqr) {
  const tv = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0
    const g = BP.Game.debug; g.go("tv"); g.step(5); g.render()
    const c = document.getElementById("screen"), o = document.createElement("canvas"); o.width = 768; o.height = 720
    const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 768, 720)
    const res = jsQR(x.getImageData(0, 0, 768, 720).data, 768, 720)
    return { got: res && res.data, want: g.playUrl() }
  })
  r.push([`TV screen QR decodes to play URL (${tv.got})`, tv.got === tv.want])
}
let f = 0
for (const [n, ok] of r) { console.log((ok ? "PASS " : "FAIL ") + n); if (!ok) f++ }
console.log(f ? f + " FAILURES" : "ALL PASS")
await browser.close()
