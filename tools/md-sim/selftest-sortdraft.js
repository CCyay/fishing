// 〈sortdraft〉排序手算用例〔2026-10-29〕：堆 5 / 无点数 / 9 / 2 / 9 / 7 → 无点数 9 9 7 5 2，平行数组跟着走
const R = require('./rules.js')
const vals = [[5], [], [9], [2], [9], [7]]
const tag = ['a', 'b', 'c', 'd', 'e', 'f']
const G = { pile: tag.slice(), pileByFoe: [0, 1, 0, 1, 0, 1], pileGuard: tag.map(t => 'g' + t),
  pileVals: vals.map(v => v.slice()), pileSuit: tag.map(t => 's' + t), pileBurn: tag.map(t => 'b' + t) }
const moved = R.sortPileDesc(G)
const got = G.pileVals.map(v => v.length ? v[0] : '-').join(' ')
let bad = 0
const want = '- 9 9 7 5 2'
console.log((got === want ? '✓' : (bad++, '✗')) + ' 点数序：' + got + '（应为 ' + want + '）')
const order = G.pile.join('')
console.log((order === 'bcefad' ? '✓' : (bad++, '✗')) + ' 牌序：' + order + '（应为 bcefad —— 两张 9 保持原先后 c 在 e 前）')
const aligned = G.pile.every((t, i) => G.pileGuard[i] === 'g' + t && G.pileSuit[i] === 's' + t && G.pileBurn[i] === 'b' + t && G.pileByFoe[i] === [0, 1, 0, 1, 0, 1][tag.indexOf(t)])
console.log((aligned ? '✓' : (bad++, '✗')) + ' 六条平行数组对齐')
console.log('挪了 ' + moved + ' 步')
process.exit(bad ? 1 : 0)
