// SUPER BEER PONG — shared party leaderboard (logic shared by the two route files).
//
//   POST   /api/beerpong/run                     -> { ok, token }   (call at the start of every run)
//   GET    /api/beerpong/scores?limit=10         -> { ok, top: Entry[], count }
//   GET    /api/beerpong/scores?admin=1          (header x-admin-key) -> { ok, entries: all, count }
//   POST   /api/beerpong/scores  (run summary)   -> { ok, rank, id, top }
//   DELETE /api/beerpong/scores[?id=...]         (header x-admin-key) -> { ok, removed }
//
// Storage: Redis sorted set `beerpong:scores` (score = points, member = JSON Entry), trimmed to the
// best 500. Works with Vercel KV or any Upstash Redis (REST). With no KV env configured everything
// answers 503 {error:"leaderboard_unconfigured"} and the game keeps scores on-device.
//
// Anti-cheat (a prize is at stake, but this is a party game — not a bank):
//  * Run token: POST /run returns an HMAC-signed {iat, nonce}. A submit must carry it; the server
//    checks the signature, that it was not used for a different entry, and that real wall-clock
//    time since issue covers the claimed durationMs and the minimum plausible run time. Forging
//    a big score from the console therefore needs a token AND real elapsed time.
//  * plausible(): a ceiling derived from the game's scoring rules (mirrored in scores.js).
//  * FNV-1a checksum with a static salt (speed bump only — the salt ships in the page source).
//  * Sanitised names, strict ranges, per-IP rate limits, duplicate-id rejection.

import { createClient } from "@vercel/kv"
import { z } from "zod"

const KEY = "beerpong:scores"
const KEEP = 500
const RATE_LIMIT = 30 // submits per IP per minute (a whole party shares one NAT'd IP)
const RUN_RATE_LIMIT = 60 // run tokens per IP per minute
const MAX_BODY = 4096
const SALT = "SBP-1989-PARTYSOFT" // == scores.js SALT. Not a secret.
const TOKEN_TTL_MS = 7 * 86_400_000 // queued offline scores may arrive days later
const USED_TTL_S = 8 * 86_400 // remember used tokens / ids a bit longer than tokens live
const DURATION_SLACK_MS = 15_000
const MAX_LAG_MS = 120_000 // token fetched late (flaky wifi at run start): client-reported, capped

// ---------------------------------------------------------------- store ----
// Minimal subset of the Upstash/Vercel KV client we use, so tests can inject a fake.
export type KvLike = {
  zadd(key: string, sm: { score: number; member: string }): Promise<unknown>
  zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }): Promise<unknown[]>
  zcount(key: string, min: string | number, max: string | number): Promise<number>
  zcard(key: string): Promise<number>
  zrem(key: string, ...members: unknown[]): Promise<number>
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  del(...keys: string[]): Promise<number>
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<unknown>
  get(key: string): Promise<unknown>
}

let client: KvLike | null = null
function kvEnv() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  }
}
function getStore(): KvLike | null {
  // Test / devserver hook: an in-memory fake (see beer-pong/tools/scores-fakekv.mjs).
  const injected = (globalThis as { __BEERPONG_STORE__?: KvLike | null }).__BEERPONG_STORE__
  if (injected !== undefined) return injected
  const { url, token } = kvEnv()
  if (!url || !token) return null
  if (!client) client = createClient({ url, token, automaticDeserialization: false }) as unknown as KvLike
  return client
}

// -------------------------------------------------------------- helpers ----
type Entry = { id: string; name: string; score: number; stage: number; round: number; ts: number }

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  })
}
const unconfigured = () => json({ ok: false, error: "leaderboard_unconfigured" }, 503)
const storeError = (where: string, e: unknown) => {
  console.error(`[beerpong] ${where} failed`, e)
  return json({ ok: false, error: "store_error" }, 500)
}

const BAD_WORDS = /FUCK|SHIT|CUNT|NIGG|FAGG|NAZI|HITLER|KKK|WHORE|SLUT|BITCH|PUSSY|RAPIST/

