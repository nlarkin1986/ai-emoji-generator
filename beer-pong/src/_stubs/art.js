// STUB — replaced by src/art.js
BP.Art = (function () {
  const PAL = { black:'#000000', white:'#FCFCFC', gray:'#7C7C7C', lgray:'#BCBCBC', dgray:'#3C3C3C', red:'#D82800', dred:'#A81000', pink:'#F878F8', orange:'#FC7460', yellow:'#F8B800', gold:'#F8B800', beer:'#FCA044', brown:'#AC7C00', dbrown:'#503000', tan:'#FCE0A8', skin:'#FCBCB0', skin2:'#E45C10', green:'#00A800', dgreen:'#005800', lgreen:'#58D854', blue:'#0058F8', dblue:'#0000BC', navy:'#000088', sky:'#3CBCFC', cyan:'#00E8D8', purple:'#6844FC', magenta:'#D800CC' }
  const r = (c, x, y, w, h, col) => { c.fillStyle = PAL[col] || col; c.fillRect(x | 0, y | 0, w | 0, h | 0) }
  const text = (c, s, x, y, col = 'white') => { c.fillStyle = PAL[col] || col; c.font = '8px monospace'; c.textBaseline = 'top'; s = String(s).toUpperCase(); c.fillText(s, x, y); return s.length * 8 }
  return {
    W: 256, H: 240, PAL, init() {},
    text, textCenter(c, s, y, col) { text(c, s, 128 - String(s).length * 4, y, col) },
    bigText(c, s, x, y, col) { text(c, s, x, y, col) },
    drawBox(c, x, y, w, h) { r(c, x, y, w, h, 'white'); r(c, x + 2, y + 2, w - 4, h - 4, 'black') },
    drawBackground(c, stage) { r(c, 0, 0, 256, 240, 'navy'); r(c, 0, 200, 256, 40, 'dgreen') },
    drawTable(c) { r(c, 32, 182, 192, 14, 'red'); r(c, 32, 196, 192, 4, 'dred'); r(c, 40, 200, 3, 22, 'gray'); r(c, 213, 200, 3, 22, 'gray') },
    drawPlayer(c, who, pose, x, fy) { r(c, x - 12, fy - 48, 24, 48, who === 'hero' ? 'red' : 'white'); text(c, pose[0], x - 4, fy - 30, 'black') },
    drawCup(c, cx, by) { r(c, cx - 4, by - 10, 8, 10, 'red'); r(c, cx - 4, by - 10, 8, 2, 'white') },
    drawCupTop(c, cx, cy, st) { r(c, cx - 6, cy - 6, 12, 12, st === 'gone' ? 'dgray' : 'red'); if (st !== 'gone') r(c, cx - 4, cy - 4, 8, 8, 'beer') },
    drawBall(c, x, y, fire) { r(c, x - 2, y - 2, 5, 5, fire ? 'orange' : 'white') },
    drawShadow(c, x, y) { r(c, x - 2, y - 1, 4, 2, 'black') },
    drawSplash(c, x, y, t) { r(c, x - t / 3, y - t / 2, 2, 2, 'beer'); r(c, x + t / 3, y - t / 2, 2, 2, 'beer') },
    drawCrosshair(c, x, y) { r(c, x - 4, y, 9, 1, 'white'); r(c, x, y - 4, 1, 9, 'white') },
    drawIcon(c, n, x, y) { r(c, x, y, 8, 8, 'yellow') },
    drawLogo(c, x, y) { text(c, 'SUPER BEER PONG', x - 60, y, 'yellow') },
    drawPortrait(c, who, x, y) { r(c, x, y, 32, 32, 'skin') },
    drawTrailDot(c, x, y) { r(c, x, y, 1, 1, 'white') },
  }
})()
