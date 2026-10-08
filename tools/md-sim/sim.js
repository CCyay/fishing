// 摸打钓鱼 · 模拟器入口
//
//   node sim.js base                     跑基准（双方都没技能），对照设计文档的六个数字
//   node sim.js one <key> [选项]          量一件技能的分差
//   node sim.js all [选项]                所有技能跑一遍，出一张表
//   node sim.js pair <keyA> <keyB> [选项] 量两件技能装在一起的分差（组合技用）
//
// 选项：
//   -n 40000        跑几局（默认 20000）
//   --seed 1        随机种子起点（默认 1）
//   --level N       技能等级（默认它的 maxLevel）
//   --slot suit|rank  装哪个槽（默认：KIND_RANK 的只能 rank，其余 suit）
//   --spots A,7,K   点数槽指定装在哪几个点数上（默认从前往后填）
//
// 分差的口径跟设计文档一致：**扣掉后手本来就有的那点优势**。
// 做法是同一批种子跑两遍（一遍双方空手当基线、一遍一方带技能），
// 两遍的开局牌序一样，所以差出来的就是技能本身。

const R = require('./rules.js')
const AI = require('./ai.js')

function parseArgs(argv) {
  const out = { _: [], n: 20000, seed: 1, level: -1, slot: '', spots: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n') { out.n = parseInt(argv[++i], 10) }
    else if (a === '--seed') { out.seed = parseInt(argv[++i], 10) }
    else if (a === '--level') { out.level = parseInt(argv[++i], 10) }
    else if (a === '--slot') { out.slot = argv[++i] }
    else if (a === '--spots') { out.spots = argv[++i].split(',') }
    else { out._.push(a) }
  }
  return out
}

// 跑 n 局，双方配装给定。返回汇总
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
      foeSmart: o.foeSmart !== false
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
  const empty = R.emptyLoadout()
  const sum = run(args.n, args.seed, R.emptyLoadout(), empty)
  const g = sum.games
  console.log('基准：双方都没技能、都会记牌，跑 ' + g + ' 局（种子 ' + args.seed + ' 起）\n')
  const rows = [
    ['每人每局出牌', f1(avg(sum.plays[R.ME], g)) + ' 次', '26 次'],
    ['每人每局钓到', f1(avg(sum.catches[R.ME], g)) + ' 次', '约 9 次'],
    ['钓到占出牌', pct(avg(sum.catches[R.ME], sum.plays[R.ME])), '34%'],
    ['每次平均收', f2(avg(sum.caught[R.ME], sum.catches[R.ME])) + ' 张', '2.75 张'],
    ['每人每局积分', f1(avg(sum.score[R.ME], g)) + ' 分', '约 24 分'],
    ['J 通吃占所有钓牌', pct(avg(sum.jackCatches[R.ME], sum.catches[R.ME])), '22%'],
    ['后手（你）胜率', pct(avg(sum.wins[R.ME], g)), '57–59%'],
    ['先手（庄家）胜率', pct(avg(sum.wins[R.FOE], g)), '—'],
    ['平局', pct(avg(sum.draws, g)), '—'],
    ['堆里剩下（不算分）', f1(avg(sum.leftover, g)) + ' 张', '—']
  ]
  console.log('  项                    这次跑的      设计文档（v2）')
  console.log('  ' + '-'.repeat(52))
  for (let i = 0; i < rows.length; i++) {
    console.log('  ' + rows[i][0].padEnd(22) + rows[i][1].padEnd(14) + rows[i][2])
  }
  console.log('\n后手分差（你 − 庄家）：+' + f2(meanDiff(sum))
    + ' 分（标准误 ' + f2(stderrOf(sum)) + '）—— 量技能时要扣掉这个数')
}

// ---------- 装一件技能 ----------

