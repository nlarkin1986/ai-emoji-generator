# SUPER BEER PONG: host guide

This is a single-file NES-style beer pong game, served at **`/beerpong`** by this Next.js app. Guests play on their phones and their high scores go to one shared leaderboard. Put the leaderboard on a TV with **`/beerpong?tv`**.

## 1. Deploy (Vercel)
1. Build the game: `node beer-pong/build.mjs`. This writes `public/beerpong/index.html`. Commit that file, or run the build before `next build`.
2. Deploy the app to Vercel as usual.
3. Create the leaderboard database. In the Vercel project, go to **Storage → Create → KV** (or **Marketplace → Upstash Redis**) and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Either pair works.
4. Add the env var `BEERPONG_ADMIN_KEY` (for example from `openssl rand -hex 24`), used for the admin list and reset. Optionally also add `BEERPONG_SECRET`, which signs run tokens; by default that secret is derived from the admin key or the KV token.
5. Redeploy. Open `https://<your-app>/api/beerpong/scores`. It should return `{"ok":true,"top":[],...}`. If you get `503 leaderboard_unconfigured`, the KV env vars are missing.

## 2. At the party
- **Phones:** share `https://<your-app>/beerpong` (a QR code works well). The HIGH SCORES screen shows **GLOBAL** when the shared board is live.
- **TV:** open `https://<your-app>/beerpong?tv` full screen. It refreshes every 10 s.
- **Host admin (curl one-liners)**, with `K=<your BEERPONG_ADMIN_KEY>` and `H=https://<your-app>`:
  ```sh
  # list every entry (rank, id, name, score, stage, round, ts)
  curl -s -H "x-admin-key: $K" "$H/api/beerpong/scores?admin=1"
  # remove one entry (cheater, rude name)
  curl -s -X DELETE -H "x-admin-key: $K" "$H/api/beerpong/scores?id=<id>"
  # wipe the board (do this right before the party)
  curl -s -X DELETE -H "x-admin-key: $K" "$H/api/beerpong/scores"
  ```

## 3. Offline and fallback behaviour
- Every score is also saved on the phone in `localStorage` (`bp_scores`, which keeps the top 50).
- If a submit fails because of wifi, a timeout, rate limiting or a server error, the score is queued in `bp_pending`, together with its run token.
- Queued scores are retried in the background (after 15 s, 30 s, then every 60 s) while the queue is non-empty. They are also retried when the browser comes back online, when the tab becomes visible, and on `pageshow`.
- No requests are made while `navigator.onLine` is false, so the console stays clean.
- Each entry carries a client id. The server accepts an identical retry and ignores duplicates, so a score can never be double-counted.
- `submit()` reports `mode:'local'` (with `queued:true` or `rejected`) whenever the score is not yet on the shared board.
- If no API is reachable, the game runs in **LOCAL** mode with an on-device table. That covers no KV configured, a static host, or `file://`. The game only probes the API when the page was served by this app: the Next config sets the cookie `bp_api=1` on `/beerpong`, and `?api` forces the probe. Static copies therefore never log 404s.
- Inside a claude.ai Artifact, the game uses the artifact's shared `db` (collection `scores`) when it is available. Viewers who cannot write fall back to the local table. Run tokens are not used there.

## 4. API (`src/app/api/beerpong/_lib.ts`, routes `run/` and `scores/`)
| Method | Request | Response |
|---|---|---|
| POST `/api/beerpong/run` | none (called by `BP.Scores.startRun()` at the start of every run) | `{ok, token}` |
| GET `/api/beerpong/scores` | `?limit=10` (1–100) | `{ok, top:[{id,name,score,stage,round,ts}], count}` |
| GET `/api/beerpong/scores?admin=1` | header `x-admin-key` | `{ok, entries:[{rank,id,...}], count}` (all, up to 500) |
| POST `/api/beerpong/scores` | `{v:1,id,name,score,stage,round,cups,accuracy,shots,makes,durationMs,ts,token,lag,sum}` | `{ok, rank, id, top}` |
| DELETE `/api/beerpong/scores` | header `x-admin-key`, optional `?id=` | `{ok, removed}` |

Errors are 400 (invalid or bad checksum), 401, 413, 422 (implausible or bad token, with a `reason`), 429 (30 submits / 60 tokens per minute per IP), 500 (store error) and 503 (unconfigured). The game sends `x-bp-soft: 1`, which turns errors into `200 {ok:false,error,status}` so browsers log nothing to the console.

Storage:
- The scores are a Redis sorted set `beerpong:scores`. The score is the points and the member is the JSON entry. Only the best 500 are kept.
- `beerpong:tok:<nonce>` and `beerpong:id:<id>` each hold the entry the token or id was used for. They expire after 8 days.
- Rate-limit keys are `beerpong:rl[run]:<ip>:<minute>`.

**Anti-cheat.** A prize is at stake, but this is still a party game, so the goal is to make forging tedious:
1. **Run token.** `POST /run` returns `{iat, nonce}` signed with HMAC-SHA256. The secret is `BEERPONG_SECRET`, or else one derived from `BEERPONG_ADMIN_KEY`, or else from the KV token. A submit must carry the token, and the server checks that:
   - the token is valid and at most 7 days old;
   - it was not used for a different entry;
   - `now − iat + min(lag, 120 s) + 15 s ≥ max(durationMs, S·20 s)`.

   So a console forger needs a token **and** must wait as long as the run they claim. `lag` covers a token fetched late on flaky wifi.
2. **Plausibility.** `round ∈ 1..30` (3+ = CHAMPION'S GAUNTLET, multiplier = round), `stage ∈ 0..4`, `S = (round−1)·5 + stage + 1`, and:
   ```
   makes ≤ shots;   (S−1)·3 ≤ makes ≤ S·10 + 10
   score ≤ (makes·1500 + S·15000)·round + 10000
   S·20 s ≤ durationMs ≤ 3 h;   shots ≤ durationMs/700 + 20
   ```
3. Sanitised names (A–Z 0–9 space . - ! ♥, 8 characters, plus a small bad-word filter), strict ranges, and an FNV-1a checksum with a *static* salt. The checksum is a speed bump only, because the salt ships in the page.

What remains possible: someone who reads the source can still post up to the plausibility ceiling for a run as long as they actually waited. For S = 10 that is a ceiling of 640,000 after a 200 s wait. Keep an eye on `?admin=1` and remove suspicious entries.

## 5. Local development
```sh
bun install --ignore-scripts                 # once
node beer-pong/build.mjs
node beer-pong/tools/devserver.mjs           # http://localhost:8787/beerpong/  (GLOBAL, in-memory board)
node beer-pong/tools/devserver.mjs --unconfigured   # 503 -> LOCAL mode
```
The devserver runs the real route handler against an in-memory fake KV. QA hooks are `POST /__dev/net?down=1`, `/__dev/kv?fail=1`, `/__dev/clock?advance=ms` (ages run tokens) and `/__dev/reset`. The admin key is `dev`.

Tests:
- `node beer-pong/tools/scores-route.test.mjs` runs the route against the fake KV.
- `node beer-pong/tools/scores-browser.test.mjs` runs Playwright against the global, 503, offline-queue, `file://` and artifact-db paths.
