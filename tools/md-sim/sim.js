// 摸打钓鱼 · 模拟器入口
//
//   node sim.js base                     跑基准（双方都不带角色不带技能），对照设计文档
//   node sim.js one <key> [选项]          量一件点数技能：后手 / 先手 / X / D
//   node sim.js all [选项]                所有点数技能跑一遍，出一张表
//   node sim.js pair <keyA> <keyB> [选项] 量两件技能装在一起的分差（组合技用）
//   node sim.js vs <我的> <对手的> [选项]  我带一件、**对手带一件**（反制型技能用）
//   node sim.js vs <key> <key>            同一件传两次 = 量它在**先手/后手**各值多少
//   node sim.js roles [选项]              八个角色各自的常驻技能值多少分
//   node sim.js role <key> [选项]         一个角色打满槽，对照空装
//   node sim.js cards [选项]              零点牌 / 无点数牌掺进牌组，局面怎么变
//
// `pair` 和 `vs` 的区别要分清：**pair 两件都在我这边，vs 分在两边。**
// 一件「专门破对手某样东西」的技能在 pair 里量不出来 ——
// 那两件都归我，它只会去破我自己的东西（抄底撞上过这堵墙，见 cmdVs）
//
// ---- `one` 的口径对齐了 `all`〔2026-10-14〕----
//
// 改之前 `one` 报的是**单侧（后手）、而且对手不带角色**，可它把那个数
// 印成「分差」—— 读起来就像「这件技能值多少」。两条都是 `all` 在
// 2026-10-12 明确判废的口径（理由见 cmdAll 上面那段）。
//
// **那是【燃烧】族重建那一轮记错数的来源**：六个候选的后手值被当成 X
// 写进文档，引火因此少定了一档价（真实 X +4.92 对记录的 +4.25）。
// 偏得整齐是因为这一族的 D 小（+0.17~+0.67）—— 差得不够大，看不出错。
//
// 现在 `one` 跑三格（基线 / 我带 / 对手带）并报四个数，
// 跟全表可以直接比。**`pair` 还用着老的 `measure`** —— 协同是差中之差，
// 那两条偏差相减时大部分抵掉，所以没动它。
//
// 选项：
//   -n 40000        跑几局（默认 20000）
//   --seed 1        随机种子起点（默认 1）
//   --role basket   借哪个角色的**槽形状**（默认 lock —— 四个小槽，最中性）
//   --slot N        装进那个角色的第几个槽（从 0 数，默认 0）
//   --special       **把那个角色的常驻特殊技也带上**（默认不带，见下）
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
//
// ---- 量技能**不带常驻特殊技**（2026-10-13 定的口径）----
//
// 角色在这儿只提供**槽的形状**（覆盖面几张）。它的常驻特殊技
// 一律关掉 —— `one` / `all` / `pair` / `vs` 四个子命令都是。
// 要带的话显式加 `--special`。
//
// 原先的做法是「基线也带同一个角色，相减就抵掉了」。那条**只在
// 常驻技的影响是可加的时候成立**，而它不是：
//
//   候潮渔翁【涨落】（手牌 6 张、只在打不出牌时才补）
//   → 双方都带、槽全空的**基线格**就已经是 后手 −12.23 分 / 胜率 11.2%
//   （江口闸官同一格：+1.94 / 54.5%）
//
// 基线歪 12 分，四格相减出来的数就全是噪声。而这还不是最坏的 ——
// 最坏的是它**伪装成结论**：野火在那个角色上报「先后手差 21.19 分」，
// 我一度读成「机制出了环」，其实那是基线的歪被技能一半抹平留下的残差。
//
// > 口径：**槽的形状可以借，常驻技不能借。** 量技能就量技能。
// > 常驻技自己有子命令（`roles` / `role`），那两个照旧带。

const R = require('./rules.js')
const AI = require('./ai.js')

// 量单件技能时默认装在谁身上。江口闸官 = ['A','2','3','4']，
// 四个等大的小槽，所以「这件技能管 4 张牌」在各件之间是可比的
const DEFAULT_ROLE = 'lock'

function parseArgs(argv) {
  const out = { _: [], n: 20000, seed: 1, role: DEFAULT_ROLE, slot: 0, special: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n') { out.n = parseInt(argv[++i], 10) }
    else if (a === '--seed') { out.seed = parseInt(argv[++i], 10) }
    else if (a === '--role') { out.role = argv[++i] }
    else if (a === '--slot') { out.slot = parseInt(argv[++i], 10) }
    else if (a === '--special') { out.special = true }
    else { out._.push(a) }
  }
  return out
}

// 量技能时传给 run 的角色下标。**默认 −1（不带常驻技）** —— 见抬头那段。
//
// 借槽形状靠的是 `kitWithOne` / `kitFromRole` 产出的 loadout，
// 那条路跟 G.roles **完全无关**（rules.js 里只有 hasSpecial 和囤饵的
// baitRankOf 读 G.roles，而囤饵本身就是常驻技）。所以关掉 roles
// 掉的只有常驻技，覆盖面一张不少
function rolesFor(args, role, foeToo) {
  const r = args.special ? role : -1
  return { myRole: r, foeRole: foeToo ? r : -1 }
}