function loadoutWith(key, level, slot, spots) {
  const at = R.SKILLS.findIndex(function (s) { return s.key === key })
  if (at < 0) {
    throw new Error('没有这个技能：' + key + '（有的是 '
      + R.SKILLS.map(function (s) { return s.key }).join(' ') + '）')
  }
  const def = R.SKILLS[at]
  if (def.unwired) {
    console.log('⚠ 【' + def.name + '】在 ap-fishing.uvue 里还没接线，跑出来一定是 0 分差')
  }
  const lv = level >= 0 ? Math.min(level, def.maxLevel) : def.maxLevel
  const where = slot || (def.kind === R.KIND_RANK ? 'rank' : 'suit')
  if (where === 'rank' || def.kind === R.KIND_RANK) {
    return { lo: R.putRank(R.emptyLoadout(), at, lv, spots), def: def, lv: lv, slot: 'rank' }
  }
  return { lo: R.putSuit(R.emptyLoadout(), at, lv, null), def: def, lv: lv, slot: 'suit' }
}

// 覆盖面写成人话：♠♣ 或 5 7 9
function coverText(lo) {
  const out = []
  for (let i = 0; i < lo.suitOwner.length; i++) {
    if (lo.suitOwner[i] >= 0) out.push(R.SUITS[i])
  }
  for (let i = 0; i < lo.rankOwner.length; i++) {
    if (lo.rankOwner[i] >= 0) out.push(R.SKILL_RANKS[i])
  }
  return out.join(' ')
}

// 一件（或一对）技能的分差：同一批种子跑基线和实验，相减
function measure(args, loadout) {
  const base = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout())
  const test = run(args.n, args.seed, loadout, R.emptyLoadout())
  return {
    base: base,
    test: test,
    gain: meanDiff(test) - meanDiff(base),
    se: Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base)),
    winGain: avg(test.wins[R.ME], test.games) - avg(base.wins[R.ME], base.games)
  }
}

function cmdOne(args) {
  const key = args._[1]
  const made = loadoutWith(key, args.level, args.slot, args.spots)
  const m = measure(args, made.lo)
  console.log('【' + made.def.name + '】' + made.def.key
    + ' · ' + (made.lv === 0 ? '初始' : '升 ' + made.lv + ' 级')
    + ' · ' + made.slot + '槽 · 管 ' + coverText(made.lo)
    + ' · ' + args.n + ' 局\n')
  console.log('  分差（已扣掉后手基线 +' + f2(meanDiff(m.base)) + '）：'
    + (m.gain >= 0 ? '+' : '') + f2(m.gain) + ' 分   标准误 ' + f2(m.se))
  console.log('  胜率：' + pct(avg(m.test.wins[R.ME], m.test.games))
    + '（基线 ' + pct(avg(m.base.wins[R.ME], m.base.games)) + '，'
    + (m.winGain >= 0 ? '+' : '') + pct(m.winGain) + '）')
  console.log('  带技能那方：每局钓到 ' + f1(avg(m.test.catches[R.ME], m.test.games))
    + ' 次（基线 ' + f1(avg(m.base.catches[R.ME], m.base.games)) + '），每次收 '
    + f2(avg(m.test.caught[R.ME], m.test.catches[R.ME])) + ' 张（基线 '
    + f2(avg(m.base.caught[R.ME], m.base.catches[R.ME])) + '）')
}

