// 〈stackdraft〉以堆上第 i 张为锚的【21 匹配】手算用例〔2026-10-29〕
// 堆（底→顶）K 3 5 9 2。用法：node selftest-stackdraft.js（STACK21_DIR 默认 best）
const R = require('./rules.js')
function mk(vals) {
  // 用模拟器自己的 newGame 造一个完整局面，再把堆换成手写的这几张（六条平行数组一起换）
  const G = R.newGame({ rng: R.makeRng(1) })
  G.pile = vals.map((v, i) => ({ suit: '♠', rank: String(v), value: v, extra: [], id: i }))
  G.pileVals = vals.map(v => [v])
  G.pileSuit = vals.map(() => '♠')
  G.pileByFoe = vals.map(() => false)
  G.pileGuard = vals.map(() => 0)
  G.pileBurn = vals.map(() => false)
  return G
}
const G = mk([13, 3, 5, 9, 2])
let bad = 0
function check(label, i, want) {
  let got
  try { const r = R.stackReachBest(G, i, 0); got = r ? '[' + r.lo + ',' + r.hi + ']' : 'null' }
  catch (e) { got = '抛错：' + e.message }
  const ok = got === want
  if (!ok) bad++
  console.log((ok ? '✓ ' : '✗ ') + label + '：' + got + (ok ? '' : '  应为 ' + want))
}
check('锚 3（第 1 格）往顶 5+9+2', 1, '[1,4]')
check('锚 9（第 3 格）往底 5+3', 3, '[1,3]')
check('锚 2（堆顶）往底 9+5+3', 4, '[1,4]')
check('锚 K（堆底）往顶 3+5 = 8 ≤ 8', 0, '[0,2]')
// 门槛：堆上含锚 2 张就算（锚 9 往顶只够 2 那 1 张 → 含锚 2 张，**算**）
check('锚 9（第 3 格）只往顶：9+2 含锚 2 张也算', 3, process.env.STACK21_DIR === 'up' ? '[3,4]' : '[1,3]')
console.log(bad ? '\n✗ ' + bad + ' 条不对' : '\n全过')
process.exit(bad ? 1 : 0)
