// 摸打钓鱼 · 模拟器入口
//
//   node sim.js base                     跑基准（双方都不带角色不带技能），对照设计文档
//   node sim.js one <key> [选项]          量一件点数技能的分差
//   node sim.js all [选项]                所有点数技能跑一遍，出一张表
//   node sim.js pair <keyA> <keyB> [选项] 量两件技能装在一起的分差（组合技用）
//   node sim.js roles [选项]              八个角色各自的常驻技能值多少分
//   node sim.js role <key> [选项]         一个角色打满槽，对照空装
//   node sim.js cards [选项]              零点牌 / 无点数牌掺进牌组，局面怎么变
//
// 选项：
//   -n 40000        跑几局（默认 20000）
//   --seed 1        随机种子起点（默认 1）
//   --role basket   技能装在哪个角色身上（默认 lock —— 四个小槽，最中性）
//   --slot N        装进那个角色的第几个槽（从 0 数，默认 0）
//
// 分差的口径跟设计文档一致：**扣掉后手本来就有的那点优势**。
// 做法是同一批种子跑两遍（一遍双方空手当基线、一遍一方带技能），
// 两遍的开局牌序一样，所以差出来的就是技能本身。
//
// ---- 这一层整个重写过（2026-10） ----
//
// 原先的选项是 --level / --slot suit|rank / --spots A,7,K，模型是
// 「技能自带覆盖面，等级决定占几格」。源码那边花色槽砍了、等级删了，
// 现在覆盖面由**角色卡的槽**决定，所以量一件技能必须先说「装在谁身上」。
//
// 这也是为什么 --role 的默认值是**江口闸官**：它四个槽、每槽恰好一个点数
//（4 张牌），是全表最中性的尺子 —— 换别的角色量出来的数不能直接比。

const R = require('./rules.js')
const AI = require('./ai.js')

// 量单件技能时默认装在谁身上。江口闸官 = ['A','2','3','4']，
// 四个等大的小槽，所以「这件技能管 4 张牌」在各件之间是可比的
const DEFAULT_ROLE = 'lock'

function parseArgs(argv) {
  const out = { _: [], n: 20000, seed: 1, role: DEFAULT_ROLE, slot: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n') { out.n = parseInt(argv[++i], 10) }
    else if (a === '--seed') { out.seed = parseInt(argv[++i], 10) }
    else if (a === '--role') { out.role = argv[++i] }
    else if (a === '--slot') { out.slot = parseInt(argv[++i], 10) }
    else { out._.push(a) }
  }
  return out
}

// 跑 n 局，双方配装给定。返回汇总。
//
// opts.myRole / opts.foeRole 是角色下标（-1 = 不带角色）——
// 那件常驻特殊技能靠它现查，所以**量特殊技能就是换这个数**
function run(n, seed, mine, foe, opts) {
  const o = opts || {}
  const sum = {
    games: 0, plays: [0, 0], catches: [0, 0], caught: [0, 0],
    jackCatches: [0, 0], skillCatch: [0, 0],
    score: [0, 0], wins: [0, 0], draws: 0, leftover: 0, turns: 0,
    // 每局的分差，用来算标准差（判断「这个差值是不是跑够了」）
    diffs: []
  }
  for (let i = 0; i < n; i++) {
    const rng = R.makeRng(seed + i)
    const G = R.playGame({
      rng: rng,
      mine: mine,
      foe: foe,
      mineSmart: o.mineSmart !== false,
      foeSmart: o.foeSmart !== false,
      myRole: o.myRole === undefined ? -1 : o.myRole,
      foeRole: o.foeRole === undefined ? -1 : o.foeRole,
      // 改造过的牌组（cards 命令用）。每局现造一副 —— 牌是按对象认的，
      // 两局共用同一批对象不出错，但现造最省心
      deck: o.deckFn ? o.deckFn() : undefined
    }, AI)
    sum.games++
    for (let s = 0; s < 2; s++) {
      sum.plays[s] += G.stat.plays[s]
      sum.catches[s] += G.stat.catches[s]
      sum.caught[s] += G.stat.caught[s]
      sum.jackCatches[s] += G.stat.jackCatches[s]
      sum.skillCatch[s] += G.stat.skillCatch[s]
      sum.score[s] += G.score[s]
    }
    sum.turns += G.stat.turns
    sum.leftover += G.pile.length
    if (G.score[R.ME] > G.score[R.FOE]) sum.wins[R.ME]++
    else if (G.score[R.FOE] > G.score[R.ME]) sum.wins[R.FOE]++
    else sum.draws++
    sum.diffs.push(G.score[R.ME] - G.score[R.FOE])
  }
  return sum
}

