// STUB — replaced by src/input.js
BP.Input = (function () {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyZ: 'a', Space: 'a', KeyX: 'b', Enter: 'start', ShiftLeft: 'select' }
  const held = {}, edge = {}; let ptr = null
  return {
    init(canvas) {
      addEventListener('keydown', (e) => { const b = map[e.code]; if (!b) return; e.preventDefault(); if (!held[b]) edge[b] = true; held[b] = true; BP.Audio.unlock() })
      addEventListener('keyup', (e) => { const b = map[e.code]; if (b) held[b] = false })
      canvas.addEventListener('pointerdown', (e) => { const r = canvas.getBoundingClientRect(); ptr = { x: (e.clientX - r.left) * 256 / r.width, y: (e.clientY - r.top) * 240 / r.height, down: true, tapped: true }; edge.a = true; BP.Audio.unlock() })
    },
    update() { for (const k in edge) edge[k] = false; if (ptr) ptr.tapped = false },
    pressed: (b) => !!edge[b], held: (b) => !!held[b], anyPressed: () => Object.values(edge).some(Boolean), pointer: () => ptr, rumble() {},
  }
})()
