// STUB — replaced by src/game.js. Renders a test card exercising Art.
BP.Game = { debug: { state: 'stub' }, start(canvas) {
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; BP.Art.init(); BP.Input.init(canvas); let t = 0, stage = 0
  const poses = ['idle', 'aim', 'throw', 'cheer', 'drink', 'sad', 'walk']
  const who = ['chad', 'tank', 'sky', 'brody', 'kegmaster']
  ;(function f() { t++; if (BP.Input.pressed('a')) { stage = (stage + 1) % 5; BP.Audio.sfx('sink') }
    BP.Art.drawBackground(c, stage, t, 0.5); BP.Art.drawTable(c, stage)
    BP.Art.drawPlayer(c, 'hero', poses[(t / 60 | 0) % poses.length], 16, 228, t); BP.Art.drawPlayer(c, who[stage], poses[(t / 60 | 0) % poses.length], 240, 228, t)
    for (const [x, z] of [[200, -9], [200, 0], [200, 9], [209, -4.5], [209, 4.5], [218, 0]]) BP.Art.drawCup(c, x, 189 + z * 0.5, 'full', t)
    BP.Art.text(c, '1P 000000   HI 000000', 8, 8); BP.Art.drawBall(c, 128, 120 + Math.sin(t / 10) * 30, stage === 2, t)
    BP.Input.update(); requestAnimationFrame(f) })()
} }
document.addEventListener('DOMContentLoaded', () => BP.Game.start(document.getElementById('screen')))
