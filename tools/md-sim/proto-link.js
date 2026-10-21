// 2026-10-20 ·【点数互通】的**无天花板口径**：双方同角色、同满配，
// 只有我这一侧带这件常驻技。
//
//   node tools/md-sim/proto-link.js [局数]
//
// ---- 为什么要专门写这个口径 ----
//
// `sim.js role` 的对手**完全不带角色、配装全空**，于是满配那一档
// 胜率已经 95~98%，带上这件只能挤到 99.6~99.8% —— **撞天花板**。
// 那一档量出「触发件次 ×4 换 +6.35、×2 就有 +5.98」，看着像饱和，
// 可天花板也长这样，两者分不开。而「是真饱和还是天花板」对定档有后果：
//   真饱和     → 4 槽卡是浪费，该配 2~3 槽
//   天花板假象 → 4 槽卡会在 campaign 那种「庄家也强」的局面里爆掉
//
// 双方同配装的话分差天然回到 0 附近，那一档的增量才是这件技能本身。
//
// ---- 口径细节 ----
//
// 照 `vs X X`：双方同角色、同配装（KIT_ORDER 前 N 件）、都会记牌。
// **先后手各跑一半**再平均 —— 不这么做的话先后手价差（base 实测 −0.46）
// 会整个压在报出来的差上。
//
// 报的「差」是**我 − 对手的原始分差**。照 CLAUDE.md 第二节那条：
// 这不是 D，D 是它的一半。
//
// ---- 第二个模式：`--duel A B`〔2026-10-20 加〕 ----
//
//   node tools/md-sim/proto-link.js 8000 --duel linkman night
//
// 两张**不同的**角色卡正面对打，同样先后手各一半。加它的理由是
// `sim.js vs` 只收一个 `--role`（双方同角色），而【通号人】的立项读数
// 正是「它跟**槽一模一样的**夜钓客差多少」—— 同槽、同插件、
// 只差常驻技（点数互通 vs 两色），那个差就是这件技能相对两色的净值。
//
// ⚠ 两张卡**槽数不同**的话这个数不能当「技能差」读 ——
// 槽数决定插几件，那就不是控变量了。脚本会在槽数不等时印一行警告。
const R = require('./rules.js')
const AI = require('./ai.js')

const argv = process.argv.slice(2)
const duelAt = argv.indexOf('--duel')
const duel = duelAt >= 0 ? argv.slice(duelAt + 1, duelAt + 3) : null
const n = parseInt((duelAt === 0 ? '' : argv[0]) || '8000', 10)

if (!duel && R.RANK_LINK !== 'me') {
  console.error('这个脚本（扫描模式）要 RANK_LINK=me（只有我方带）。现在是 '
    + (R.RANK_LINK === '' ? '关' : R.RANK_LINK)
    + '\n  用法：RANK_LINK=me node tools/md-sim/proto-link.js 8000'
    + '\n  或者对打模式（载体卡，不用旋钮）：'
    + '\n    node tools/md-sim/proto-link.js 8000 --duel linkman night')
  process.exit(1)
}
// 对打模式下旋钮必须**关着** —— 开着的话它会给对手那张卡也挂上互通，
// 而那正好把要量的差抹掉。这是静默的，所以在这儿拦
if (duel && R.RANK_LINK !== '') {
  console.error('对打模式要 RANK_LINK 关着（载体卡自己带）。现在是 ' + R.RANK_LINK)
  process.exit(1)
}

// ---- 跟 `sim.js` 的 KIT_ORDER 同一份名单 ----
//
// ⚠ 这是**复制**的（sim.js 是 CLI、没导出它）。那边改了这儿要跟 ——
// 不跟的话两个口径的满配装的不是同一套技能，数不能相减
const KIT_ORDER = [
  'chain', 'kindle', 'swapcard', 'flow', 'wild', 'peak', 'draft', 'coldhue'
]

function skillIndexOf(key) {
  for (let i = 0; i < R.SKILLS.length; i++) {
    if (R.SKILLS[i].key === key) return i
  }
  return -1
}