function avg(x, n) { return n === 0 ? 0 : x / n }

function meanDiff(sum) {
  return avg(sum.score[R.ME] - sum.score[R.FOE], sum.games)
}

// 分差的标准误。报出来是为了让人看得出「这个 +0.3 到底算不算一回事」
function stderrOf(sum) {
  const m = meanDiff(sum)
  let v = 0
  for (let i = 0; i < sum.diffs.length; i++) {
    const d = sum.diffs[i] - m
    v += d * d
  }
  return Math.sqrt(v / sum.diffs.length / sum.diffs.length)
}

function pct(x) { return (100 * x).toFixed(1) + '%' }
function f1(x) { return x.toFixed(1) }
function f2(x) { return x.toFixed(2) }

// ---------- base：对照设计文档的基础数据 ----------

function cmdBase(args) {
  const sum = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout())
  const g = sum.games
  console.log('基准：双方都没技能、都会记牌，跑 ' + g + ' 局（种子 ' + args.seed + ' 起）\n')

  // ---- 三列：你 / 庄家 / 两人平均 ----
  //
  // **要对照文档的是「两人平均」那一列**，不是「你」那一列 ——
  // 后手有 +3 分的固有优势（见下面那行分差），所以单看后手必然偏高，
  // 而设计文档第一节那张表报的是两人平均。
  //
  // 早先这儿只印后手一方，于是积分 26.0（文档 24）、钓到 9.7（文档 9）
  // 看着像实现跑偏了，其实只是口径不同。差点为此去查 catchStart
  const both = function (pick) {
    return (pick(R.ME) + pick(R.FOE)) / 2
  }
  const perGame = function (side) { return avg(sum.score[side], g) }
  const catches = function (side) { return avg(sum.catches[side], g) }
  const rows = [
    ['每人每局出牌',
      f1(avg(sum.plays[R.ME], g)), f1(avg(sum.plays[R.FOE], g)),
      f1(both(function (s) { return avg(sum.plays[s], g) })), '26 次'],
    ['每人每局钓到',
      f1(catches(R.ME)), f1(catches(R.FOE)), f1(both(catches)), '约 9 次'],
    ['钓到占出牌',
      pct(avg(sum.catches[R.ME], sum.plays[R.ME])),
      pct(avg(sum.catches[R.FOE], sum.plays[R.FOE])),
      pct(both(function (s) { return avg(sum.catches[s], sum.plays[s]) })), '34%'],
    ['每次平均收',
      f2(avg(sum.caught[R.ME], sum.catches[R.ME])),
      f2(avg(sum.caught[R.FOE], sum.catches[R.FOE])),
      f2(both(function (s) { return avg(sum.caught[s], sum.catches[s]) })), '2.75 张'],
    ['每人每局积分',
      f1(perGame(R.ME)), f1(perGame(R.FOE)), f1(both(perGame)), '约 24 分'],
    ['J 通吃占所有钓牌',
      pct(avg(sum.jackCatches[R.ME], sum.catches[R.ME])),
      pct(avg(sum.jackCatches[R.FOE], sum.catches[R.FOE])),
      pct(both(function (s) { return avg(sum.jackCatches[s], sum.catches[s]) })), '22%']
  ]
  console.log('  项                 你(后手)   庄家(先手)  两人平均   文档 v2')
  console.log('  ' + '-'.repeat(62))
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    console.log('  ' + r[0].padEnd(19) + r[1].padEnd(11) + r[2].padEnd(12)
      + r[3].padEnd(11) + r[4])
  }
  console.log('')
  console.log('  后手胜率 ' + pct(avg(sum.wins[R.ME], g))
    + '（文档 57–59%）· 先手 ' + pct(avg(sum.wins[R.FOE], g))
    + ' · 平局 ' + pct(avg(sum.draws, g)))
  console.log('  后手分差（你 − 庄家）：+' + f2(meanDiff(sum))
    + ' 分（标准误 ' + f2(stderrOf(sum)) + '）—— 量技能时要扣掉这个数')

  // ---- 牌数守恒：最硬的一条自检 ----
  //
  // 两人收走的 + 堆里剩的必须等于一副牌。差一张就说明收牌区间、
  // 记分或者 splice 那一套有重复或漏算 —— 这条过了，
  // 上面那些数才值得讨论
  const collected = perGame(R.ME) + perGame(R.FOE)
  const left = avg(sum.leftover, g)
  const total = collected + left
  const deckSize = 52
  console.log('  牌数守恒：收走 ' + f1(collected) + ' + 堆里剩 ' + f1(left)
    + ' = ' + f1(total) + '（一副 ' + deckSize + ' 张）'
    + (Math.abs(total - deckSize) < 0.05 ? ' ✓' : '  ← 对不上，去查 collect / harvestPile'))
}

