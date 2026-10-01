// In-memory stand-in for the subset of @vercel/kv (Upstash Redis) used by
// src/app/api/beerpong/scores/route.ts. Used by the devserver and the route tests.
// Mimics Upstash's automatic JSON deserialisation of returned members.
export function createFakeKv({ fail = false } = {}) {
  const zsets = new Map() // key -> Map(member -> score)
  const kv = new Map() // key -> number
  const des = (m) => { try { return JSON.parse(m) } catch { return m } }
  const sorted = (key) => [...(zsets.get(key) || new Map())].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const idx = (i, len) => (i < 0 ? len + i : i)
  const guard = () => { if (store.fail) throw new Error("fake kv down") }
  const bound = (v, isMin) => {
    if (v === "+inf") return [Infinity, false]
    if (v === "-inf") return [-Infinity, false]
    const s = String(v)
    return s.startsWith("(") ? [Number(s.slice(1)), true] : [Number(s), false]
  }
  const store = {
    fail,
    _zsets: zsets,
    async zadd(key, { score, member }) {
      guard()
      if (!zsets.has(key)) zsets.set(key, new Map())
      const z = zsets.get(key), had = z.has(member)
      z.set(member, score)
      return had ? 0 : 1
    },
    async zrange(key, start, stop, opts = {}) {
      guard()
      let a = sorted(key)
      if (opts.rev) a = a.reverse()
      const s = idx(start, a.length), e = idx(stop, a.length)
      if (e < 0 || e < s) return []
      return a.slice(Math.max(0, s), e + 1).map(([m]) => des(m))
    },
    async zcount(key, min, max) {
      guard()
      const [lo, lx] = bound(min), [hi, hx] = bound(max)
      return sorted(key).filter(([, s]) => (lx ? s > lo : s >= lo) && (hx ? s < hi : s <= hi)).length
    },
    async zcard(key) { guard(); return (zsets.get(key) || new Map()).size },
    async zrem(key, ...members) {
      guard()
      const z = zsets.get(key); if (!z) return 0
      let n = 0; for (const m of members) if (z.delete(m)) n++
      return n
    },
    async zremrangebyrank(key, start, stop) {
      guard()
      const a = sorted(key), s = Math.max(0, idx(start, a.length)), e = idx(stop, a.length)
      const z = zsets.get(key); let n = 0
      if (!z || e < 0 || e < s) return 0
      for (const [m] of a.slice(s, e + 1)) { z.delete(m); n++ }
      return n
    },
    async incr(key) { guard(); const v = (kv.get(key) || 0) + 1; kv.set(key, v); return v },
    async expire() { guard(); return 1 },
    async del(...keys) { guard(); let n = 0; for (const k of keys) { if (zsets.delete(k)) n++; if (kv.delete(k)) n++ } return n },
    resetRateLimits() { for (const k of [...kv.keys()]) if (k.startsWith("beerpong:rl:")) kv.delete(k) },
  }
  return store
}
