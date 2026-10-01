// Objective audio verification for BP.Audio (we can't listen, so we measure).
// node beer-pong/tools/audiotest.mjs [outDir]
// Renders every music track + sfx through OfflineAudioContext, checks: no errors, non-silence, no clipping,
// sane RMS, durations, loop seams (RMS-envelope correlation of loop pass 1 vs pass 2), channel stealing,
// tempo, key membership of all notes; then drives the live API with real clicks (unlock / pause / mute).
// Dumps a few WAVs + waveform/spectrogram PNGs to outDir.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || join(process.env.SCRATCH || "/tmp", "audio")
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } })
const errors = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`) })
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`))
await page.goto(pathToFileURL(join(here, "audiotest.html")).href)
await page.waitForFunction(() => window.BP && BP.Audio && window.T)

let fails = 0
const fail = (msg) => { fails++; console.log("  FAIL " + msg) }
const list = await page.evaluate(() => BP.Audio._list())
const DUMP_WAV = new Set(["title", "stage0", "stage1", "stage2", "stage3", "stage4", "fire", "clear", "gameover", "sfx:sink", "sfx:rim", "sfx:onFire", "sfx:cheer", "steal"])
const DUMP_PNG = new Set(["title", "stage1", "stage4", "fire", "vs", "clear", "gameover", "sfx:sink", "sfx:rim", "sfx:onFire", "sfx:ballsBack", "sfx:cheer", "sfx:throw", "steal"])

async function render(spec, seconds, key) {
  return page.evaluate(async ({ spec, seconds, key, wav, png }) => {
    const t0 = performance.now()
    const b = await BP.Audio._renderOffline(spec, seconds)
    const r = { ms: Math.round(performance.now() - t0), ...T.stats(b), centroid: Math.round(T.centroid(b)) }
    const info = typeof spec === "string" && !/^sfx:/.test(spec) ? BP.Audio._info(spec) : null
    if (info && info.loop) {
      // 100 ms RMS windows (noise-channel LFSR start offsets are random per hit, like the real chip)
      const a = T.env(b, 0.05 + info.introSec, 0.05 + info.introSec + info.loopSec, 0.1)
      const c = T.env(b, 0.05 + info.introSec + info.loopSec, 0.05 + info.introSec + 2 * info.loopSec, 0.1)
      r.mixCorr = T.corr(a, c)
      // per-channel solo renders: pass 2 must equal pass 1 (mix can differ slightly: free-running oscillator phases interfere)
      r.loopCorr = 1
      for (const ch of ["p1", "p2", "tr", "no", "dm"]) {
        const sb = await BP.Audio._renderOffline({ music: spec, mute: ["p1", "p2", "tr", "no", "dm"].filter((x) => x !== ch) }, seconds)
        const sa = T.env(sb, 0.05 + info.introSec, 0.05 + info.introSec + info.loopSec, 0.1), sc = T.env(sb, 0.05 + info.introSec + info.loopSec, 0.05 + info.introSec + 2 * info.loopSec, 0.1)
        if (T.stats(sb).peak > 0.01) {
          // flat envelopes (e.g. constant 16th hats) make correlation meaningless: accept a tiny relative difference too
          let dd = 0, aa = 0; for (let i = 0; i < Math.min(sa.length, sc.length); i++) { dd += (sa[i] - sc[i]) ** 2; aa += sa[i] ** 2 }
          r.loopCorr = Math.min(r.loopCorr, Math.sqrt(dd / (aa + 1e-12)) < 0.05 ? 1 : T.corr(sa, sc))
        }
      }
      // seam: audio right after the loop point must not be silent (music restarts immediately)
      r.seamRms = T.stats({ getChannelData: () => b.getChannelData(0).subarray(Math.round((0.05 + info.introSec + info.loopSec) * 44100), Math.round((0.05 + info.introSec + info.loopSec + 0.5) * 44100)), sampleRate: 44100 }).rms
    }
    if (wav) r.wav = T.wav(b)
    if (png) { T.draw(b, document.getElementById("wave"), document.getElementById("spec"), key) }
    return r
  }, { spec, seconds, key, wav: DUMP_WAV.has(key), png: DUMP_PNG.has(key) })
}
async function shot(key) {
  if (!DUMP_PNG.has(key)) return
  const el = await page.$("#wave"); const el2 = await page.$("#spec")
  const bw = await el.boundingBox(), bs = await el2.boundingBox()
  await page.screenshot({ path: join(out, key.replace(/[:]/g, "_") + ".png"), clip: { x: bw.x, y: bw.y, width: bw.width, height: bs.y + bs.height - bw.y } })
}
function save(key, r) { if (r.wav) { writeFileSync(join(out, key.replace(/[:]/g, "_") + ".wav"), Buffer.from(r.wav, "base64")); delete r.wav } }

