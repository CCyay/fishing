// 出牌那一刻的手牌构成统计（2026-11-01）
//   node tools/md-sim/handstat.js [局数=20000]
// 跑**不带任何技能**的基线对局（双方空槽、不带角色、默认 AI），统计每一次出牌时出牌方的手牌。
// 计数口在 rules.js 的 noteHandStat（只读，不改行为）
const R = require('./rules.js')
const AI = require('./ai.js')
const n = parseInt(process.argv[2] || '20000', 10)
for (let i = 0; i < n; i++) {
  R.playGame({ rng: R.makeRng(1 + i), mine: R.emptyLoadout(), foe: R.emptyLoadout(), mineSmart: true, foeSmart: true, myRole: -1, foeRole: -1 }, AI)
}
const st = R.PROTO_STAT.handstat
const pct = function (a, b) { return (100 * a / b).toFixed(1) + '%' }
const row = function (arr, from, to) { const out = []; for (let k = from; k <= to; k++) out.push(k + ' 种/张：' + pct(arr[k], st.plays)); return out.join('　') }
console.log('基线对局 ' + n + ' 局（双方空槽、不带角色）· 出牌 ' + st.plays + ' 次')
console.log('')
console.log('整手（出牌前，含要打的那张）')
console.log('  张数　' + row(st.fullSize, 1, 6))
console.log('  花色　' + row(st.fullSuits, 1, 4))
console.log('剩下（打出这张之后）')
console.log('  张数　' + row(st.restSize, 0, 5))
console.log('  花色　' + row(st.restSuits, 0, 4))
console.log('  跟打出那张同花色的张数　' + row(st.restSameSuit, 0, 4))
console.log('  有对子（任意点数）　' + pct(st.restAnyPair, st.plays))
console.log('  有跟打出那张同点数的牌　' + pct(st.restPlayedPair, st.plays))
