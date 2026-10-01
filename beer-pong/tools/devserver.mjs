// Local dev server for SUPER BEER PONG with a working GLOBAL leaderboard.
//   node beer-pong/build.mjs && node beer-pong/tools/devserver.mjs   ->  http://localhost:8787/beerpong/
// Serves public/ and runs the REAL Next route (src/app/api/beerpong/scores/route.ts) against an
// in-memory fake KV, so validation / anti-cheat / ranking behave exactly as in production.
// Options:
//   --port N          (default 8787, or $PORT)
//   --unconfigured    API answers 503 leaderboard_unconfigured  -> game falls back to LOCAL
//   --latency MS      delay every API response
// Dev-only control endpoints (for QA scripts):
//   POST /__dev/kv?fail=1|0        make the fake KV throw (API -> 500, client queues & retries)
//   POST /__dev/net?down=1|0       drop API connections (simulates flaky wifi; header x-dev-bypass skips it)
//   POST /__dev/reset              clear all scores and rate limits
// Admin key for DELETE is $BEERPONG_ADMIN_KEY or "dev".
import http from "node:http"
import { readFile, stat } from "node:fs/promises"
import { join, extname, normalize, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createFakeKv } from "./scores-fakekv.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const pub = join(root, "public")
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const port = +(opt("--port", process.env.PORT || 8787))
const latency = +opt("--latency", 0)

let kv = createFakeKv()
let netDown = false
globalThis.__BEERPONG_STORE__ = args.includes("--unconfigured") ? null : kv
process.env.BEERPONG_ADMIN_KEY ||= "dev"

process.removeAllListeners("warning")
process.on("warning", (w) => { if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w.message) })
let route
try {
  route = await import(join(root, "src/app/api/beerpong/scores/route.ts"))
} catch (e) {
  console.error("Could not load route.ts (needs Node >= 22.18 for TS type stripping, and `bun install` for zod/@vercel/kv):\n", e.message)
  process.exit(1)
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain" }
const body = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))) })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const p = url.pathname
  try {
    if (p.startsWith("/__dev/") && req.method === "POST") {
      if (p === "/__dev/kv") kv.fail = url.searchParams.get("fail") === "1"
      if (p === "/__dev/net") netDown = url.searchParams.get("down") === "1"
      if (p === "/__dev/reset") { kv = createFakeKv(); if (globalThis.__BEERPONG_STORE__) globalThis.__BEERPONG_STORE__ = kv }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, fail: kv.fail, netDown }))
      return
    }
    if (p === "/api/beerpong/scores") {
      if (netDown && !req.headers["x-dev-bypass"]) { req.socket.destroy(); return }
      if (latency) await new Promise((r) => setTimeout(r, latency))
      const handler = route[req.method]
      if (!handler) { res.writeHead(405).end(); return }
      const hasBody = !["GET", "HEAD"].includes(req.method)
      const headers = { ...req.headers, "x-forwarded-for": req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local" }
      const r = await handler(new Request(url, { method: req.method, headers, body: hasBody ? await body(req) : undefined }))
      res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()))
      return
    }
    // static (Next-style rewrite: /beerpong and /beerpong/ -> /beerpong/index.html)
    let file = normalize(join(pub, decodeURIComponent(p)))
    if (!file.startsWith(pub)) { res.writeHead(403).end(); return }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html")
    const data = await readFile(file).catch(() => null)
    if (!data) { res.writeHead(404, { "content-type": "text/plain" }).end("404"); return }
    const h = { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }
    if (p === "/beerpong" || p.startsWith("/beerpong/")) h["set-cookie"] = "bp_api=1; Path=/; Max-Age=604800; SameSite=Lax" // same as next.config.js
    res.writeHead(200, h).end(data)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500).end()
  }
})
server.listen(port, () => {
  console.log(`SUPER BEER PONG dev server: http://localhost:${port}/beerpong/   (TV: /beerpong/?tv)`)
  console.log(`leaderboard: ${globalThis.__BEERPONG_STORE__ ? "GLOBAL (in-memory fake KV)" : "UNCONFIGURED (503 -> local mode)"}; admin key: ${process.env.BEERPONG_ADMIN_KEY}`)
})
