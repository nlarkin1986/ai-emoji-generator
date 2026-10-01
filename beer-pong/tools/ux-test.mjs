// UX / input test-bench for SUPER BEER PONG (owner: UX agent).
//   node beer-pong/tools/ux-test.mjs [--shots] [--tests] [--only name] [--out DIR]
// --tests : builds an isolated harness page (shell.html + input.js + audio stub, NO game loop) and drives
//           BP.Input tick-by-tick with keyboard, CDP multi-touch, mouse and a mocked Gamepad API.
// --shots : screenshots the BUILT game (public/beerpong/index.html; run build.mjs first) on phone/tablet/desktop
//           presets, plus pressed-state and notch (safe-area) variants. Prints layout metrics per device.
// Default: both.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const has = (k) => args.includes(k)
const OUT = opt("--out", process.env.UX_OUT || "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/ux")
mkdirSync(OUT, { recursive: true })
const runTests = has("--tests") || !has("--shots")
const runShots = has("--shots") || !has("--tests")
const only = opt("--only", "")

const browser = await chromium.launch()
let fails = 0
const ok = (cond, msg, extra) => { if (cond) console.log("  ok  ", msg); else { fails++; console.log("  FAIL", msg, extra !== undefined ? JSON.stringify(extra) : "") } }

// ------------------------------------------------------------------ input tests
if (runTests) {
  const shell = readFileSync(join(root, "src", "shell.html"), "utf8")
  const input = readFileSync(join(root, "src", "input.js"), "utf8")
  const harness = `<script>window.BP=window.BP||{};
BP.Audio={unlocks:0,_m:false,unlock(){this.unlocks++},isMuted(){return this._m},toggleMute(){this._m=!this._m},setMuted(b){this._m=!!b},sfx(){},music(){}}
</script><script>${input.replace(/<\/script/gi, "<\\/script")}</script><script>
BP.Input.init(document.getElementById('screen'))
var BTNS=['up','down','left','right','a','b','start','select']
window.T=function(){var p=[],h=[];BTNS.forEach(function(b){if(BP.Input.pressed(b))p.push(b);if(BP.Input.held(b))h.push(b)});
 var r={p:p.join(','),h:h.join(','),any:BP.Input.anyPressed(),ptr:BP.Input.pointer()&&JSON.parse(JSON.stringify(BP.Input.pointer()))};BP.Input.update();return r}
window.C=function(id){var r=document.getElementById(id).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,l:r.left,t:r.top}}
window.__prevented={};['keydown','touchmove','touchstart'].forEach(function(t){document.addEventListener(t,function(e){window.__prevented[t]=(window.__prevented[t]||0)+(e.defaultPrevented?1:0)})})
</script>`
  const page1 = join(OUT, "_harness.html")
  writeFileSync(page1, shell.replace("<!-- @@SCRIPTS@@ -->", () => harness))
  const url = pathToFileURL(page1).href

  // ---- keyboard (desktop) ----
  console.log("\n[tests] keyboard (desktop 1280x800)")
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()))
    await page.goto(url)
    const T = () => page.evaluate(() => T())
    await T()
    await page.keyboard.down("z"); let r = await T(); ok(r.p === "a" && r.h === "a", "Z -> pressed(a) on next tick + held", r)
    r = await T(); ok(r.p === "" && r.h === "a", "edge lasts exactly one tick, held persists", r)
    await page.keyboard.down("z"); r = await T(); ok(r.p === "", "auto-repeat keydown gives no new edge", r) // Playwright marks repeat
    await page.keyboard.up("z"); r = await T(); ok(r.h === "", "keyup releases", r)
    await page.keyboard.down("Space"); await page.keyboard.up("Space"); r = await T(); ok(r.p === "a" && r.h === "", "Space press+release between ticks still gives ONE edge", r)
    r = await T(); ok(r.p === "", "...and only one", r)
    for (const [k, b] of [["ArrowUp", "up"], ["KeyW", "up"], ["ArrowLeft", "left"], ["KeyD", "right"], ["KeyS", "down"], ["KeyJ", "a"], ["KeyX", "b"], ["KeyK", "b"], ["Backspace", "b"], ["Enter", "start"], ["KeyP", "start"], ["Escape", "start"], ["Shift", "select"], ["Tab", "select"]]) {
      await page.keyboard.press(k); r = await T(); ok(r.p === b, `${k} -> ${b}`, r)
    }
    const prevented = await page.evaluate(() => window.__prevented.keydown)
    ok(prevented >= 17, "game keys preventDefault'ed (no scroll / focus move)", prevented)
    const scrollY = await page.evaluate(() => (window.scrollTo(0, 0), document.scrollingElement.scrollTop))
    ok(scrollY === 0, "page not scrolled", scrollY)
    await page.keyboard.down("ArrowRight"); await T()
    await page.evaluate(() => window.dispatchEvent(new Event("blur"))); r = await T(); ok(r.h === "", "window blur clears held keys", r)
    await page.keyboard.up("ArrowRight")
    const m0 = await page.evaluate(() => BP.Audio.isMuted()); await page.keyboard.press("m")
    const m1 = await page.evaluate(() => BP.Audio.isMuted()); ok(m0 !== m1, "M toggles mute")
    const icon = await page.evaluate(() => document.getElementById("bMute").classList.contains("muted")); ok(icon === m1, "mute icon reflects state")
    // mouse click on canvas = A + pointer coords
    const c = await page.evaluate(() => C("screen"))
    await page.mouse.click(c.l + c.w * 0.75, c.t + c.h * 0.25); r = await T()
    ok(r.p === "a" && r.ptr && Math.abs(r.ptr.x - 192) <= 1 && Math.abs(r.ptr.y - 60) <= 1, "click on canvas = A, pointer in 256x240 coords", r)
    ok(r.ptr && r.ptr.tapped === true, "pointer().tapped true on tap tick", r.ptr); r = await T(); ok(r.ptr && r.ptr.tapped === false, "...then false", r.ptr)
    // gamepad (mocked standard mapping)
    await page.evaluate(() => {
      window.__gp = { connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      navigator.getGamepads = () => [window.__gp]
      window.dispatchEvent(new Event("gamepadconnected"))
    })
    await page.evaluate(() => { __gp.buttons[0].pressed = true }); await T(); r = await T(); ok(r.p === "a", "gamepad button 0 -> A (edge on the tick after poll)", r)
    r = await T(); ok(r.p === "" && r.h === "a", "gamepad A held, single edge", r)
    await page.evaluate(() => { __gp.buttons[0].pressed = false; __gp.buttons[9].pressed = true; __gp.axes[0] = -0.9 }); await T(); r = await T()
    ok(r.p.includes("start") && r.p.includes("left"), "gamepad START + left stick", r)
    await page.evaluate(() => { __gp.buttons[9].pressed = false; __gp.axes[0] = 0.2; __gp.buttons[2].pressed = true; __gp.buttons[13].pressed = true }); await T(); r = await T()
    ok(r.p === "down,b" || (r.p.includes("b") && r.p.includes("down")), "gamepad X(2) -> B, dpad 13 -> down, stick deadzone", r)
    const ul = await page.evaluate(() => BP.Audio.unlocks); ok(ul > 3, "BP.Audio.unlock() called on gestures", ul)
    ok(errs.length === 0, "no console errors", errs)
    await ctx.close()
  }

  // ---- touch (phone portrait + landscape) via CDP multi-touch ----
  for (const dev of ["iPhone 13", "iPhone 13 landscape"]) {
    console.log(`\n[tests] touch (${dev})`)
    const ctx = await browser.newContext({ ...devices[dev], hasTouch: true })
    const page = await ctx.newPage()
    const errs = []; page.on("pageerror", (e) => errs.push(e.message))
    await page.goto(url)
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) })
    const T = () => page.evaluate(() => T())
    const mode = await page.evaluate(() => BP.Shell.state.mode); ok(mode === (dev.includes("landscape") ? "landscape" : "portrait"), "layout mode " + mode)
    await T()
    const dp = await page.evaluate(() => C("dpad")), A = await page.evaluate(() => C("sA")), B = await page.evaluate(() => C("sB"))
    const sel = await page.evaluate(() => C("pSel")), st = await page.evaluate(() => C("pSt")), cv = await page.evaluate(() => C("screen"))
    ok(A.w >= 64 && B.w >= 64, `A/B sockets >= 64px (A ${A.w.toFixed(1)}px)`)
    const red = await page.evaluate(() => document.querySelector("#sA .btn").getBoundingClientRect().width); console.log("       red A button diameter", red.toFixed(1))
    const R = dp.w * 0.4
    await touch("touchStart", [[dp.x + R, dp.y, 1]]); let r = await T(); ok(r.p === "right" && r.h === "right", "touch D-pad right", r)
    await touch("touchStart", [[dp.x + R, dp.y, 1], [A.x, A.y, 2]]); r = await T(); ok(r.p === "a" && r.h === "right,a", "multi-touch: hold right + tap A", r)
    await touch("touchMove", [[dp.x, dp.y - R, 1], [A.x, A.y, 2]]); r = await T(); ok(r.p === "up" && r.h === "up,a", "slide thumb right -> up", r)
    await touch("touchMove", [[dp.x + R * 0.7, dp.y - R * 0.7, 1], [A.x, A.y, 2]]); r = await T(); ok(r.h === "up,right,a" && r.p === "right", "diagonal up-right = two dirs", r)
    await touch("touchMove", [[dp.x + R * 0.7, dp.y - R * 0.7, 1], [B.x, B.y, 2]]); r = await T(); ok(r.p === "b" && r.h === "up,right,b", "slide A -> B", r)
    // CDP: touchEnd lists the point(s) being lifted
    await touch("touchEnd", [[dp.x + R * 0.7, dp.y - R * 0.7, 1]]); r = await T(); ok(r.h === "b", "lift d-pad finger only, B stays held", r)
    await touch("touchEnd", []); r = await T(); ok(r.h === "", "all released", r)
    await touch("touchStart", [[A.x, A.y, 3]]); await touch("touchEnd", []); r = await T(); ok(r.p === "a" && r.h === "", "quick tap between ticks still = one A edge", r)
    await touch("touchStart", [[sel.x, sel.y, 4]]); await touch("touchEnd", []); r = await T(); ok(r.p === "select", "SELECT", r)
    await touch("touchStart", [[st.x, st.y + st.h * 0.9, 5]]); await touch("touchEnd", []); r = await T(); ok(r.p === "start", "START (slightly off-target, slop)", r)
    await touch("touchStart", [[cv.l + cv.w / 2, cv.t + cv.h / 2, 6]]); r = await T()
    ok(r.p === "a" && r.ptr && Math.abs(r.ptr.x - 128) <= 1 && Math.abs(r.ptr.y - 120) <= 1 && r.ptr.down, "tap canvas centre = A @ (128,120)", r)
    await touch("touchEnd", []); r = await T(); ok(r.ptr && !r.ptr.down, "pointer().down false after lift", r.ptr)
    const pressedVis = await page.evaluate(async () => { return document.querySelector("#sA .btn").classList.contains("on") })
    ok(!pressedVis, "pressed visual cleared")
    // swipe across the whole screen: page must not scroll or zoom
    await touch("touchStart", [[cv.x, cv.t + 10, 7]]); for (let i = 1; i <= 8; i++) await touch("touchMove", [[cv.x, cv.t + 10 + i * 40, 7]]); await touch("touchEnd", [])
    const sc = await page.evaluate(() => ({ y: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1, pv: window.__prevented.touchmove }))
    ok(sc.y === 0 && sc.vv === 1, "no scroll/zoom on swipe", sc)
    ok(errs.length === 0, "no page errors", errs)
    await ctx.close()
  }
}