/** Uppercase A-Z 0-9 space . - ! ♥, max 8 chars, never empty (-> "PLAYER"). Mirrors scores.js. */
function sanitizeName(raw: unknown): string {
  const s = String(raw == null ? "" : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-!♥]/g, "")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, 8)
    .trim()
  if (!s || BAD_WORDS.test(s.replace(/[^A-Z]/g, ""))) return "PLAYER"
  return s
}

/** FNV-1a 32-bit (hex). Mirrors scores.js. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ("0000000" + h.toString(16)).slice(-8)
}
const SUM_FIELDS = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts", "token", "lag"] as const
function checksum(p: Record<string, unknown>): string {
  return fnv1a(SALT + "|" + SUM_FIELDS.map((k) => (p[k] === undefined || p[k] === null ? "" : String(p[k]))).join("|"))
}

/**
 * Plausibility ceiling. Mirrors scores.js plausible(). Game: 2 rounds x 5 stages (stage 0-4),
 * <= 1,500 pts per make before the Round-2 x2, <= 15,000 bonus per stage.
 *   round in {1,2}, stage in 0..4, S = (round-1)*5 + stage + 1   (stages reached, 1..10)
 *   makes <= shots;  (S-1)*3 <= makes <= S*10 + 10
 *   score <= (makes*1500 + S*15000) * round + 10000
 *   S*20000 <= durationMs <= 3 h;  shots <= durationMs/700 + 20
 */
type Summary = { score: number; stage: number; round: number; makes: number; shots: number; durationMs: number }
function minRunMs(stage: number, round: number) {
  return ((round - 1) * 5 + stage + 1) * 20_000
}
function plausible(p: Summary): string | null {
  if (p.round !== 1 && p.round !== 2) return "bad_round"
  if (!(p.stage >= 0 && p.stage <= 4)) return "bad_stage"
  const S = (p.round - 1) * 5 + p.stage + 1
  if (p.makes > p.shots) return "makes_gt_shots"
  if (p.makes > S * 10 + 10) return "too_many_makes"
  if (p.makes < (S - 1) * 3) return "too_few_makes"
  if (p.score > (p.makes * 1500 + S * 15000) * p.round + 10000) return "score_too_high"
  if (p.durationMs < S * 20_000) return "too_short"
  if (p.durationMs > 3 * 3_600_000) return "too_long"
  if (p.shots > p.durationMs / 700 + 20) return "too_fast"
  return null
}

// ------------------------------------------------------------ run token ----
// token = base64url(JSON {iat, n}) + "." + base64url(HMAC-SHA256(secret, payload))
// Secret: BEERPONG_SECRET, else derived from BEERPONG_ADMIN_KEY, else from the KV token (always
// present when the board works), else random per process (dev only).
function secretMaterial(): string {
  const g = globalThis as { __bpSecret?: string }
  if (process.env.BEERPONG_SECRET) return "s:" + process.env.BEERPONG_SECRET
  if (process.env.BEERPONG_ADMIN_KEY) return "a:" + process.env.BEERPONG_ADMIN_KEY
  const kvToken = kvEnv().token
  if (kvToken) return "k:" + kvToken
  if (!g.__bpSecret) g.__bpSecret = "r:" + Array.from(crypto.getRandomValues(new Uint8Array(32))).join(",")
  return g.__bpSecret
}
const enc = (s: string) => new TextEncoder().encode(s)
const b64url = (bin: string) => btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"))
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc("beerpong-run|" + secretMaterial()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(data)))
  let bin = ""
  for (let i = 0; i < sig.length; i++) bin += String.fromCharCode(sig[i])
  return b64url(bin)
}
async function issueToken(now: number): Promise<string> {
  const n = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")
  const payload = b64url(JSON.stringify({ iat: now, n }))
  return payload + "." + (await hmac(payload))
}
async function readToken(token: string): Promise<{ iat: number; n: string } | null> {
  const [payload, sig] = token.split(".")
  if (!payload || !sig || !safeEqual(sig, await hmac(payload))) return null
  try {
    const o = JSON.parse(unb64url(payload))
    return typeof o.iat === "number" && typeof o.n === "string" && /^[0-9a-f]{24}$/.test(o.n) ? o : null
  } catch {
    return null
  }
}