console.log("== MUSIC")
for (const name of list.music) {
  const info = await page.evaluate((n) => BP.Audio._info(n), name)
  const secs = info.loop ? info.introSec + info.loopSec * 2 + 0.6 : info.sec + 1
  const r = await render(name, secs, name)
  save(name, r); await shot(name)
  console.log(`${name.padEnd(9)} bars=${info.bars} bpm=${info.bpm} len=${info.sec.toFixed(2)}s loop=${info.loop} peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(3)} first=${r.first.toFixed(3)} last=${r.last.toFixed(2)} centroid=${r.centroid}Hz` +
    (info.loop ? ` loopCorr(min ch)=${r.loopCorr.toFixed(3)} mix=${r.mixCorr.toFixed(3)} seamRms=${r.seamRms.toFixed(3)}` : "") + ` (${r.ms}ms)`)
  if (info.warn.length) fail(`${name} pattern length mismatch ${info.warn}`)
  { // key check: every pitched note in its section's scale (declared passing/borrowed tones allowed, moved with key lifts)
    const NI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, pc = (n) => (NI[n[0]] + (n[1] === "#" ? 1 : n[1] === "b" ? -1 : 0) + 12) % 12
    const SC = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] }
    let tot = 0, ex = 0, out = []
    for (const ch of ["p1", "p2", "tr"]) for (const [m, k] of info.nk[ch]) {
      tot++
      const root = pc(k), sh = root - pc(info.key), p = ((m % 12) + 12) % 12
      if (SC[info.scale].some((x) => (x + root) % 12 === p)) continue
      if (info.extra.split(" ").filter(Boolean).some((x) => (pc(x) + sh + 12) % 12 === p)) { ex++; continue }
      out.push(ch + ":" + m + "@" + k)
    }
    console.log(`          key ${info.key} ${info.scale}: ${tot} notes, ${tot - ex - out.length} diatonic, ${ex} declared borrowed/passing, ${out.length} out`)
    if (out.length) fail(`${name} out-of-key notes ${out.slice(0, 8)}`)
  }
  if (r.nan) fail(`${name} NaN samples`)
  if (r.peak >= 0.99) fail(`${name} clipping peak ${r.peak}`)
  if (r.rms < 0.03) fail(`${name} too quiet rms ${r.rms}`)
  if (r.rms > 0.35) fail(`${name} too loud rms ${r.rms}`)
  if (r.first > 0.15) fail(`${name} starts late ${r.first}`)
  if (info.loop) {
    if (info.bars < 16 && /^(title|stage)/.test(name)) fail(`${name} only ${info.bars} bars`)
    if (r.loopCorr < 0.98) fail(`${name} loop pass 2 differs from pass 1 (corr ${r.loopCorr})`)
    if (r.seamRms < 0.02) fail(`${name} silence at loop seam`)
    if (r.last < secs - 0.7) fail(`${name} stopped early at ${r.last}`)
  } else {
    if (Math.abs(r.last - (0.05 + info.sec)) > 0.6) fail(`${name} audible length ${r.last} vs ${info.sec}`)
  }
}

console.log("== SFX")
const sfxStats = {}
for (const name of list.sfx) {
  const key = "sfx:" + name
  const r = await render(key, 3, key)
  save(key, r); await shot(key)
  sfxStats[name] = r
  const dur = r.last - r.first
  console.log(`${name.padEnd(11)} dur=${dur.toFixed(3)}s peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(4)} centroid=${r.centroid}Hz`)
  if (r.nan) fail(`${key} NaN`)
  if (r.peak < 0.03) fail(`${key} silent (peak ${r.peak})`)
  if (r.peak >= 0.99) fail(`${key} clipping`)
  if (dur > 2.2) fail(`${key} too long ${dur}`)
}
// distinctness: no two sfx with near-identical (duration, centroid, rms)
const names = Object.keys(sfxStats)
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = sfxStats[names[i]], b = sfxStats[names[j]]
  const sim = Math.abs((a.last - a.first) - (b.last - b.first)) < 0.02 && Math.abs(a.centroid - b.centroid) < 120 && Math.abs(a.rms - b.rms) < 0.004
  if (sim) fail(`sfx ${names[i]} and ${names[j]} look identical`)
}

