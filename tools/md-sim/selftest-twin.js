// 双装槽（`rankOwner2`）的机制自检 —— 五行手算用例〔2026-10-28〕
//
// 为什么要有这一份：CLAUDE.md 第四节「量一个新机制，X 之外必须有一个
//『它做了几次』的计数」。同色闸那次传错参数，bug 下量出 4.89、修好 4.88,
// **单看 X 永远发现不了**。双装同病 —— 它只改「一张牌响几件」，
// 而那一档边际只有 0.12 分/件次，接错了的分差完全藏得住。
//
// ⚠ 下面五行里**第 3、5 行是闸，不是性质**：
//   ♠5 → 0 件　　漏了就是「任何点数牌都触发所有技能」（而 X 会变好看）
//   TWIN_SLOT=off 打 ♠2 → 1 件　　漏了就是零点没关干净 →
//     「双装值多少」量出 0，而那个 0 跟「这机制不值钱」一模一样
//
// 跑法：
//   node tools/md-sim/selftest-twin.js
//   TWIN_SLOT=off node tools/md-sim/selftest-twin.js

const R = require('./rules.js')

const ri = R.DRAW_ROLES.findIndex(function (r) { return r.key === 'riggertwin' })
if (ri < 0) {
  console.log('✗ 找不到 riggertwin —— 这张原型卡被删了？')
  process.exit(1)
}

const role = R.DRAW_ROLES[ri]
const on = R.TWIN_SLOT

console.log('卡 ' + role.key + '  slots=' + JSON.stringify(role.slots) + '  twin=' + role.twin)
console.log('TWIN_SLOT=' + (on ? 'on' : 'off')
  + '  slotCount=' + R.roleSlotCount(ri)
  + '  kitCount=' + R.roleKitCount(ri)
  + '  twinSlotOf=' + R.twinSlotOf(ri)
  + '  roleCover=' + R.roleCover(ri))

// 满配：槽 0 → 技能 0，槽 1 → 技能 1，双装第 2 件 → 技能 2
const picks = []
for (let i = 0; i < R.roleKitCount(ri); i++) picks.push(i)
const lo = R.kitFromRole(ri, picks)

console.log('picks     = ' + JSON.stringify(picks))
console.log('rankOwner  = ' + JSON.stringify(lo.rankOwner))
console.log('rankOwner2 = ' + JSON.stringify(lo.rankOwner2))
console.log('')

// 期望：on 档 ♠2/♠7 两件、♠Q 一件、♠5/♠J 零件；off 档 ♠2 只一件
const want = on
  ? { '2': 2, '7': 2, 'Q': 1, '5': 0, 'J': 0 }
  : { '2': 1, '7': 1, 'Q': 1, '5': 0, 'J': 0 }

let bad = 0
Object.keys(want).forEach(function (rk) {
  const got = R.triggersOf(lo, { rank: rk, suit: '♠' })
  const ok = got.length === want[rk]
  if (!ok) bad++
  console.log((ok ? '✓' : '✗') + ' 打 ♠' + rk + ' → ' + got.length + ' 件 '
    + JSON.stringify(got) + '（期望 ' + want[rk] + '）')
})

// 覆盖面：双装**不加**覆盖面，两件管的是同样那几张
const c0 = R.coverageOf(lo, 0)
const c2 = R.coverageOf(lo, 2)
console.log('')
console.log('技能 0（双装第 1 件）管 ' + JSON.stringify(c0))
console.log('技能 2（双装第 2 件）管 ' + JSON.stringify(c2)
  + (on ? '　← on 档该跟上一行一字不差' : '　← off 档该是空的（零点关干净了）'))
if (on && JSON.stringify(c0) !== JSON.stringify(c2)) {
  console.log('✗ 两件覆盖面不一致 —— 双装的本质就是「共用一个槽」，这儿必须相同')
  bad++
}
if (!on && c2.length !== 0) {
  console.log('✗ off 档技能 2 还管着牌 —— 零点没关干净')
  bad++
}

console.log('')
console.log(bad === 0 ? '—— 全过。' : '—— ' + bad + ' 条没过。')
process.exit(bad === 0 ? 0 : 1)