// ---------- 装一件技能 ----------
//
// 覆盖面由**角色卡的槽**决定，所以装一件技能要说清三件事：
// 哪件技能、装在哪个角色身上、插它的第几个槽。
//
// **注意这会连带把那个角色的常驻特殊技能也带上** —— 没有「只有槽、
// 没有特殊技」的角色。所以 measure 的基线也得带同一个角色（见下面），
// 不然量出来的是「技能 + 特殊技」的和

function skillIndexOf(key) {
  const at = R.SKILLS.findIndex(function (s) { return s.key === key })
  if (at < 0) {
    throw new Error('没有这个技能：' + key + '（有的是 '
      + R.SKILLS.map(function (s) { return s.key }).join(' ') + '）')
  }
  return at
}

function roleIndexOrDie(key) {
  const at = R.roleIndexOf(key)
  if (at < 0) {
    throw new Error('没有这个角色：' + key + '（有的是 '
      + R.DRAW_ROLES.map(function (r) { return r.key }).join(' ') + '）')
  }
  return at
}

function loadoutWith(key, roleKey, slotAt) {
  const at = skillIndexOf(key)
  const role = roleIndexOrDie(roleKey)
  const slots = R.DRAW_ROLES[role].slots
  if (slotAt < 0 || slotAt >= slots.length) {
    throw new Error('【' + R.DRAW_ROLES[role].name + '】只有 ' + slots.length
      + ' 个槽（0 ~ ' + (slots.length - 1) + '），--slot ' + slotAt + ' 越界')
  }
  const lo = R.kitWithOne(role, slotAt, at)
  return {
    lo: lo, def: R.SKILLS[at], role: role, slotAt: slotAt,
    cover: R.coverageOf(lo, at)
  }
}

// 一件技能的分差。
//
// ---- 基线也带同一个角色，这是关键 ----
//
// 角色和特殊技能是绑死的，所以「带江口闸官 + 磁钩」里混着【窄口】的贡献。
// 基线用**同一个角色、所有槽空着**，相减之后剩的才是磁钩本身。
// 基线换成「不带角色」的话，量出来的每一件都会多算一份窄口
function measure(args, loadout, role) {
  const r = role === undefined ? -1 : role
  const o = { myRole: r, foeRole: -1 }
  const base = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout(), o)
  const test = run(args.n, args.seed, loadout, R.emptyLoadout(), o)
  return {
    base: base,
    test: test,
    gain: meanDiff(test) - meanDiff(base),
    se: Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base)),
    winGain: avg(test.wins[R.ME], test.games) - avg(base.wins[R.ME], base.games)
  }
}

// 一个角色的**常驻技能**值多少分：同一批种子，一边带角色（槽全空）、
// 一边完全不带角色。相减就是那件特殊技能
function measureSpecial(args, role) {
  const empty = R.emptyLoadout()
  const base = run(args.n, args.seed, empty, empty, { myRole: -1, foeRole: -1 })
  const test = run(args.n, args.seed, empty, empty, { myRole: role, foeRole: -1 })
  return {
    base: base,
    test: test,
    gain: meanDiff(test) - meanDiff(base),
    se: Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base)),
    winGain: avg(test.wins[R.ME], test.games) - avg(base.wins[R.ME], base.games)
  }
}

// 「江口闸官 · 第 1 个槽（A）」这样一行，报表抬头用
function whereText(made) {
  const role = R.DRAW_ROLES[made.role]
  return role.name + ' · 第 ' + (made.slotAt + 1) + ' 个槽（'
    + role.slots[made.slotAt] + '）· 管 ' + made.cover
}

