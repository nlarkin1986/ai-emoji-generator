// STUB — replaced by src/scores.js
BP.Scores = (function () {
  const K = 'bp_scores', load = () => { try { return JSON.parse(localStorage.getItem(K)) || [] } catch (e) { return [] } }
  return {
    init: () => Promise.resolve(), mode: () => 'local',
    top: (n = 10) => Promise.resolve(load().slice(0, n)),
    best: () => Promise.resolve((load()[0] || { score: 0 }).score),
    submit(e) { const a = load(); a.push(Object.assign({ ts: Date.now() }, e)); a.sort((x, y) => y.score - x.score); try { localStorage.setItem(K, JSON.stringify(a.slice(0, 50))) } catch (_) {} return Promise.resolve({ rank: a.indexOf(e) + 1, top: a.slice(0, 10) }) },
  }
})()