function parseEntry(m: unknown): Entry | null {
  try {
    const o = (typeof m === "string" ? JSON.parse(m) : m) as Partial<Entry> | null
    if (!o || typeof o !== "object" || typeof o.score !== "number") return null
    return {
      id: String(o.id ?? ""),
      name: sanitizeName(o.name),
      score: o.score,
      stage: Number(o.stage) || 0,
      round: Number(o.round) || 1,
      ts: Number(o.ts) || 0,
    }
  } catch {
    return null
  }
}

async function readTop(store: KvLike, n: number): Promise<Entry[]> {
  const raw = await store.zrange(KEY, 0, n - 1, { rev: true })
  return raw
    .map(parseEntry)
    .filter((e): e is Entry => !!e)
    .sort((a, b) => b.score - a.score || a.ts - b.ts) // ties: earlier score ranks higher (arcade rule)
}

function clientIp(req: Request): string {
  const h = req.headers
  const xff = h.get("x-forwarded-for")
  const ip = (xff && xff.split(",")[0].trim()) || h.get("x-real-ip") || (req as { ip?: string }).ip || "local"
  return ip.slice(0, 64)
}

/** Fixed-window limiter: one key per IP per minute, so a lost EXPIRE can never lock anyone out. */
async function rateLimited(store: KvLike, kind: string, ip: string, limit: number): Promise<boolean> {
  const key = `beerpong:${kind}:${ip}:${Math.floor(Date.now() / 60000)}`
  const n = await store.incr(key)
  if (n === 1) await store.expire(key, 120)
  return n > limit
}