function cmdOne(args) {
  const made = loadoutWith(args._[1], args.role, args.slot)
  const m = measure(args, made.lo, made.role)
  console.log('【' + made.def.name + '】' + made.def.key
    + ' · ' + whereText(made) + ' · ' + args.n + ' 局\n')
  console.log('  分差（已扣掉后手基线 +' + f2(meanDiff(m.base)) + '）：'
    + (m.gain >= 0 ? '+' : '') + f2(m.gain) + ' 分   标准误 ' + f2(m.se))
  console.log('  胜率：' + pct(avg(m.test.wins[R.ME], m.test.games))
    + '（基线 ' + pct(avg(m.base.wins[R.ME], m.base.games)) + '，'
    + (m.winGain >= 0 ? '+' : '') + pct(m.winGain) + '）')
  console.log('  带技能那方：每局钓到 ' + f1(avg(m.test.catches[R.ME], m.test.games))
    + ' 次（基线 ' + f1(avg(m.base.catches[R.ME], m.base.games)) + '），每次收 '
    + f2(avg(m.test.caught[R.ME], m.test.catches[R.ME])) + ' 张（基线 '
    + f2(avg(m.base.caught[R.ME], m.base.catches[R.ME])) + '）')
  console.log('\n  基线**也带这个角色**（槽全空），所以上面那个分差里没有'
    + '「' + R.DRAW_ROLES[made.role].special + '」的份。')
}

function cmdAll(args) {
  const role = roleIndexOrDie(args.role)
  const slots = R.DRAW_ROLES[role].slots
  const slotAt = args.slot < slots.length ? args.slot : 0
  console.log('所有点数技能，各跑 ' + args.n + ' 局（种子 ' + args.seed + ' 起）')
  console.log('装在【' + R.DRAW_ROLES[role].name + '】的第 ' + (slotAt + 1)
    + ' 个槽（' + slots[slotAt] + '，' + R.slotCover(slots[slotAt]) + ' 张牌）\n')
  console.log('  技能      覆盖面        分差     标准误   胜率')
  console.log('  ' + '-'.repeat(52))
  // 基线带同一个角色、槽全空 —— 见 measure 那段注释
  const o = { myRole: role, foeRole: -1 }
  const base = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout(), o)
  const baseDiff = meanDiff(base)
  const baseWin = avg(base.wins[R.ME], base.games)
  const lines = []
  for (let i = 0; i < R.SKILLS.length; i++) {
    const def = R.SKILLS[i]
    const lo = R.kitWithOne(role, slotAt, i)
    const test = run(args.n, args.seed, lo, R.emptyLoadout(), o)
    lines.push({
      name: def.name,
      cover: R.coverageOf(lo, i),
      gain: meanDiff(test) - baseDiff,
      se: Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base)),
      win: avg(test.wins[R.ME], test.games) - baseWin
    })
  }
  lines.sort(function (a, b) { return b.gain - a.gain })
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    console.log('  ' + l.name.padEnd(10)
      + l.cover.padEnd(14)
      + ((l.gain >= 0 ? '+' : '') + f2(l.gain)).padStart(7)
      + f2(l.se).padStart(9)
      + ((l.win >= 0 ? '+' : '') + pct(l.win)).padStart(8))
  }
  console.log('\n  基线（带这个角色、槽全空）：后手分差 +' + f2(baseDiff)
    + '、后手胜率 ' + pct(baseWin))
  console.log('\n  目标档位（设计文档第四节）：单件每局 +3 ~ +5 分。')
  console.log('  这张表只量**槽里那件**。常驻特殊技能用 `roles` 子命令。')
  console.log('  换 --role / --slot 会改覆盖面，数就不能跟这一列比了。')
}

// ---------- roles：八个角色的常驻技能各值多少分 ----------

function cmdRoles(args) {
  console.log('八个角色的**常驻特殊技能**，各跑 ' + args.n + ' 局（种子 '
    + args.seed + ' 起）')
  console.log('槽一律空着 —— 量的是那件常驻技能本身，不含槽里插的东西\n')
  console.log('  角色    特殊技      覆盖    槽        分差     标准误   胜率')
  console.log('  ' + '-'.repeat(66))
  const lines = []
  for (let i = 0; i < R.DRAW_ROLES.length; i++) {
    const role = R.DRAW_ROLES[i]
    const m = measureSpecial(args, i)
    lines.push({
      name: role.name, sp: role.special,
      cover: R.roleCover(i), slots: role.slots.join('/'),
      gain: m.gain, se: m.se,
      win: m.winGain,
      note: R.SP_NOTE[role.special] || ''
    })
  }
  lines.sort(function (a, b) { return b.gain - a.gain })
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    console.log('  ' + l.name.padEnd(8)
      + l.sp.padEnd(12)
      + (l.cover + ' 张').padEnd(8)
      + l.slots.padEnd(10)
      + ((l.gain >= 0 ? '+' : '') + f2(l.gain)).padStart(7)
      + f2(l.se).padStart(9)
      + ((l.win >= 0 ? '+' : '') + pct(l.win)).padStart(8))
  }
  const noted = lines.filter(function (l) { return l.note !== '' })
  if (noted.length > 0) {
    console.log('')
    for (let i = 0; i < noted.length; i++) {
      console.log('  ⚠ ' + noted[i].name + '（' + noted[i].sp + '）：' + noted[i].note)
    }
  }
  console.log('\n  目标档位：一件常驻特殊技每局 +3 ~ +5 分（设计文档 13.3 第六条）。')
  console.log('  【深钩】文档里记着超标（手估约 9 分），这张表是来验它的。')
  console.log('  表里没有【稳钩】—— 它的效果实现了，但没有角色带它（磐石删了）。')
}