function kitFor(role) {
  const picks = []
  const n2 = R.DRAW_ROLES[role].slots.length
  for (let i = 0; i < n2; i++) picks.push(skillIndexOf(KIT_ORDER[i % KIT_ORDER.length]))
  return picks
}

// 这张卡有几个点数槽 = 理论倍率
function rankSlotsOf(role) {
  const slots = R.DRAW_ROLES[role].slots
  let k = 0
  for (let i = 0; i < slots.length; i++) {
    const labels = R.slotLabels(slots[i])
    for (let j = 0; j < labels.length; j++) {
      if (!R.isSuitSlot(labels[j])) { k++; break }
    }
  }
  return k
}

function f2(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) }

// 一个角色跑 n 局，返回 { mean, se, mult }。两个模式共用它 ——
// **别复制一份**（CLAUDE.md：复制一份逻辑，两份必然分叉）
// 这一跑该读哪个诊断口。三件常驻技**共用这个脚本**〔2026-10-20 加〕——
// 串钩 / 红心万用 / 归方 的无天花板口径是同一个（双方同卡同满配、
// 只我方带），所以不另写一份脚本（「复制一份逻辑，两份必然分叉」）。
//
// 判法是**问计数器**：哪一个 `plays > 0` 就报哪一个。
// 三个都是 0 的话报 ×0.00，而那本身就是「这一档什么都没发动」的信号
const PROTO_KEYS = ['ranklink', 'heartwild', 'todia']

function resetProtoStats() {
  for (let i = 0; i < PROTO_KEYS.length; i++) {
    const st = R.PROTO_STAT[PROTO_KEYS[i]]
    st.plays = 0; st.hit = 0; st.base = 0; st.extra = 0
    if ('hearts' in st) st.hearts = 0
    if ('turned' in st) st.turned = 0
  }
}

function liveProtoStat() {
  for (let i = 0; i < PROTO_KEYS.length; i++) {
    const st = R.PROTO_STAT[PROTO_KEYS[i]]
    if (st.plays > 0) return st
  }
  return null
}

function runPair(myRole, foeRole) {
  const mine = R.kitFromRole(myRole, kitFor(myRole))
  const theirs = R.kitFromRole(foeRole, kitFor(foeRole))
  resetProtoStats()
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const G = R.playGame({
      rng: R.makeRng(12345 + i),
      mine: mine,
      foe: theirs,
      mineSmart: true,
      foeSmart: true,
      myRole: myRole,
      foeRole: foeRole,
      // 先后手各一半 —— 先后手价差（base −0.46）不这么做会整个压在差上
      fixFirst: i % 2 === 0 ? R.FOE : R.ME
    }, AI)
    const d = G.score[R.ME] - G.score[R.FOE]
    sum += d
    sumSq += d * d
  }
  const mean = sum / n
  const st = liveProtoStat()
  return {
    mean: mean,
    se: Math.sqrt((sumSq / n - mean * mean) / n),
    mult: st !== null && st.base > 0 ? (st.base + st.extra) / st.base : 0
  }
}

