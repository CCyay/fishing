// 〔2026-10-29〕新抢牌规则（特殊匹配不能被抢、可以用特殊匹配抢）的诊断：
//   node tools/md-sim/steal-diag.js <key> [局数] [角色] [槽]
// 双方同带这件、各插同一个槽，数：问抢几次 / 抢成几次 / 其中靠特殊匹配抢成 / 靠 21 匹配免抢
const R = require('./rules.js')
const AI = require('./ai.js')
const key = process.argv[2]
const n = parseInt(process.argv[3] || '2000', 10)
const role = R.roleIndexOf(process.argv[4] || 'lockold')
const slot = parseInt(process.argv[5] || '0', 10)
const at = R.SKILLS.findIndex(function (s) { return s.key === key })
if (at < 0) { console.error('没有这件技能：' + key); process.exit(1) }
const lo = R.kitWithOne(role, slot, at)
const t = { asked: 0, stolen: 0, bySpecial: 0, immune: 0 }
for (let i = 0; i < n; i++) {
  const G = R.playGame({ rng: R.makeRng(1 + i), mine: lo, foe: lo, mineSmart: true, foeSmart: true }, AI)
  const sd = G.stat.steal
  for (let s = 0; s < 2; s++) {
    t.asked += sd.asked[s]; t.stolen += sd.stolen[s]; t.bySpecial += sd.bySpecial[s]; t.immune += sd.immune[s]
  }
}
console.log(key + ' · ' + n + ' 局（双方都带）· 每局：问抢 ' + (t.asked / n).toFixed(2) + ' / 抢成 ' + (t.stolen / n).toFixed(2)
  + ' / 其中靠特殊匹配 ' + (t.bySpecial / n).toFixed(2) + ' / 21 匹配免抢 ' + (t.immune / n).toFixed(2))
