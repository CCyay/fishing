// 一次性标定：白板尺子（本目录）↔ 玩家尺子（out-foestr-1109，鱼塘老板 + 技能池，2026-11-09）
// 每个难度 × 每一档：43 张卡做线性拟合 pond = a + b·blank，把 tiers.js 的 CENTER（玩家尺子刻度）换算到白板刻度，区间半宽 3 → 3 / b
const path = require('path')
const log = console.log; console.log = () => {}
const pond = require(path.join(__dirname, '..', 'out-foestr-1109', 'tiers.js'))
delete require.cache[require.resolve(path.join(__dirname, 'tiers.js'))]
const blank = require(path.join(__dirname, 'tiers.js'))
console.log = log
const D = pond.D, TN = pond.TN, CENTER = pond.CENTER
const out = [], half = []
for (let d = 0; d < 3; d++) {
  out.push([]); half.push([])
  for (let t = 0; t < 4; t++) {
    const xs = [], ys = []
    for (const [c] of pond.CARDS) { xs.push(blank.mean(c, d, t)); ys.push(pond.mean(c, d, t)) }
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
    const b = sxy / sxx, a = my - b * mx, r2 = sxy * sxy / (sxx * syy)
    const xc = (CENTER[d][t] - a) / b
    out[d].push(+xc.toFixed(1)); half[d].push(+(3 / b).toFixed(1))
    log(D[d] + ' ' + TN[t] + '：pond = ' + a.toFixed(1) + ' + ' + b.toFixed(2) + ' × blank · R² ' + r2.toFixed(2) + ' · 中心 ' + CENTER[d][t] + ' → 白板 ' + xc.toFixed(1) + '（半宽 ' + (3 / b).toFixed(1) + '）')
  }
}
log('CENTER_BLANK = ' + JSON.stringify(out))
log('HALF_BLANK = ' + JSON.stringify(half))
