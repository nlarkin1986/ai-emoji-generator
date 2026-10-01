# 1519 Madison Tailgate

An NES-style 8-bit beer pong party game for Sal & Nate's 40th. Guests play on their phones; every score goes to one shared leaderboard, and a TV can show the board live.

- **Game:** one self-contained HTML file built from `beer-pong/src/` into `public/index.html` (also `public/beerpong/index.html`).
- **Leaderboard API:** Vercel Functions in `api/beerpong/` (Redis via Vercel KV or Upstash).

## Deploy to Vercel
1. Import this repo as a new Vercel project. `vercel.json` sets everything (no framework, build `node beer-pong/build.mjs`, output `public/`).
2. Add a Redis store: **Storage → Upstash Redis** (Marketplace) or **KV**, connected to the project. This sets `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).
3. Add env var `BEERPONG_ADMIN_KEY` (e.g. `openssl rand -hex 24`). Optional: `BEERPONG_SECRET`.
4. Deploy, then open `https://<your-app>/api/beerpong/scores`. It should return `{"ok":true,"top":[],...}`. A `503 leaderboard_unconfigured` means the Redis env vars are missing.

Without Redis the game still works, keeping scores on each phone (LOCAL mode).

## At the party
- **Phones:** `https://<your-app>/` (HIGH SCORES shows **GLOBAL** when the shared board is live).
- **TV:** `https://<your-app>/?tv` full screen (QR code to the game, refreshes every 10 s).
- **Admin** (`K=<BEERPONG_ADMIN_KEY>`, `H=https://<your-app>`):
  ```sh
  curl -s -H "x-admin-key: $K" "$H/api/beerpong/scores?admin=1"        # list all entries
  curl -s -X DELETE -H "x-admin-key: $K" "$H/api/beerpong/scores?id=<id>" # remove one
  curl -s -X DELETE -H "x-admin-key: $K" "$H/api/beerpong/scores"         # wipe before the party
  ```
  Before awarding the prize, check the winner's `serverMs` / `stagesCleared` in the admin list (a real stage takes about 45 s or more).

## Develop
```sh
npm install
npm run dev     # builds, then serves http://localhost:8787/ with an in-memory leaderboard
npm test        # leaderboard API unit tests
```
Edit `beer-pong/src/*` and rebuild with `npm run build`. Full design notes: `beer-pong/SPEC.md`; leaderboard and anti-cheat details: `beer-pong/README.md` (written for the original Next.js host; paths there map to `api/beerpong/` here, and the game is served at `/` as well as `/beerpong`).
