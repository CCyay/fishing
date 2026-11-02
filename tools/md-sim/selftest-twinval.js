// 〈twinval〉手算用例（不跑对局，只问 valuesOf）〔2026-10-29〕
// 用法：node selftest-twinval.js ；TWINVAL=off node selftest-twinval.js
const R = require('./rules.js')
const role = R.roleIndexOf('riggerval')
const G = { roles: [-1, -1], hands: [[], []], pile: [], pileByFoe: [], turn: 0 }
const ME = 0, FOE = 1
G.roles[ME] = role
const off = process.env.TWINVAL === 'off'
let bad = 0
function card(rank) { return { suit: '♠', rank: rank, value: R.valueOfRank ? R.valueOfRank(rank) : ({ A: 1, Q: 12, K: 13 }[rank] || +rank), extra: [] } }
function check(label, side, rank, want) {
  const c = card(rank)
  G.hands[side] = [c]
  const got = R.valuesOf(G, c, []).slice().sort((a, b) => a - b)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log((ok ? '✓ ' : '✗ ') + label + '：' + JSON.stringify(got) + (ok ? '' : '  应为 ' + JSON.stringify(want)))
}
check('我打 2', ME, '2', off ? [2] : [2, 7])
check('我打 7', ME, '7', off ? [7] : [2, 7])
check('我打 Q（闸：不在双装槽）', ME, 'Q', [12])
check('我打 5（闸）', ME, '5', [5])
check('对手打 2（闸：他没带）', FOE, '2', [2])
console.log(bad ? '\n✗ ' + bad + ' 条不对' : '\n全过')
process.exit(bad ? 1 : 0)