// 报表抬头里那一句「带 / 不带常驻技」。**必须打出来** ——
// 不打的话新旧两批输出长得一模一样，而它们不可比
function specialNote(args, role) {
  if (!args.special) return '不带常驻技'
  return '带常驻技【' + R.DRAW_ROLES[role].special + '】'
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
    diffs: [],
    // 【洪水】的诊断口（见 rules.js 的 stat.flood）
    flood: {
      fires: [0, 0], pileSum: [0, 0], flipSum: [0, 0],
      gotSum: [0, 0], thin: [0, 0],
      gotFresh: [0, 0], gotOwn: [0, 0], gotTheirs: [0, 0]
    },
    // 顺子那两件的诊断口（见 rules.js 的 stat.straight / stat.wade）
    straight: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0] },
    wade: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0] },
    // 顺流（按排序收牌）—— 跟上面两件同一组列，所以下面共用同一个循环和同一张表
    order: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0] },
    // 【野火】的诊断口（见 rules.js 的 stat.wild）—— 查那个非单调
    wild: {
      fires: [0, 0], took: [0, 0], blank: [0, 0], burnSum: [0, 0],
      reapSum: [0, 0], reapOwn: [0, 0], reapTheirs: [0, 0],
      sweeps: [0, 0], sweepSum: [0, 0]
    }
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
      const fd = G.stat.flood
      sum.flood.fires[s] += fd.fires[s]
      sum.flood.pileSum[s] += fd.pileSum[s]
      sum.flood.flipSum[s] += fd.flipSum[s]
      sum.flood.gotSum[s] += fd.gotSum[s]
      sum.flood.thin[s] += fd.thin[s]
      sum.flood.gotFresh[s] += fd.gotFresh[s]
      sum.flood.gotOwn[s] += fd.gotOwn[s]
      sum.flood.gotTheirs[s] += fd.gotTheirs[s]
      const keys = ['fires', 'hits', 'lenSum', 'gotSum']
      for (let k = 0; k < keys.length; k++) {
        sum.straight[keys[k]][s] += G.stat.straight[keys[k]][s]
        sum.wade[keys[k]][s] += G.stat.wade[keys[k]][s]
        sum.order[keys[k]][s] += G.stat.order[keys[k]][s]
      }
      const wk = ['fires', 'took', 'blank', 'burnSum',
        'reapSum', 'reapOwn', 'reapTheirs', 'sweeps', 'sweepSum']
      for (let k = 0; k < wk.length; k++) {
        sum.wild[wk[k]][s] += G.stat.wild[wk[k]][s]
      }
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
    // `at` 是给 measureBoth 用的 —— 它要自己再 kitWithOne 两次（镜像那一格）
    at: at,
    cover: R.coverageOf(lo, at)
  }
}

