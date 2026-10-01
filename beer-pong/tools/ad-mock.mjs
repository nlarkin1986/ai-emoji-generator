// AD: render an alternate (patched) build for side-by-side: stage-0 aim frame (3x) + VS card (3x).
// node beer-pong/tools/ad-mock.mjs <index.html> <outPrefix>
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const [file, pre] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(pathToFileURL(file).href + "?debug&fast&seed=4")
await p.waitForFunction(() => window.BP && BP.Game && BP.Game.debug && BP.Game.debug.state !== "boot")
await p.evaluate(() => { window.requestAnimationFrame = () => 0 })
const g = (r, k) => p.evaluate(([r, k]) => { BP.Game.debug.render(); const c = document.getElementById("screen"), o = document.createElement("canvas"); o.width = r[2] * k; o.height = r[3] * k; const x = o.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(c, r[0], r[1], r[2], r[3], 0, 0, o.width, o.height); return o.toDataURL() }, [r, k])
const save = (n, d) => fs.writeFileSync(pre + n + ".png", Buffer.from(d.split(",")[1], "base64"))
await p.evaluate(() => { const d = BP.Game.debug; d.startAt(0, 0, 0); for (let i = 0; i < 3000 && !(d.phase === "aim" && d.turn === "player"); i++) d.step(1); d.step(30) })
save("match", await g([0, 150, 256, 90], 3))
await p.evaluate(() => { const d = BP.Game.debug; d.go("vs", { stage: 0 }); d.step(150) })
save("vs", await g([0, 30, 256, 85], 3))
await b.close(); console.log("ok")