function cmdAll(args) {
  console.log('所有技能，各跑 ' + args.n + ' 局（种子 ' + args.seed + ' 起）\n')
  console.log('  技能      槽    等级   覆盖面        分差     标准误   胜率')
  console.log('  ' + '-'.repeat(64))
  const base = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout())
  const baseDiff = meanDiff(base)
  const baseWin = avg(base.wins[R.ME], base.games)
  const lines = []
  for (let i = 0; i < R.SKILLS.length; i++) {
    const def = R.SKILLS[i]
    const made = loadoutWith(def.key, args.level, args.slot, args.spots)
    const test = run(args.n, args.seed, made.lo, R.emptyLoadout())
    const gain = meanDiff(test) - baseDiff
    lines.push({
      name: def.name, slot: made.slot, lv: made.lv,
      cover: coverText(made.lo), gain: gain,
      se: Math.sqrt(stderrOf(test) * stderrOf(test) + stderrOf(base) * stderrOf(base)),
      win: avg(test.wins[R.ME], test.games) - baseWin,
      unwired: def.unwired === true
    })
  }
  lines.sort(function (a, b) { return b.gain - a.gain })
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    console.log('  ' + (l.name + (l.unwired ? '*' : '')).padEnd(10)
      + l.slot.padEnd(6)
      + (l.lv === 0 ? '初始' : '升' + l.lv).padEnd(7)
      + l.cover.padEnd(14)
      + ((l.gain >= 0 ? '+' : '') + f2(l.gain)).padStart(7)
      + f2(l.se).padStart(9)
      + ((l.win >= 0 ? '+' : '') + pct(l.win)).padStart(8))
  }
  console.log('\n  基线：后手分差 +' + f2(baseDiff) + '、后手胜率 ' + pct(baseWin))
  console.log('  * = 这件在 ap-fishing.uvue 里还没接线')
  console.log('\n  目标档位（设计文档第四节）：单件满级每局 +3 ~ +5 分。')
  console.log('  注意 v2 那张表的「满装」是老槽规则（点数技满级管 6 个点数），')
  console.log('  现在是线性的（每级多 1 格，满级管 3 个），所以数值对不上是正常的。')
}

// ---------- pair：两件装一起（组合技要用的底数） ----------

function cmdPair(args) {
  const atA = R.SKILLS.findIndex(function (s) { return s.key === args._[1] })
  const atB = R.SKILLS.findIndex(function (s) { return s.key === args._[2] })
  if (atA < 0 || atB < 0) {
    throw new Error('技能名写错了：' + args._[1] + ' / ' + args._[2])
  }
  // 第一个装花色槽，所以它不能是「只放点数槽」那类（钩顶、搅水、见底、洪水）。
  // 组合技要求一件在花色槽、一件在点数槽（同一个技能只占一个槽，见 slotOf），
  // 所以顺序写反了就直接报出来 —— 悄悄装进花色槽等于测了一个游戏里不存在的配装
  if (R.SKILLS[atA].kind === R.KIND_RANK) {
    throw new Error('【' + R.SKILLS[atA].name + '】只能放点数槽，'
      + '把它写在第二个：node sim.js pair ' + args._[2] + ' ' + args._[1])
  }
  const a = loadoutWith(args._[1], args.level, 'suit', null)
  const b = loadoutWith(args._[2], args.level, 'rank', args.spots)
  // 两件装进同一套：花色槽那件 + 点数槽那件
  const lo = R.emptyLoadout()
  R.putSuit(lo, atA, a.lv, null)
  R.putRank(lo, atB, b.lv, args.spots)
  const both = measure(args, lo)
  const onlyA = measure(args, a.lo)
  const onlyB = measure(args, b.lo)
  console.log('【' + a.def.name + '】(花色槽) + 【' + b.def.name + '】(点数槽) · '
    + args.n + ' 局\n')
  console.log('  只带 ' + a.def.name + '：' + (onlyA.gain >= 0 ? '+' : '') + f2(onlyA.gain))
  console.log('  只带 ' + b.def.name + '：' + (onlyB.gain >= 0 ? '+' : '') + f2(onlyB.gain))
  console.log('  两件都带：' + (both.gain >= 0 ? '+' : '') + f2(both.gain)
    + '   标准误 ' + f2(both.se))
  const synergy = both.gain - onlyA.gain - onlyB.gain
  console.log('\n  协同（两件都带 − 各自单带之和）：'
    + (synergy >= 0 ? '+' : '') + f2(synergy) + ' 分')
  console.log('  这个数是**现在**的协同（没有组合技，纯粹是两件技能互相影响）。')
  console.log('  第九节的组合技做完之后再跑一遍，差额就是组合技自己的贡献。')
}

// ---------- 入口 ----------

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'base'
  if (cmd === 'base') return cmdBase(args)
  if (cmd === 'one') return cmdOne(args)
  if (cmd === 'all') return cmdAll(args)
  if (cmd === 'pair') return cmdPair(args)
  console.log('不认识的命令：' + cmd + '\n看文件头的注释，或者 README.md')
}

main()
