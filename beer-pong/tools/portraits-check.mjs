// Lint the hand-authored portrait maps: row counts, half widths, unknown chars, patch bounds.
// node beer-pong/tools/portraits-check.mjs
import fs from "node:fs"
import vm from "node:vm"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(join(here, "..", "src", "art-portraits.js"), "utf8")
const win = { BP: { Art: { PAL: {}, drawPortrait() {}, init() {} } } }
vm.runInNewContext(code, { window: win, document: {} })
const CH = win.BP.Art._portraitDefs
let bad = 0
const err = (m) => { console.log("BAD " + m); bad++ }
for (const who in CH) {
  const d = CH[who]
  for (const [key, size] of [["p64", 64], ["p32", 32]]) {
    const s = d[key]; if (!s) { err(`${who}.${key} missing`); continue }
    if (s.half.length !== size) err(`${who}.${key} has ${s.half.length} rows`)
    s.half.forEach((r, i) => { if (r.length !== size / 2) err(`${who}.${key} row ${i} len ${r.length}`) })
    const roles = new Set(Object.keys(d.pal).concat(["K", "E", "W", "w", "M", ".", ","]))
    s.half.forEach((r, i) => { for (const ch of r) if (!roles.has(ch)) err(`${who}.${key} row ${i} unknown '${ch}'`) })
    ;(s.patches || []).forEach(([x, y, p], n) => {
      p.forEach((r, j) => { if (x + r.length > size || y + j >= size) err(`${who}.${key} patch ${n} out of bounds`); for (const ch of r) if (!roles.has(ch)) err(`${who}.${key} patch ${n} unknown '${ch}'`) })
    })
  }
}
console.log(bad ? bad + " problems" : "portrait maps OK (" + Object.keys(CH).join(", ") + ")")
process.exit(bad ? 1 : 0)