// ---------- role：一个角色打满槽 ----------

function cmdRole(args) {
  const role = roleIndexOrDie(args._[1] || args.role)
  const r = R.DRAW_ROLES[role]
  // 槽里插什么会严重影响结果，所以这儿**不替用户选** ——
  // 按表序把前几件插进去只是一个「有东西」的参照，不是最优配装
  const picks = []
  for (let i = 0; i < r.slots.length; i++) {
    picks.push(i)
  }
  const lo = R.kitFromRole(role, picks)
  const o = { myRole: role, foeRole: -1 }
  const base = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout(),
    { myRole: -1, foeRole: -1 })
  const test = run(args.n, args.seed, lo, R.emptyLoadout(), o)
  const gain = meanDiff(test) - meanDiff(base)
  const se = Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base))
  console.log('【' + r.name + '】' + r.key + ' · ' + r.special
    + ' · 槽 ' + r.slots.join(' / ') + '（' + R.roleCover(role) + ' 张）· '
    + args.n + ' 局\n')
  for (let i = 0; i < r.slots.length; i++) {
    console.log('  槽 ' + (i + 1) + '（' + r.slots[i] + '）：'
      + R.SKILLS[picks[i]].name)
  }
  console.log('\n  对照「完全不带角色」：' + (gain >= 0 ? '+' : '') + f2(gain)
    + ' 分   标准误 ' + f2(se))
  console.log('  胜率 ' + pct(avg(test.wins[R.ME], test.games))
    + '（基线 ' + pct(avg(base.wins[R.ME], base.games)) + '）')
  console.log('\n  槽里插的是**按表序取的前几件**，不是最优配装 ——'
    + '这个数只说明「这个角色带着东西大概什么量级」。')
}

// ---------- pair：两件装一起（组合技要用的底数） ----------

function cmdPair(args) {
  const role = roleIndexOrDie(args.role)
  const slots = R.DRAW_ROLES[role].slots
  if (slots.length < 2) {
    throw new Error('【' + R.DRAW_ROLES[role].name + '】只有一个槽，装不下两件。'
      + '换一个多槽的角色：--role lock')
  }
  const atA = skillIndexOf(args._[1])
  const atB = skillIndexOf(args._[2])
  // 两件分别插头两个槽。**槽不一样大的角色会让这个数偏**（比如逆流船夫是
  // '5 6 7' + '4'），所以默认用江口闸官那种等大的
  const lo = R.kitFromRole(role, slots.map(function (s, i) {
    return i === 0 ? atA : (i === 1 ? atB : -1)
  }))
  const both = measure(args, lo, role)
  const onlyA = measure(args, R.kitWithOne(role, 0, atA), role)
  const onlyB = measure(args, R.kitWithOne(role, 1, atB), role)
  console.log('【' + R.SKILLS[atA].name + '】(槽 1：' + slots[0] + ') + 【'
    + R.SKILLS[atB].name + '】(槽 2：' + slots[1] + ')'
    + ' · ' + R.DRAW_ROLES[role].name + ' · ' + args.n + ' 局\n')
  console.log('  只带 ' + R.SKILLS[atA].name + '：'
    + (onlyA.gain >= 0 ? '+' : '') + f2(onlyA.gain))
  console.log('  只带 ' + R.SKILLS[atB].name + '：'
    + (onlyB.gain >= 0 ? '+' : '') + f2(onlyB.gain))
  console.log('  两件都带：' + (both.gain >= 0 ? '+' : '') + f2(both.gain)
    + '   标准误 ' + f2(both.se))
  const synergy = both.gain - onlyA.gain - onlyB.gain
  console.log('\n  协同（两件都带 − 各自单带之和）：'
    + (synergy >= 0 ? '+' : '') + f2(synergy) + ' 分')
  console.log('  这个数是**现在**的协同（没有组合技，纯粹是两件技能互相影响）。')
  console.log('  第九节的组合技做完之后再跑一遍，差额就是组合技自己的贡献。')
  console.log('\n  注意槽不一样大的角色会让这个数偏 —— 默认的江口闸官四个槽等大。')
}