/** Constant-time string compare (no early exit on mismatch). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
function isAdmin(req: Request): "ok" | "unset" | "denied" {
  const adminKey = process.env.BEERPONG_ADMIN_KEY
  if (!adminKey) return "unset"
  return safeEqual(req.headers.get("x-admin-key") || "", adminKey) ? "ok" : "denied"
}
function adminFail(state: "unset" | "denied") {
  return state === "unset" ? json({ ok: false, error: "admin_unconfigured" }, 503) : json({ ok: false, error: "unauthorized" }, 401)
}

const int = (min: number, max: number) => z.number().int().min(min).max(max)
const Body = z.object({
  v: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/),
  name: z.string().max(64),
  score: int(0, 9_999_999),
  stage: int(0, 4),
  round: int(1, 2),
  cups: int(0, 9999).optional(),
  accuracy: z.number().min(0).max(100).optional(),
  shots: int(0, 100_000),
  makes: int(0, 100_000),
  durationMs: int(0, 86_400_000),
  ts: z.number().int().optional(),
  token: z.string().max(300).optional(),
  lag: int(0, 86_400_000).optional(),
  sum: z.string().max(16),
})

// --------------------------------------------------------------- routes ----
type Handler = (req: Request) => Promise<Response>
// The game sends `x-bp-soft: 1`: errors then come back as HTTP 200 {ok:false, error, status}
// so browsers don't log "Failed to load resource" console errors (judged!) when the board is
// unconfigured or a submit is rejected. Plain clients (curl, TV, tests) get real status codes.
export function soften(handler: Handler): Handler {
  return async (req) => {
    const res = await handler(req)
    if (res.status < 400 || req.headers.get("x-bp-soft") !== "1") return res
    const body = (await res.json()) as Record<string, unknown>
    return json({ ...body, status: res.status }, 200)
  }
}

export async function runPost(req: Request): Promise<Response> {
  const store = getStore()
  if (!store) return unconfigured()
  try {
    if (await rateLimited(store, "rlrun", clientIp(req), RUN_RATE_LIMIT)) return json({ ok: false, error: "rate_limited" }, 429, { "retry-after": "60" })
    const now = Date.now()
    return json({ ok: true, token: await issueToken(now), iat: now })
  } catch (e) {
    return storeError("run", e)
  }
}

export async function scoresGet(req: Request): Promise<Response> {
  const store = getStore()
  if (!store) return unconfigured()
  const q = new URL(req.url).searchParams
  if (q.has("admin")) {
    const a = isAdmin(req)
    if (a !== "ok") return adminFail(a)
    try {
      const entries = (await readTop(store, KEEP)).map((e, i) => ({ rank: i + 1, ...e }))
      return json({ ok: true, entries, count: entries.length })
    } catch (e) {
      return storeError("admin GET", e)
    }
  }
  const lim = parseInt(q.get("limit") || "10", 10)
  const n = Math.min(100, Math.max(1, Number.isFinite(lim) ? lim : 10))
  try {
    const [top, count] = await Promise.all([readTop(store, n), store.zcard(KEY)])
    return json({ ok: true, top, count })
  } catch (e) {
    return storeError("GET", e)
  }
}

export async function scoresPost(req: Request): Promise<Response> {
  const store = getStore()
  if (!store) return unconfigured()
  try {
    if (await rateLimited(store, "rl", clientIp(req), RATE_LIMIT)) return json({ ok: false, error: "rate_limited" }, 429, { "retry-after": "60" })
  } catch (e) {
    return storeError("rate limit", e)
  }

  let raw: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413)
    raw = JSON.parse(text)
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return json({ ok: false, error: "invalid", issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + ": " + i.message) }, 400)
  const p = parsed.data
  if (checksum(raw as Record<string, unknown>) !== p.sum) return json({ ok: false, error: "bad_checksum" }, 400)
  const why = plausible(p)
  if (why) return json({ ok: false, error: "implausible", reason: why }, 422)

  // Run token: signed by us, recent enough, and real time elapsed covers the claimed run.
  const now = Date.now()
  const tok = p.token ? await readToken(p.token) : null
  if (!tok) return json({ ok: false, error: "implausible", reason: p.token ? "bad_token" : "no_token" }, 422)
  if (tok.iat > now + 60_000 || now - tok.iat > TOKEN_TTL_MS) return json({ ok: false, error: "implausible", reason: "token_expired" }, 422)
  const elapsed = now - tok.iat + Math.min(p.lag || 0, MAX_LAG_MS)
  if (elapsed + DURATION_SLACK_MS < Math.max(p.durationMs, minRunMs(p.stage, p.round))) return json({ ok: false, error: "implausible", reason: "token_too_young" }, 422)

  // Keep the client's ts when sane so a retried submit produces the identical member (idempotent).
  const ts = p.ts != null && p.ts > now - TOKEN_TTL_MS && p.ts < now + 86_400_000 ? p.ts : now
  const entry: Entry = { id: p.id, name: sanitizeName(p.name), score: p.score, stage: p.stage, round: p.round, ts }
  const member = JSON.stringify(entry)
  try {
    // One entry per token and per id. A retry of the SAME entry (lost response, offline queue)
    // is accepted idempotently; anything else reusing the token / id is rejected.
    for (const k of [`beerpong:tok:${tok.n}`, `beerpong:id:${p.id}`]) {
      const fresh = await store.set(k, member, { nx: true, ex: USED_TTL_S })
      if (!fresh && String(await store.get(k)) !== member) return json({ ok: false, error: "implausible", reason: k.includes(":tok:") ? "token_used" : "duplicate_id" }, 422)
    }
    await store.zadd(KEY, { score: entry.score, member })
    await store.zremrangebyrank(KEY, 0, -(KEEP + 1))
    const [higher, top] = await Promise.all([store.zcount(KEY, `(${entry.score}`, "+inf"), readTop(store, 10)])
    return json({ ok: true, rank: higher + 1, id: entry.id, top })
  } catch (e) {
    return storeError("POST", e)
  }
}

export async function scoresDelete(req: Request): Promise<Response> {
  const a = isAdmin(req)
  if (a !== "ok") return adminFail(a)
  const store = getStore()
  if (!store) return unconfigured()
  const id = new URL(req.url).searchParams.get("id")
  try {
    if (!id) return json({ ok: true, removed: (await store.del(KEY)) ? "all" : 0 })
    const all = await store.zrange(KEY, 0, -1)
    const hits = all.filter((m) => parseEntry(m)?.id === id).map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
    return json({ ok: true, removed: hits.length ? await store.zrem(KEY, ...hits) : 0 })
  } catch (e) {
    return storeError("DELETE", e)
  }
}
