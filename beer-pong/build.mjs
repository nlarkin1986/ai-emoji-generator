// Inlines all game modules into ONE self-contained HTML file (bake-off style).
// Usage: node beer-pong/build.mjs   ->  public/beerpong/index.html
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "src")
const MODULES = ["art", "audio", "input", "scores", "game"] // load order matters

const pick = (m) => {
  const real = join(src, `${m}.js`)
  if (existsSync(real)) return { file: real, stub: false }
  const stub = join(src, "_stubs", `${m}.js`)
  if (existsSync(stub)) return { file: stub, stub: true }
  throw new Error(`missing module ${m} (no src/${m}.js and no stub)`)
}

const shell = readFileSync(join(src, existsSync(join(src, "shell.html")) ? "shell.html" : "_stubs/shell.html"), "utf8")
if (!shell.includes("<!-- @@SCRIPTS@@ -->")) throw new Error("shell.html must contain <!-- @@SCRIPTS@@ -->")

const parts = MODULES.map((m) => {
  const { file, stub } = pick(m)
  if (stub) console.warn(`[build] using STUB for ${m}`)
  const code = readFileSync(file, "utf8").replace(/<\/script/gi, "<\\/script")
  return `<script>\n/* ==== ${m}.js ==== */\n${code}\n</script>`
})

const html = shell.replace("<!-- @@SCRIPTS@@ -->", () => `<script>window.BP=window.BP||{};</script>\n` + parts.join("\n"))
const out = join(here, "..", "public", "beerpong", "index.html")
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`[build] wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`)