// ---------- cards：零点牌 / 无点数牌掺进牌组，局面怎么变 ----------
//
// 牌组是**双方共用**的，所以这儿量的不是「谁占便宜」，而是**局面的形状**：
// 局长不长、钓牌率掉多少、堆里剩多少 —— 商店卖这两种牌、【抹点】抹牌，
// 改的就是这几样。双方都不带技能（基线口径），分差那一列看后手优势有没有被放大。
//
// 每一行跟同一批种子的标准 52 张比
function cmdCards(args) {
  const n = args.n
  const plain = function () { return R.standardDeck() }
  // 往标准牌组里加 k 张某种牌（花色轮着来）
  const plus = function (rank, k) {
    return function () {
      const deck = R.standardDeck()
      for (let i = 0; i < k; i++) deck.push(R.makeCard(R.SUITS[i % 4], rank, []))
      return deck
    }
  }
  // 把标准牌组里某个点数的 k 张抹成无点数（【抹点】）
  const blanked = function (rank, k) {
    return function () {
      const deck = R.standardDeck()
      let left = k
      for (let i = 0; i < deck.length && left > 0; i++) {
        if (deck[i].rank === rank) {
          deck[i] = R.makeCard(deck[i].suit, R.BLANK_RANK, [])
          left--
        }
      }
      return deck
    }
  }
  const rows = [
    ['标准 52 张', plain],
    ['+4 张零点', plus(R.ZERO_RANK, 4)],
    ['+8 张零点', plus(R.ZERO_RANK, 8)],
    ['+4 张无点数', plus(R.BLANK_RANK, 4)],
    ['+8 张无点数', plus(R.BLANK_RANK, 8)],
    ['抹掉 4 张 K', blanked('K', 4)],
    ['抹掉 4 张 7', blanked('7', 4)]
  ]
  console.log('零点牌 / 无点数牌掺进牌组：双方都没技能、都会记牌，各跑 ' + n + ' 局\n')
  console.log('  牌组            张数   每人出牌  每人钓到  每次收   堆里剩   后手分差   后手胜率')
  console.log('  ' + '-'.repeat(84))
  for (let i = 0; i < rows.length; i++) {
    const sum = run(n, args.seed, R.emptyLoadout(), R.emptyLoadout(), { deckFn: rows[i][1] })
    const g = sum.games
    const size = rows[i][1]().length
    const plays = (avg(sum.plays[R.ME], g) + avg(sum.plays[R.FOE], g)) / 2
    const catches = (avg(sum.catches[R.ME], g) + avg(sum.catches[R.FOE], g)) / 2
    const per = avg(sum.caught[R.ME] + sum.caught[R.FOE], sum.catches[R.ME] + sum.catches[R.FOE])
    console.log('  ' + rows[i][0].padEnd(14) + String(size).padEnd(7)
      + f1(plays).padEnd(10) + f1(catches).padEnd(10) + f2(per).padEnd(9)
      + f1(avg(sum.leftover, g)).padEnd(9)
      + ((meanDiff(sum) >= 0 ? '+' : '') + f2(meanDiff(sum))).padEnd(11)
      + pct(avg(sum.wins[R.ME], g)))
  }
  console.log('\n  零点牌：见底 / 撒网 / 磁钩的料，按点数钓不到也钓不走。')
  console.log('  无点数牌：只有 J、顺色、收色带得走 —— 堆里剩的那一列看它们卡住了多少。')
}

// ---------- 入口 ----------

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'base'
  if (cmd === 'base') return cmdBase(args)
  if (cmd === 'one') return cmdOne(args)
  if (cmd === 'all') return cmdAll(args)
  if (cmd === 'pair') return cmdPair(args)
  if (cmd === 'roles') return cmdRoles(args)
  if (cmd === 'role') return cmdRole(args)
  if (cmd === 'cards') return cmdCards(args)
  console.log('不认识的命令：' + cmd + '\n看文件头的注释，或者 README.md')
}

main()
