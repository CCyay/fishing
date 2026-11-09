// 二次标定：每个 (难度, 档) 拟合 pond = a + b·blank + c·blank²（排除读玩家配装的镜魔H / 镜魔S），
// 用拟合值换算到玩家尺子刻度，照原来的 CENTER ±3 分档；用玩家尺子的过关率复核通关率、数不一致
const path = require('path'), fs = require('fs')
const log = console.log; console.log = () => {}
const pond = require(path.join(__dirname, '..', 'out-foestr-1109', 'tiers.js'))
const blank = require(path.join(__dirname, 'tiers.js'))
console.log = log
const EX = (process.env.EXCLUDE || '镜魔H,镜魔S,镜魔D').split(','), D = pond.D, TN = pond.TN, CENTER = pond.CENTER, LIVES = [4, 4, 3], TIERS = [[3, 4, 5], [6, 7, 8], [9, 10, 11], [12]]
const cards = pond.CARDS.filter(x => EX.indexOf(x[1]) < 0)
function solve(A, y) { const k = A[0].length, M = [], v = []
  for (let i = 0; i < k; i++) { M.push([]); v.push(0); for (let j = 0; j < k; j++) { let s = 0; for (let r = 0; r < A.length; r++) s += A[r][i] * A[r][j]; M[i].push(s) } for (let r = 0; r < A.length; r++) v[i] += A[r][i] * y[r] }
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]]
    for (let r = 0; r < k; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let j = i; j < k; j++) M[r][j] -= f * M[i][j]; v[r] -= f * v[i] } }
  return v.map((x, i) => x / M[i][i]) }
const W = []
for (let d = 0; d < 3; d++) { W.push([]); for (let t = 0; t < 4; t++) W[d].push(solve(cards.map(([c]) => { const x = blank.mean(c, d, t); return [1, x, x * x] }), cards.map(([c]) => pond.mean(c, d, t)))) }
log('COEF = ' + JSON.stringify(W.map(r => r.map(w => w.map(x => +x.toFixed(5))))))
const est = (c, d, t) => { const x = blank.mean(c, d, t), w = W[d][t]; return w[0] + w[1] * x + w[2] * x * x }
const tierB = {}, pools = [[[], [], [], []], [[], [], [], []], [[], [], [], []]]
for (const [c, name] of pond.CARDS) for (let d = 0; d < 3; d++) {
  let best = -1
  if (EX.indexOf(name) >= 0) best = pond.tierOf[c + ':' + d]
  else { let bd = 99; for (let t = 0; t < 4; t++) { const x = Math.abs(est(c, d, t) - CENTER[d][t]); if (x <= 3 && x < bd) { bd = x; best = t } } }
  tierB[c + ':' + d] = best; if (best >= 0) pools[d][best].push(c)
}
const filled = []
for (let d = 0; d < 3; d++) for (let t = 0; t < 4; t++) { const need = TIERS[t].length; if (pools[d][t].length >= need) continue
  const rest = pond.CARDS.map(x => x[0]).filter(c => pools[d][t].indexOf(c) < 0).sort((a, b) => Math.abs(est(a, d, t) - CENTER[d][t]) - Math.abs(est(b, d, t) - CENTER[d][t]))
  while (pools[d][t].length < need) { const c = rest.shift(); pools[d][t].push(c); filled.push(D[d] + ' ' + TN[t] + ' 补 ' + pond.CARDS.find(x => x[0] === c)[1]) } }
function parse(f) { const out = {}; let d = null
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const h = l.match(/^【(简单|普通|困难)】/); if (h) { d = h[1]; out[d] = {}; continue }
    const m = d && l.match(/^\s+(\d+)\s+.+?\s+(?:不记牌|记牌|随机)\S*\s+\d+ 件\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/); if (m) out[d][+m[1]] = (+m[2] + +m[4]) / 100 }
  return out }
const base = parse(path.join(__dirname, '..', 'out-foestr-1109', 'base.txt'))
function clear(ps, lives) { let st = []; for (let k = 0; k <= lives; k++) st.push(k === lives ? 1 : 0)
  for (const p of ps) { const nx = st.map(() => 0); for (let k = 1; k <= lives; k++) { if (!st[k]) continue; for (let j = 0; j < k; j++) nx[k - j] += st[k] * Math.pow(1 - p, j) * p } st = nx }
  return st.reduce((a, b) => a + b, 0) }
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
function mc(pl, d, n) { const FIX = [base[D[d]][1], base[D[d]][2]]; let s = 0
  for (let i = 0; i < n; i++) { const used = [], ps = FIX.slice()
    for (let t = 0; t < 4; t++) { let pool = pl[d][t].filter(c => used.indexOf(c) < 0)
      for (const lv of TIERS[t]) { const c = pool.length ? pool.splice(Math.floor(rnd() * pool.length), 1)[0] : pl[d][t][0]; used.push(c); ps.push(pond.P[c][D[d]][lv]) } }
    s += clear(ps, LIVES[d]) }
  return s / n }
for (let d = 0; d < 3; d++) {
  const diff = []
  for (const [c, name] of pond.CARDS) if (pond.tierOf[c + ':' + d] !== tierB[c + ':' + d]) {
    const t0 = pond.tierOf[c + ':' + d], t1 = tierB[c + ':' + d], t = t0 >= 0 ? t0 : t1
    diff.push(name + '（' + (t0 < 0 ? '—' : TN[t0]) + '→' + (t1 < 0 ? '—' : TN[t1]) + '，实测 ' + pond.mean(c, d, t).toFixed(1) + ' / 换算 ' + est(c, d, t).toFixed(1) + '）') }
  log(D[d] + '：通关率 ' + (mc(pools, d, 20000) * 100).toFixed(1) + '%（玩家尺子分档 ' + (mc(pond.pools, d, 20000) * 100).toFixed(1) + '%）· 不一致 ' + diff.length)
  for (const x of diff) log('    ' + x)
}
log(filled.join('\n'))
