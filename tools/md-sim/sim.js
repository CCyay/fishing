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
//   node sim.js switch <keyA> <keyB>      【换竿】值多少：两岸船家两个槽插这两件，开关 vs 不带
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
// ⚠ **【候潮渔翁】和【涨落】2026-10-16 删了**（常驻 X=−8.87，全表唯一超 2σ 的）。
// 这个文件里还有三处拿它当例子（425、956、970 行附近）——
// **那些例子一个都不删**：它们讲的是量法（基线不能借、残差会伪装成结论），
// 而那条教训不依赖那件技能还在不在表里。只是别再照那几行去跑命令，
// `--role tidal` 现在查不到。
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
    // 收摊时双方手里剩的牌（2026-10-15 加）。**守恒检查要它** ——
    // 终局改成「牌库空 + 各打 1 手」之后手里恒剩几张，
    // 不算进来的话那条检查每次都报「对不上 6 张」
    handLeft: 0,
    // 开局切牌定庄之后，玩家先手了几局、两种局面各自的分差和胜场。
    // 合计数会把这两种局面平均掉，而那正是这次改动要看的东西
    meFirst: 0, diffFirst: 0, diffSecond: 0, winFirst: 0, winSecond: 0,
    // 这一批每局的牌组大小之和。**守恒基准读它，不写死 52** ——
    // 商店能买卡进牌组，所以牌组大小会变（见 rules.js 的 G.deckSize）
    deckSizeSum: 0,
    // 每局的分差，用来算标准差（判断「这个差值是不是跑够了」）
    diffs: [],
    // 【洪水】的诊断口（见 rules.js 的 stat.flood）
    flood: {
      fires: [0, 0], pileSum: [0, 0], flipSum: [0, 0],
      gotSum: [0, 0], thin: [0, 0], hits: [0, 0],
      gotFresh: [0, 0], gotOwn: [0, 0], gotTheirs: [0, 0]
    },
    // 顺子那两件的诊断口（见 rules.js 的 stat.straight / stat.wade）
    //
    // straight 多三列（failFires / tagged / wildUsed）—— 那是
    // 【失败补偿】（`FLOW_FAIL_TAG`）的诊断口，只在那个旋钮开着时才非零。
    // wade / order 没有这一档，所以下面那个共用循环**只跑前四个 key**，
    // 这三列单独累加
    straight: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      failFires: [0, 0], tagged: [0, 0], wildUsed: [0, 0]
    },
    wade: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0] },
    // 打出那张自己贴【通配】那次改动的诊断口（见 rules.js 的
    // stat.selfWildTag）—— 三件顺子技能共用，`CHAIN_SELF_TAG=0` 时
    // 只有 kept 那一列的含义变成「本来会留下几次」
    selfWildTag: { fires: [0, 0], kept: [0, 0], oldSeen: [0, 0], oldUsed: [0, 0] },
    // 【传火】的诊断口（见 rules.js 的 stat.chain）—— `lit` 是
    // `CHAIN_HUE` 那个方案的成败指标，比 X 先看
    chain: { fires: [0, 0], lit: [0, 0], nextGot: [0, 0] },
    // 【21 匹配】的诊断口（见 rules.js 的 stat.draft）——
    // **预算用掉几成**那一列比 X 先看（见那边的注释）
    draft: {
      fires: [0, 0], hits: [0, 0], budSum: [0, 0], sumSum: [0, 0],
      gotSum: [0, 0], pileSum: [0, 0], zeroIn: [0, 0], zeroOut: [0, 0],
      stopOver: [0, 0], stopVoid: [0, 0], stopGuard: [0, 0],
      stopEnd: [0, 0], stopEmpty: [0, 0], stopZero: [0, 0]
    },
    // 【分饵】的诊断口 —— `tookMine` / `tookFoe` 不相等就是拿了奇数张
    gift: { fires: [0, 0], tookMine: [0, 0], tookFoe: [0, 0] },
    // 【漫流】—— 跟顺子那两件同一组列（所以下面共用那个循环），外加 pushed
    brim: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      pushed: [0, 0]
    },
    // 顺流（按排序收牌）—— 跟上面两件同一组列，所以下面共用同一个循环和同一张表
    order: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0] },
    // 【易流】—— 跟顺子那几件同组列，外加 swapped（真换了几次）
    tideflow: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      swapped: [0, 0], failFires: [0, 0], tagged: [0, 0], wildUsed: [0, 0]
    },
    swellflow: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      swapped: [0, 0], failFires: [0, 0], tagged: [0, 0], wildUsed: [0, 0]
    },
    swapflow: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      swapped: [0, 0]
    },
    // 【推牌】的诊断口（见 rules.js 的 stat.surge）〔2026-10-20 接上〕。
    //
    // 它一直在 rules.js 里记着，而这边**从来没汇总过** —— 于是
    // 「一局总共推了几张」这个数读不到，而『机制：推牌』那一章说得很清楚：
    // **局长是这一族的全局预算，要按「一局总共推几张」排**。
    // 接上它是为了量【常涌】（每手推 1 张）—— 那一件的张数是其余两件的几倍，
    // 而**光看 X 看不出它花了多少**（照「量一个新机制，X 之外必须有一个
    // 「它做了几次」的计数」那条）
    surge: { fires: [0, 0], flipped: [0, 0], hits: [0, 0], back: [0, 0] },
    // 【撒网】的诊断口（见 rules.js 的 stat.cast）〔2026-10-20 加〕——
    // 前四列跟顺子那几件同名，所以走下面那个共用循环；oddPick 单独累加
    cast: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      oddPick: [0, 0], alone: [0, 0], nextSame: [0, 0],
      pileAdj: [0, 0], pileSame: [0, 0], onPile: [0, 0], nextSameOn: [0, 0]
    },
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
      deck: o.deckFn ? o.deckFn() : undefined,
      // ---- 量技能时**写死庄家先手**（见 rules.js 的 fixFirst）----
      //
      // 开局切牌定庄之后 ME 有一半的局是先手，而「这件技能在先手手里
      // 值多少 / 后手手里值多少」那套口径（measureBoth 的 A / D 两格）
      // 正是靠**配装给 ME 还是给 FOE** 来区分的 —— 先后手一随机，
      // 两格就都变成了「一半先手一半后手」，D 直接失去意义。
      //
      // 所以除了 base（它要量的就是切牌本身），一律固定
      fixFirst: o.freeFirst ? undefined : R.FOE
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
      sum.flood.hits[s] += fd.hits[s]
      sum.flood.gotFresh[s] += fd.gotFresh[s]
      sum.flood.gotOwn[s] += fd.gotOwn[s]
      sum.flood.gotTheirs[s] += fd.gotTheirs[s]
      const keys = ['fires', 'hits', 'lenSum', 'gotSum']
      for (let k = 0; k < keys.length; k++) {
        sum.straight[keys[k]][s] += G.stat.straight[keys[k]][s]
        sum.wade[keys[k]][s] += G.stat.wade[keys[k]][s]
        sum.order[keys[k]][s] += G.stat.order[keys[k]][s]
        sum.brim[keys[k]][s] += G.stat.brim[keys[k]][s]
        sum.swapflow[keys[k]][s] += G.stat.swapflow[keys[k]][s]
        sum.swellflow[keys[k]][s] += G.stat.swellflow[keys[k]][s]
        sum.tideflow[keys[k]][s] += G.stat.tideflow[keys[k]][s]
        sum.cast[keys[k]][s] += G.stat.cast[keys[k]][s]
      }
      sum.cast.oddPick[s] += G.stat.cast.oddPick[s]
      sum.cast.alone[s] += G.stat.cast.alone[s]
      sum.cast.nextSame[s] += G.stat.cast.nextSame[s]
      sum.cast.pileAdj[s] += G.stat.cast.pileAdj[s]
      sum.cast.pileSame[s] += G.stat.cast.pileSame[s]
      sum.cast.onPile[s] += G.stat.cast.onPile[s]
      sum.cast.nextSameOn[s] += G.stat.cast.nextSameOn[s]
      const sg = G.stat.surge
      sum.surge.fires[s] += sg.fires[s]
      sum.surge.flipped[s] += sg.flipped[s]
      sum.surge.hits[s] += sg.hits[s]
      sum.surge.back[s] += sg.back[s]
      sum.brim.pushed[s] += G.stat.brim.pushed[s]
      sum.swapflow.swapped[s] += G.stat.swapflow.swapped[s]
      // 【21 匹配】—— 列不一样，单独一个循环
      const dk = ['fires', 'hits', 'budSum', 'sumSum', 'gotSum', 'pileSum',
        'stopOver', 'stopVoid', 'stopGuard', 'stopEnd', 'stopEmpty', 'stopZero',
        'zeroIn', 'zeroOut']
      for (let k = 0; k < dk.length; k++) {
        sum.draft[dk[k]][s] += G.stat.draft[dk[k]][s]
      }
      // 失败补偿那三列只有 straight 有
      const fk = ['failFires', 'tagged', 'wildUsed']
      for (let k = 0; k < fk.length; k++) {
        sum.straight[fk[k]][s] += G.stat.straight[fk[k]][s]
      }
      // 自己贴【通配】那四列是三件共用的（挂在 G.stat.selfWildTag 上）
      const tk = ['fires', 'kept', 'oldSeen', 'oldUsed']
      for (let k = 0; k < tk.length; k++) {
        sum.selfWildTag[tk[k]][s] += G.stat.selfWildTag[tk[k]][s]
      }
      const ck = ['fires', 'lit', 'nextGot']
      for (let k = 0; k < ck.length; k++) {
        sum.chain[ck[k]][s] += G.stat.chain[ck[k]][s]
      }
      const gk = ['fires', 'tookMine', 'tookFoe']
      for (let k = 0; k < gk.length; k++) {
        sum.gift[gk[k]][s] += G.stat.gift[gk[k]][s]
      }
      const wk = ['fires', 'took', 'blank', 'burnSum',
        'reapSum', 'reapOwn', 'reapTheirs', 'sweeps', 'sweepSum']
      for (let k = 0; k < wk.length; k++) {
        sum.wild[wk[k]][s] += G.stat.wild[wk[k]][s]
      }
    }
    sum.turns += G.stat.turns
    sum.leftover += G.pile.length
    sum.handLeft += G.hands[R.ME].length + G.hands[R.FOE].length
    if (G.score[R.ME] > G.score[R.FOE]) sum.wins[R.ME]++
    else if (G.score[R.FOE] > G.score[R.ME]) sum.wins[R.FOE]++
    else sum.draws++
    const diff = G.score[R.ME] - G.score[R.FOE]
    sum.diffs.push(diff)
    sum.deckSizeSum += G.deckSize
    // ---- 按「玩家是先手还是后手」分两组 ----
    //
    // 开局切牌定庄之后（见 rules.js 的 CUT），**「后手分差」这个说法
    // 本身就没意义了** —— 谁是后手每局在变，一个合计数把两种局面
    // 平均掉，正好把这次改动要看的东西抹掉。
    //
    // 要看的是：玩家先手时赚多少、后手时亏多少，**以及两者差多少**
    //（那个差就是先后手的真实价差，而它现在由剩堆归属撑着）
    if (G.first === R.ME) {
      sum.meFirst++
      sum.diffFirst += diff
      if (G.score[R.ME] > G.score[R.FOE]) sum.winFirst++
    } else {
      sum.diffSecond += diff
      if (G.score[R.ME] > G.score[R.FOE]) sum.winSecond++
    }
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
  // **只有 base 走自由先手** —— 它要量的正是切牌定庄本身
  //（别的命令固定庄家先手，见 run 里 fixFirst 那段）
  const sum = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout(),
    { freeFirst: true })
  const g = sum.games
  // 规则那一段读 R.ruleTag()，**不自己拼 env** —— 抬头印错档位的话，
  // 底下那些数会被当成现行规则的数记进文档（那是 campaign.js 栽过的）
  console.log('基准：双方都没技能、都会记牌，跑 ' + g + ' 局（种子 ' + args.seed + ' 起）')
  console.log('规则 ' + R.ruleTag() + '\n')

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
  // ---- 最后一列是**参考值**，2026-10-15 整列换过 ----
  //
  // 原先对的是设计文档 v2 那张表（26 次 / 约 9 次 / 34% / 2.75 张 / 24 分 / 22%），
  // 那一列是「剩堆不算分 + 打完手牌」时代量的。终局改成
  // 「牌库空 + 双方各打 1 手」之后六个数有四个变了 —— 一局从 52 手掉到 46 手，
  // 于是钓牌次数跟着少（8.9 → 7.7），而 J 的张数没变、总钓牌次数变少，
  // 所以 **J 占比反而升了**（22.7% → 25.7%）。「每次平均收」升到 2.85 是
  // 同一个来路：少掉的那 6 手正是终局手牌萎缩期，那几手的收成最薄。
  //
  // 对不上的时候先问「是不是终局规则又动了」—— 这六个数全是它的函数
  const rows = [
    ['每人每局出牌',
      f1(avg(sum.plays[R.ME], g)), f1(avg(sum.plays[R.FOE], g)),
      f1(both(function (s) { return avg(sum.plays[s], g) })), '23 次'],
    ['每人每局钓到',
      f1(catches(R.ME)), f1(catches(R.FOE)), f1(both(catches)), '约 7.7 次'],
    ['钓到占出牌',
      pct(avg(sum.catches[R.ME], sum.plays[R.ME])),
      pct(avg(sum.catches[R.FOE], sum.plays[R.FOE])),
      pct(both(function (s) { return avg(sum.catches[s], sum.plays[s]) })), '33%'],
    ['每次平均收',
      f2(avg(sum.caught[R.ME], sum.catches[R.ME])),
      f2(avg(sum.caught[R.FOE], sum.catches[R.FOE])),
      f2(both(function (s) { return avg(sum.caught[s], sum.catches[s]) })), '2.85 张'],
    ['每人每局积分',
      f1(perGame(R.ME)), f1(perGame(R.FOE)), f1(both(perGame)), '约 21.8 分'],
    ['J 通吃占所有钓牌',
      pct(avg(sum.jackCatches[R.ME], sum.catches[R.ME])),
      pct(avg(sum.jackCatches[R.FOE], sum.catches[R.FOE])),
      pct(both(function (s) { return avg(sum.jackCatches[s], sum.catches[s]) })), '25.7%']
  ]
  console.log('  项                 你(后手)   庄家(先手)  两人平均   参考值')
  console.log('  ' + '-'.repeat(62))
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    console.log('  ' + r[0].padEnd(19) + r[1].padEnd(11) + r[2].padEnd(12)
      + r[3].padEnd(11) + r[4])
  }
  console.log('')
  console.log('  后手胜率 ' + pct(avg(sum.wins[R.ME], g))
    // 参考值随终局规则变，换过两次：
    //   「剩堆不算分 + 打完手牌」 57–59%
    //   「剩堆归没打最后一手的」  约 46.5%
    //   **现行（牌库空 + 各打 1 手 + 剩堆不算分）约 48%，平局掉到 3.7%**
    //     —— 平局变少是因为双方总分不再恒为 52（手里和堆上剩的都不算分）
    //
    // **默认值跟 rules.js 一致（'old'）** —— 那边 2026-10-15 把默认从
    // pileNotLast 换过来了，这儿读 env 要用同一个默认，不然不设变量时报错档
    + ((process.env.BALANCE || 'old') === 'old'
      ? '（现行约 48%）' : '（剩堆归没打最后一手的那档：约 46.5%）')
    + '· 先手 ' + pct(avg(sum.wins[R.FOE], g))
    + ' · 平局 ' + pct(avg(sum.draws, g)))
  console.log('  后手分差（你 − 庄家）：' + (meanDiff(sum) >= 0 ? '+' : '') + f2(meanDiff(sum))
    + ' 分（标准误 ' + f2(stderrOf(sum)) + '）—— 量技能时要扣掉这个数')

  // ---- 牌数守恒：最硬的一条自检 ----
  //
  // 两人收走的 + 堆里剩的必须等于一副牌。差一张就说明收牌区间、
  // 记分或者 splice 那一套有重复或漏算 —— 这条过了，
  // 上面那些数才值得讨论
  // ---- 切牌定庄：分两组看，合计数在这件事上没意义 ----
  //
  // 切牌改的是「谁当先手」，所以要看的是**两组的差** —— 那个差就是
  // 先后手的真实价差。
  //
  // 〔原先这儿写「它主要由剩堆归属撑着」。那是 pileNotLast 时代的话 ——
  //   现在剩堆谁都不算分，残余的价差来自**终局那几手的结构**
  //  （最后一手面对一个常态厚度的堆而无人回应），现行约 +0.31。
  //   见设计文档『终局那两手』〕
  const nFirst = sum.meFirst
  const nSecond = g - nFirst
  console.log('')
  console.log('  ---- 开局切牌定庄（红 = 庄家先手，黑 = 玩家先手；那张牌给先手）----')
  console.log('    玩家先手 ' + f1(avg(nFirst, g) * 100) + '% 的局'
    + '（该是 50% 上下 —— 红黑各 26 张）')
  console.log('    玩家先手时：分差 ' + f2(avg(sum.diffFirst, nFirst))
    + '　胜率 ' + f1(avg(sum.winFirst, nFirst) * 100) + '%')
  console.log('    玩家后手时：分差 ' + f2(avg(sum.diffSecond, nSecond))
    + '　胜率 ' + f1(avg(sum.winSecond, nSecond) * 100) + '%')
  console.log('    先后手价差：' + f2(avg(sum.diffFirst, nFirst) - avg(sum.diffSecond, nSecond))
    + ' 分　←（这个数越大，「抢先手」越值钱）')
  console.log('')

  const collected = perGame(R.ME) + perGame(R.FOE)
  const left = avg(sum.leftover, g)
  // **手里剩的也要算进来**（2026-10-15）：终局改成「牌库空 + 各打 1 手」
  // 之后牌不再全部打出，手里恒剩几张。漏了它这条检查每次都报「对不上 6 张」，
  // 而那是三个桶里最容易被忘掉的一个
  const held = avg(sum.handLeft, g)
  const total = collected + left + held
  // **不写死 52** —— 商店能买卡进牌组，所以牌组大小是会变的。
  // 读每局实际的 G.deckSize（见 rules.js）
  const deckSize = avg(sum.deckSizeSum, g)
  console.log('  牌数守恒：收走 ' + f1(collected) + ' + 堆里剩 ' + f1(left)
    + ' + 手里剩 ' + f1(held) + ' = ' + f1(total) + '（一副 ' + deckSize + ' 张）'
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

// 一个角色的**常驻技能**值多少分。
//
// ---- 三格，照 measureBoth（2026-10-15 补的）----
//
// 原先只有两格（基线 + 我带），所以它只报「后手带着值多少」，**给不出 D**。
// 那个缺口在终局规则换掉之后变得要紧：全表（`all`）的 D 全部重量过了，
// 可角色表还是单侧的，于是「逆流船夫 / 深海钓手偏不偏先手」这个问题
// 根本没有读数 —— 而那两张正是文档挂着「要重新定档」的。
//
//   C    = 双方都不带角色（基线）
//   back = 我（ME，后手）带      → meanDiff(D格) − meanDiff(C)
//   front= 对手（FOE，先手）带   → meanDiff(C) − meanDiff(A格)
//   X = (back+front)/2    D = (front−back)/2
//
// `gain` 保留 = back，老调用方（cmdRole 那条「分差」列）不受影响
function measureSpecial(args, role) {
  const empty = R.emptyLoadout()
  const C = run(args.n, args.seed, empty, empty, { myRole: -1, foeRole: -1 })
  const D = run(args.n, args.seed, empty, empty, { myRole: role, foeRole: -1 })
  const A = run(args.n, args.seed, empty, empty, { myRole: -1, foeRole: role })
  const baseDiff = meanDiff(C)
  const back = meanDiff(D) - baseDiff
  const front = baseDiff - meanDiff(A)
  return {
    base: C,
    test: D,
    gain: back,
    back: back,
    front: front,
    x: (back + front) / 2,
    d: (front - back) / 2,
    se: Math.sqrt(stderrOf(D) * stderrOf(D) + stderrOf(C) * stderrOf(C)),
    winGain: avg(D.wins[R.ME], D.games) - avg(C.wins[R.ME], C.games)
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
  // ---- 「D 的上限 = 基线优势」那句话 2026-10-15 删了 ----
  //
  // 它是基线 +3.03 时代的判据。终局规则改成「牌库空 + 各打 1 手」之后
  // 基线只剩 +0.3，于是**任何正 D 都"超限"**，那条判据没意义了。
  // 现在两条合用：相对标准误显著 + 相对比例模型偏离（见下面那行）
  console.log('\n  基线（双方同角色、槽全空）：后手分差 ' + sign(m.baseDiff))
  console.log('  **D 要跟标准误比，别跟基线比** —— |D| < ' + f2(m.se * 2)
    + '（两个标准误）统计上分不开。')
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
  // 目标档位 2026-10-15 从「+3~5」降下来：每人每局积分从 24.4 掉到 21.8
  //（终局规则换了），比例没变、绝对值跟着走
  console.log('\n  目标档位：单件每局 +2.7 ~ +4.5 分（看 **X** 这一列）。')
  // ---- 判 D 的办法换了（2026-10-15）----
  //
  // 原先是「D ≈ 2 要当心，基线优势就是 D 的上限」。基线只剩 +0.3 之后
  // 那条失效了（任何正 D 都"超限"）。现在两条合用：
  //
  //   **跟标准误比** —— |D| < 2σ 统计上分不开；
  //   **跟比例模型比** —— D 大体正比于基线优势（先手在劣势侧，技能给他的
  //     边际收益更高），所以旧口径的 D 乘上「现基线÷3.03」就是它的"正常值"。
  //     偏离那个值的才是真偏向。实测全表只有洪水 / 择饵偏离。
  console.log('  **D 要跟标准误比，别跟基线比**（基线只剩 ' + f2(baseDiff)
    + '，拿它当上限的话任何正 D 都"超限"）——')
  console.log('  |D| < ' + f2((lines.length > 0 ? lines[0].se : 0) * 2)
    + ' 统计上分不开；再大的要对着比例模型看（见设计文档『终局那两手』）。')
  console.log('  X ≤ 0 的件不给建议价：那不是定价问题，是效果问题。')
  console.log('\n  换 --role / --slot 会改覆盖面，数就不能跟这一列比了。')
  console.log('  常驻特殊技能用 `roles` 子命令。')
}

// ---------- roles：八个角色的常驻技能各值多少分 ----------

function cmdRoles(args) {
  console.log('八个角色的**常驻特殊技能**，各跑 ' + args.n + ' 局（种子 '
    + args.seed + ' 起）')
  console.log('槽一律空着 —— 量的是那件常驻技能本身，不含槽里插的东西')
  // X / D 两列是 2026-10-15 补的（原先只有单侧的「分差」）——
  // 口径跟 `all` / `one` 一致，所以这几个数可以直接跟全表比
  console.log('口径跟 `all` 一致：三格（基线 / 我带 / 对手带），**两侧都量**\n')
  console.log('  角色    特殊技      槽数  覆盖    常驻 X      D'
    + '    满配    每槽')
  console.log('  ' + '-'.repeat(72))
  // ---------- 满配那一格：**槽数才是角色强度的主导因素** ----------
  //
  // 加这一列是因为「常驻技定档」那个问题问错了对象。证据：
  // **填河工和江口闸官都是 4 槽**，可常驻技一个 +0.04、一个 +5.35 ——
  // 而两张卡的实际强度差得远没有那个数那么多，因为**4 个槽本身**
  // 就值一大截（一件技能平均 X ≈ +2.2，真人会挑强的，所以更高）。
  //
  // 所以要定档的是**角色总强度 = 常驻技 + 槽**，而「每槽边际值」
  // 是把两样换算到同一把尺子上的那个系数。它一直没人量过
  const empty = R.emptyLoadout()
  const baseRun = run(args.n, args.seed, empty, empty, { myRole: -1, foeRole: -1 })
  const baseD = meanDiff(baseRun)
  const lines = []
  for (let i = 0; i < R.DRAW_ROLES.length; i++) {
    const role = R.DRAW_ROLES[i]
    const m = measureSpecial(args, i)
    // 满配：同一张卡插满槽（KIT_ORDER 前 N 件）。跟基线比，所以它
    // **含常驻技**那一份 —— 「每槽」那一列把常驻减掉再除槽数
    const full = run(args.n, args.seed, R.kitFromRole(i, kitFor(i)), empty,
      { myRole: i, foeRole: -1 })
    const fullGain = meanDiff(full) - baseD
    const nSlots = role.slots.length
    lines.push({
      name: role.name, sp: role.special,
      cover: R.roleCover(i), slots: role.slots.join('/'),
      nSlots: nSlots,
      back: m.back, front: m.front, x: m.x, d: m.d, se: m.se,
      full: fullGain,
      perSlot: nSlots > 0 ? (fullGain - m.back) / nSlots : 0,
      win: m.winGain,
      note: R.SP_NOTE[role.special] || ''
    })
  }
  // **按「满配」排序** —— 那才是玩家实际拿到手的强度。
  // 原先按常驻技的 X 排，而那一列现在只是总强度的一半
  lines.sort(function (a, b) { return b.full - a.full })
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    console.log('  ' + l.name.padEnd(8)
      + l.sp.padEnd(12)
      + String(l.nSlots).padStart(2) + ' 个'
      + (' ' + l.cover + ' 张').padEnd(8)
      + sign(l.x).padStart(7)
      + sign(l.d).padStart(8)
      // |D| 超过两个标准误的标出来 —— 那才是「真的偏」
      + (Math.abs(l.d) > l.se * 2 ? '←' : ' ')
      + sign(l.full).padStart(8)
      + sign(l.perSlot).padStart(8))
  }
  const noted = lines.filter(function (l) { return l.note !== '' })
  if (noted.length > 0) {
    console.log('')
    for (let i = 0; i < noted.length; i++) {
      console.log('  ⚠ ' + noted[i].name + '（' + noted[i].sp + '）：' + noted[i].note)
    }
  }
  // ---- 四列怎么读（2026-10-16 改了判据，见设计文档『角色总强度』）----
  //
  // 原先只有「常驻 X」一列，而目标档位是「常驻技每局 +2.7~4.5」。
  // **那条判据问错了对象** —— 填河工和江口闸官都是 4 槽，可常驻技
  // 一个 +0.04、一个 +5.35，而玩家拿到手的强度差得远没那么多。
  console.log('\n  **要定档的是「满配」那一列** —— 那是玩家实际拿到手的强度。')
  console.log('  常驻 X 和槽数是它的两个来源，而「每槽」是把两样换算到'
    + '同一把尺子上的系数。')
  console.log('  读法：**常驻技强就该少给槽，常驻技弱就用多槽补偿** ——'
    + '两样都给（或都不给）才是失衡。')
  console.log('\n  D 要跟标准误比，别跟基线比 —— 每件的标准误约 '
    + f2(lines.length > 0 ? lines[0].se : 0) + '，`←` 标的是 |D| > 2σ 的。')
  console.log('  「常驻 X」那一列有几件恒等于 0，而那是**量法问题不是设计问题**：'
    + '信息类 AI 不读（镜湖占卜师 —— 清水是这一族仅剩的一件），')
  console.log('  花色 / 点数类在槽全空时无效（夜钓客 / 赌船荷官）——'
    + '照【归深】那个先例。看它们要看「满配」。')
  console.log('  表里没有【稳钩】—— 它的效果实现了，但没有角色带它（磐石删了）。')
}

// ---------- role：一个角色打满槽 ----------

// ---------- 插满槽时插什么：**按「真人会买的」顺序** ----------
//
// 原先 `role` 命令插的是**表序前 N 件** —— 磁钩 / 观潮 / 窥视 / 换水，
// 而它们的 X 是 **+1.19 / +1.04 / 0.00 / +0.69**，全表最弱的几件。
//（那个 0.00 就是窥视，它 2026-10-16 删了 —— 这条教训比那件技能活得久）
// 后果有两层，第二层才是要命的：
//
//   它系统性**低估**角色（插的是弱件）；
//   而且**对槽多的角色低估更多** —— 第 3、4 件比第 1、2 件更弱。
//     于是 4 槽的卡和 2 槽的卡量出来差不多，**而槽数正是角色强度的
//     主导因素**。十一张卡的数因此不可比。
//
// 这个名单按 X 降序，跟 `campaign.js` 的 `PLAYER_POOL` 同源
//（「X ≥ 1.5 而且游戏里在卖」）—— 真人在商店里就是这么挑的。
//
// **一件技能插哪种槽都行**（设计文档『技能必须通用』），所以不用管
// 花色槽 / 点数槽的区别
const KIT_ORDER = [
  'chain', 'kindle', 'swapcard', 'flow', 'wild', 'peak', 'draft', 'coldhue'
]

function kitFor(role) {
  const n = R.DRAW_ROLES[role].slots.length
  const picks = []
  for (let i = 0; i < n; i++) {
    picks.push(skillIndexOf(KIT_ORDER[i % KIT_ORDER.length]))
  }
  return picks
}

function cmdRole(args) {
  const role = roleIndexOrDie(args._[1] || args.role)
  const r = R.DRAW_ROLES[role]
  const picks = kitFor(role)
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
  // ---- 推牌那一族的诊断行〔2026-10-20 加〕----
  //
  // **只在真推了牌的时候印** —— 别的角色跑这个命令时这两行是噪声。
  //
  // 两样都要，而且**第二样是关键**：局长（双方出牌数）是这一族的全局预算
  //（『机制：推牌』那一章：推 4 张双带已经 −21%），而「一局推几张」
  // 是那笔预算的**账单本身**。光看 X 看不出账单 ——
  // 填塘 X=0.00 和这一件万一也是 0，成因可能完全不同
  const pushed = (test.surge.flipped[R.ME] + test.surge.flipped[R.FOE]) / test.games
  if (pushed > 0.005) {
    const basePlays = (base.plays[R.ME] + base.plays[R.FOE]) / base.games
    const myPlays = (test.plays[R.ME] + test.plays[R.FOE]) / test.games
    console.log('\n  ---- 推牌诊断（这一族的全局预算是局长）----')
    console.log('    一局共推 ' + f2(pushed) + ' 张'
      + '（我这侧 ' + f2(test.surge.flipped[R.ME] / test.games)
      + ' · 对手那侧 ' + f2(test.surge.flipped[R.FOE] / test.games) + '）')
    console.log('    撞点数置 0 ' + f2((test.surge.hits[R.ME]
      + test.surge.hits[R.FOE]) / test.games) + ' 张')
    console.log('    双方出牌 ' + f2(myPlays) + '（不带角色 ' + f2(basePlays)
      + '）→ 局长 ' + f2((myPlays / basePlays - 1) * 100) + '%')
  }
  // ---- 【点数互通】原型的诊断行〔2026-10-20〕----
  //
  // 照上面「推牌诊断」那个先例：**只在旋钮开着的时候印**。
  // 要看的是最后那个实际倍率 —— 等于 1.00 就是**一次都没互通**，
  // 那一档跑的是原版，X 的差全是噪声（同色闸那次就是这么漏掉的）。
  //
  // ⚠ 理论倍率只对**没有花色槽**的卡成立（江口闸官 / 填河工 / 鱼塘老板 /
  // 夜钓客 / 赌船荷官 / 背篓渔夫 / 逆流船夫）。带花色槽的两张（镜湖 ♥ /
  // 深海 ♣）分母里混着花色槽那一份触发，而花色槽吃不到互通 ——
  // 所以它们的实际倍率会**低于** nRank，那不是 bug
  //
  // 闸从 `R.RANK_LINK`（旋钮）换成 `st.plays > 0`〔2026-10-20〕——
  // 载体卡【通号人】走 `hasSpecial`、**旋钮关着也发动**，查旋钮会漏掉它。
  // 照上面推牌那段 `pushed > 0.005` 的先例：**问计数器，别问旋钮**
  const lst = R.PROTO_STAT.ranklink
  if (lst.plays > 0) {
    let nRank = 0
    for (let i = 0; i < r.slots.length; i++) {
      const labels = R.slotLabels(r.slots[i])
      for (let j = 0; j < labels.length; j++) {
        if (!R.isSuitSlot(labels[j])) { nRank++; break }
      }
    }
    const mult = lst.base > 0 ? (lst.base + lst.extra) / lst.base : 0
    console.log('\n  ---- 点数互通诊断（来源：'
      + (r.special === 'ranklink' ? '载体卡' : 'RANK_LINK=' + R.RANK_LINK) + '）----')
    console.log('    这张卡有 ' + nRank + ' 个点数槽 → 理论倍率 ×' + nRank)
    console.log('    我方出牌 ' + f2(lst.plays / args.n) + ' 张/局，'
      + '其中 ' + f2(lst.hit / args.n) + ' 张真的多触发了技能')
    console.log('    技能触发件次：不带这件 ' + f2(lst.base / args.n)
      + ' → 带上 ' + f2((lst.base + lst.extra) / args.n)
      + ' → **实际倍率 ×' + f2(mult) + '**')
  }
  // ---- 【红钩】的诊断行〔2026-10-20，当天上架，原名【红心万用】〕----
  //
  // 照上面两条先例：**问计数器，别问旋钮**。
  // 两个要看的比例都在这儿，而它们查的是不同的东西：
  //   `♥ 占比` 查**闸**（理论 12/52 ≈ 23%，不含 ♥J）；
  //   `实际倍率` 查**效果**（=1.00 就是一次都没万用）。
  // 只看倍率的话「闸漏了但碰巧倍率正常」查不出来 —— 同色闸那次的教训
  const hst = R.PROTO_STAT.heartwild
  if (hst.plays > 0) {
    const mult = hst.base > 0 ? (hst.base + hst.extra) / hst.base : 0
    console.log('\n  ---- 红钩诊断（' + (R.HEART_OFF ? '**HEART_OFF=1 全关**' : 'HEART_PICK=' + R.HEART_PICK)
      + ' · HEART_ADD=' + (R.HEART_ADD === '' ? '(无)' : R.HEART_ADD)
      + ' · HEART_SIDE=' + R.HEART_SIDE + '）----')
    console.log('    我方出牌 ' + f2(hst.plays / args.n) + ' 张/局，其中 ♥ '
      + f2(hst.hearts / args.n) + ' 张（占 '
      + f2(hst.plays > 0 ? hst.hearts * 100 / hst.plays : 0)
      + '% —— **理论 23%**，不含 ♥J）')
    console.log('    其中 ' + f2(hst.hit / args.n) + ' 张真的多触发了技能')
    console.log('    技能触发件次：不带这件 ' + f2(hst.base / args.n)
      + ' → 带上 ' + f2((hst.base + hst.extra) / args.n)
      + ' → **实际倍率 ×' + f2(mult) + '**')
    if (R.HEART_PICK === 'one') {
      console.log('    ⚠ `one` 档是**固定序**（下标最小的那件）——'
        + 'AI 没有「选哪件」的决策口，所以这个数是**下限**。')
    }
  }
  // ---- 【归方】原型的诊断行〔2026-10-20〕----
  //
  // **第一个数是 `turned`，不是 X。** 这一件不加件次（改的是花色轴），
  // 所以 X 很小不等于机制没跑 —— 得先确认它真的把牌变过去了
  const dst = R.PROTO_STAT.todia
  if (dst.plays > 0) {
    console.log('\n  ---- 归方诊断（DIA_ON=on · DIA_SIDE=' + R.DIA_SIDE + '）----')
    console.log('    我方出牌 ' + f2(dst.plays / args.n) + ' 张/局，其中 '
      + f2(dst.turned / args.n) + ' 张变成了 ♦（占 '
      + f2(dst.plays > 0 ? dst.turned * 100 / dst.plays : 0) + '%）')
    console.log('    变 ♦ 之后**多触发**的件次 ' + f2(dst.extra / args.n)
      + ' 件/局（' + f2(dst.hit / args.n) + ' 手）'
      + ' —— 没有 ♦ 槽的卡这一列该是 **0.00**')
    if (dst.turned === 0) {
      console.log('    ⚠ **一张都没变** —— 闸没过（查 diaSuitOf 的 rankOwner 那条），'
        + '这一档跑的是原版。')
    }
  }
  console.log('\n  槽里插的是 KIT_ORDER 的前 ' + r.slots.length
    + ' 件（按 X 降序，跟 campaign 的池子同源）——'
    + '所以这个数**可以跟别的角色横着比**。')
}

// ---------- pair：两件装一起（组合技要用的底数） ----------

// ---------- 用户那三个驻场效果的诊断口（`COLD_MODE`）〔2026-10-20 加〕 ----------
//
// 照 ranklink / icekey 那条先例：**问计数器，别问旋钮**。
// `cmdVs` 和 `cmdPair` 两处都调它 —— 写成一个函数、不抄两份，
// 理由就是 rules.js 里反复写的那句「复制一份逻辑，两份必然分叉」。
//
// ⚠ **不印「每局」**：`PROTO_STAT` 是全局累加，而这两个命令各跑好几格
//（`vs` 跑 A/B/C/D 四格、`pair` 跑 both/onlyA/onlyB 三格），
// 格与格之间冰量差得远。所以只印绝对数和**比值**，那两个跨档可比
function printColdDiag() {
  if (R.COLD_MODE === 'hue') return
  const st = R.PROTO_STAT.cold
  console.log('\n  ---- 诊断：寒流那个槽 · COLD_MODE=' + R.COLD_MODE + ' ----')
  console.log('    驻场那句为真  ' + st.onfield + ' 手（挂的那张还在堆上）')
  console.log('    在场效果发动  ' + st.fires + ' 次'
    + '（占在场手数 ' + pct(avg(st.fires, st.onfield)) + '）')
  if (R.COLD_MODE !== 'match') {
    console.log('  **那个百分比就是那条链的维持率** —— pick/board 两档靠'
      + '「打出带冰的牌 → 再贴一张冰」自我续命，维持率低就是链断了。')
  }
  if (st.fires === 0) {
    console.log('  ⚠ **一次都没发动** —— 那不是幅度问题，是条件恒假。'
      + '去查 G.playedIced（打出的牌手里带冰吗）和 coldHueOn（挂的那张还在堆上吗）。')
    return
  }
  if (R.COLD_MODE !== 'match') {
    console.log('    贴出手牌钥匙  ' + st.keys
      + '（' + f2(avg(st.keys, st.fires)) + ' 把/次）')
  }
  console.log('    堆上真贴障碍  ' + st.tiles
    + '（' + f2(avg(st.tiles, st.fires)) + ' 张/次）')
  if (st.foeKeys > 0) {
    console.log('    **送给对手的钥匙** ' + st.foeKeys
      + '（' + f2(avg(st.foeKeys, st.fires)) + ' 把/次）')
  }
  if (R.COLD_MODE === 'pick') {
    console.log('  「钥匙/次」该接近 1（手里至少 3 张，总有一张还没冰）——'
      + '明显低于 1 就说明手牌早被自己贴满了，这一档在空转。')
  }
  if (R.COLD_MODE === 'match') {
    console.log('  「障碍/次」< 1 是正常的：撞上【燃烧】相消、以及那张'
      + '已经带冰（不可叠加）两种都不计；钓中被收走的那几手也不发动。')
  }
}

// 两件技能的协同。
//
// ⚠ **它的口径跟 `all` / `vs` / `one` 不一样，而这一点栽过一次**〔2026-10-21〕。
//
// 这儿走的是 `measure`（两格：基线 / 我带），所以三个数全是**后手单侧
// `back`**；而那三条命令走 `measureBoth`（三格，多一个「对手带」），
// 报的是 **X = (back + front) / 2**。换算是 `back = X − D`。
//
// 实证（拢水那一轮，20000 局 · 江口闸官）：伏流这儿报 3.66、全表 X 3.85 /
// D +0.12 → 3.85 − 0.12 = 3.73，差 0.07；易流 / 涉水 / 拢水三件差 0.01~0.02。
// **四件全对得上，所以两批数是一致的** —— 可我一度把那个差当成了「跨批噪声」，
// 还写进了两份文档。噪声能靠多跑几局收敛，口径差跑一百遍还是差一个 D。
//
// 所以下面**必须把口径打出来**（照 `cmdOne` / `cmdVs` 那两条已经打的）——
// 不打的话输出跟全表长得一样，而两者不能相减。
//
// 还有一条换算不出来的：**协同没法转成 X 口径**。它是三个 `back` 的差，
// 要转得知道「两件都带」那一格的 D，而这儿不量对手侧，给不出。
// 要 X 口径的协同只能改成三格 × 三种配装（九格），当前没这个命令。
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
    + ' · ' + R.DRAW_ROLES[role].name + ' · ' + args.n + ' 局'
    + ' · ' + specialNote(args, role) + '\n')
  // 口径必须打出来 —— 见函数抬头那段。**单侧，不是 X**
  console.log('  ⚠ 口径：两格（基线 / 我带），所以下面三个数都是'
    + '**后手单侧 back**，\n'
    + '     **不是 X** —— `all` / `vs` / `one` 报的 X 是两侧平均。'
    + '换算 `back = X − D`，\n'
    + '     所以**这三个数不能直接跟全表相减**。\n')
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
  console.log('  它也是单侧口径，而且**换算不成 X** —— 要转得知道'
    + '「两件都带」那一格的 D，这儿不量对手侧。')
  console.log('  第九节的组合技做完之后再跑一遍，差额就是组合技自己的贡献。')
  console.log('\n  注意槽不一样大的角色会让这个数偏 —— 默认的江口闸官四个槽等大。')
  printColdDiag()
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
  // 两边各插同一个角色的**同一个槽** —— 槽一样大，覆盖面才可比。
  //
  // ---- ⚠ `--slot` 原先在这儿被**静默忽略**〔2026-10-19 修〕 ----
  //
  // 这两行本来硬编码 `0`，而 `--slot` 只有 `one` / `all` 那几条认。
  // 后果是**静默读错口径**：`vs draft draft --role deepline --slot 1`
  // 看着是在量「K 槽」（4 张），实际量的是深海钓手的**第 0 槽 `♣`**
  //（13 张花色槽）—— 而覆盖面差 3.25 倍。
  //
  // 我就是这么栽的：量出「吃水在 K 槽 7.66、A 槽 3.41」，正要下
  //「幅度跟槽上那个点数成正比」的结论，**而抖出它的是诊断口的发动次数**
  //（5.65 次/局 对 1.93 —— 4 张牌的理论值是 ~1.85，5.65 只能是 13 张）。
  // 那是 CLAUDE.md 第四节那条的又一个实例：**X 看着「合理」说明不了什么。**
  //
  // 常驻技**默认关掉**（`--special` 才带）。原先靠「双方同角色所以
  // 两边的常驻技互相抵掉」，而那条对**不对称的**常驻技不成立 ——
  // 候潮渔翁【涨落】双方都带时，基线格仍然是后手 −12.23 分：
  // 它偏的是**先后手**，不是偏某一方，所以镜像抵不掉它
  const slotAt = args.slot
  const mine = R.kitWithOne(role, slotAt, atMine)
  const theirs = R.kitWithOne(role, slotAt, atTheirs)
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
      // 槽号和槽名都跟着 `--slot` 走〔2026-10-19 修〕——
      // 原先这两处写死 `1` / `slots[0]`，于是换槽之后**标题照旧报第 1 槽**。
      // 那比静默忽略 `--slot` 更坏：它会给错数配一个看着对的口径说明
      + R.DRAW_ROLES[role].name + ' · 都插第 ' + (slotAt + 1) + ' 个槽（'
      + R.DRAW_ROLES[role].slots[slotAt] + '）· ' + specialNote(args, role)
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
    // ---- 【撒网】的诊断口〔2026-10-20 加〕 ----
    //
    // 它**不走下面那张共用表**，两个原因：撒网的「段长」和「收成」是
    // 同一个数（那一列白占），而且 sdRows 全是顺子那几件 ——
    // 量撒网时那张表是空的，挂在它的 `if` 里面就永远不打印。
    //
    // 这一族真正要回答的是「**它收走了堆的几成**」：判死散收版的那句话
    //（「奇偶面本来就太大了」）说的正是这个比例，而那句话底下一直没有数
    const castRow = function (label, cd, s) {
      if (cd.fires[s] === 0) return null
      const h = cd.hits[s]
      return '    ' + label.padEnd(10)
        + f2(avg(cd.fires[s], args.n)).padStart(7) + ' 次/局'
        + pct(avg(h, cd.fires[s])).padStart(9)
        + f2(avg(cd.lenSum[s], h)).padStart(9)
        + f2(avg(cd.gotSum[s], h)).padStart(9)
        + pct(avg(cd.gotSum[s], cd.lenSum[s])).padStart(9)
        + pct(avg(cd.oddPick[s], h)).padStart(8)
        // 最后两列**不依赖 CAST_MODE**（见 rules.js 那段注释）：
        // 下面没牌的比例 / 下面那张跟它自己同奇偶的比例
        + pct(avg(cd.alone[s], cd.fires[s])).padStart(9)
        + pct(avg(cd.nextSame[s], cd.fires[s] - cd.alone[s])).padStart(10)
        // 整个堆的相邻奇偶对 —— 跟上一列对照（那一列只看撒网那一手）
        + pct(avg(cd.pileSame[s], cd.pileAdj[s])).padStart(11)
        + pct(avg(cd.onPile[s], cd.fires[s])).padStart(9)
        + pct(avg(cd.nextSameOn[s], cd.onPile[s])).padStart(11)
    }
    const castRows = [
      castRow('撒网·后手', D.cast, R.ME), castRow('撒网·先手', A.cast, R.FOE)
    ].filter(function (r) { return r !== null })
    if (castRows.length > 0) {
      console.log('\n  ---- 诊断：撒网（奇偶）· CAST_MODE='
        + (process.env.CAST_MODE || 'seg') + ' ----')
      console.log('            打出次数   成事率   平均堆厚   每次收成   收走堆的'
        + '   选奇率   下面空   下面同奇偶   全堆同奇偶   它落堆了   落堆·下面同')
      for (let i = 0; i < castRows.length; i++) console.log(castRows[i])
      console.log('\n  「成事率」= 真收到了的比例（只有它自己时什么也不收，所以 < 100%）；')
      console.log('  「收走堆的」= 收成 ÷ 堆厚 —— **散收档这一列该 ≈ 50%**')
      console.log('  （0 点算偶数，所以偶数那边本来略多）。差太远就去查 sameParity / pileValsAt。')
      console.log('  「选奇率」只在 `*pick` 档有意义（非自选档它就是手里那张的奇偶分布）。')
    }
    // ---- 【结冰】那道豁免的诊断口〔2026-10-20 加〕 ----
    //
    // 照 ranklink 那条先例：**问计数器，别问旋钮**（闸是 `kst.blocked > 0`）。
    //
    // ⚠ **不印「每局」** —— `PROTO_STAT` 是全局累加，而 cmdVs 跑的是
    // 四格（A/B/C/D），四格的冰量天差地别（C 格双方全空、压根没冰）。
    // 所以这儿只印**绝对数和比例**，那两个不依赖局数、跨档可比。
    //
    // 两档该看到的：`ICE_KEY=0` 下 hands 和 saved **都必须是 0**
    //（不是 0 就是闸漏了），而 `saved + blocked` 两档之间该大致守恒
    const kst = R.PROTO_STAT.icekey
    if (kst.blocked > 0 || kst.hands > 0) {
      const bump = kst.saved + kst.blocked
      console.log('\n  ---- 诊断：【结冰】的豁免 · ICE_KEY='
        + (R.ICE_KEY ? 'on（现行规则）' : '0（**豁免关掉**）') + ' ----')
      console.log('    豁免开着的手数  ' + kst.hands)
      console.log('    收牌撞上带冰的牌 ' + bump + ' 次 —— '
        + '豁免救下 ' + kst.saved + '（' + pct(avg(kst.saved, bump)) + '）'
        + ' / 冰挡住 ' + kst.blocked + '（' + pct(avg(kst.blocked, bump)) + '）')
      console.log('  ICE_KEY=0 下 hands 和「豁免救下」**都该是 0**；'
        + '而「撞上」的合计两档该接近 —— 差太远说明冰的**总量**也变了，那要分开读。')
    }
    printColdDiag()
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
      sdRow('顺流·后手', D.order, R.ME), sdRow('顺流·先手', A.order, R.FOE),
      sdRow('漫流·后手', D.brim, R.ME), sdRow('漫流·先手', A.brim, R.FOE),
      sdRow('易流·后手', D.swapflow, R.ME), sdRow('易流·先手', A.swapflow, R.FOE),
      sdRow('涌流·后手', D.swellflow, R.ME), sdRow('涌流·先手', A.swellflow, R.FOE),
      sdRow('潮流·后手', D.tideflow, R.ME), sdRow('潮流·先手', A.tideflow, R.FOE)
    ].filter(function (r) { return r !== null })
    if (sdRows.length > 0) {
      console.log('\n  ---- 诊断：成段的那几件怎么凑成的（顺子 / 排序）----')
      console.log('            打出次数   凑成率   平均段长   每次收成')
      for (let i = 0; i < sdRows.length; i++) console.log(sdRows[i])
      console.log('\n  「凑成率」低 → 瓶颈在**发动条件**；')
      console.log('  「每次收成」低 → 瓶颈在**收法**；')
      console.log('  两样都不低而分差仍低 → 收的那几张**本来也钓得到**')
      console.log('  （洪水那场查出来的那个机制，见 rules.js 的 stat.flood）。')
      // 易流多一个数：**真换了几次**（换了不如不换就不换，所以它低于打出次数）
      if (D.swapflow.fires[R.ME] > 0) {
        console.log('\n  易流**真换了**：后手 '
          + pct(avg(D.swapflow.swapped[R.ME], D.swapflow.fires[R.ME])) + ' 的手、先手 '
          + pct(avg(A.swapflow.swapped[R.FOE], A.swapflow.fires[R.FOE])) + ' 的手'
          + '（换了不如不换就不换）')
      }
      // 漫流多一个数：真推上来几张（牌库不足 2 张时不推，所以它低于 2×层数）
      if (D.brim.fires[R.ME] > 0) {
        console.log('\n  漫流**真推上来**：后手 '
          + f2(avg(D.brim.pushed[R.ME], D.brim.fires[R.ME])) + ' 张/次、先手 '
          + f2(avg(A.brim.pushed[R.FOE], A.brim.fires[R.FOE])) + ' 张/次'
          + '（层数 × 2 是上限，牌库不足 2 张时不推）')
      }
      // ---- 【失败补偿】那一档的三列（只在 FLOW_FAIL_TAG 开着时打）----
      //
      // 这三个数**必须一起读**，单看任何一个都会把成因归错：
      //
      //   补偿次数 ≈ 打出次数 × (1 − 凑成率)  → 对得上就说明那一支走到了
      //   真贴上 / 补偿次数                  → 明显小于 N 就是**手牌贴满了**（饱和）
      //   用上的 / 真贴上                    → 小就是**兑现链断了**（贴的是手牌，
      //                                        要等它打出去落堆才成为材料）
      //
      // 第三列是这一档的死因所在，而它跟「幅度不够」是两种病、两种解法
      const ftRow = function (label, sd, s) {
        if (sd.failFires[s] === 0) return null
        return '    ' + label.padEnd(10)
          + f2(avg(sd.failFires[s], args.n)).padStart(8) + ' 次/局'
          + f2(avg(sd.tagged[s], sd.failFires[s])).padStart(9) + ' 张/次'
          + f2(avg(sd.wildUsed[s], sd.hits[s])).padStart(9) + ' 张/成'
      }
      const ftRows = [
        ftRow('伏流·后手', D.straight, R.ME),
        ftRow('伏流·先手', A.straight, R.FOE)
      ].filter(function (r) { return r !== null })
      if (ftRows.length > 0) {
        console.log('\n  ---- 诊断：失败补偿（FLOW_FAIL_TAG）----')
        console.log('            补偿次数    真贴上     凑成时用上的通配')
        for (let i = 0; i < ftRows.length; i++) console.log(ftRows[i])
        console.log('\n  「真贴上」明显小于 N → **手牌贴满了**（饱和，加 N 没用）；')
        console.log('  「用上的通配」小 → **兑现链断了** —— 贴的是手牌，')
        console.log('  要等那张牌打出去落堆才成为材料，而堆的换手是 3.3 回合。')
        console.log('  那是第一条死因（兑现牌遇不上）的变体，加 N 治不了。')
      }
    }
    // ---- 打出那张自己贴【通配】的诊断（2026-10-19 规则变更）----
    //
    // **挂自己的条件、放在 sdRows 那个块外面** —— 照下面传火那段的教训。
    //
    // 这次改动的判定部分一个字没变（填格额度照旧由 `self:'wild'` 给），
    // 所以 X 的差额**全部**来自「凑不成那张带着标签留在堆上」。
    // 四列要一起读：
    //
    //   留下几次 / 贴了几次   = 失败率（这次改动的入口有多宽）
    //   发动时见到的旧通配    = 留下来的标签**活到了**下一次吗
    //   凑成时用上的旧通配    = 它们**变成分了**吗
    //
    // 后两列都低 = 标签活不到下一次（堆的换手 3.3 回合）；
    // 前高后低 = 攒住了但凑不上，那是第一条死因的变体
    const twRow = function (label, td, s) {
      if (td.fires[s] === 0) return null
      return '    ' + label.padEnd(10)
        + f2(avg(td.fires[s], args.n)).padStart(8) + ' 次/局'
        + f2(avg(td.kept[s], td.fires[s])).padStart(9) + ' 留/贴'
        + f2(avg(td.oldSeen[s], td.fires[s])).padStart(9) + ' 张/次'
        + f2(avg(td.oldUsed[s], td.fires[s])).padStart(9) + ' 张/次'
    }
    const twRows = [
      twRow('后手', D.selfWildTag, R.ME),
      twRow('先手', A.selfWildTag, R.FOE)
    ].filter(function (r) { return r !== null })
    if (twRows.length > 0) {
      console.log('\n  ---- 诊断：打出那张自己贴【通配】（CHAIN_SELF_TAG）----')
      console.log('            贴了几次    留下率   见到旧通配  用上旧通配')
      for (let i = 0; i < twRows.length; i++) console.log(twRows[i])
      console.log('\n  「见到旧通配」低 → 标签**活不到下一次**（堆的换手 3.3 回合）；')
      console.log('  「见到」高而「用上」低 → 攒住了但凑不上（第一条死因的变体）。')
      console.log('  A/B：`CHAIN_SELF_TAG=0` 退回「自带一次、不留标签」那一档。')
    }
    // ---- 【传火】那两个旋钮的诊断（CHAIN_HUE / CHAIN_NEXT）----
    //
    // ⚠ **这一段必须在那个 `if (sdRows.length > 0)` 块外面。**
    // 2026-10-16 第一版写在里面了，而那个块是「顺子那几件」的 ——
    // 传火不是顺子件，所以 sdRows 空、整块跳过、**传火的诊断一行都没打**。
    // 我因此在读那一轮五格矩阵时完全没有诊断列可看，只能从 X 反推。
    //
    // 判据：**诊断口要挂在它自己的条件上**（这儿是 `cd.fires[s] === 0`），
    // 别挂在别人的块里 —— 那种漏不报错，只是静默地什么都不打。
    const chRow = function (label, cd, s) {
      if (cd.fires[s] === 0) return null
      return '    ' + label.padEnd(10)
        + f2(avg(cd.fires[s], args.n)).padStart(8) + ' 次/局'
        + f2(avg(cd.lit[s], cd.fires[s])).padStart(9) + ' 张/次'
        + pct(avg(cd.nextGot[s], cd.fires[s])).padStart(10)
    }
    const chRows = [
      chRow('传火·后手', D.chain, R.ME),
      chRow('传火·先手', A.chain, R.FOE)
    ].filter(function (r) { return r !== null })
    if (chRows.length > 0) {
      console.log('\n  ---- 诊断：传火（CHAIN_HUE / CHAIN_NEXT）----')
      console.log('            发动次数   同色点着   连锁取到率')
      for (let i = 0; i < chRows.length; i++) console.log(chRows[i])
      console.log('\n  「同色点着」是**新**点着几张 —— 已经着火的那几格 lightAt')
      console.log('  返回假、不计数，所以它低于「堆上同颜色有几张」。实测 0.70。')
      console.log('  **别只看这个数判成「点不着几张所以弱」** —— 实测同颜色那档')
      console.log('  值 +2.12，因为堆薄同时让**燃尽**更容易达成（点着 1 张 + 它自己')
      console.log('  就可能是全堆带火，实测燃尽率 71~91%）。')
      console.log('  **堆薄对「点几张」和「燃不燃尽」符号相反**，所以别照直觉改回去。')
      console.log('  「连锁取到率」在 noburn 档下 = 没燃尽的比例 × 牌库里还有同点数的比例。')
    }
    // ---- 【分饵】的诊断（GIFT_LOOK / GIFT_FOE / GIFT_FATE）----
    const gfRow = function (label, gd, s) {
      if (gd.fires[s] === 0) return null
      return '    ' + label.padEnd(10)
        + f2(avg(gd.fires[s], args.n)).padStart(8) + ' 次/局'
        + f2(avg(gd.tookMine[s], gd.fires[s])).padStart(9) + ' 张给己'
        + f2(avg(gd.tookFoe[s], gd.fires[s])).padStart(9) + ' 张给敌'
    }
    const gfRows = [
      gfRow('分饵·后手', D.gift, R.ME),
      gfRow('分饵·先手', A.gift, R.FOE)
    ].filter(function (r) { return r !== null })
    if (gfRows.length > 0) {
      console.log('\n  ---- 诊断：分饵（GIFT_LOOK / GIFT_FOE / GIFT_FATE）----')
      console.log('            发动次数   给自己     给对手')
      for (let i = 0; i < gfRows.length; i++) console.log(gfRows[i])
      console.log('\n  两列**相等**才是偶数张离库（不翻牌库奇偶）。')
      console.log('  `GIFT_FOE=0` 那一档是**对照组**：它让拿牌数变成奇数，')
      console.log('  所以两档的 **D 之差**就是「奇偶那道缝」在这件技能上值多少')
      console.log('  （填塘那次量过同一条缝：X=0.00 而 D=+0.80，完美反对称）。')
      console.log('  「给自己」低于 1.00 → 牌库快空时看都看不到 1 张。')
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
      console.log('            发动次数   发动时堆厚   翻几张   收几次   收几张   其中空堆')
      const row = function (label, fd, s) {
        const fires = fd.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        return label.padEnd(10)
          + f2(avg(fires, args.n)).padStart(8) + ' 次/局'
          + f2(avg(fd.pileSum[s], fires)).padStart(10)
          + f2(avg(fd.flipSum[s], fires)).padStart(9)
          + f2(avg(fd.hits[s], fires)).padStart(9)
          + f2(avg(fd.gotSum[s], fires)).padStart(9)
          + (pct(avg(fd.thin[s], fires))).padStart(10)
      }
      console.log('    ' + row('后手（我）', fdMe, R.ME))
      console.log('    ' + row('先手（对手）', fdFoe, R.FOE))
      console.log('\n  「发动时堆厚」**含它自己**，所以 1.00 = 空堆开局那一手。')
      console.log('  要看的是哪一列在两侧差得最多 —— 那才是溢价的来源。')
      // ---- 「收几次」这一列是**机制诊断口**，不是强度 ----
      //
      // 定稿形状是「一张张翻，撞上**当场**收」，所以一次发动能收**好几次**
      //（收完堆短一截，后面翻的牌落在更薄的堆上，还能再撞）。
      //
      // ⚠ **原先这儿写的判据是错的**〔2026-10-21 当场改〕：
      //   「这一列 ≤ 1.00 就说明当场收那条分支没生效」。**1.00 不是分界线** ——
      //   这一列按**发动次数**平均，而一次发动经常一次都撞不上。
      //   `full` 档 hits ∈ {0,1}，它的 hits/fires 是「**至少撞一次的概率**」，
      //   天然 ≤ 1.00；`each` 的是「**期望撞几次**」。两个都能小于 1。
      //   实测 each 档 N=2..6 是 0.33/0.52/0.74/0.94/1.15 —— 照旧判据
      //   前四格全都「不合格」，而它们明明都比同 N 的 full 多收。
      //
      // **正确的比法：同 N 下拿 `each` 这一列去对 `full` 这一列。**
      // `each` 高出的那一截才是「当场收」多做的功。退化的话两者相等。
      //〔CLAUDE.md 第四节：同色闸那次 bug 下 X 4.89、修好 4.88，只看 X 发现不了。
      //  这一次反过来 —— **诊断口在，判读它的那条判据错了**，
      //  而错法是「拿一个绝对阈值当分界线」。诊断口要配**对照组**，不是阈值〕
      console.log('\n  「收几次」要跟**同 N 的 FLOOD_STOP=full** 比，')
      console.log('  **别拿 1.00 当分界线** —— 这一列按发动次数平均，而 full 的')
      console.log('  hits ∈ {0,1}（= 至少撞一次的概率），本来就 ≤ 1.00。')
      console.log('  each 高出 full 的那一截，才是「撞上当场收」多做的功。')
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
    // ---- 【21 匹配】的诊断口〔2026-10-19，为系列化量矩阵加的〕 ----
    //
    // **「预算用掉几成」那一列比 X 先看。** 它决定「调 CAP / 改预算归属」
    // 这整条分化轴是活的还是死的 —— 富余的话那条轴撞「条件撞局面常量」
    //（第三条死因），而只看 X 根本看不出来。
    //
    // 「为什么停」那四列同理：end 占多数 = 瓶颈是**堆太薄**（那条轴
    // 要靠【推牌】治），over 占多数才说明预算真的是瓶颈
    const drMe = D.draft
    const drFoe = A.draft
    if (drMe.fires[R.ME] > 0 || drFoe.fires[R.FOE] > 0) {
      console.log('\n  ---- 诊断：【21 匹配】每次发动（' + args.n + ' 局合计）----')
      console.log('            发动   凑成率   堆厚   预算   用掉   用掉几成   够着几张')
      const dRow = function (label, dr, s) {
        const fires = dr.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        const bud = avg(dr.budSum[s], fires)
        const used = avg(dr.sumSum[s], fires)
        return label.padEnd(10)
          + f2(avg(fires, args.n)).padStart(6) + '/局'
          + pct(avg(dr.hits[s], fires)).padStart(9)
          + f2(avg(dr.pileSum[s], fires)).padStart(7)
          + f2(bud).padStart(7)
          + f2(used).padStart(7)
          + pct(bud > 0 ? used / bud : 0).padStart(11)
          + f2(avg(dr.gotSum[s], fires)).padStart(11)
      }
      console.log('    ' + dRow('后手（我）', drMe, R.ME))
      console.log('    ' + dRow('先手（对手）', drFoe, R.FOE))
      console.log('\n  ---- 为什么停（占发动次数的比例）----')
      console.log('            超预算   无点数断链   0点断链   被护   整堆吃完   空堆')
      const sRow = function (label, dr, s) {
        const fires = dr.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        return label.padEnd(10)
          + pct(avg(dr.stopOver[s], fires)).padStart(8)
          + pct(avg(dr.stopVoid[s], fires)).padStart(13)
          + pct(avg(dr.stopZero[s], fires)).padStart(10)
          + pct(avg(dr.stopGuard[s], fires)).padStart(7)
          + pct(avg(dr.stopEnd[s], fires)).padStart(11)
          + pct(avg(dr.stopEmpty[s], fires)).padStart(7)
      }
      console.log('    ' + sRow('后手（我）', drMe, R.ME))
      console.log('    ' + sRow('先手（对手）', drFoe, R.FOE))
      console.log('\n  **「整堆吃完」高 = 瓶颈是堆太薄，不是预算不够** ——')
      console.log('  那样「调 CAP / 自己不占预算」这条轴是死的（条件撞局面常量）。')
      // ---- 「21 匹配 和 0 点匹配能不能共存」那个问题的度量 ----
      console.log('\n  ---- 堆上的 0 点牌归谁（每次发动平均）----')
      console.log('            这段里收走   段外剩下   段外占比')
      const zRow = function (label, dr, s) {
        const fires = dr.fires[s]
        if (fires === 0) return label.padEnd(10) + '（没发动过）'
        const zin = avg(dr.zeroIn[s], fires)
        const zout = avg(dr.zeroOut[s], fires)
        const tot = zin + zout
        return label.padEnd(10)
          + f2(zin).padStart(8)
          + f2(zout).padStart(11)
          + (tot > 0 ? pct(zout / tot) : '—').padStart(11)
      }
      console.log('    ' + zRow('后手（我）', drMe, R.ME))
      console.log('    ' + zRow('先手（对手）', drFoe, R.FOE))
      console.log('\n  **「段外剩下」就是「0 点匹配」能独立拿到的全部** ——')
      console.log('  21 匹配穿过 0 点牌不花预算也不断链，所以它们几乎都在那一段里。')
      console.log('  这一列 ≈ 0 就是「两条线共存 = 纯重复」的直接证据。')
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

// ---------- switch：【换竿】本身值多少 ----------
//
// `roles` 量常驻技时槽一律空着，而换竿对调的是**两个槽里的技能** ——
// 空槽对调还是空槽，那一格恒为 0。所以它得单开一条：两个槽插上给定的两件，
// 同一套配装**带不带换竿**各跑一遍，差出来的才是换竿自己。
//
// 口径照 `roles` / `all`：两侧都量（后手 / 先手），报 X 和 D。
// 对手一律空手、不带角色。
//
// AI 每手把开、关两种都估一遍（ai.js 的 pickCard），挑收得多的那种 ——
// 当饵那一支不看换竿（开关落回关），所以这个数是它的**下限**
function cmdSwitch(args) {
  const role = roleIndexOrDie('banks')
  const slots = R.DRAW_ROLES[role].slots
  const atA = skillIndexOf(args._[1])
  const atB = skillIndexOf(args._[2])
  const lo = R.kitFromRole(role, [atA, atB])
  const empty = R.emptyLoadout()
  // 同一套配装，常驻技关 / 开
  const offBack = run(args.n, args.seed, lo, empty, { myRole: -1, foeRole: -1 })
  const onBack = run(args.n, args.seed, lo, empty, { myRole: role, foeRole: -1 })
  const offFront = run(args.n, args.seed, empty, lo, { myRole: -1, foeRole: -1 })
  const onFront = run(args.n, args.seed, empty, lo, { myRole: -1, foeRole: role })
  const base = run(args.n, args.seed, empty, empty, { myRole: -1, foeRole: -1 })
  const back = meanDiff(onBack) - meanDiff(offBack)
  const front = meanDiff(offFront) - meanDiff(onFront)
  const kitBack = meanDiff(offBack) - meanDiff(base)
  const kitFront = meanDiff(base) - meanDiff(offFront)
  const se = Math.sqrt(stderrOf(onBack) * stderrOf(onBack) + stderrOf(offBack) * stderrOf(offBack))
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  console.log('【换竿】· ' + R.DRAW_ROLES[role].name + ' · 槽 1（' + slots[0] + '）'
    + R.SKILLS[atA].name + ' / 槽 2（' + slots[1] + '）' + R.SKILLS[atB].name
    + ' · ' + args.n + ' 局\n')
  console.log('  两件技能本身（不带换竿，对照空手）：X ' + sign((kitBack + kitFront) / 2)
    + '   D ' + sign((kitFront - kitBack) / 2))
  console.log('  换竿在这之上多出来的：            X ' + sign((back + front) / 2)
    + '   D ' + sign((front - back) / 2) + '   （后手 ' + sign(back)
    + ' / 先手 ' + sign(front) + '，标准误约 ' + f2(se) + '）')
  console.log('\n  目标档位：一件常驻特殊技每局 +2.7 ~ +4.5 分（看 **X**）。')
  console.log('  AI 当饵时不拨开关，所以这是换竿的下限。')
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
  if (cmd === 'switch') return cmdSwitch(args)
  if (cmd === 'cards') return cmdCards(args)
  console.log('不认识的命令：' + cmd + '\n看文件头的注释，或者 README.md')
}

main()
