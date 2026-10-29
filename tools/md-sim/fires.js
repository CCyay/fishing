// 一张角色卡的「件次」枚举器 —— 52 张牌逐张问「打它响几件」〔2026-10-28〕
//
// 为什么要它：改角色卡形状时，第一个该知道的数是**牌面硬计数**
//（覆盖面几张、总件次多少），而那个数**不需要跑对局** —— 它只取决于
// `skillsOf`，一个纯查表函数。跑 8000 局拿 X 是另一回事，而且慢、带噪声。
//
// ⚠ 它报的**不是强度**。台账归档 5586-5588（同跑同口径）：
//     给一手**新增第一件**  1.86 分/件次
//     同一手**再叠第 2、3 件** 0.12 分/件次
//   所以「覆盖面几张」和「总件次多少」是**两个轴，不能加在一起**，
//   而判据（归档 5596）是「让更多牌能发动」永远比「让一张牌多发动几件」值钱。
//   这个脚本把两个数**分开印**就是为了不让人把它们混成一个。
//
// 它绕开了 `G` 的全部状态，只喂 `skillsOf` 需要的那两格
//（`roles` 给 `hasSpecial`、`loadouts` 给 `triggersOf`）—— 所以
// **按侧判的常驻技（串钩 / 红钩）照旧生效**，不用自己复述它们的逻辑。
// 这正是「别复制一份等效实现」那条：`addRankLink` / `addHeartWild`
// 都没导出，而正确的做法是走 `skillsOf` 这个唯一入口，不是在这儿重写。
//
// 跑法：
//   node tools/md-sim/fires.js peachtide
//   node tools/md-sim/fires.js riggertwin
//   node tools/md-sim/fires.js peachtide --slots '♥|5'            # 假设形状
//   node tools/md-sim/fires.js peachtide --slots '5|10'           # 撤掉 ♥ 槽
//   node tools/md-sim/fires.js peachtide --slots '♥|5 10' --twin 1
//   node tools/md-sim/fires.js peachtide --special ''             # 撤掉常驻技
//
// `--slots` 用 `|` 分槽、槽内用空格分标签（照 DRAW_ROLES 的写法）。
// 不带 `--slots` 就是卡上现行的形状。

const R = require('./rules.js')

const argv = process.argv.slice(2)
const key = argv[0]
if (!key) {
  console.log('用法：node tools/md-sim/fires.js <角色 key> [--slots "♥|5 10"] [--twin N] [--special X]')
  console.log('现有：' + R.DRAW_ROLES.map(function (r) { return r.key }).join(' '))
  process.exit(1)
}

function argOf(name) {
  const at = argv.indexOf('--' + name)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

const ri = R.DRAW_ROLES.findIndex(function (r) { return r.key === key })
if (ri < 0) {
  console.log('✗ 没有这张卡：' + key)
  console.log('现有：' + R.DRAW_ROLES.map(function (r) { return r.key }).join(' '))
  process.exit(1)
}

const role = R.DRAW_ROLES[ri]
const origSlots = role.slots
const origTwin = role.twin
const origSpecial = role.special

// ---- 形状覆写：**就地改 DRAW_ROLES**，因为 `roleSlotCount` / `twinSlotOf` /
// `kitFromRole` / `hasSpecial` 四处读的都是那张表。在这儿另造一份「形状对象」
// 再喂进去就是复制一份逻辑 —— 而那四处里漏一处是静默的
const slotsArg = argOf('slots')
if (slotsArg !== null) {
  role.slots = slotsArg.split('|').map(function (s) { return s.trim() })
}
const twinArg = argOf('twin')
if (twinArg !== null) {
  const t = parseInt(twinArg, 10)
  if (t >= 0) role.twin = t
  else delete role.twin
}
const specialArg = argOf('special')
if (specialArg !== null) role.special = specialArg

// ---- 满配：第 i 个槽插技能 i，双装的第 2 件插最后那一格 ----
const nKit = R.roleKitCount(ri)
const picks = []
for (let i = 0; i < nKit; i++) picks.push(i)
const lo = R.kitFromRole(ri, picks)

// `skillsOf` 要的就这两格（`hasSpecial` 读 roles、`triggersOf` 读 loadouts）
const G = { roles: [ri, -1], loadouts: [lo, R.emptyLoadout()] }

console.log('')
console.log('卡 ' + role.key + '（' + role.name + '）'
  + '  slots=' + JSON.stringify(role.slots)
  + (R.twinSlotOf(ri) >= 0 ? '  twin=' + role.twin : '')
  + '  special=' + (role.special || '（无）'))
if (slotsArg !== null || twinArg !== null || specialArg !== null) {
  console.log('⚠ 这是**覆写后**的假设形状，卡上印的是 slots='
    + JSON.stringify(origSlots)
    + (origTwin !== undefined ? ' twin=' + origTwin : '')
    + ' special=' + (origSpecial || '（无）'))
}
console.log('槽数 ' + R.roleSlotCount(ri) + '　技能件数 ' + nKit
  + '　roleCover ' + R.roleCover(ri) + '（⚠ 这个数不去重、也不知道常驻技，下面那两行才是真的）')
console.log('')

// ---- 52 张牌逐张 ----
const byCount = {}
const fireRows = []
let total = 0
let live = 0

for (let s = 0; s < R.SUITS.length; s++) {
  for (let k = 0; k < R.RANKS.length; k++) {
    const card = { suit: R.SUITS[s], rank: R.RANKS[k] }
    const got = R.skillsOf(G, R.ME, card)
    const n = got.length
    byCount[n] = (byCount[n] || 0) + 1
    total += n
    if (n > 0) {
      live++
      fireRows.push(card.suit + card.rank + '→' + n)
    }
  }
}

console.log('能发动的牌　　 **' + live + ' 张** / 52　← 覆盖面（去重、已排除 J）')
console.log('总件次　　　　 **' + total + '**　← 「一张牌响几件」累加')
console.log('平均　　　　　 ' + (live > 0 ? (total / live).toFixed(2) : '0')
  + ' 件/张（在能发动的牌里）')
console.log('')
console.log('分布：')
Object.keys(byCount).sort(function (a, b) { return a - b }).forEach(function (n) {
  console.log('  响 ' + n + ' 件：' + byCount[n] + ' 张')
})
console.log('')
console.log('逐张：' + fireRows.join('  '))
console.log('')

role.slots = origSlots
if (origTwin === undefined) delete role.twin
else role.twin = origTwin
role.special = origSpecial
