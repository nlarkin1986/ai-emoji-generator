# SUPER BEER PONG — Team Design Spec & Module Contracts

We are a team competing in a bake-off (see https://jonclegg.github.io/pacman-bakeoff/ for the format:
single self-contained HTML game, judged by a 90 s automated playtest + source audit).
**Judging criteria for THIS contest:**
1. Adherence to classic 1985–1990 NES (8-bit Nintendo) games — look, sound, feel, UI conventions.
2. Full UI/UX and overall game quality — menus, feedback, juice, polish, no stuck states.
3. Must be fully playable on a **mobile phone** (touch, portrait and landscape).
4. Players log their **high score** to a shared leaderboard to win a prize at a party.

Reference image (the vibe): night-time backyard party, pixel-art house with lit windows, crescent moon,
trees, crowd of partygoers; side view of a long red beer-pong table with red cups at each end; our hero
(red cap, red shirt with white "W", khaki shorts) on the LEFT; rival (white cap backwards, white shirt with
red "W", red shorts) on the RIGHT. Ball arcs with a dotted trail, sinks with a splash "plink" burst, the
crowd cheers, the shooter raises his arms, the loser bends over and drinks the cup.

## 0. Hard technical rules (every module)
- Plain browser JS, no frameworks, no network libraries, no external assets, no web fonts. Everything
  procedurally drawn / synthesized. The build (`node beer-pong/build.mjs`) inlines all modules into ONE file:
  `public/beerpong/index.html`. Each module is a plain script that attaches to the global `window.BP`
  namespace (`BP.Art`, `BP.Audio`, `BP.Input`, `BP.Scores`, `BP.Game`). `window.BP` already exists when
  your script runs. Load order: art, audio, input, scores, game. Do **not** run heavy work at load time
  except in `init()`; do not touch other modules at load time (only inside functions called later).
- Internal resolution **256×240** (NES). All game rendering happens on that canvas at 1:1 logical pixels,
  integers only (`Math.round`/`|0` every draw coordinate), `imageSmoothingEnabled = false`.
- **NES palette only.** Use the 2C02 palette colors exported by `BP.Art.PAL` (named). No gradients, no
  alpha blending for art (alpha only for whole-screen fades done NES-style = stepping palette darker in
  ~4 discrete steps, or black flicker). No anti-aliased text — bitmap 8×8 font only.
- Frame-rate independence: game logic runs on a **fixed 60 Hz timestep** with an accumulator (clamp big
  gaps, e.g. after tab switch). Must behave identically at 30/60/120/144/240 Hz displays.
