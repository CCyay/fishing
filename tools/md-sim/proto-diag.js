// 2026-10-19 · 五件原型的**诊断口**：不看 X，看「它到底做了几次」。
//
// 为什么单独写一个脚本：CLAUDE.md 第四节那条硬规矩 ——
// 同色闸传错参那一次，bug 档量出 4.89、修好 4.88，**单看 X 永远发现不了**；
// 抖出它的是一个跟机制直接挂钩的计数（那一档「一次都没补」）。
// 所以每加一个机制就配一个计数口，而 `sim.js` 只报分，不报这个。
//
//   node tools/md-sim/proto-diag.js lowdraft 4000
//
// 口径跟 `sim.js vs` 那一套对齐：**江口闸官第 1 槽（A）**、双方同角色、
// 庄家先手写死（fixFirst）。只统计**我方**带这件时它做了什么 ——
// 对手不带，所以 PROTO_STAT 里的数全是我这一侧的。
const R = require('./rules.js')
const AI = require('./ai.js')

// 第 4~6 个参数〔2026-10-19 加，为了量【21 匹配】沉底那一支〕：
//   slot      插第几个槽（从 0 数）
//   roleKey   借哪个角色的槽（默认 lock = 江口闸官，四个等大小槽）
//   special   传 'special' 就**把那个角色的常驻技也带上**
//
// 第三个参数是补上来的，而它是一次实打实的损失：`sim.js` 的 `--role`
// **只借槽形状、默认不带常驻技**，而【逆流】（可选落堆底）正是常驻技 ——
// 不带它，沉底那一支一次都不会发动，于是 A/B 两档逐位相同、
// 看起来像「改动无害」。
const key = process.argv[2]
const n = parseInt(process.argv[3] || '4000', 10)
const slotAt = parseInt(process.argv[4] || '0', 10)
const roleKey = process.argv[5] || 'lock'
const withSpecial = process.argv[6] === 'special'

let skillAt = -1
for (let i = 0; i < R.SKILLS.length; i++) {
  if (R.SKILLS[i].key === key) skillAt = i
}
if (skillAt < 0) {
  console.error('没有这件技能：' + key)
  process.exit(1)
}

const role = R.roleIndexOf(roleKey)
if (role < 0) {
  console.error('没有这个角色：' + roleKey)
  process.exit(1)
}
const lo = R.kitWithOne(role, slotAt, skillAt)
const empty = R.emptyLoadout()
// 带常驻技就把 myRole 传进去；不带传 −1（照 sim.js 的 rolesFor）
const myRole = withSpecial ? role : -1

let plays = 0
let score = 0
for (let i = 0; i < n; i++) {
  const G = R.playGame({
    rng: R.makeRng(12345 + i),
    mine: lo,
    foe: empty,
    mineSmart: true,
    foeSmart: true,
    myRole: myRole,
    foeRole: -1,
    fixFirst: R.FOE
  }, AI)
  plays += G.stat.plays[R.ME]
  score += G.score[R.ME]
}

console.log('【' + R.SKILLS[skillAt].name + '】· ' + n + ' 局 · '
  + R.DRAW_ROLES[role].name + '第 ' + (slotAt + 1) + ' 槽'
  + (withSpecial ? ' · **带常驻技**' : ' · 不带常驻技'))
console.log('我方出牌 ' + (plays / n).toFixed(1) + ' 次/局、得分 '
  + (score / n).toFixed(2) + ' 分/局')
const st = R.PROTO_STAT
for (const k in st) {
  const row = st[k]
  let any = false
  for (const f in row) if (row[f] !== 0) any = true
  if (!any) continue
  const parts = []
  for (const f in row) parts.push(f + '=' + (row[f] / n).toFixed(3) + '/局')
  console.log('  ' + k + ': ' + parts.join('  '))
}
