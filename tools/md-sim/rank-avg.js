// 读 out-ranks/<点数>.txt（12 个单点数槽的 `all` 输出），每件技能算：
//   12 槽平均 X / 平均 Δ胜率 / 最小~最大 / 离散度（12 格的标准差）
// 离散度跟单格 se（≈0.15）比 —— 纯噪声下 12 格的标准差 ≈ se 本身，
// 所以「标准差 / se」明显大于 1 就是 X 真的随槽变（「效果跟槽上印的点数绑死」）
const fs = require('fs')
const path = require('path')
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K']
const dir = path.join(__dirname, 'out-ranks')
const tab = {}
let se = 0
for (const r of RANKS) {
  const txt = fs.readFileSync(path.join(dir, r + '.txt'), 'utf8')
  const m = txt.match(/每件的标准误约 ([\d.]+)/)
  if (!m) throw new Error(r + ' 没跑完')
  se = Math.max(se, +m[1])
  for (const l of txt.split(/\r?\n/)) {
    const x = l.match(/^  (\S+)\s+\S+\s+[+-][\d.]+\s+[+-][\d.]+\s+([+-][\d.]+)\s+[+-][\d.]+\s+([+-][\d.]+)点/)
    if (!x) continue
    if (!tab[x[1]]) tab[x[1]] = {}
    tab[x[1]][r] = { x: +x[2], w: +x[3] }
  }
}
const rows = []
for (const k in tab) {
  const xs = RANKS.map(r => tab[k][r].x)
  const ws = RANKS.map(r => tab[k][r].w)
  const mean = xs.reduce((a, b) => a + b) / 12
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / 11)
  rows.push({ k, xs, mean, w: ws.reduce((a, b) => a + b) / 12, sd, ratio: sd / se,
    min: Math.min(...xs), max: Math.max(...xs) })
}
rows.sort((a, b) => b.ratio - a.ratio)
const f = v => (v >= 0 ? '+' : '') + v.toFixed(2)
console.log('单格 se ' + se + '；平均值的 se ≈ ' + (se / Math.sqrt(12)).toFixed(2))
console.log('技能  ' + RANKS.map(r => r.padStart(6)).join('') + '   平均   Δ胜率  标准差 /se')
for (const r of rows) {
  console.log(r.k.padEnd(4) + r.xs.map(v => f(v).padStart(6)).join('') + '  ' + f(r.mean).padStart(6)
    + '  ' + f(r.w).padStart(6) + '  ' + r.sd.toFixed(2) + '  ×' + r.ratio.toFixed(1))
}