- Auto-pause on `visibilitychange`/`blur`. Never a stuck state: every screen must be escapable via A/START/tap.
- No console errors. ES2019-safe syntax is fine (no optional-chaining requirement, but it's allowed).
- Keep the total single-file build under ~350 KB.

## 1. Game design (owner: Game agent, everyone should know it)

### Core loop — "TOURNAMENT" arcade mode (1 player vs CPU ladder)
- Title → (1 PLAYER / HIGH SCORES / HOW TO PLAY) → Stage intro "VS" card → Match → Stage clear tally →
  next stage … → lose a match → GAME OVER → name entry (if qualifies, or always for party: always allow) →
  leaderboard showing your rank → title.
- A match: each side has a **6-cup pyramid** (3-2-1; apex cup points toward the shooter). Stage 5+ racks are 10 cups (4-3-2-1).
  Turns alternate; **2 balls per turn**. Player shoots first each match.
- Re-rack: when a side gets down to 3 cups, auto re-rack into a tight triangle (sfx `rerack`, "RE-RACK!").
- Win a match when the opponent has 0 cups. If the CPU sinks your last cup → **REDEMPTION**: you keep
  shooting until you miss; if you clear every remaining CPU cup → **OVERTIME** (3 cups each, sudden-death style
  re-run of the turn order). Fail redemption → GAME OVER.

### Shooting (the skill mechanic) — NES "meter" style, 2 taps per throw, one-button friendly
1. **AIM**: an inset window (top-down, magnified view of the target rack) shows a crosshair sweeping in a
   Lissajous / figure-8 path over the rack. Press **A** (or tap anywhere on the screen) to lock it.
2. **POWER**: a vertical power meter oscillates up and down with a highlighted sweet-spot band.
   Press **A** to lock. Power error shifts the landing point long/short along the table (x axis).
   Aim lock defines the target (x,z). Final landing = aim point + power error + small "buzz" wobble.
3. **B** during AIM toggles **BOUNCE SHOT** (ball is aimed to bounce once on the table in front of the
   rack; harder; if it sinks it removes the target cup **plus one extra adjacent cup** and pays bonus).
4. The ball then flies in the main side view with real 3D physics (x along table, y height, z depth),
   gravity, table bounces, rim collisions (rim hits can rattle in or spin out), floor bounces, and a
   ground shadow. Sinking = ball passes down through a cup's rim circle.

### Difficulty & theme mechanics
- **BUZZ meter** (mug icon in HUD, 0–5): +1 each time the CPU sinks one of your cups (your guy drinks).
  Buzz increases crosshair speed and adds a wobble to the crosshair path. Clearing a stage sobers you by 2.
- **HEATING UP** (2 makes in a row) → **ON FIRE** (3 in a row): ball becomes a fireball sprite with a flame
  trail, crosshair slows down, score ×3 until you miss. (NBA-Jam-era nod, beer pong slang.)
- **BALLS BACK**: sink both balls in one turn → shoot 2 more.
- CPU opponents get more accurate each stage; stage 3 (ROOFTOP) has **WIND** (arrow + strength shown in
  HUD, pushes ball in z/x like NES golf). Stage list (stage index 0-based):
  0. BACKYARD BASH — night backyard (the reference image) — rival "CHAD" (white cap/shirt) — easy
  1. FRAT BASEMENT — brick walls, string lights, couch, kegs — "TANK" (big guy, green jersey)
  2. ROOFTOP — city skyline night, WIND — "SKY" (shades, purple shirt)
  3. BEACH BONFIRE — dusk/night sea, bonfire glow — "BRO-DY" (tank top, sunglasses)
  4. CHAMPIONSHIP — arena, spotlights, banner "WORLD CUP OF PONG" — "THE KEGMASTER" (boss, gold crown)
  After stage 4: "ROUND 2" loop back to stage 0 with harder CPUs and faster meters (NES 2nd-quest style).
- Opponent accuracy (probability-ish of a make): ~25% stage0 → ~55% stage4 → keeps climbing in loops (cap 75%).

### Scoring (shown with 6-digit score, NES style)
- Cup sunk: 100 × fire multiplier (×1, HEATING UP ×2, ON FIRE ×3)
- SWISH (dead center, no rim touch): +50 bonus ("SWISH!")
- Rim-in (rattled in): +25 ("RATTLED IN!")
- Bounce-shot make: +200 bonus and 2 cups
- ISLAND cup (sunk cup that had no neighbor touching it): +250 ("ISLAND!")
- BALLS BACK: +300
- Stage clear tally (counted up with blips): CLEAR BONUS 1000×(stage+1), CUPS LEFT bonus 200 per of your
  cups remaining, ACCURACY bonus = round(accuracy% × 10), PERFECT (no cups lost) 5000.
- Redemption success +2000. Extra-loop multiplier: Round 2 scores ×2.
- High score shown as "HI" at the top (from leaderboard best).

### Screens / UI (NES conventions)
- Title: big pixel logo "SUPER BEER PONG", small animated ball bouncing into cup, menu with blinking
  "▶" cursor, "PUSH START" blinking, "© 1989 PARTY SOFT" style fake credit line, LICENSED-BY style is NOT
  allowed (no real trademarks). Attract mode after ~20 s idle: cycles the HIGH SCORES table and a CPU-vs-CPU
  demo match ("DEMO PLAY"), any input returns to title.
- HOW TO PLAY: 2–3 pages, NES manual style, with drawn examples.
- VS card: two portraits, names, stage name, "READY? / GO!" (like Punch-Out!! / Tecmo).
- In-match HUD (top 3 tile rows): `1P 000000   HI 000000`, stage name, both racks' cups-remaining icons,
  balls-left this turn, BUZZ mugs, fire meter, wind indicator on stage 2.
- Big centered callouts with NES-style text boxes: "SWISH!", "HEATING UP!", "ON FIRE!", "BALLS BACK!",
  "RE-RACK!", "REDEMPTION!", "LAST CUP!", "MISS".
- Pause: "PAUSE" box, music stops, START resumes (+ RESUME / QUIT menu).
- Game over: "GAME OVER" then name entry (Zelda-style letter grid, max 8 chars, D-pad/tap to choose, A to
  add, B to delete, END to finish; on mobile tapping letters directly works) → submit → leaderboard with
  your row flashing → title.
- HIGH SCORES table: top 10, rank / name / score / stage reached. Label "GLOBAL" or "LOCAL" (offline).
- **TV MODE**: URL `?tv` → full-screen auto-refreshing (every 10 s) leaderboard attract screen for the
  party TV with blinking "PLAY ON YOUR PHONE!" and the page URL shown as text.

## 2. Screen geometry (shared by Art and Game — DO NOT deviate)
```
Canvas 256 x 240.
HUD:            y 0..23  (3 rows of 8x8 tiles), black or stage-colored band.
Scene/backdrop: y 24..239 drawn by Art.drawBackground (sky, house, crowd, floor/ground everywhere).
Table:          drawn by Art.drawTable(ctx, stage). Side view with slight top-down depth:
                top surface is a band from y=TABLE_BACK=182 (far edge) to y=TABLE_FRONT=196 (near edge),
                x from TABLE_X0=32 to TABLE_X1=224. Front apron / edge thickness y 196..200.
                Legs from y=200 down to the floor at FLOOR_Y=222 (two legs each end, folding-table style).
Players:        Art.drawPlayer anchor = bottom-center of feet. Hero (p1) at x=16, CPU at x=240, feet y=228.
                Player sprites are 24 wide x 48 tall (head top at y≈180, waist ≈ y 200 → table at waist).
                Hand release point when throwing: hero (28, 186) screen, CPU (228, 186), mirrored.
World→screen projection (Game owns physics, Art just draws at given screen coords):
                world x == screen x.  z = depth in world px, range about -14 (far) .. +14 (near).
                screen y = TABLE_MID - y_height + z * 0.5      where TABLE_MID = 189.
                (so a point on the table surface with z=-14 is at y=182, z=+14 at y=196.)
Cups:           side-view cup sprite 8 wide x 10 tall. drawCup(ctx, cx, baseY) draws it with bottom-center at
                (cx, baseY). Cup world radius = 4 px (rim circle in x,z), rim height = 10 px above table.
                Ball world radius = 2 (sprite 4x4 / 5x5 round). Shadow = 4x2 dark ellipse on table.
                Draw order: back-to-front by z (painter's algorithm), ball drawn in correct order w.r.t. cups.
Aim inset:      Game draws a bordered window (Art.drawBox) about 72x64 at top-right/top-center under the HUD,
                showing the target rack top-down at 2x scale using Art sprite 'cupTop' (12x12 circle: red
                outer ring, white rim, amber beer center) and 'crosshair' (9x9).
Power meter:    Game draws an 8x48 vertical meter (Art.drawBox + fills) beside the inset.
```

## 3. Module contracts

### BP.Art  (owner: Pixel Art agent)  — file `beer-pong/src/art.js`
```js
BP.Art = {
  W: 256, H: 240,
  PAL: { black:'#000000', white:'#FCFCFC', red:'#...', ... },  // named NES 2C02 colors ONLY. Must include at least:
       // black, white, gray, lgray, dgray, red, dred, pink, orange, yellow, gold, beer (amber), brown, dbrown,
       // tan, skin, skin2 (darker skin), green, dgreen, lgreen, blue, dblue, navy, sky, cyan, purple, magenta
  init(),                                   // pre-render all sprites to offscreen canvases (call once)
  text(ctx, str, x, y, color='white', shadow=false) -> widthPx,  // 8x8 bitmap font: A-Z 0-9 space and
                                            // . , ! ? - : ' " / ( ) * # % & + = < > @ $ ^ (^ = arrow-up icon
                                            // is optional) plus special glyphs: '▶' cursor, '♥', '★', '©', '×'.
                                            // lowercase input must be upper-cased automatically.
  textCenter(ctx, str, y, color='white', shadow=false),
  bigText(ctx, str, x, y, color, scale=2),  // chunky 2x (or 3x) callout text with dark outline (for "SWISH!")
  drawBox(ctx, x, y, w, h, style='default'),// NES dialog window: black fill + 2-px white/rounded border
                                            // styles: 'default','red','gold','dim'
  drawBackground(ctx, stage, t, excite=0),  // full-screen scene for stage 0..4 incl. sky, moon/lights, scenery,
                                            // crowd behind the table; crowd animates (bob/jump) more when
                                            // excite>0 (0..1). t = frame counter (int, 60/s). Must fill y 0..239.
  drawTable(ctx, stage),                    // per-stage table color (red beer pong table like reference for 0)
  drawPlayer(ctx, who, pose, x, feetY, t, flip=false),
        // who: 'hero' | 'chad' | 'tank' | 'sky' | 'brody' | 'kegmaster'
        // pose: 'idle' (2-frame breathing anim using t), 'aim' (ball held up near face), 'throw' (arm
        //       extended forward), 'cheer' (both arms up, 2-frame anim), 'drink' (bent over, cup to mouth),
        //       'sad' (slumped), 'walk' (2 frames)
        // Hero faces RIGHT by default; CPU characters are drawn facing LEFT (flip handled inside: pass
        // flip=false and Art mirrors CPU chars automatically). 24x48 nominal size, anchor bottom-center.
  drawCup(ctx, cx, baseY, state='full', t=0),  // state: 'full' | 'hit' (wobble/splash frames, use t 0..20)
  drawCupTop(ctx, cx, cy, state='full'),        // 12x12 top-down cup for the aim inset; 'gone' = faint ring
  drawBall(ctx, x, y, fire=false, t=0),         // centered; 5x5 white ping pong ball; fire = fireball w/ flicker
  drawShadow(ctx, x, y),                        // centered small dark ellipse
  drawSplash(ctx, x, y, t),                     // beer splash burst particles for t=0..24 frames (like ref panel 11)
  drawCrosshair(ctx, x, y, t),                  // 9x9 blinking crosshair centered
  drawIcon(ctx, name, x, y),                    // 8x8 icons: 'cup','cupEmpty','mug','mugFull','ball','fire',
                                                // 'wind','heart','star','arrowL','arrowR','speaker','mute'
  drawLogo(ctx, x, y, t),                       // "SUPER BEER PONG" title logo, ~200x56, centered at x
  drawPortrait(ctx, who, x, y),                 // 32x32 face portrait for VS screens (top-left anchor)
  drawTrailDot(ctx, x, y, fire=false),          // 1-2 px dotted arc trail dot
}
```
Stage background requirements: 0 backyard night house (like ref: blue siding house, lit yellow windows,
green door, porch light, trees, crescent moon, stars, grass, partygoers in red/white), 1 frat basement,
2 city rooftop at night (skyline, blinking antenna light), 3 beach bonfire (sea, moon reflection, fire flicker),
4 championship arena (crowd stands, spotlights sweeping, banner "WORLD CUP OF PONG").

### BP.Audio  (owner: Audio agent) — file `beer-pong/src/audio.js`
Emulate the NES 2A03 APU with Web Audio: 2 pulse channels (duty 12.5/25/50/75% via PeriodicWave),
1 triangle (4-bit stepped / quantized), 1 noise (LFSR long + short "metallic" mode, generated buffers).
SFX should steal a channel the way NES games did (e.g. sfx on pulse2/noise temporarily mutes that music
voice) — authentic. All music ORIGINAL compositions (no copyrighted melodies).
```js
BP.Audio = {
  unlock(),                    // create/resume AudioContext; MUST be safe to call on every user gesture (iOS)
  setMuted(b), isMuted(), toggleMute(),   // persist mute in localStorage('bp_mute') (try/catch)
  music(name),                 // 'title' | 'stage0'..'stage4' (5 distinct loops OR at least 3 shared) |
                               // 'fire' (on-fire variant/ intensity layer) | 'vs' (short jingle) |
                               // 'clear' (stage clear fanfare, no loop) | 'gameover' (no loop) |
                               // 'entry' (name entry loop) | 'scores' (high score loop) | null = stop
  setTempo(mult),              // 1.0 normal, up to ~1.3 for LAST CUP tension
  sfx(name),                   // 'select','confirm','cancel','aimLock','powerLock','throw','bounce','rim',
                               // 'sink','splash','miss','floor','cheer','boo','heatingUp','onFire','ballsBack',
                               // 'rerack','drink','redemption','pause','tally','lastCup','win','lose','tick',
                               // 'whoosh','letter','error'
  pause(), resume(),           // for game pause / tab hidden (suspend music, keep state)
}
```
Unknown names must be ignored silently. All methods must be no-throw even if audio is unavailable.

### BP.Input  (owner: UX agent) — files `beer-pong/src/input.js` AND `beer-pong/src/shell.html`
```js
BP.Input = {
  init(canvas),        // attach keyboard, touch buttons, canvas tap, Gamepad API
  update(),            // called by Game ONCE per fixed tick at the END of the tick (clears edge flags)
  pressed(btn),        // true on the tick the button went down (edge). btn: 'up','down','left','right','a','b','start','select'
  held(btn),
  anyPressed(),        // any button edge this tick (incl. canvas tap)
  pointer(),           // {x,y,down,tapped} in 256x240 canvas coords for the last tap (for name-entry grid/menus) or null
  rumble(ms),          // navigator.vibrate if available, respects a setting
}
```
Keyboard: arrows/WASD = d-pad, Z/Space/J = A, X/K/Backspace = B, Enter = START, Shift/Tab = SELECT,
M = mute (calls BP.Audio.toggleMute), P/Escape = START (pause). Prevent page scroll on these keys.
Tapping the game canvas = A press (and records pointer position). Every input gesture calls `BP.Audio.unlock()`.
`shell.html`: complete HTML page (doctype, meta viewport with `viewport-fit=cover, user-scalable=no`,
theme-color, apple-mobile-web-app-capable, title "Super Beer Pong") containing `<canvas id="screen"
width="256" height="240">` and the placeholder comment `<!-- @@SCRIPTS@@ -->` right before `</body>`.
Layout: canvas scaled with crisp pixels (image-rendering: pixelated) as large as possible keeping 256:240
(integer scale when it fits, otherwise fractional but crisp); on phones in portrait, an on-screen
**NES controller** (D-pad, SELECT, START, B, A — gray/black/red NES colors and shapes) sits below the
screen; in landscape the D-pad and B/A flank the screen. Desktop: controller hidden by default (toggle).
Small top bar: mute toggle, fullscreen, CRT scanline filter toggle (CSS overlay). Touch: no zoom, no
scroll bounce, no text selection, no long-press callout, safe-area insets, multi-touch (hold d-pad while
pressing A). Buttons must give pressed visual state. Shell bootstraps nothing itself except layout;
`game.js` starts the game on DOMContentLoaded.

### BP.Scores (owner: Backend agent) — file `beer-pong/src/scores.js` + Next.js API route
```js
BP.Scores = {
  init(),                       // Promise; detects backend. Never rejects.
  mode(),                       // 'global' | 'local'
  top(n=10),                    // Promise<[{name, score, stage, round, ts}]>, sorted desc; never rejects
  best(),                       // Promise<number> best score (for HI display)
  submit(entry),                // entry {name, score, stage, round, cups, accuracy} -> Promise<{rank, top}>
                                // always also saves locally; never rejects
}
```
Backend order: (1) same-origin `GET/POST /api/beerpong/scores` (Next.js route in this repo using
`@vercel/kv` sorted set; returns 503 JSON when KV env vars are missing so the client falls back);
(2) localStorage. Sanitize names (A-Z 0-9 space . - ! only, max 8), clamp scores (0..9,999,999), basic
rate limit per IP. Optional admin DELETE with `x-admin-key` header == env `BEERPONG_ADMIN_KEY`.

### BP.Game (owner: Game agent) — file `beer-pong/src/game.js`
Owns the state machine, physics, CPU AI, scoring, HUD, all screens, attract mode, TV mode, pause, the
main loop (requestAnimationFrame + fixed 60 Hz accumulator), and calls into the other modules. Starts
itself: `document.addEventListener('DOMContentLoaded', () => BP.Game.start(document.getElementById('screen')))`
(or immediately if already loaded). Expose `BP.Game.debug` (state getters, e.g. `{state, score, cups}`)
so automated tests can read state.
Testing hooks (for QA bots): `?seed=123` deterministic RNG; `?fast` skips intros; `window.BP.Game.debug`.

## 4. Stubs
`beer-pong/src/_stubs/*.js` contain minimal placeholder implementations so any module can be built and
tested before the others exist. `node beer-pong/build.mjs` uses the real file when present.
