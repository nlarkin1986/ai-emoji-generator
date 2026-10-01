# SUPER BEER PONG: host guide

This is a single-file NES-style beer pong game, served at **`/beerpong`** by this Next.js app. Guests play on their phones and their high scores go to one shared leaderboard. Put the leaderboard on a TV with **`/beerpong?tv`**.

## 1. Deploy (Vercel)
1. Build the game: `node beer-pong/build.mjs`. This writes `public/beerpong/index.html`. Commit that file, or run the build before `next build`.
2. Deploy the app to Vercel as usual.
3. Create the leaderboard database. In the Vercel project, go to **Storage → Create → KV** (or **Marketplace → Upstash Redis**) and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Either pair works.
4. Add the env var `BEERPONG_ADMIN_KEY` (for example from `openssl rand -hex 24`). It is only needed to reset the board.
5. Redeploy. Open `https://<your-app>/api/beerpong/scores`. It should return `{"ok":true,"top":[],...}`. If you get `503 leaderboard_unconfigured`, the KV env vars are missing.

## 2. At the party
- **Phones:** share `https://<your-app>/beerpong` (a QR code works well). The HIGH SCORES screen shows **GLOBAL** when the shared board is live.
- **TV:** open `https://<your-app>/beerpong?tv` full screen. It refreshes every 10 s.
- **Reset the board before the party:**
  ```sh
  curl -X DELETE -H "x-admin-key: $BEERPONG_ADMIN_KEY" https://<your-app>/api/beerpong/scores
  ```
- **Remove one bogus entry:** first find its `id` with `curl https://<your-app>/api/beerpong/scores?limit=100`, then run:
  ```sh
  curl -X DELETE -H "x-admin-key: $BEERPONG_ADMIN_KEY" "https://<your-app>/api/beerpong/scores?id=<id>"
  ```

## 3. Offline and fallback behaviour
- Every score is also saved on the phone in `localStorage` (`bp_scores`, which keeps the top 50).
- If a submit fails because of wifi, a timeout, rate limiting or a server error, the score is queued (`bp_pending`). It is retried on the next submit, the next page load, a leaderboard refresh, or when the browser comes back online. Until then the player still sees their score on the board.
- If no API is reachable, the game runs in **LOCAL** mode with an on-device table. That covers no KV configured, a static host, or `file://`. The game only probes the API when the page was served by this app: the Next config sets the cookie `bp_api=1` on `/beerpong`, and `?api` forces the probe. Static copies therefore never log 404s.
- Inside a claude.ai Artifact, the game uses the artifact's shared `db` (collection `scores`) when it is available. Viewers who cannot write fall back to the local table.

## 4. API (`src/app/api/beerpong/scores/route.ts`)
| Method | Request | Response |
|---|---|---|
| GET | `?limit=10` (1–100) | `{ok, top:[{id,name,score,stage,round,ts}], count}` |
| POST | run summary `{v:1,id,name,score,stage,round,cups,accuracy,shots,makes,durationMs,ts,sum}` | `{ok, rank, id, top}` |
| DELETE | header `x-admin-key`, optional `?id=` | `{ok, removed}` |

Errors are 400 (invalid or bad checksum), 413, 422 (implausible), 429 (rate limited, 30/min per IP), 500 (store error) and 503 (unconfigured). The game sends `x-bp-soft: 1`, which turns errors into `200 {ok:false,error,status}` so browsers log nothing to the console.

Storage is a Redis sorted set `beerpong:scores`. The score is the points and the member is the JSON entry. Only the best 500 are kept. Rate-limit keys are `beerpong:rl:<ip>:<minute>`.

**Anti-cheat is a speed bump, not security.** It consists of:
- sanitised names (A–Z 0–9 space . - ! ♥, 8 characters, plus a small bad-word filter);
- strict ranges;
- an FNV-1a checksum with a *static* salt (it is in the page source, so anyone determined can forge it);
- the plausibility ceiling below;
- the per-IP rate limit.

Plausibility check (`round` is 1-based, `stage` is the 0-based stage reached):
```
R = max(1, round);  S = (R-1)*5 + stage + 1;  makesEff = makes ?? S*25
reject if score > (makesEff*3000 + S*16000) * R + 10000
       or makes > shots,  shots > durationMs/400 + 20,
       makes < (S-2)*3,   durationMs < (S-2)*5000        (each only when the fields are sent)
```

## 5. Local development
```sh
bun install --ignore-scripts                 # once
node beer-pong/build.mjs
node beer-pong/tools/devserver.mjs           # http://localhost:8787/beerpong/  (GLOBAL, in-memory board)
node beer-pong/tools/devserver.mjs --unconfigured   # 503 -> LOCAL mode
```
The devserver runs the real route handler against an in-memory fake KV. QA hooks are `POST /__dev/net?down=1`, `/__dev/kv?fail=1` and `/__dev/reset`. The admin key is `dev`.

Tests:
- `node beer-pong/tools/scores-route.test.mjs` runs the route against the fake KV.
- `node beer-pong/tools/scores-browser.test.mjs` runs Playwright against the global, 503, offline-queue, `file://` and artifact-db paths.
