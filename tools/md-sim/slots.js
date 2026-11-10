// 一件技能一次量四个槽 + 斜率提示〔2026-11-10〕
//
//   node slots.js <技能 key> [-n 20000] [其余 sim.js one 的参数]      旋钮照常用环境变量传
//
// 四个槽（这一轮定下来的标准口径）：
//   A  = 江口闸官·旧 第 1 槽（lockold 0）    5 = 夜钓客旧形状不带常驻技 第 2 槽（nightoff 1）
//   K  = 鱼塘老板旧形状 第 3 槽（pondold 2）  ♥ = 镜湖占卜师 第 1 槽（mirror 0）
// 三个点数槽都是「单点数、4 张牌」，所以按理该平；最大差超过 2 × √2 × 标准误（两格之差的 2σ）就提示有斜率。
//
// 为什么要它：2026-11-10「变成手里最小 / 最大的点数」那两版，只量 A / ♥ 时看不出一头的槽吃亏，
// 补量 5 / K 才发现（最小让 A 槽吃亏、最大让 K 槽吃亏）。点数类、顺子类的新件默认用它量。
const { spawn } = require('child_process')
const path = require('path')

const SLOTS = [['A', 'lockold', 0], ['5', 'nightoff', 1], ['K', 'pondold', 2], ['♥', 'mirror', 0]]
const key = process.argv[2]
if (!key) { console.log('用法：node slots.js <技能 key> [-n 20000] [其余 sim.js one 的参数]'); process.exit(1) }
const extra = process.argv.slice(3)
if (extra.indexOf('-n') < 0) extra.push('-n', '20000')

function runOne(slot) {
  const [name, role, at] = slot
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [path.join(__dirname, 'sim.js'), 'one', key, '--role', role, '--slot', String(at)].concat(extra), { env: process.env })
    let out = ''
    child.stdout.on('data', function (d) { out += d })
    child.stderr.on('data', function (d) { out += d })
    child.on('close', function () {
      const lines = out.split(/\r?\n/)
      const line = lines.find(function (l) { return /X [+-]\d/.test(l) && /D [+-]\d/.test(l) }) || ''
      const num = function (re) { const m = line.match(re); return m ? parseFloat(m[1]) : NaN }
      const win = (lines.find(function (l) { return l.indexOf('Δ胜率') >= 0 }) || '').match(/([+-]\d+\.\d+) 点/)
      const stamp = lines.find(function (l) { return l.indexOf('代码指纹') >= 0 }) || ''
      resolve({ name: name, x: num(/X ([+-]\d+\.\d+)/), d: num(/D ([+-]\d+\.\d+)/), se: num(/标准误 (\d+\.\d+)/), win: win ? win[1] : '?', stamp: stamp.trim(), err: line ? '' : lines.slice(-4).join(' / ') })
    })
  })
}

Promise.all(SLOTS.map(runOne)).then(function (rs) {
  console.log('【' + key + '】四个槽 · sim.js one ' + extra.join(' '))
  console.log('  槽   X        D       标准误  Δ胜率')
  for (const r of rs) {
    if (r.err) { console.log('  ' + r.name + '   没跑出来：' + r.err); continue }
    console.log('  ' + r.name.padEnd(3) + (r.x >= 0 ? '+' : '') + r.x.toFixed(2).padEnd(8) + (r.d >= 0 ? '+' : '') + r.d.toFixed(2).padEnd(8) + r.se.toFixed(2).padEnd(8) + r.win)
  }
  const pts = rs.filter(function (r) { return r.name !== '♥' && !r.err })
  if (pts.length === 3) {
    const xs = pts.map(function (r) { return r.x })
    const spread = Math.max.apply(null, xs) - Math.min.apply(null, xs)
    const se = pts.reduce(function (a, r) { return a + r.se }, 0) / pts.length
    const lim = 2 * Math.SQRT2 * se
    const lo = pts[xs.indexOf(Math.min.apply(null, xs))].name
    const hi = pts[xs.indexOf(Math.max.apply(null, xs))].name
    console.log(spread > lim
      ? '  ⚠ 有斜率：点数槽最大差 ' + spread.toFixed(2) + '（' + lo + ' 最低、' + hi + ' 最高）> 2σ ' + lim.toFixed(2) + ' —— 先查原因再定价（看发动次数、屯牌比例）'
      : '  ✓ 点数槽平：最大差 ' + spread.toFixed(2) + ' ≤ 2σ ' + lim.toFixed(2))
    const a = rs[0]
    if (!a.err) console.log('  按 A 槽的价：取整到 5（39 + 16.8 × ' + a.x.toFixed(2) + '）= ' + (Math.round((39 + 16.8 * a.x) / 5) * 5))
  }
  const st = rs.find(function (r) { return r.stamp })
  if (st) console.log('  ' + st.stamp.replace(/^—— /, ''))
})
