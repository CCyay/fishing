// 2026-10-21 · 【冻结】**锁满**有多常见：占几个槽能把对方 4 张手牌全锁住。
//
//   node tools/md-sim/freeze-lock.js [局数]
//   FREEZE_CAP=99 node tools/md-sim/freeze-lock.js 20000     ← 不设上限（用户问的那一档）
//   FREEZE_VOID=0 FREEZE_CAP=99 node tools/md-sim/freeze-lock.js 20000   ← 带点数的对照
//
// ---- 为什么要单独一个脚本：这一格 X 量不出来 ----
//
// 「对方手牌全被冻住 → 他只能连着跳回合」是**体验问题**，不是强度问题。
// 它在 X 上几乎看不见（跳回合的那一方少打几手，而少打几手两边的分都缩），
// 而它决定的是「这件技能能不能上架、上限定几」。
// 2026-10-20 定 FREEZE_CAP=3 靠的就是这一类数，那次的探针放在 /tmp 没进仓库 ——
// **于是 10-21 撤掉自带冰之后没法复量，只能重写一遍。这次进仓库。**
//
// ---- 口径（跟 proto-diag.js 对齐）----
//
// 我方带【冻结】×N 槽、**对手空装**、双方都会记牌、庄家先手写死。
// 读的是 `G.stat.lockSkips[FOE]` / `lockMax[FOE]` —— 被锁的是对手。
//
// ⚠ 「锁满」判的是 `ai.pickCard` 返回 −1，也就是 `playableCount === 0`。
// 手牌**不止 4 张**（`refill` 只补到下限 4、上限不限），所以「4 张全锁」
// 其实是「手里每一张都被锁」。这两件事在这个规则下是同一件事。
//
// ⚠ `G.hands[side].length === 0`（手里真没牌）那条岔**不计**在内 ——
// 那是终局现象，跟冻结无关。
const R = require('./rules.js')
const AI = require('./ai.js')

const n = parseInt(process.argv[2] || '20000', 10)

// 每一行：角色 key + 这些槽插冻结。覆盖面是算出来的，不是写死的 ——
// 写死过一次就会跟角色表分叉（这个项目的老毛病）
const CASES = [
  ['lock', [0], '1 个点数槽（A）'],
  ['lock', [0, 1], '2 个点数槽（A 2）'],
  ['lock', [0, 1, 2], '3 个点数槽（A 2 3）'],
  ['lock', [0, 1, 2, 3], '4 个点数槽（A 2 3 4）'],
  ['mirror', [1], '1 个点数槽（3 4）'],
  ['mirror', [0], '1 个**花色**槽（♥）'],
  ['mirror', [0, 1], '花色 + 点数（♥ 3 4）'],
  ['peachtide', [0, 1, 2], '花色 + 两点数（♥ 5 10）']
]

function run(roleKey, slots) {
  const role = R.roleIndexOf(roleKey)
  const picks = []
  for (let i = 0; i < R.roleSlotCount(role); i++) picks.push(-1)
  for (const s of slots) picks[s] = R.SK.FREEZE
  const lo = R.kitFromRole(role, picks)
  const empty = R.emptyLoadout()

  let cover = 0
  for (const s of slots) cover += R.slotCover(R.DRAW_ROLES[role].slots[s])

  let games = 0        // 这一局出现过锁满
  let skips = 0        // 锁满跳过的总次数
  let maxRun = 0       // 全样本最长连跳
  let run3 = 0         // 连跳 ≥3 的局
  let myScore = 0
  let foeScore = 0
  let wins = 0
  for (let i = 0; i < n; i++) {
    const G = R.playGame({
      rng: R.makeRng(12345 + i),
      mine: lo,
      foe: empty,
      mineSmart: true,
      foeSmart: true,
      myRole: -1,
      foeRole: -1,
      fixFirst: R.FOE
    }, AI)
    const sk = G.stat.lockSkips ? G.stat.lockSkips[R.FOE] : 0
    const mx = G.stat.lockMax ? G.stat.lockMax[R.FOE] : 0
    if (sk > 0) games++
    skips += sk
    if (mx > maxRun) maxRun = mx
    if (mx >= 3) run3++
    myScore += G.score[R.ME]
    foeScore += G.score[R.FOE]
    if (G.score[R.ME] > G.score[R.FOE]) wins++
  }
  return {
    cover: cover, pct: games / n, skips: skips / n, maxRun: maxRun,
    run3: run3 / n, my: myScore / n, foe: foeScore / n, win: wins / n
  }
}

// ⚠ 这个 fallback 字串**必须跟 rules.js 的默认值一起翻**（10-21 翻过一次：
//   3 → 99 = 不设上限）。写死过一次就会印出「FREEZE_CAP=3」而跑的是无上限 ——
//   那正是 CLAUDE.md 第一条（真相在实现那一层，文案会骗人）
const cap = process.env.FREEZE_CAP ? process.env.FREEZE_CAP : '99（默认 = 不设上限）'
const vd = process.env.FREEZE_VOID === '0' ? '带点数（对照）' : '无点数（定稿）'
console.log('【冻结】锁满有多常见 · ' + n + ' 局 · FREEZE_CAP=' + cap + ' · ' + vd)
console.log('我方带冻结 ×N 槽、对手空装、不带常驻技、庄家先手\n')
console.log('  配置                        覆盖  出现锁满的局  跳过/局  连跳≥3  最长连跳   我分   对手分   胜率')
console.log('  ' + '-'.repeat(103))
for (const [roleKey, slots, label] of CASES) {
  const r = run(roleKey, slots)
  console.log('  ' + label.padEnd(26 + (label.match(/\*/g) || []).length)
    + String(r.cover).padStart(4)
    + (r.pct * 100).toFixed(2).padStart(13) + '%'
    + r.skips.toFixed(3).padStart(9)
    + (r.run3 * 100).toFixed(2).padStart(7) + '%'
    + String(r.maxRun).padStart(9)
    + r.my.toFixed(2).padStart(8)
    + r.foe.toFixed(2).padStart(8)
    + (r.win * 100).toFixed(1).padStart(8) + '%')
}
console.log('\n  「出现锁满的局」= 这一局里对手至少有一个回合一张牌都打不出去。')
console.log('  「连跳」= 对手连着几个自己的回合都没打出牌（中间夹着我的回合不打断它）。')