console.log("== DMC (DPCM) SAMPLES")
{
  const r = await page.evaluate(() => ["K", "S", "oh", "yeah"].map((n) => {
    const s = BP.Audio._dev.dmc(n), lv = s.lv, re = BP.Audio._dev.dec(s.bytes, lv.length)
    let bad = 0, mn = 127, mx = 0, ss = 0, same = 0
    for (let i = 0; i < lv.length; i++) { if (i && Math.abs(lv[i] - lv[i - 1]) !== 2 && lv[i] !== lv[i - 1]) bad++; if (re[i] === lv[i]) same++; mn = Math.min(mn, lv[i]); mx = Math.max(mx, lv[i]); ss += (lv[i] - 64) ** 2 }
    return { n, rate: Math.round(s.fs), bytes: s.bytes.length, bad, mn, mx, rms: Math.sqrt(ss / lv.length), end: lv[lv.length - 1], same: same === lv.length }
  }))
  for (const x of r) {
    console.log(`${x.n.padEnd(5)} ${x.rate} Hz ${x.bytes} bytes levels ${x.mn}-${x.mx} rms ${x.rms.toFixed(1)} end ${x.end}`)
    if (x.bad) fail(`dmc ${x.n}: ${x.bad} steps not +-2`)
    if (!x.same) fail(`dmc ${x.n}: decode(bytes) mismatch`)
    if (x.rms < 8) fail(`dmc ${x.n} too quiet`)
    if (Math.abs(x.end - 64) > 3) fail(`dmc ${x.n} does not return to rest level`)
  }
}

console.log("== KEY SFX AUDIBILITY OVER EACH TRACK (sfx RMS / music RMS over the sfx window)")
{
  const r = await page.evaluate(async () => {
    const SF = ["sink", "rim", "throw", "onFire", "ballsBack", "swish", "crowdOh", "crowdYeah", "splash"], out = {}
    const rms = (b, a, z) => { const d = b.getChannelData(0); let s = 0, n = 0; for (let i = Math.round(a * 44100); i < Math.round(z * 44100); i++) { s += d[i] * d[i]; n++ } return Math.sqrt(s / n) }
    const alone = {}
    for (const x of SF) { const b = await BP.Audio._renderOffline({ sfx: [[2.0, x]] }, 5), st = T.stats(b); alone[x] = { b, a: st.first, z: st.last } }
    for (const m of ["title", "stage0", "stage1", "stage2", "stage3", "stage4", "fire"]) {
      const mb = await BP.Audio._renderOffline({ music: m }, 5); out[m] = {}
      for (const x of SF) {
        const A = alone[x], mix = await BP.Audio._renderOffline({ music: m, sfx: [[2.0, x]] }, 5)
        out[m][x] = { ratio: rms(A.b, A.a, A.z) / rms(mb, A.a, A.z), peak: T.stats(mix).peak }
      }
    }
    return out
  })
  for (const m in r) {
    console.log(m.padEnd(7) + Object.entries(r[m]).map(([x, v]) => ` ${x}=${v.ratio.toFixed(2)}`).join(""))
    for (const x in r[m]) {
      const v = r[m][x]
      if (v.peak >= 0.99) fail(`${m}+${x} clips`)
      if (x === "sink" ? v.ratio < 1.15 : v.ratio < (x === "splash" ? 0.45 : 0.6)) fail(`${x} not clearly audible over ${m} (${v.ratio.toFixed(2)})`)
    }
  }
}

