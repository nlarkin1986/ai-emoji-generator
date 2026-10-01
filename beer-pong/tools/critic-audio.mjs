// Critic audio pass: offline-render tracks via BP.Audio._renderOffline, draw waveform + spectrogram PNGs, print stats.
import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { join } from "node:path"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))
const OUT = "/tmp/claude-0/-home-user-ai-emoji-generator/882cccb5-0c44-5c24-8b34-6afc9a583ff8/scratchpad/critic"
const FILE = "file:///home/user/ai-emoji-generator/public/beerpong/index.html"
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(FILE + "?debug")
await page.waitForFunction(() => window.BP && BP.Audio && BP.Audio._renderOffline)
const specs = [["title", 10], ["stage0", 10], ["stage2", 8], ["fire", 6], ["sfx:sink", 1.5], ["sfx:cheer", 2], ["sfx:onFire", 1.5], ["sfx:rim", 0.6]]
for (const [spec, secs] of specs) {
  const r = await page.evaluate(async ([spec, secs]) => {
    const buf = await BP.Audio._renderOffline(spec, secs)
    const d = buf.getChannelData(0), sr = buf.sampleRate, N = d.length
    let peak = 0, sq = 0, clip = 0
    for (let i = 0; i < N; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; if (a > 0.99) clip++ }
    // distinct amplitude levels in a 4-voice mix are not meaningful; instead measure a short pulse-only window
    const W = 1200, H = 520, c = document.createElement("canvas"); c.width = W; c.height = H
    const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, W, H)
    // top: full waveform envelope
    x.strokeStyle = "#5c94fc"
    for (let px = 0; px < W; px++) {
      let mn = 1, mx = -1
      const a = Math.floor((px * N) / W), b = Math.floor(((px + 1) * N) / W)
      for (let i = a; i < b; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i] }
      x.beginPath(); x.moveTo(px + 0.5, 60 - mx * 55); x.lineTo(px + 0.5, 60 - mn * 55); x.stroke()
    }
    // middle: 25 ms zoom at 1.0 s
    const z0 = Math.floor(sr * Math.min(1.0, secs * 0.4)), zN = Math.floor(sr * 0.025)
    x.strokeStyle = "#fcfcfc"; x.beginPath()
    for (let i = 0; i < zN; i++) { const px = (i / zN) * W, py = 190 - d[z0 + i] * 65; i ? x.lineTo(px, py) : x.moveTo(px, py) }
    x.stroke()
    // bottom: spectrogram 0..11 kHz (naive DFT on 1024 windows, log magnitude)
    const FFT = 1024, cols = 300, rows = 256, top = 260
    const img = x.createImageData(cols, rows)
    for (let cI = 0; cI < cols; cI++) {
      const off = Math.floor((cI / cols) * (N - FFT))
      const re = new Float32Array(FFT), im = new Float32Array(FFT)
      for (let i = 0; i < FFT; i++) re[i] = d[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT))
      // radix-2 fft
      for (let i = 1, j = 0; i < FFT; i++) { let bit = FFT >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
      for (let len = 2; len <= FFT; len <<= 1) {
        const ang = (-2 * Math.PI) / len
        for (let i = 0; i < FFT; i += len) for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k), wi = Math.sin(ang * k), ar = re[i + k + len / 2], ai = im[i + k + len / 2]
          const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr
          re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti; re[i + k] += tr; im[i + k] += ti
        }
      }
      for (let rI = 0; rI < rows; rI++) {
        const bin = Math.floor((rI / rows) * (FFT / 2))
        const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2)
        const v = Math.max(0, Math.min(255, 255 + 20 * Math.log10(mag + 1e-9) * 4))
        const p = ((rows - 1 - rI) * cols + cI) * 4
        img.data[p] = v; img.data[p + 1] = v * 0.7; img.data[p + 2] = 255 - v * 0.5; img.data[p + 3] = 255
      }
    }
    const tmp = document.createElement("canvas"); tmp.width = cols; tmp.height = rows; tmp.getContext("2d").putImageData(img, 0, 0)
    x.imageSmoothingEnabled = false; x.drawImage(tmp, 0, top, W, H - top)
    x.fillStyle = "#fc0"; x.font = "14px monospace"; x.fillText(spec + "  (top: envelope, mid: 25ms zoom, bottom: spectrogram 0-22kHz)", 8, 14)
    return { url: c.toDataURL(), peak: +peak.toFixed(3), rms: +Math.sqrt(sq / N).toFixed(4), clip, sr, info: BP.Audio._info(spec) && { bpm: BP.Audio._info(spec).bpm, sec: +BP.Audio._info(spec).sec.toFixed(1), loopSec: +BP.Audio._info(spec).loopSec.toFixed(1), warn: BP.Audio._info(spec).warn } }
  }, [spec, secs])
  fs.writeFileSync(join(OUT, "snd-" + spec.replace(":", "_") + ".png"), Buffer.from(r.url.split(",")[1], "base64"))
  delete r.url
  console.log(spec, JSON.stringify(r))
}
console.log(JSON.stringify(await page.evaluate(() => BP.Audio._list())))
await browser.close()
