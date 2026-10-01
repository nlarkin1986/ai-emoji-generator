import { chromium, DEV, hookErrors, sleep, key, dbg } from "./judge3-lib.mjs"
const b = await chromium.launch(); const page = await (await b.newContext()).newPage(); const errs = []; hookErrors(page, errs)
await page.goto(DEV); await sleep(800)
for (let i = 0; i < 8; i++) { await key(page, "ArrowDown"); await key(page, "ArrowDown"); await key(page, "z"); await sleep(800); await key(page, "Enter"); await sleep(800); console.log((await dbg(page)).state, errs.length) }
console.log(errs); await b.close()