console.log("== CHANNEL STEALING / TEMPO / BOUNCE ARG")
{
  const res = await page.evaluate(async () => {
    const base = await BP.Audio._renderOffline({ music: "stage0" }, 6)
    const st = await BP.Audio._renderOffline({ music: "stage0", sfx: [[2.0, "sink"], [2.05, "cheer"], [4.0, "ballsBack"]] }, 6)
    const d0 = base.getChannelData(0), d1 = st.getChannelData(0)
    const diff = (t0, t1) => { let s = 0; for (let i = Math.round(t0 * 44100); i < Math.round(t1 * 44100); i++) s += (d0[i] - d1[i]) ** 2; return Math.sqrt(s / ((t1 - t0) * 44100)) }
    // tempo: a 4.0 s jingle rendered at x1.25 must end at ~3.2 s
    const fast = await BP.Audio._renderOffline({ music: "gameover", tempo: 1.25 }, 5), slow = await BP.Audio._renderOffline({ music: "gameover" }, 5)
    const b0 = await BP.Audio._renderOffline({ sfx: [[0.05, "bounce", 0]] }, 1), b1 = await BP.Audio._renderOffline({ sfx: [[0.05, "bounce", 1]] }, 1)
    return { before: diff(0.1, 1.9), during: diff(2.0, 2.6), after: diff(5.5, 5.95), peak: T.stats(st).peak, onBase: T.stats(slow).last, onFast: T.stats(fast).last,
      bounce0: T.stats(b0).peak, bounce1: T.stats(b1).peak, c0: T.centroid(b0), c1: T.centroid(b1), wav: T.wav(st), steal: (T.draw(st, document.getElementById("wave"), document.getElementById("spec"), "steal: stage0 + sink@2 cheer@2.05 ballsBack@4"), 1) }
  })
  writeFileSync(join(out, "steal.wav"), Buffer.from(res.wav, "base64")); delete res.wav
  await shot("steal")
  console.log(`steal diff rms before=${res.before.toFixed(4)} during=${res.during.toFixed(4)} after-return=${res.after.toFixed(4)} peak=${res.peak.toFixed(3)}`)
  console.log(`tempo: gameover ends x1.0=${res.onBase.toFixed(2)}s x1.25=${res.onFast.toFixed(2)}s; bounce(0) peak=${res.bounce0.toFixed(3)} centroid=${Math.round(res.c0)} bounce(1) peak=${res.bounce1.toFixed(3)} centroid=${Math.round(res.c1)}`)
  if (res.before > 1e-4) fail("music changed before sfx")
  if (res.during < 0.01) fail("sfx had no effect")
  if (res.after > 0.02) fail("music voice did not return after sfx")
  if (res.peak >= 0.99) fail("clipping with sfx over music")
  if (Math.abs(res.onFast - (0.05 + 4 / 1.25)) > 0.3) fail("setTempo had no effect")
  if (!(res.bounce1 > res.bounce0)) fail("bounce intensity arg not applied")
}

console.log("== LIVE API (real gesture, realtime context)")
{
  const s0 = await page.evaluate(() => { BP.Audio.music("title"); BP.Audio.sfx("sink"); BP.Audio.sfx("nonexistent"); BP.Audio.music("nope"); return BP.Audio._state() })
  console.log("before gesture:", JSON.stringify(s0))
  if (s0.ctx !== "none") fail("context created before any gesture")
  await page.click("#stop") // gesture -> unlock via document listener (title is pending, stop clears it)
  await page.evaluate(() => BP.Audio.music("title"))
  await page.waitForTimeout(600)
  const s1 = await page.evaluate(() => BP.Audio._state())
  console.log("after gesture + music(title):", JSON.stringify(s1))
  if (s1.ctx !== "running" || s1.playing !== "title") fail("live playback not running")
  const s2 = await page.evaluate(async () => {
    const A = BP.Audio, out = {}
    A.sfx("pause"); A.pause(); out.paused = A._state()
    await new Promise((r) => setTimeout(r, 300))
    A.resume(); out.resumed = A._state()
    A.setTempo(1.3); A.music("stage7"); out.stage7 = A._state()
    for (const n of A._list().sfx) A.sfx(n)
    A.toggleMute(); out.muted = A.isMuted(); out.ls = localStorage.getItem("bp_mute"); A.toggleMute()
    A.music("clear"); out.clearTempo = A._state().tempo
    await new Promise((r) => setTimeout(r, 5600))
    out.afterClear = A._state()
    A.music(null); out.stopped = A._state()
    // throw-proofing
    A.sfx(undefined); A.sfx(null, "x"); A.music(42); A.setTempo("abc"); A.setMuted("1"); A.setMuted(false); A.pause(); A.pause(); A.resume(); A.resume()
    return out
  })
  console.log(JSON.stringify(s2))
  if (!s2.paused.paused || s2.paused.playing) fail("pause did not stop music")
  if (s2.resumed.playing !== "title") fail("resume did not restore title")
  if (s2.stage7.playing !== "stage2") fail("stage7 should map to stage2")
  if (!s2.muted || s2.ls !== "1") fail("mute not persisted")
  if (s2.clearTempo !== 1) fail("jingle should reset tempo")
  if (s2.afterClear.playing) fail("clear jingle did not end")
}
console.log("console errors/warnings:", errors.length ? errors : "none")
if (errors.length) fails++
await browser.close()
console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL AUDIO CHECKS PASSED", "  output:", out)
process.exit(fails ? 1 : 0)
