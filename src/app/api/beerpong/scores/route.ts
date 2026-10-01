// SUPER BEER PONG — shared party leaderboard.
//
//   GET    /api/beerpong/scores?limit=10      -> { ok, top: Entry[], count }
//   POST   /api/beerpong/scores  (run summary) -> { ok, rank, id, top }
//   DELETE /api/beerpong/scores[?id=...]       (header x-admin-key) -> { ok, removed }
//
// Storage: one Redis sorted set `beerpong:scores` (score = points, member = JSON Entry),
// trimmed to the best 500. Works with Vercel KV or any Upstash Redis (REST) database.
// When no KV env is configured every method answers 503 {error:"leaderboard_unconfigured"}
// and the game silently falls back to its on-device (localStorage) table.
//
// Anti-cheat is deliberately light (a party game, not a bank): sanitised names, strict
// field ranges, a client checksum with a static salt (a speed bump only — the salt ships
// in the page source), a generous "could this score have been earned?" ceiling and a
// per-IP rate limit. The client (beer-pong/src/scores.js) mirrors checksum() and
// plausible() exactly; keep both files in sync.

import { createClient } from "@vercel/kv"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0

const KEY = "beerpong:scores"
const KEEP = 500
const RATE_LIMIT = 30 // submits per IP per minute (a whole party shares one NAT'd IP)
const MAX_BODY = 4096
const SALT = "SBP-1989-PARTYSOFT" // == scores.js SALT. Not a secret: a speed bump.

// ---------------------------------------------------------------- store ----
// Minimal subset of the Upstash/Vercel KV client we use, so tests can inject a fake.
type KvLike = {
  zadd(key: string, sm: { score: number; member: string }): Promise<unknown>
  zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }): Promise<unknown[]>
  zcount(key: string, min: string | number, max: string | number): Promise<number>
  zcard(key: string): Promise<number>
  zrem(key: string, ...members: unknown[]): Promise<number>
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  del(...keys: string[]): Promise<number>
}