if (duel) {
  const a = R.roleIndexOf(duel[0])
  const b = R.roleIndexOf(duel[1])
  if (a < 0 || b < 0) {
    console.error('角色 key 查不到：' + duel.filter(function (k, i) {
      return (i === 0 ? a : b) < 0
    }).join(' / '))
    process.exit(1)
  }
  const ra = R.DRAW_ROLES[a]
  const rb = R.DRAW_ROLES[b]
  const res = runPair(a, b)
  console.log('【' + ra.name + '】 vs 【' + rb.name + '】 · 双方满配 · '
    + n + ' 局（先后手各一半）\n')
  console.log('  我：' + ra.name + '（' + ra.special + '）槽 '
    + ra.slots.join(' / ') + '（' + R.roleCover(a) + ' 张）')
  console.log('  他：' + rb.name + '（' + rb.special + '）槽 '
    + rb.slots.join(' / ') + '（' + R.roleCover(b) + ' 张）\n')
  console.log('  我 − 他：' + f2(res.mean) + '   标准误 ±' + res.se.toFixed(2)
    + '   我方实际倍率 ×' + res.mult.toFixed(2))
  // 同一张卡对自己〔2026-10-20 加〕：那是【红心万用】/【归方】的
  // 无天花板口径 —— 双方同卡同满配，靠 `HEART_SIDE=me` / `DIA_SIDE=me`
  // 只给我这一侧开。旋钮忘了调成 `me` 的话两边都带，差恒为 0，
  // 而那会被读成「这件技能没用」—— 所以在这儿拦一句
  if (a === b) {
    console.log('\n  **同一张卡对打** —— 这个差全部来自「只有我方带那件常驻技」。')
    if (ra.special === 'heartwild' && R.HEART_SIDE !== 'me') {
      console.log('  ⚠ HEART_SIDE=' + R.HEART_SIDE
        + '（两边都带）→ 这个差**恒为 0**，不是「没用」。'
        + '加上 HEART_SIDE=me 重跑。')
    }
    if (ra.special === 'todia' && R.DIA_SIDE !== 'me') {
      console.log('  ⚠ DIA_SIDE=' + R.DIA_SIDE
        + '（两边都带）→ 这个差**恒为 0**，不是「没用」。'
        + '加上 DIA_SIDE=me 重跑。')
    }
  } else if (ra.slots.length !== rb.slots.length) {
    console.log('\n  ⚠ **两张卡槽数不同**（' + ra.slots.length + ' vs '
      + rb.slots.length + '）—— 插的件数就不一样，'
      + '这个差里混着「多插一件」那一份，**不能当常驻技的差读**。')
  } else {
    console.log('\n  槽数相同（各 ' + ra.slots.length
      + ' 个，插 KIT_ORDER 前 ' + ra.slots.length + ' 件），'
      + '槽标签' + (ra.slots.join() === rb.slots.join() ? '**也相同**' : '不同')
      + ' —— ' + (ra.slots.join() === rb.slots.join()
        ? '所以这个差就是两件常驻技的差。'
        : '覆盖面可能不等，看上面那两个张数。'))
  }
  console.log('  这是**原始分差**，不是 D —— D 是它的一半（CLAUDE.md 第二节）。')
  return
}

console.log('【点数互通】双方同角色同满配、**只有我方带这件常驻技** · 各 '
  + n + ' 局（先后手各一半）\n')
console.log('  角色      点数槽  覆盖   我 − 对手    标准误   实际倍率')
console.log('  ' + '-'.repeat(60))

const skipped = []
for (let ri = 0; ri < R.DRAW_ROLES.length; ri++) {
  const role = R.DRAW_ROLES[ri]
  // ⚠ 载体卡（常驻技就是这一件）在这个口径下**恒等于 0** ——
  // 双方同角色 → 两边都靠 `hasSpecial` 带上它 → 旋钮那一档差不出来。
  // 印一行 0 会被当成「这张卡吃不到互通」，所以跳过并在末尾说明。
  // 要量它们得走 `--duel`（跟槽一样的夜钓客对打）
  if (role.special === 'ranklink') { skipped.push(role.name); continue }
  const res = runPair(ri, ri)
  console.log('  ' + role.name.padEnd(10)
    + String(rankSlotsOf(ri)).padStart(3) + ' 个'
    + (' ' + R.roleCover(ri) + ' 张').padEnd(8)
    + f2(res.mean).padStart(9)
    + ('±' + res.se.toFixed(2)).padStart(9)
    + ('×' + res.mult.toFixed(2)).padStart(10))
}

console.log('\n  「我 − 对手」是**原始分差**，不是 D —— D 是它的一半'
  + '（CLAUDE.md 第二节）。')
console.log('  双方同角色同配装，所以这一列没有天花板：'
  + '不带这件的话它该是 0（在标准误之内）。')
console.log('  实际倍率 ×1.00 的两张（镜湖 / 深海，各只有 1 个点数槽）'
  + '是**对照组** —— 它们的差也该是 0。')
if (skipped.length > 0) {
  console.log('\n  跳过 ' + skipped.join(' / ')
    + '：载体卡双方都带这件常驻技，这个口径下差**恒为 0**（不是「吃不到」）。')
  console.log('    量它们用：node tools/md-sim/proto-link.js ' + n
    + ' --duel linkman night')
}
