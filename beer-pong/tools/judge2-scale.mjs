import { chromium, devices, DEV, sleep } from "./judge2-lib.mjs"
const b = await chromium.launch()
for (const name of ["iPhone 13", "iPhone 13 landscape", "iPhone SE", "iPhone SE landscape", "Pixel 7", "Pixel 7 landscape", "Galaxy S9+", "iPhone 15 Pro Max", "iPad Mini", "Galaxy S8"]) {
  const d = devices[name]; if (!d) { console.log("no", name); continue }
  const ctx = await b.newContext({ ...d, hasTouch: true }); const page = await ctx.newPage(); await page.goto(DEV); await sleep(700)
  const r = await page.evaluate(() => { const r = document.getElementById("screen").getBoundingClientRect(); return { w: r.width, h: r.height, dpr: devicePixelRatio, vp: [innerWidth, innerHeight], over: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight } })
  const k = r.w * r.dpr / 256
  console.log(name.padEnd(22), JSON.stringify(r), "dev px/pixel", k.toFixed(3), Math.abs(k - Math.round(k)) < 0.02 ? "INT" : "non-int", "screen fill", (100 * r.w * r.h / (r.vp[0] * r.vp[1])).toFixed(0) + "%")
  await ctx.close()
}
await b.close()