let client: KvLike | null = null
function getStore(): KvLike | null {
  // Test / devserver hook: an in-memory fake (see beer-pong/tools/scores-fakekv.mjs).
  const injected = (globalThis as { __BEERPONG_STORE__?: KvLike | null }).__BEERPONG_STORE__
  if (injected !== undefined) return injected
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  if (!client) client = createClient({ url, token }) as unknown as KvLike
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
const SUM_FIELDS = ["v", "id", "name", "score", "stage", "round", "cups", "accuracy", "shots", "makes", "durationMs", "ts"] as const
function checksum(p: Record<string, unknown>): string {
  return fnv1a(SALT + "|" + SUM_FIELDS.map((k) => (p[k] === undefined || p[k] === null ? "" : String(p[k]))).join("|"))
}

/**
 * Generous "could this have been earned?" ceiling. Mirrors scores.js plausible().
 *   R        = max(1, round)                      (round is 1-based; Round 2 pays x2)
 *   S        = (R-1)*5 + stage + 1                (stages touched; stage is the 0-based index reached)
 *   makesEff = makes ?? S*25
 *   maxScore = (makesEff*3000 + S*16000) * R + 10000
 * plus, when supplied: makes <= shots, shots <= durationMs/400 + 20,
 * makes >= (S-2)*3 and durationMs >= (S-2)*5000 (stages surely cleared need cups and time).
 */
type Summary = { score: number; stage: number; round: number; makes?: number; shots?: number; durationMs?: number }
function plausible(p: Summary): string | null {
  const R = Math.max(1, p.round)
  const S = (R - 1) * 5 + p.stage + 1
  const cleared = Math.max(0, S - 2)
  const makesEff = p.makes ?? S * 25
  const maxScore = (makesEff * 3000 + S * 16000) * R + 10000
  if (p.score > maxScore) return "score_too_high"
  if (p.makes != null && p.shots != null && p.makes > p.shots) return "makes_gt_shots"
  if (p.shots != null && p.durationMs != null && p.shots > p.durationMs / 400 + 20) return "too_fast"
  if (p.makes != null && p.makes < cleared * 3) return "too_few_makes"
  if (p.durationMs != null && p.durationMs < cleared * 5000) return "too_short"
  return null
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
async function rateLimited(store: KvLike, ip: string): Promise<boolean> {
  const key = `beerpong:rl:${ip}:${Math.floor(Date.now() / 60000)}`
  const n = await store.incr(key)
  if (n === 1) await store.expire(key, 120)
  return n > RATE_LIMIT
}

/** Constant-time string compare (no early exit on mismatch). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

const int = (min: number, max: number) => z.number().int().min(min).max(max)
const Body = z.object({
  v: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/),
  name: z.string().max(64),
  score: int(0, 9_999_999),
  stage: int(0, 999).default(0),
  round: int(0, 999).default(1),
  cups: int(0, 9999).optional(),
  accuracy: z.number().min(0).max(100).optional(),
  shots: int(0, 100_000).optional(),
  makes: int(0, 100_000).optional(),
  durationMs: int(0, 86_400_000).optional(),
  ts: z.number().int().optional(),
  sum: z.string().max(16),
})

// --------------------------------------------------------------- routes ----
// The game sends `x-bp-soft: 1`: errors then come back as HTTP 200 {ok:false, error, status}
// so browsers don't log "Failed to load resource" console errors (judged!) when the board is
// unconfigured or a submit is rejected. Plain clients (curl, TV, tests) get real status codes.
function soften(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req)
    if (res.status < 400 || req.headers.get("x-bp-soft") !== "1") return res
    const body = (await res.json()) as Record<string, unknown>
    return json({ ...body, status: res.status }, 200)
  }
}
export const GET = soften(handleGet)
export const POST = soften(handlePost)

async function handleGet(req: Request): Promise<Response> {
  const store = getStore()
  if (!store) return unconfigured()
  const lim = parseInt(new URL(req.url).searchParams.get("limit") || "10", 10)
  const n = Math.min(100, Math.max(1, Number.isFinite(lim) ? lim : 10))
  try {
    const [top, count] = await Promise.all([readTop(store, n), store.zcard(KEY)])
    return json({ ok: true, top, count })
  } catch (e) {
    console.error("[beerpong] GET failed", e)
    return json({ ok: false, error: "store_error" }, 500)
  }
}

async function handlePost(req: Request): Promise<Response> {
  const store = getStore()
  if (!store) return unconfigured()
  try {
    if (await rateLimited(store, clientIp(req))) return json({ ok: false, error: "rate_limited" }, 429, { "retry-after": "60" })
  } catch (e) {
    console.error("[beerpong] rate limit failed", e)
    return json({ ok: false, error: "store_error" }, 500)
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

  const now = Date.now()
  // Keep the client's ts when sane so a retried submit produces the identical member (idempotent ZADD).
  const ts = p.ts != null && p.ts > now - 30 * 86_400_000 && p.ts < now + 86_400_000 ? p.ts : now
  const entry: Entry = { id: p.id, name: sanitizeName(p.name), score: p.score, stage: p.stage, round: p.round, ts }
  try {
    await store.zadd(KEY, { score: entry.score, member: JSON.stringify(entry) })
    await store.zremrangebyrank(KEY, 0, -(KEEP + 1))
    const [higher, top] = await Promise.all([store.zcount(KEY, `(${entry.score}`, "+inf"), readTop(store, 10)])
    return json({ ok: true, rank: higher + 1, id: entry.id, top })
  } catch (e) {
    console.error("[beerpong] POST failed", e)
    return json({ ok: false, error: "store_error" }, 500)
  }
}

export async function DELETE(req: Request) {
  const adminKey = process.env.BEERPONG_ADMIN_KEY
  if (!adminKey) return json({ ok: false, error: "admin_unconfigured" }, 503)
  if (!safeEqual(req.headers.get("x-admin-key") || "", adminKey)) return json({ ok: false, error: "unauthorized" }, 401)
  const store = getStore()
  if (!store) return unconfigured()
  const id = new URL(req.url).searchParams.get("id")
  try {
    if (!id) return json({ ok: true, removed: await store.del(KEY) ? "all" : 0 })
    const all = await store.zrange(KEY, 0, -1)
    const hits = all.filter((m) => parseEntry(m)?.id === id).map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
    return json({ ok: true, removed: hits.length ? await store.zrem(KEY, ...hits) : 0 })
  } catch (e) {
    console.error("[beerpong] DELETE failed", e)
    return json({ ok: false, error: "store_error" }, 500)
  }
}