// 一件技能的分差。
//
// ---- 基线和测试格都**不带常驻技**（口径见抬头那段）----
//
// 原先这儿写的是「基线也带同一个角色，相减就抵掉了常驻技」。
// 那条**被候潮渔翁证伪**：它的常驻技【涨落】把基线格本身推到
// 后手 −12.23 分，基线一歪，相减出来的全是噪声。
//
// 可加的常驻技（比如窄口）那样算没错，不可加的就错 ——
// 而「哪件可加」事前判不出来。所以改成一律不带
function measure(args, loadout, role) {
  const r = role === undefined ? -1 : role
  const o = rolesFor(args, r, false)
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

// 一件技能的**两侧**分差。口径跟 `all` / `vs` 一致。
//
// ---- 为什么另开一个，不改上面那个 `measure` ----
//
// `measure` 有两处**已经被 `all` 判废的**口径（理由写在 cmdAll 上面那段）：
//
//   **只量后手一侧** —— 先手溢价的跨度是 −0.01 ~ +4.31，
//     只看一侧等于对一半的技能系统性偏；
//   **对手不带角色** —— 实测偏差 ±1.2（洪水 −1.23、抬水 +0.48），
//     方向因技能而异，没法用一个修正值盖掉。
//
// 而 `one` 一直在用它，**于是它报的「分差」既是单侧的、又是旧口径的**。
// 那正是【燃烧】族重建那一轮把后手值当 X 记进文档的来源
//（六个候选全错同一格，引火因此少定了一档价）。
//
// `measure` 没删，因为 `pair` 还用着它 —— 协同是**差中之差**，
// 那两条口径偏差在相减时大部分抵掉。改 `one` 不该顺手动 `pair`
function measureBoth(args, role, slotAt, skillAt) {
  const o = rolesFor(args, role, true)
  const empty = R.emptyLoadout()
  const lo = R.kitWithOne(role, slotAt, skillAt)
  // 三格：基线（都空）/ 我带 / 对手带。照 cmdAll
  const C = run(args.n, args.seed, empty, empty, o)
  const D = run(args.n, args.seed, lo, empty, o)
  const A = run(args.n, args.seed, empty, lo, o)
  const baseDiff = meanDiff(C)
  const back = meanDiff(D) - baseDiff
  const front = baseDiff - meanDiff(A)
  return {
    base: C, test: D, baseDiff: baseDiff,
    back: back, front: front,
    x: (back + front) / 2,
    d: (front - back) / 2,
    se: Math.sqrt(stderrOf(D) * stderrOf(D) + stderrOf(C) * stderrOf(C)),
    winGain: avg(D.wins[R.ME], D.games) - avg(C.wins[R.ME], C.games)
  }
}

// 「江口闸官 · 第 1 个槽（A，4 张牌）」这样一行，报表抬头用。
//
// **张数走 `slotCover`，不走 `coverageOf`** —— 后者返回的是标签字符串
//（'A' / '2' / '4'），而原先这行写成「管 」+ 那个字符串，
// 于是点数槽读出来是「管 2」「管 4」，看着像张数。三个都是 4 张
function whereText(made) {
  const role = R.DRAW_ROLES[made.role]
  const slot = role.slots[made.slotAt]
  return role.name + ' · 第 ' + (made.slotAt + 1) + ' 个槽（'
    + slot + '，' + R.slotCover(slot) + ' 张牌）'
}

function cmdOne(args) {
  const made = loadoutWith(args._[1], args.role, args.slot)
  const m = measureBoth(args, made.role, made.slotAt, made.at)
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  console.log('【' + made.def.name + '】' + made.def.key
    + ' · ' + whereText(made) + ' · ' + args.n + ' 局 · ' + specialNote(args, made.role) + '\n')
  // 四个数照 `all`：**定价看 X，平衡看 D**
  console.log('  后手 ' + sign(m.back) + '   先手 ' + sign(m.front)
    + '   X ' + sign(m.x) + '   D ' + sign(m.d) + '   标准误 ' + f2(m.se))
  // 建议价的口径跟 cmdAll 逐字一致（锚 25 + X×21、取整到 5、两种不给干净数）
  console.log('  建议价：' + (m.x <= 0 ? '—（X ≤ 0 是效果问题，不是定价问题）'
    : String(Math.round((25 + m.x * 21) / 5) * 5)
      + (Math.abs(m.d) > 1 ? '?　—— |D| > 1，先修平衡再谈价' : '')))
  console.log('\n  胜率：' + pct(avg(m.test.wins[R.ME], m.test.games))
    + '（基线 ' + pct(avg(m.base.wins[R.ME], m.base.games)) + '，'
    + (m.winGain >= 0 ? '+' : '') + pct(m.winGain) + '）')
  console.log('  带技能那方（后手格）：每局钓到 '
    + f1(avg(m.test.catches[R.ME], m.test.games))
    + ' 次（基线 ' + f1(avg(m.base.catches[R.ME], m.base.games)) + '），每次收 '
    + f2(avg(m.test.caught[R.ME], m.test.catches[R.ME])) + ' 张（基线 '
    + f2(avg(m.base.caught[R.ME], m.base.catches[R.ME])) + '）')
  console.log('\n  基线（双方同角色、槽全空）：后手分差 ' + sign(m.baseDiff)
    + ' —— D 的上限就是它。')
  console.log('  口径跟 `all` 一致：双方同角色、各插同一个槽、**两侧都量**，'
    + '所以这几个数可以直接跟全表比。')
}

// ---------- all：全表一张定价表 ----------
//
// ---- 口径换过（2026-10-12），换之前的数**不可比** ----
//
// 原先是「我带角色、**对手不带**」，而且只报后手一侧。那两条都会让
// 绝对值失真，而这张表是用来**定价**的 —— 定价要的正是绝对值：
//
//   **只量后手** —— 已知先手溢价跨度 −0.01 ~ +4.31（洪水、连竿那几件），
//     只看后手等于对一半的技能系统性低估或高估。
//   **对手不带角色** —— 口径偏差实测 ±1.2（洪水 −1.23、抬水 +0.48），
//     而且方向因技能而异，没法用一个修正值盖掉。
//
// 现在跟 `vs` 同口径：**双方同角色、各插同一个槽**，每件量两侧。
// 基线格（双方空手）跟技能无关，所以**全表共用一次** ——
// 于是成本是 44 × 2 + 1 遍，而不是 × 3。
//
// ---- 四个数怎么读 ----
//
//   后手 / 先手 —— 两侧各值多少分
//   **X**  = 两者平均 → **技能本身的强度**，定价看这个
//   **D**  = 两者之差的一半 → 它抹掉了多少后手优势（基线优势 1.94 是上限）
//
// 为什么非得拆开：**溢价一样不代表强度一样**。洪水 X=+5.22 是「强且偏」，
// 连竿 X=−0.45 是「弱且偏」—— 前者该削、后者该修效果，只看溢价会混成一回事
function cmdAll(args) {
  const role = roleIndexOrDie(args.role)
  const slots = R.DRAW_ROLES[role].slots
  const slotAt = args.slot < slots.length ? args.slot : 0
  console.log('全表定价表 · 各跑 ' + args.n + ' 局（种子 ' + args.seed + ' 起）')
  console.log('双方各插【' + R.DRAW_ROLES[role].name + '】第 '
    + (slotAt + 1) + ' 个槽（' + slots[slotAt] + '，'
    + R.slotCover(slots[slotAt]) + ' 张牌）· ' + specialNote(args, role))
  console.log('按 X（技能本身的强度）排序\n')
  console.log('  技能      覆盖面       后手    先手       X       D    建议价  现价')
  console.log('  ' + '-'.repeat(74))
  const o = rolesFor(args, role, true)
  const empty = R.emptyLoadout()
  // 基线格全表共用 —— 它不含任何槽技能，所以跟量哪一件无关
  const C = run(args.n, args.seed, empty, empty, o)
  const baseDiff = meanDiff(C)
  const lines = []
  for (let i = 0; i < R.SKILLS.length; i++) {
    const def = R.SKILLS[i]
    const lo = R.kitWithOne(role, slotAt, i)
    const D = run(args.n, args.seed, lo, empty, o)
    const A = run(args.n, args.seed, empty, lo, o)
    const back = meanDiff(D) - baseDiff
    const front = baseDiff - meanDiff(A)
    lines.push({
      name: def.name,
      cover: R.coverageOf(lo, i),
      back: back,
      front: front,
      x: (back + front) / 2,
      d: (front - back) / 2,
      se: Math.sqrt(stderrOf(D) * stderrOf(D) + stderrOf(C) * stderrOf(C))
    })
  }
  lines.sort(function (a, b) { return b.x - a.x })
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    // 建议价：每 1 分 ≈ 21 金币、起价 25（拿已量的件拟出来的锚）。
    // 取整到 5 的倍数。两种情况不给干净的数：
    //   X ≤ 0 —— 那不是定价问题，是效果问题
    //   |D| > 1 —— 它抹掉了后手的结构性优势，**先修平衡再谈价**，
    //     所以后面加个「?」。洪水 X=+5.21 算出来 135（超过全表最高档），
    //     可它 D=+2.13，那个 135 不该采纳
    //
    // **取整到 5 会把相近的 X 分到两档**（顺色 2.52 → 80、撒网 2.48 → 75，
    // 而两者差 0.04 < 标准误）。所以看建议价时，差一档等于没差 ——
    // 真正的判据是 X 本身
    const want = l.x <= 0 ? '—'
      : String(Math.round((25 + l.x * 21) / 5) * 5) + (Math.abs(l.d) > 1 ? '?' : '')
    console.log('  ' + l.name.padEnd(10) + l.cover.padEnd(13)
      + sign(l.back).padStart(7) + sign(l.front).padStart(8)
      + sign(l.x).padStart(8) + sign(l.d).padStart(8)
      + want.padStart(8))
  }
  console.log('\n  基线（双方同角色、槽全空）：后手分差 ' + sign(baseDiff)
    + '（标准误 ' + f2(stderrOf(C)) + '）')
  console.log('  每件的标准误约 ' + f2(lines.length > 0 ? lines[0].se : 0)
    + ' —— 比它小的差异不作数')
  console.log('\n  目标档位：单件每局 +3 ~ +5 分（看 **X** 这一列）。')
  console.log('  **D ≈ 2 的件要当心** —— 那说明它抹掉了后手的结构性优势')
  console.log('  （基线优势 ' + f2(baseDiff) + ' 就是 D 的上限）。')
  console.log('  X ≤ 0 的件不给建议价：那不是定价问题，是效果问题。')
  console.log('\n  换 --role / --slot 会改覆盖面，数就不能跟这一列比了。')
  console.log('  常驻特殊技能用 `roles` 子命令。')
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

// ---------- vs：**反制型技能**只能这么量 ----------
//
// 别的子命令一律给对手传 `emptyLoadout()`，于是一件「专门用来破对手某样
// 东西」的技能在它们里头**永远无事可做** —— 量出来的不是它的价值，
// 是「一张废牌值多少分」。
//
// 抄底就是第一个撞上这堵墙的（2026-10-10）：
//   `all` 里 −0.92 —— 场上没叠放，它永远掀空；
//   `pair dredge calm` 里协同 −0.15 —— 两件都在**我**这边，
//     等于我垫盾再自己掀掉，那是「对双方都生效」的设计后果，不是它的用法。
//
// 所以这儿把配装**分到两边**：我带 mine，对手带 theirs。
//
// ---- 它跑的是一个 **2×2**，不是一次对照 ----
//
// 「我那一件值多少分」要在**两种棋盘**上各问一次，才分得清
// 「它本来就值这么多」和「它是因为对手带了东西才值这么多」：
//
//                     对手空手        对手带 theirs
//   我空手              C               A        ← 两个基线
//   我带 mine           D               B
//
//   对手空手时我那件值 D − C；对手带 theirs 时值 B − A。
//   **两者之差 (B−A) − (D−C) 就是反制那部分**（差中之差）。
//
// 为什么非得跑四格而不是拿它跟 `one` 比：`one` 的对手**不带角色**，
// 而这儿双方都带。那两个数的基线口径不一样，相减会混进
// 「对手白得了一个角色」的影响。四格全在同一个口径里才能相减
//
// ---- `vs X X`（同一件传两次）是个**另有用处**的特例 ----
//
// C − A 那两格**都是「我空手」**，所以 mine 压根不进那个计算 ——
// 参考行对任何 mine 都一样。于是把同一件技能传两次，四格就变成了
// 「这件技能在**先手**和**后手**手里各值多少」的干净对照：
//
//   D − C   它在后手（我）手里值多少
//   C − A   它在先手（对手）手里值多少
//
// 同一基线、同一角色、同一槽，所以这两个数**可以直接比**。
// 别的子命令给不出后者 —— all / one / pair 一律只量后手那一侧。
//
// ---- 读这四格之前，**先看基线那一格** ----
//
// 「我空 / 对手空」那行是全部减法的参照。它正常该是
// 后手 **+1.94 分 / 胜率 54.5%**（不带常驻技的标准值）。
// 它要是歪了，上面那四个数一个都不能用 ——
// 候潮渔翁带【涨落】时那一格是 **−12.23 / 11.2%**，
// 而野火在那上面报出来的「先后手差 21.19 分」纯粹是基线的歪留下的残差。
// 常驻技现在默认关掉了，但 `--special` 和将来新加的机制都可能再把它弄歪
//
// 这个特例下「差中之差」的含义也变了：它是**镜像对局**的协同
//（双方都带同一件时，我那件多值多少），不是反制。报表会换一套措辞
function cmdVs(args) {
  const role = roleIndexOrDie(args.role)
  const atMine = skillIndexOf(args._[1])
  const atTheirs = skillIndexOf(args._[2])
  // 两边各插同一个角色的第一个槽 —— 槽一样大，覆盖面才可比。
  //
  // 常驻技**默认关掉**（`--special` 才带）。原先靠「双方同角色所以
  // 两边的常驻技互相抵掉」，而那条对**不对称的**常驻技不成立 ——
  // 候潮渔翁【涨落】双方都带时，基线格仍然是后手 −12.23 分：
  // 它偏的是**先后手**，不是偏某一方，所以镜像抵不掉它
  const mine = R.kitWithOne(role, 0, atMine)
  const theirs = R.kitWithOne(role, 0, atTheirs)
  const o = rolesFor(args, role, true)
  const empty = R.emptyLoadout()
  const A = run(args.n, args.seed, empty, theirs, o)
  const B = run(args.n, args.seed, mine, theirs, o)
  const C = run(args.n, args.seed, empty, empty, o)
  const D = run(args.n, args.seed, mine, empty, o)
  const se2 = function (x, y) {
    return Math.sqrt(stderrOf(x) * stderrOf(x) + stderrOf(y) * stderrOf(y))
  }
  const vsGain = meanDiff(B) - meanDiff(A)
  const soloGain = meanDiff(D) - meanDiff(C)
  const counter = vsGain - soloGain
  const nameMine = R.SKILLS[atMine].name
  const nameTheirs = R.SKILLS[atTheirs].name
  // 同一件传两次：那是「先手 vs 后手」那个特例，换一套措辞（见上面那段）
  const mirror = atMine === atTheirs
  const theirGain = meanDiff(C) - meanDiff(A)
  if (mirror) {
    console.log('【' + nameMine + '】在**先手**和**后手**手里各值多少 · '
      + R.DRAW_ROLES[role].name + ' · 都插第 1 个槽（'
      + R.DRAW_ROLES[role].slots[0] + '）· ' + specialNote(args, role)
      + ' · ' + args.n + ' 局\n')
    console.log('    后手（我）手里：  ' + (soloGain >= 0 ? '+' : '') + f2(soloGain)
      + '   标准误 ' + f2(se2(D, C)))
    console.log('    先手（对手）手里：' + (theirGain >= 0 ? '+' : '') + f2(theirGain)
      + '   标准误 ' + f2(se2(C, A)))
    const sideGap = theirGain - soloGain
    console.log('\n  **先手 − 后手**：' + (sideGap >= 0 ? '+' : '') + f2(sideGap) + ' 分')
    console.log('  同一基线、同一角色、同一槽，所以这两个数可以直接比。')
    console.log('  正数 = 这件技能**对先手更有用**（先手本来劣势，'
      + '技能对它的边际价值更高）。')
    console.log('  `all` / `one` / `pair` 只量后手那一侧，所以那几张表'
      + '报的是「后手的价值」。')
    console.log('\n  镜像协同（双方都带时我那件多值多少）：'
      + (counter >= 0 ? '+' : '') + f2(counter) + ' 分')
    // ---- 顺子那两件的诊断口 ----
    //
    // 伏流达标（+3.49）而涉水不达标（+1.01），两件只差「怎么凑」。
    // 这张表把差异拆成三列：**凑成率 / 链长 / 每次收成** ——
    // 哪一列塌了，瓶颈就在那儿。
    //
    // 两侧取的格子跟上面两个分差一致：后手取 D（我带 / 对手空）、
    // 先手取 A（我空 / 对手带）
    const sdRow = function (label, sd, s) {
      const fires = sd.fires[s]
      if (fires === 0) return null
      const hits = sd.hits[s]
      return '    ' + label.padEnd(10)
        + f2(avg(fires, args.n)).padStart(7) + ' 次/局'
        + pct(avg(hits, fires)).padStart(9)
        + f2(avg(sd.lenSum[s], hits)).padStart(9)
        + f2(avg(sd.gotSum[s], hits)).padStart(9)
    }
    const sdRows = [
      sdRow('伏流·后手', D.straight, R.ME), sdRow('伏流·先手', A.straight, R.FOE),
      sdRow('涉水·后手', D.wade, R.ME), sdRow('涉水·先手', A.wade, R.FOE),
      // 顺流不是顺子（它看位置次序，不看值连不连），但要回答的问题
      // 和要看的四列**一模一样**，所以共用这张表
      sdRow('顺流·后手', D.order, R.ME), sdRow('顺流·先手', A.order, R.FOE)
    ].filter(function (r) { return r !== null })
    if (sdRows.length > 0) {
      console.log('\n  ---- 诊断：成段的那几件怎么凑成的（顺子 / 排序）----')
      console.log('            打出次数   凑成率   平均段长   每次收成')
      for (let i = 0; i < sdRows.length; i++) console.log(sdRows[i])
      console.log('\n  「凑成率」低 → 瓶颈在**发动条件**；')
      console.log('  「每次收成」低 → 瓶颈在**收法**；')
      console.log('  两样都不低而分差仍低 → 收的那几张**本来也钓得到**')
      console.log('  （洪水那场查出来的那个机制，见 rules.js 的 stat.flood）。')
    }
    // ---- 【洪水】的诊断口 ----
    //
    // 两侧的 flood 统计要从**两个不同的格子**取，不能都从一个格子读：
    //   后手（我）那一侧 —— D（我带 / 对手空）
    //   先手（对手）那一侧 —— A（我空 / 对手带）
    // 那正好是上面两个分差的来源，所以诊断和分差对得上号
    const fdMe = D.flood
    const fdFoe = A.flood
    if (fdMe.fires[R.ME] > 0 || fdFoe.fires[R.FOE] > 0) {
      console.log('\n  ---- 诊断：它每次发动时的局面（' + args.n + ' 局合计）----')
      console.log('            发动次数   发动时堆厚   翻几张   收几张   其中空堆')
      const row = function (label, fd, s) {
        const fires = fd.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        return label.padEnd(10)
          + f2(avg(fires, args.n)).padStart(8) + ' 次/局'
          + f2(avg(fd.pileSum[s], fires)).padStart(10)
          + f2(avg(fd.flipSum[s], fires)).padStart(9)
          + f2(avg(fd.gotSum[s], fires)).padStart(9)
          + (pct(avg(fd.thin[s], fires))).padStart(10)
      }
      console.log('    ' + row('后手（我）', fdMe, R.ME))
      console.log('    ' + row('先手（对手）', fdFoe, R.FOE))
      console.log('\n  「发动时堆厚」**含它自己**，所以 1.00 = 空堆开局那一手。')
      console.log('  要看的是哪一列在两侧差得最多 —— 那才是溢价的来源。')
      // ---- 收走的牌**本来属于谁**（第四轮定位）----
      //
      // 前三轮都发现洪水在两侧**行为对称**（收一样多、缩一样短），
      // 所以不对称只能在「收的那几张本来归谁」这一步。
      //
      // 要看的是 own 那一列：它是「**自己抢自己**」—— 本来自己就钓得到
      // 的饵，洪水提前拿走，净增益是 0。那一列在两侧差得越多，
      // 就越能解释为什么同样收 6.7 张、分差一个 +3.08 一个 −7.34
      console.log('\n  ---- 收走的牌本来属于谁（每次发动平均）----')
      console.log('            牌库新翻   自己的饵   对手的饵')
      const ownRow = function (label, fd, s) {
        const fires = fd.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        return label.padEnd(10)
          + f2(avg(fd.gotFresh[s], fires)).padStart(8)
          + f2(avg(fd.gotOwn[s], fires)).padStart(11)
          + f2(avg(fd.gotTheirs[s], fires)).padStart(11)
      }
      console.log('    ' + ownRow('后手（我）', fdMe, R.ME))
      console.log('    ' + ownRow('先手（对手）', fdFoe, R.FOE))
      console.log('\n  「自己的饵」那一列是净增益为 0 的部分（自己抢自己）。')
    }
    // ---- 【野火】的诊断口：查那个**非单调** ----
    //
    //   `A`（池 4）    X = +0.50
    //   `♥`（池 12）   X = **−2.93**
    //   `3456`（池 16）X = −0.52
    //
    // 池子越宽分数先降后升，而两档宽槽的**失败形状还不一样**：
    //   `♥`    和（双方总收牌）几乎没动 → **纯转移**（我 −1.56 / 对手 +1.66）
    //   `3456` 和 +0.71、堆上剩 −0.71   → 扫堆真的在干活，只是我没分到
    //
    // 五列各对应一个候选病根，所以哪一列塌了就能直接定位：
    //   触发/局 低  → 池子宽度没兑现成触发（摸不到带它的牌）
    //   取到率 低   → 燃料池空了（连锁断在中途）
    //   贴火/次 低  → 堆太薄，火没地方贴
    //   收成/次 低  → 火活不到下一次触发（留存率那个老问题）
    //   自己的饵 高 → **自己抢自己**（洪水那场查出来的机制），收成是虚的
    const wdMe = D.wild
    const wdFoe = A.wild
    if (wdMe.fires[R.ME] > 0 || wdFoe.fires[R.FOE] > 0) {
      console.log('\n  ---- 诊断：野火的连锁跑成什么样（' + args.n + ' 局）----')
      // 「净/次」= 收成/次 − 0.94。那个 0.94 是**放弃一次普通钓牌**的期望
      //（base 里 34% 命中 × 每次 2.76 张），而野火无点数、必然放弃一次。
      //
      // 它是**卡面账**，已知偏低：它只算当次收成，没算「这次贴上去的火
      // 留给后面几次触发收」那部分。宽槽的数就是证据 ——
      // 触发多 4 倍、X 从 +0.51 跳到 +9.52，远超线性。
      // 所以这一列负着也可能整体正分，看它是为了**比较**，不是判生死
      // 「收成/次」那几列删了 —— 野火**不收牌了**（收割权归关键词），
      // 所以它们恒为 0，留着会被当成「它收不到东西」。
      // 收成现在看下面那张「闭合扫堆」表
      console.log('            点火/局   取到率   贴火/次')
      const wrow = function (label, wd, s) {
        const fires = wd.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没点过火）'
        return label.padEnd(10)
          + f2(avg(fires, args.n)).padStart(8)
          + pct(avg(wd.took[s], fires)).padStart(9)
          + f2(avg(wd.burnSum[s], fires)).padStart(10)
      }
      console.log('    ' + wrow('后手（我）', wdMe, R.ME))
      console.log('    ' + wrow('先手（对手）', wdFoe, R.FOE))
      console.log('\n  「取到率」低 = 燃料池空了（池子跟槽宽走）。')
      console.log('  「贴火/次」= 一次点火点着几格（自带那档恒为 1）。')
      // ---- 【燃烧】闭合扫堆：**双方都从同一个格子读** ----
      //
      // 这跟上面那两张表的取法**不一样**，而那是有意的：
      // 闭合归「当前出牌方」，所以**带野火的那一方点的火，可能被对手闭合**。
      // 要看的就是这个 —— 从格 D（只有我带野火）里同时读我和对手的次数。
      //
      // 两边差不多 → **这条规则washed out**（双方抢同一个池子，净值趋零），
      // 那是它唯一的真未知；我明显更多 → 点火的人确实占优势
      const swMe = D.wild
      if (swMe.sweeps[R.ME] > 0 || swMe.sweeps[R.FOE] > 0) {
        console.log('\n  ---- 诊断：【燃烧】闭合扫堆（格 D：只有我带野火）----')
        console.log('            闭合/局   每次扫几张   扫走合计/局')
        const srow = function (label, s) {
          const n = swMe.sweeps[s]
          if (n === 0) return label.padEnd(10) + '（没闭合过）'
          return label.padEnd(10)
            + f2(avg(n, args.n)).padStart(8)
            + f2(avg(swMe.sweepSum[s], n)).padStart(12)
            + f2(avg(swMe.sweepSum[s], args.n)).padStart(13)
        }
        console.log('    ' + srow('后手（我）', R.ME))
        console.log('    ' + srow('先手（对手）', R.FOE))
        console.log('\n  **两边的「闭合/局」差不多就说明这条规则washed out** ——')
        console.log('  我点的火被对手闭合，净值趋零。那是它唯一的真未知。')
        console.log('  「每次扫几张」对照基线堆厚 3.1：接近 3 说明闭合在厚堆上发生，')
        console.log('  接近 1 说明多半是「自带火打在空堆上当场收自己」那条兜底。')
      }
      console.log('\n  「净/次」= 收成/次 − 0.94（放弃一次普通钓牌的期望）。')
      console.log('  它是**卡面账，已知偏低** —— 只算当次收成，没算')
      console.log('  「这次贴的火留给后面几次收」。所以它负着也可能整体正分；')
      console.log('  用它**比较**不同档，别用它判生死。')
      console.log('  「取到率」低 = 燃料池空了（连锁断在中途，池子跟槽宽走）。')
    }
    // ---- 局面长度：洪水**吃牌库**，而后手的优势需要局面长 ----
    //
    // 上面那张诊断表证明了洪水在两侧**打得一样**（收 3.6 张/次、
    // 1.86 次/局，两边差不到 1%）。所以溢价不在它的行为里，
    // 而在「同样的收牌量换成分差」这一步。
    //
    // 这几个数是为了查那一步：后手每局比先手多钓 1.6 次（base 里
    // 9.7 vs 8.1），那份优势**按回合数计价** —— 局面短一截就少一截。
    // 洪水每局从牌库翻掉 5 张多、收走 6.8 张，所以它让局面变短，
    // 而那对**两侧都不中立**：削的是后手的优势
    console.log('\n  ---- 局面长度（洪水吃牌库，而后手的优势按回合计价）----')
    console.log('            回合数   双方出牌   堆上剩')
    const lenRow = function (label, sum) {
      return label.padEnd(16)
        + f2(avg(sum.turns, sum.games)).padStart(7)
        + f2(avg(sum.plays[R.ME] + sum.plays[R.FOE], sum.games)).padStart(11)
        + f2(avg(sum.leftover, sum.games)).padStart(9)
    }
    console.log('    ' + lenRow('我空 / 对手空', C))
    console.log('    ' + lenRow('我带 / 对手空', D))
    console.log('    ' + lenRow('我空 / 对手带', A))
    console.log('    ' + lenRow('我带 / 对手带', B))
    console.log('\n  两边各带一件时局面缩得最多 —— 要是「我空/对手带」那行')
    console.log('  比「我带/对手空」短得明显，就说明缩短本身偏向先手。')
    // ---- 把分差拆成**双方各自的得分**（第五轮定位）----
    //
    // 前四轮量下来，洪水在**八个指标上全部两侧对称**（发动次数、堆厚、
    // 翻几张、收几张、三类归属、局面缩短）。所以不对称不在它的行为里。
    //
    // 分差 = 我的分 − 对手的分，而行为对称意味着「我用它赚的」=
    // 「对手用它赚的」。于是：
    //   我带：  我赚 X、对手亏 Y  → 增量  X + Y  = +3.08
    //   对手带：对手赚 X、我亏 Y′ → 增量 −(X+Y′) = −7.34
    // 两式相减 **Y′ − Y = 4.26** —— 不对称全在「**对手亏多少**」这一侧。
    //
    // 拆开双方得分就能直接读出 X / Y / Y′，不用再猜
    console.log('\n  ---- 拆开双方得分（每局平均）----')
    console.log('            我的分   对手的分   和')
    const scoreRow = function (label, sum) {
      const me = avg(sum.score[R.ME], sum.games)
      const foe = avg(sum.score[R.FOE], sum.games)
      return label.padEnd(16)
        + f2(me).padStart(7) + f2(foe).padStart(11) + f2(me + foe).padStart(8)
    }
    console.log('    ' + scoreRow('我空 / 对手空', C))
    console.log('    ' + scoreRow('我带 / 对手空', D))
    console.log('    ' + scoreRow('我空 / 对手带', A))
    console.log('    ' + scoreRow('我带 / 对手带', B))
    console.log('\n  对着基线行看：「我带」那行我涨了多少、对手跌了多少；')
    console.log('  「对手带」那行反过来。**两个「跌」不一样大**就是溢价的来源。')
    console.log('  「和」那一列是双方总收牌 —— 它跌说明有牌被留在了堆上没人收。')
  } else {
    console.log('我带【' + nameMine + '】 vs 对手带【' + nameTheirs + '】 · '
      + R.DRAW_ROLES[role].name + ' · 各插第 1 个槽（'
      + R.DRAW_ROLES[role].slots[0] + '）· ' + args.n + ' 局\n')
    console.log('  【' + nameMine + '】在两种棋盘上各值多少：')
    console.log('    对手空手时：  ' + (soloGain >= 0 ? '+' : '') + f2(soloGain)
      + '   标准误 ' + f2(se2(D, C)))
    console.log('    对手带【' + nameTheirs + '】时：'
      + (vsGain >= 0 ? '+' : '') + f2(vsGain)
      + '   标准误 ' + f2(se2(B, A)))
    console.log('\n  **反制那部分**（差中之差）：'
      + (counter >= 0 ? '+' : '') + f2(counter) + ' 分')
    console.log('  这就是「对手带了【' + nameTheirs + '】」让【' + nameMine
      + '】多值的分。')
  }
  // ---- 顺带报一个别的子命令给不出的数：**对手那件对它自己值多少** ----
  //
  // C − A 是「对手拿到 theirs 之后，我的分差掉了多少」= 对手赚了多少。
  // 而对手是**先手**，所以这是全套工具里唯一一个
  // 「一件技能在**先手**手里值多少分」的数 ——
  // all / one / pair 一律只量我（后手）那一侧。
  //
  // 为什么要报它：解读上面那个差中之差**少不了它**。
  // 四组 `vs dredge *` 量下来，抄底的反制收益跟这个数几乎同向 ——
  // 对手那件越有用，反制它越值钱；对手那件要是自损的（合流 −0.83），
  // 反制它反而是**替对手解套**（见 draw-skills 抄底那条）
  if (!mirror) {
    console.log('\n  参考 —— 【' + nameTheirs + '】对**对手自己**值多少：'
      + (theirGain >= 0 ? '+' : '') + f2(theirGain) + ' 分'
      + '   标准误 ' + f2(se2(C, A)))
    console.log('  对手是**先手**，所以这是全套工具里唯一一个「技能在先手手里'
      + '值多少」的数')
    console.log('  （all / one / pair 一律只量后手那一侧）。'
      + '负数说明那件技能是**自损**的。')
    console.log('  想干净地对比先后手就把同一件传两次：`vs '
      + R.SKILLS[atTheirs].key + ' ' + R.SKILLS[atTheirs].key + '`')
  }
  console.log('\n  四个格子全在同一个口径里（双方同角色），所以上面那些减法成立 ——')
  console.log('  **别拿它跟 `one ' + R.SKILLS[atMine].key
    + '` 相减**，那条的对手不带角色，口径不一样。')
  console.log('\n  四个格子的后手分差：')
  console.log('    我空 / 对手空　　　 ' + (meanDiff(C) >= 0 ? '+' : '') + f2(meanDiff(C))
    + '   胜率 ' + pct(avg(C.wins[R.ME], C.games)))
  console.log('    我空 / 对手带　　　 ' + (meanDiff(A) >= 0 ? '+' : '') + f2(meanDiff(A))
    + '   胜率 ' + pct(avg(A.wins[R.ME], A.games)))
  console.log('    我带 / 对手空　　　 ' + (meanDiff(D) >= 0 ? '+' : '') + f2(meanDiff(D))
    + '   胜率 ' + pct(avg(D.wins[R.ME], D.games)))
  console.log('    我带 / 对手带　　　 ' + (meanDiff(B) >= 0 ? '+' : '') + f2(meanDiff(B))
    + '   胜率 ' + pct(avg(B.wins[R.ME], B.games)))
}

// ---------- 入口 ----------

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'base'
  if (cmd === 'base') return cmdBase(args)
  if (cmd === 'one') return cmdOne(args)
  if (cmd === 'all') return cmdAll(args)
  if (cmd === 'pair') return cmdPair(args)
  // vs：我带一件、**对手带一件** —— 反制型技能只能这么量（见 cmdVs）
  if (cmd === 'vs') return cmdVs(args)
  if (cmd === 'roles') return cmdRoles(args)
  if (cmd === 'role') return cmdRole(args)
  if (cmd === 'cards') return cmdCards(args)
  console.log('不认识的命令：' + cmd + '\n看文件头的注释，或者 README.md')
}

main()