// ------------------------------------------------------------------ screenshots
if (runShots) {
  const file = join(root, "..", "public", "beerpong", "index.html")
  const url = pathToFileURL(file).href
  const D = (name) => ({ ...devices[name], hasTouch: true })
  const shots = [
    ["iphone13-portrait", D("iPhone 13")],
    ["iphone13-landscape", D("iPhone 13 landscape")],
    ["iphone13-notch-portrait", D("iPhone 13"), { inset: "47px 0 34px 0" }],
    ["iphone13-notch-landscape", D("iPhone 13 landscape"), { inset: "0 47px 21px 47px" }],
    ["iphoneSE3-portrait", D("iPhone SE (3rd gen)")],
    ["iphoneSE3-landscape", D("iPhone SE (3rd gen) landscape")],
    ["iphoneSE1-portrait", D("iPhone SE")],
    ["iphone15promax-portrait", D("iPhone 15 Pro Max")],
    ["pixel7-portrait", D("Pixel 7")],
    ["pixel7-landscape", D("Pixel 7 landscape")],
    ["galaxyS8-portrait", D("Galaxy S8")],
    ["ipad-portrait", D("iPad (gen 7)")],
    ["ipad-landscape", D("iPad (gen 7) landscape")],
    ["desktop-1280", { viewport: { width: 1280, height: 800 } }],
    ["desktop-1920", { viewport: { width: 1920, height: 1080 } }],
    ["desktop-1366", { viewport: { width: 1366, height: 768 } }],
    ["desktop-pad", { viewport: { width: 1280, height: 800 } }, { pad: true }],
    ["desktop-crt", { viewport: { width: 1280, height: 800 } }, { crt: true }],
    ["iphone13-pressed", D("iPhone 13"), { press: true }],
    ["iphone13-landscape-pressed", D("iPhone 13 landscape"), { press: true }],
    ["tv-mode", { viewport: { width: 1280, height: 720 } }, { query: "?tv" }],
  ].filter(([n]) => !only || n.includes(only))
  console.log("\n[shots] ->", OUT)
  for (const [name, ctxOpts, o = {}] of shots) {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()))
    await page.goto(url + (o.query || ""))
    if (o.inset) { await page.addStyleTag({ content: `#sa{padding:${o.inset} !important}` }); await page.evaluate(() => BP.Shell.layout()) }
    if (o.pad) await page.evaluate(() => BP.Shell.setPad(true, false))
    if (o.crt) await page.evaluate(() => BP.Shell.setCrt(true))
    await page.waitForTimeout(700)
    if (o.press) {
      const cdp = await ctx.newCDPSession(page)
      const g = await page.evaluate(() => { const f = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } }; return { d: f("dpad"), a: f("sA"), s: f("pSt") } })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.d.x - g.d.w * 0.38, y: g.d.y - g.d.w * 0.05, id: 1 }, { x: g.a.x, y: g.a.y, id: 2 }, { x: g.s.x, y: g.s.y, id: 3 }] })
      await page.waitForTimeout(120)
    }
    const m = await page.evaluate(() => { const s = BP.Shell.state, r = s.rect, A = document.getElementById("sA").getBoundingClientRect(), d = document.getElementById("dpad").getBoundingClientRect(); return { mode: s.mode, scale: +s.s.toFixed(3), scr: `${Math.round(r.w)}x${Math.round(r.h)}@${Math.round(r.x)},${Math.round(r.y)}`, A: Math.round(A.width), dpad: Math.round(d.width), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight } })
    const path = join(OUT, name + ".png")
    await page.screenshot({ path })
    console.log(`${name.padEnd(28)} ${m.mode.padEnd(9)} vp ${m.vw}x${m.vh} scale ${m.scale} screen ${m.scr} A ${m.A} dpad ${m.dpad}${m.sw > m.vw || m.sh > m.vh ? " OVERFLOW" : ""}${errs.length ? " ERRORS: " + errs.join(" | ") : ""}`)
    await ctx.close()
  }
}
await browser.close()
if (runTests) console.log(fails ? `\n${fails} FAILED` : "\nall input tests passed")
process.exitCode = fails ? 1 : 0
