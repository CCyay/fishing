// 区分「刻度是弯的」和「庄家技能越多、跟玩家技能的相互作用越大」：二次拟合能吃掉多少残差；残差跟庄家技能件数的关系
const path = require('path'), fs = require('fs')
const log = console.log; console.log = () => {}
const pond = require(path.join(__dirname, '..', 'out-foestr-1109', 'tiers.js'))
const blank = require(path.join(__dirname, 'tiers.js'))
console.log = log
const EX = ['镜魔H', '镜魔S'], cards = pond.CARDS.filter(x => EX.indexOf(x[1]) < 0)
// 庄家技能件数（todo.tsv 的 slots 条数 × count；守河老汉 shouhe-unhook2 不在 todo 里，按 2 件）
const nSk = {}
for (const l of fs.readFileSync(path.join(__dirname, 'todo.tsv'), 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; const j = JSON.parse(l.split('\t')[1]); nSk[j.name] = j.slots.reduce((a, s) => a + s[1], 0) }
nSk['守河老汉'] = nSk['守河老汉'] || 2
function solve(A, y) { // 最小二乘（法方程）
  const k = A[0].length, M = [], v = []
  for (let i = 0; i < k; i++) { M.push([]); v.push(0); for (let j = 0; j < k; j++) { let s = 0; for (let r = 0; r < A.length; r++) s += A[r][i] * A[r][j]; M[i].push(s) } for (let r = 0; r < A.length; r++) v[i] += A[r][i] * y[r] }
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]]
    for (let r = 0; r < k; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let j = i; j < k; j++) M[r][j] -= f * M[i][j]; v[r] -= f * v[i] } }
  return v.map((x, i) => x / M[i][i])
}
function sdRes(feat) {
  let ss = 0, n = 0
  for (let d = 0; d < 3; d++) for (let t = 0; t < 4; t++) {
    const A = cards.map(([c, name]) => feat(blank.mean(c, d, t), nSk[name] || 0)), y = cards.map(([c]) => pond.mean(c, d, t))
    const w = solve(A, y)
    for (let r = 0; r < A.length; r++) { const e = y[r] - A[r].reduce((a, x, i) => a + x * w[i], 0); ss += e * e; n++ }
  }
  return Math.sqrt(ss / n)
}
log('残差标准差（41 张 × 12 格）')
log('  直线 pond = a + b·blank：' + sdRes((x) => [1, x]).toFixed(2))
log('  二次 + c·blank²：' + sdRes((x) => [1, x, x * x]).toFixed(2))
log('  直线 + 庄家技能件数：' + sdRes((x, k) => [1, x, k]).toFixed(2))
log('  直线 + 技能件数 + 交叉项 blank·件数：' + sdRes((x, k) => [1, x, k, x * k]).toFixed(2))
