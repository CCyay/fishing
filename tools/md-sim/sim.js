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
// 目标档位上限〔2026-10-26 用户定 5.5 → 2026-10-30 用户定 **4.8**〕。下限不写死，`all` 每跑现算（胜率线）
const X_CAP = 4.8

// 量单件技能时默认装在谁身上。江口闸官 = ['A','2','3','4']，
// 四个等大的小槽，所以「这件技能管 4 张牌」在各件之间是可比的
const DEFAULT_ROLE = 'lock'

function parseArgs(argv) {
  const out = { _: [], n: 20000, seed: 1, role: DEFAULT_ROLE, slot: 0, special: false, proto: false, full: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n') { out.n = parseInt(argv[++i], 10) }
    else if (a === '--seed') { out.seed = parseInt(argv[++i], 10) }
    else if (a === '--full') { out.full = true }
    else if (a === '--role') { out.role = argv[++i] }
    else if (a === '--slot') { out.slot = parseInt(argv[++i], 10) }
    else if (a === '--special') { out.special = true }
    // `--proto`：`all` 连模拟器专属原型一起量〔2026-10-27 加，用户定「只在
    // 模拟器里的技能不用再量了」〕。**默认不量** —— 原型有 59 件、是上架件
    // 的 1.6 倍，而它们在定价表里一行都不能引用（台账那一节写着
    // 「一个都不要引用」）。所以默认档下这张表跑得快一倍半，而且没有噪音行。
    // ⚠ 它**只管 `all`**；`one` / `vs` / `pair` 是点名量的，点到谁量谁
    else if (a === '--proto') { out.proto = true }
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
    // ⚠ **`taken` 跟 `caught` 不是同一个口径，别混用**〔2026-10-23 补〕
    //
    //   `caught`  = `G.stat.caught`  —— 诊断口，「这一侧收了几张牌」
    //   `taken`   = `G.taken`        —— **规则层的张数守恒账**
    //
    // 两者在空槽基线下逐位相同，所以混用很久都没事。分叉点在
    // `rules.js:11759`（易流把**手牌**也算离场）—— 那儿的注释写得很明白：
    // 「`taken` 要跟着加，**不然守恒自检对不上**」。也就是说守恒那条式子
    // （收走 + 堆里剩 + 手里剩 = 牌组）认的是 `taken`，不是 `caught`。
    //
    // 补它是为了**接现成入口而不是接一个今天刚好相等的量**
    //（CLAUDE.md 第四节那条「复制一份逻辑，两份必然分叉」的同款）。
    taken: [0, 0],
    jackCatches: [0, 0], jackTook: [0, 0], skillCatch: [0, 0],
    // 【抢牌】的诊断口〔2026-10-27〕—— 字段义见 `rules.js` 的 `stat.steal` 那段
    stAsked: [0, 0], stAble: [0, 0], stStolen: [0, 0], stByJack: [0, 0],
    stGain: [0, 0], stLost: [0, 0], stTook: [0, 0], stCatches: [0, 0],
    stJTook: [0, 0], stJCatches: [0, 0],
    // 「为什么这一方更容易被抢」的四个拆解口〔2026-10-27 补〕—— 分母都是 stAsked
    stMine: [0, 0], stPileAt: [0, 0], stOver: [0, 0], stFoeHand: [0, 0],
    // 可抢率按 myCount 分档（下标 = 张数，封顶 8）—— 分「构成差 / 档内差」用
    stMAsk: [[0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]],
    stMAble: [[0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]],
    holdSkip: [0, 0], holdSkipSum: [0, 0], holdForced: [0, 0],
    // 【忍 1 手】的诊断口（ai.js 的 worthHolding 那段）
    holdOnce: [0, 0], holdOnceHit: [0, 0], holdOnceMiss: [0, 0],
    holdOnceGave: [0, 0], holdOnceGot: [0, 0],
    // 同一对账**按「外面还剩 0 / 1 / 2+ 张」拆开**〔2026-10-27，用户的 c〕。
    // 原先只有整体升档率，而用户问的是**某一格**该不该养堆 ——
    // 判忍率（AI 信了几成）和兑现率是两个数，混过一次（HOLD_P=25：
    // 信 25%、实际 15.2%）。三桶之和该等于整体那一对，对不上就是桶键串台
    holdOnceHitB: [[0, 0, 0], [0, 0, 0]],
    holdOnceMissB: [[0, 0, 0], [0, 0, 0]],
    // 【攒组合】的诊断口（ai.js 的 comboPair 那段）。
    // `comboHold` 是「这个旋钮改了多少次决策」，`comboChain` / `comboBroke`
    // 答的是用户那句「**接连**打出」到底发生了没有
    comboHold: [0, 0], comboHoldSum: [0, 0], comboForced: [0, 0],
    comboReady: [0, 0], comboBaitPlay: [0, 0],
    comboChain: [0, 0], comboBroke: [0, 0],
    // 三个旋钮各自的计数口：它们**改掉**了多少次决策。
    // `holdRunBlocked` 是**上界**（见 ai.js 那道闸的注释），另两个是精确值
    holdCapped: [0, 0], holdEvFlip: [0, 0], holdRunBlocked: [0, 0],
    // 【埋锚】+【够得着才养堆】的诊断口〔2026-10-27，用户情景 1 那两条规格〕。
    //
    // 四个数**两两配对**，而且**旋钮关着也记** —— 所以关着那一跑就是对照组，
    // 不用重跑（照 `holdEvPShal` 那几行的做法）：
    //
    //   reachDeep / reachShal    忍的时候够得着堆底（a）/ 够不着（b）
    //   anchorBury / anchorNone  扔出去的饵自己还收得回来 / 收不回来
    //
    // ⚠ `reachShal` 的含义**随旋钮而变**（判据在 ai.js 那道闸的注释里）：
    //   关着 = 「忍了，但够不着堆底」的次数（对照组的分母）；
    //   开着 = 「**这道闸拦掉了几次**」。两档不能混在一起相减
    reachDeep: [0, 0], reachShal: [0, 0],
    anchorBury: [0, 0], anchorNone: [0, 0],
    // 【按概率忍】`HOLD_MIX` 的计数口。`mixAdd` / `mixDrop` **分方向** ——
    // 只报一个总数看不出它是在多忍还是少忍，而两者后果相反
    mixOn: [0, 0], mixAdd: [0, 0], mixDrop: [0, 0], mixPsum: [0, 0],
    // 【HOLD_EV】真算概率那一套的诊断口（ai.js 的 holdEV 那段）。
    // `holdEvPsum` 是「AI **信**的成功率」之和 —— 要拿它跟事后实测的
    // 升档率对账，这正是 `HOLD_P=25` 栽的那一格（信 25%、实际 15.2%）
    holdEvN: [0, 0], holdEvYes: [0, 0], holdEvPsum: [0, 0],
    // 用户那三条判据的分桶：目标点数外面还剩 0 / 1 / 2+ 张
    holdEvOut: [[0, 0, 0], [0, 0, 0]],
    holdEvOutYes: [[0, 0, 0], [0, 0, 0]],
    // 第二个分桶：**从哪一档起忍**（2/3 起 / 4/5 起 / 6 张及以上）。
    // 用户的预判是「4→6 算出来一定不推荐忍」——
    // 这两行就是让那句话可证伪，而不是靠写死一条上限做成同义反复
    holdEvFrom: [[0, 0, 0], [0, 0, 0]],
    holdEvFromYes: [[0, 0, 0], [0, 0, 0]],
    // 第三个分桶：**情况 3（外面还剩 2 张）里再按牌组厚度切三档**。
    // 用户：「我希望在情况 3 且牌组还很厚的条件下，忍 1 手还是有价值的，
    // 4/5 档的积分要有这样的价值」—— 这三行就是那条验收线
    holdEvThick: [[0, 0, 0], [0, 0, 0]],
    holdEvThickYes: [[0, 0, 0], [0, 0, 0]],
    // 【HOLD_EV_SPLIT】把「平」拆成「浅层被吃」和「只有饵被吃」〔2026-10-23〕。
    // 用户：「对手手里既没有 2、也没有 J 是对的，**也配不上我那张饵**
    // 要拎出来单独算」。`holdEvOver` = 原来把浅层那一支记成 `now` 高估的那一截，
    // **旋钮关着也照记**，所以对照组不用重跑就能看出拆了值不值
    holdEvPShal: [0, 0], holdEvPBait: [0, 0], holdEvOver: [0, 0],
    // 收成分布〔2026-10-22〕。桶数**从 rules 取**，不在这儿另写一个数
    catchHist: [R.newHist(), R.newHist()],
    catchHistJ: [R.newHist(), R.newHist()],
    pileHist: [R.newHist(), R.newHist()],
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
      failFires: [0, 0], tagged: [0, 0], wildUsed: [0, 0], failWild: [0, 0]
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
      stopEnd: [0, 0], stopEmpty: [0, 0], stopZero: [0, 0],
      thruSum: [0, 0]
    },
    // 【分饵】的诊断口 —— `tookMine` / `tookFoe` 不相等就是拿了奇数张
    gift: { fires: [0, 0], tookMine: [0, 0], tookFoe: [0, 0] },
    // 【漫流】—— 跟顺子那两件同一组列（所以下面共用那个循环），外加 pushed
    brim: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      pushed: [0, 0]
    },
    // 顺流（按排序收牌）—— 跟上面两件同一组列，所以下面共用同一个循环和同一张表
    // swapped：换序 / 调序真换了几次（顺流 / 插流恒 0）
    order: { fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0], swapped: [0, 0] },
    // 【易流】—— 跟顺子那几件同组列，外加 swapped（真换了几次）
    swapflow: {
      fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0],
      swapped: [0, 0]
    },
    // 【推牌】的诊断口（见 rules.js 的 stat.surge）〔2026-10-20 接上〕。
    //
    // 它一直在 rules.js 里记着，而这边**从来没汇总过** —— 于是
    // 「一局总共推了几张」这个数读不到，而『机制：推牌』那一章说得很清楚：
    // **局长是这一族的全局预算，要按「一局总共推几张」排**。
    // 接上它是因为**光看 X 看不出一件推牌技花了多少**（照「量一个新机制，
    // X 之外必须有一个「它做了几次」的计数」那条）
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
      // ⚠ 这一个取的是 `G.taken`，**不是 `G.stat.taken`**（没有那个字段）——
      //   它挂在规则层的 G 上，跟 score 并排记（`rules.js:8121`）
      sum.taken[s] += G.taken[s]
      sum.jackCatches[s] += G.stat.jackCatches[s]
      sum.jackTook[s] += G.stat.jackTook[s]
      // 【抢牌】—— `stat.steal` 在 `newGame` 里无条件建好，所以不用 `if`
      // （照 `jackTook` 那条，不照 `holdOnce` 那条「ai.js 里才建」的）
      {
        const sd = G.stat.steal
        sum.stAsked[s] += sd.asked[s]
        sum.stAble[s] += sd.able[s]
        sum.stStolen[s] += sd.stolen[s]
        sum.stByJack[s] += sd.byJack[s]
        sum.stGain[s] += sd.gain[s]
        sum.stLost[s] += sd.lost[s]
        sum.stTook[s] += sd.took[s]
        sum.stCatches[s] += sd.catches[s]
        sum.stJTook[s] += sd.jTook[s]
        sum.stJCatches[s] += sd.jCatches[s]
        sum.stMine[s] += sd.mine[s]
        sum.stPileAt[s] += sd.pileAt[s]
        sum.stOver[s] += sd.over[s]
        sum.stFoeHand[s] += sd.foeHand[s]
        for (let b = 0; b < sd.mAsk[s].length; b++) {
          sum.stMAsk[s][b] += sd.mAsk[s][b]
          sum.stMAble[s][b] += sd.mAble[s][b]
        }
      }
      sum.holdSkip[s] += G.stat.holdSkip[s]
      sum.holdSkipSum[s] += G.stat.holdSkipSum[s]
      sum.holdForced[s] += G.stat.holdForced[s]
      if (G.stat.holdOnce) {
        sum.holdOnce[s] += G.stat.holdOnce[s]
        sum.holdOnceHit[s] += G.stat.holdOnceHit[s]
        sum.holdOnceMiss[s] += G.stat.holdOnceMiss[s]
        sum.holdOnceGave[s] += G.stat.holdOnceGave[s]
        sum.holdOnceGot[s] += G.stat.holdOnceGot[s]
        for (let b = 0; b < 3; b++) {
          sum.holdOnceHitB[s][b] += G.stat.holdOnceHitB[s][b]
          sum.holdOnceMissB[s][b] += G.stat.holdOnceMissB[s][b]
        }
      }
      // 同理：`initComboStat` 在**每个决策点**都建（集齐了也要记一笔），
      // 所以单独判一次，不跟着 `holdOnce` 走
      if (G.stat.comboHold) {
        sum.comboHold[s] += G.stat.comboHold[s]
        sum.comboHoldSum[s] += G.stat.comboHoldSum[s]
        sum.comboForced[s] += G.stat.comboForced[s]
        sum.comboReady[s] += G.stat.comboReady[s]
        sum.comboBaitPlay[s] += G.stat.comboBaitPlay[s]
        sum.comboChain[s] += G.stat.comboChain[s]
        sum.comboBroke[s] += G.stat.comboBroke[s]
      }
      // ⚠ 单独判一次 —— 它不在 `initHoldStat` 里（那支只在真忍了才建），
      //   而上限拦下的那些手恰恰**没有**真忍
      if (G.stat.holdCapped) sum.holdCapped[s] += G.stat.holdCapped[s]
      if (G.stat.holdEvFlip) sum.holdEvFlip[s] += G.stat.holdEvFlip[s]
      // 【埋锚】/【够得着才养堆】—— 同样单独判一次：两对都在 `initHoldStat`
      // 之外懒建（`reachDeep` 在判定里建、`anchorBury` 在挑饵循环里建），
      // 而那两处都可能在「从没真忍过」的局里就触发
      if (G.stat.reachDeep) {
        sum.reachDeep[s] += G.stat.reachDeep[s]
        sum.reachShal[s] += G.stat.reachShal[s]
      }
      if (G.stat.anchorBury) {
        sum.anchorBury[s] += G.stat.anchorBury[s]
        sum.anchorNone[s] += G.stat.anchorNone[s]
      }
      if (G.stat.mixOn) {
        sum.mixOn[s] += G.stat.mixOn[s]
        sum.mixAdd[s] += G.stat.mixAdd[s]
        sum.mixDrop[s] += G.stat.mixDrop[s]
        sum.mixPsum[s] += G.stat.mixPsum[s]
      }
      // 同理：被 `HOLD_RUN` 拦下的手**没有**真忍，所以也不在 initHoldStat 里
      if (G.stat.holdRunBlocked) sum.holdRunBlocked[s] += G.stat.holdRunBlocked[s]
      // 同上：`holdEvN` 在**每个决策点**都记，哪怕最后判了不忍 ——
      // 所以它也不在 `initHoldStat` 里，得单独判一次
      if (G.stat.holdEvN) {
        sum.holdEvN[s] += G.stat.holdEvN[s]
        sum.holdEvYes[s] += G.stat.holdEvYes[s]
        sum.holdEvPsum[s] += G.stat.holdEvPsum[s]
        sum.holdEvPShal[s] += G.stat.holdEvPShal[s]
        sum.holdEvPBait[s] += G.stat.holdEvPBait[s]
        sum.holdEvOver[s] += G.stat.holdEvOver[s]
        for (let b = 0; b < 3; b++) {
          sum.holdEvOut[s][b] += G.stat.holdEvOut[s][b]
          sum.holdEvOutYes[s][b] += G.stat.holdEvOutYes[s][b]
          sum.holdEvFrom[s][b] += G.stat.holdEvFrom[s][b]
          sum.holdEvFromYes[s][b] += G.stat.holdEvFromYes[s][b]
          sum.holdEvThick[s][b] += G.stat.holdEvThick[s][b]
          sum.holdEvThickYes[s][b] += G.stat.holdEvThickYes[s][b]
        }
      }
      for (let b = 0; b <= R.CATCH_BINS; b++) {
        sum.catchHist[s][b] += G.stat.catchHist[s][b]
        sum.catchHistJ[s][b] += G.stat.catchHistJ[s][b]
        sum.pileHist[s][b] += G.stat.pileHist[s][b]
      }
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
        sum.cast[keys[k]][s] += G.stat.cast[keys[k]][s]
      }
      sum.order.swapped[s] += G.stat.order.swapped[s]
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
        'zeroIn', 'zeroOut', 'thruSum']
      for (let k = 0; k < dk.length; k++) {
        sum.draft[dk[k]][s] += G.stat.draft[dk[k]][s]
      }
      // 失败补偿那三列只有 straight 有
      const fk = ['failFires', 'tagged', 'wildUsed', 'failWild']
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

// ---------- 收 N 张的难度曲线〔2026-10-22〕 ----------
//
// 用户的问题：「**收 2 牌 / 3 牌 / 4 牌… 的难度不是线性的，
// 奖励积分应该不同才是？**」
//
// 前半句是**可证伪的事实陈述**，而这个项目此前只量过它的平均值
//（`base` 那张表的「每次平均收 2.85 张」）—— 平均值答不了它。
// 这张表给的是分布。
//
// 四列各答一件事，**别只看第一列**：
//
//   次数占比    这一档有多常见（**含**「堆根本不够厚」那些局面）
//   台阶        P(N) / P(N−1)，相邻两档的倍率。
//               ⚠ **线性奖励对应的是这一列恒等于 1** —— 它离 1 多远，
//                 「难度非线性」就有多陡。这一列是用户那句话的正面回答
//   堆够厚时    P(收 N | 出牌时堆 ≥ N−1)，把天花板除掉之后的**纯匹配难度**。
//               它跟「次数占比」在哪一档开始分叉，哪一档就是天花板在起作用
//   占总分      这一档贡献了全部积分的百分之几（= N × 次数 / 总分）。
//               改 f(N) 之前必须看它：**改一个几乎不发生的档等于没改**
//
// 口径：两人合计。一边一列没有意义 —— 这是规则的性质，不是谁的打法。
//
// ⚠ **上面那句只在「双方对称」的格子里成立**〔2026-10-24 加第二个调用方时补的〕。
//   它原先只被 `cmdBase` 调（双方空手、同角色 → 合计确实是规则的性质）。
//   现在 `cmdOne` 也调（`CATCH_CURVE=1`），而那儿**两侧不对称** ——
//   `m.test` 那一格是「我带、对手空手」，合计会把带技能那方的分布
//   跟不带的那方**对半稀释**。
//   **要按侧看只有一条路：`DUMP_HIST=<tag>` 吐的 `#HIST … me / foe` 两行。**
//
// `tagSuffix`：`DUMP_HIST` 的标签后缀。同一条命令里调两次（我带 / 基线）时
//   不加它的话两份 `#HIST` 标签一模一样，离线根本分不开是哪一格
function printCatchCurve(sum, g, tagSuffix) {
  const B = R.CATCH_BINS
  const hit = []     // 收 N 张发生了几次
  const jhit = []    // 其中靠 J 通吃的
  const nhit = []    // 非 J（= 普通匹配 / 技能）—— **f(N) 要照着这一条**
  const play = []    // 出牌时堆厚 = N 的次数
  for (let b = 0; b <= B; b++) {
    hit.push(sum.catchHist[0][b] + sum.catchHist[1][b])
    jhit.push(sum.catchHistJ[0][b] + sum.catchHistJ[1][b])
    nhit.push(hit[b] - jhit[b])
    play.push(sum.pileHist[0][b] + sum.pileHist[1][b])
  }
  let totalHit = 0
  // ⚠ **这个变量 2026-10-23 晚些从 `totalCard` 改名成 `totalScore`。**
  //
  // 改名不是风格：它早上刚从「Σ hit[b]×b」改成「Σ hit[b]×scoreOf(b)」
  // （见下面那段），**而名字没跟着改** —— 于是它同时在两个地方被用：
  //   · 「占总分」那几列的分母 ← 正确，它就是总分
  //   · 下面那条「收牌张数 == caught」的自检 ← **错的，它不是张数**
  // 后者在 R4 下静默失效（见 `totalCardN` 那条）。名字说谎了半天。
  let totalScore = 0
  // 真·张数的加权和，**只给自检用**。R3 下它跟 `totalScore` 是同一个数，
  // R4 下差得很远（实测 872918 vs 560775），而那正是那条自检要抓的东西
  let totalCardN = 0
  let totalPlay = 0
  for (let b = 0; b <= B; b++) {
    totalHit += hit[b]
    totalCardN += hit[b] * b
    // ⚠ **这儿必须走 `scoreOf`，不能用 `b`**〔2026-10-23 修的 bug〕
    //
    // 原来写的是 `hit[b] * b` —— 分子分母都按**张数**算。
    // `SCORE_BANDS` 没设时「分 = 张数」，所以那一列碰巧是对的；
    // 一设档值它就不是「占总分」了，是「占总张数」，而两者差得很远：
    // 1,4,12 下收 6 张给 12 分却按 6 张算，整个 6+ 档被压掉一半还多
    //（实测 1,4,12 双方都忍：这一列报 9.2%，真占总分是 24.8%）。
    //
    // 这正是 CLAUDE.md 那条「一个看起来合理的数不能当成机制对了」——
    // 9.2% 看着就像「画饼档基本拿不到」，而它其实是口径错了。
    totalScore += hit[b] * R.scoreOf(b)
    totalPlay += play[b]
  }
  console.log('')
  console.log('  ---- 收 N 张的难度曲线（两人合计，' + g + ' 局）----')
  console.log('  〔「台阶」= P(N)/P(N−1)。**线性奖励对应的是这一列恒等于 1**〕')
  console.log('')
  console.log('    N 张      次数   占总分 |  其中J   非J次数   非J台阶   非J堆够厚时')
  console.log('  ' + '-'.repeat(72))
  let prev = 0
  for (let b = 0; b <= B; b++) {
    if (hit[b] === 0 && b < 2) continue
    // 收 N 张要求出牌时堆上**至少**有 N−1 张（匹配那张到堆顶，再加自己）。
    // 所以分母是「堆厚 ≥ N−1」的出牌次数 —— 溢出桶照它自己的下沿算，
    // 那让最后一格的「堆够厚时」偏大（真实的 N 更大、门槛更高），
    // **是个下限，不是精确值**
    const need = b - 1
    let deep = 0
    for (let k = need < 0 ? 0 : need; k <= B; k++) deep += play[k]
    const label = (b === B ? '≥' + b : '' + b)
    // **台阶算的是非 J**〔第二跑改的〕—— J 不挑点数、恒收整堆，
    // 对它谈「收 4 张比收 3 张难」没有意义，混进来只会把曲线抹平
    const step = (prev > 0 ? f2(nhit[b] / prev) : '—')
    console.log('   ' + label.padStart(4) + '  ' + ('' + hit[b]).padStart(9)
      // 同上：分子也走 `scoreOf`。溢出桶（b === B）在分档下**反而更准** ——
      // 真实 N 更大，但只要都落在顶档，`scoreOf` 给的就是同一个值
      + '  ' + pct(avg(hit[b] * R.scoreOf(b), totalScore)).padStart(7)
      + '  |' + ('' + jhit[b]).padStart(8)
      + '  ' + ('' + nhit[b]).padStart(8)
      + '  ' + ('' + step).padStart(8)
      + '  ' + pct(avg(nhit[b], deep)).padStart(11))
    prev = nhit[b]
  }
  // ---------- 按**档**汇总，而且把 J 拆出来〔2026-10-23〕 ----------
  //
  // 加它的理由是实测抓到的：1,4,12 下 6+ 档每一行的「其中 J」都过半
  //（收 6 张 54%、收 7 张 55%、收 8 张 57%），一行一行看看不出总量。
  //
  // 这件事对定 c 是决定性的：**抬 c 主要在给 J 加价，不是在奖励忍**。
  // J 通吃不需要任何决策 —— 摸到就赢，而用户要的是「赌对手什么时候收」。
  //
  // 只在设了 `SCORE_BANDS` 时打：没设的话「档」这个概念不存在
  if (R.SCORE_BANDS !== null) {
    const bandHit = [0, 0, 0]
    const bandJ = [0, 0, 0]
    const bandScore = [0, 0, 0]
    const bandJScore = [0, 0, 0]
    for (let b = 2; b <= B; b++) {
      const k = Math.min(2, R.bandOf(b))
      if (k < 0) continue
      bandHit[k] += hit[b]
      bandJ[k] += jhit[b]
      bandScore[k] += hit[b] * R.scoreOf(b)
      bandJScore[k] += jhit[b] * R.scoreOf(b)
    }
    console.log('')
    console.log('  ---- 按档汇总（档值 ' + R.SCORE_BANDS.join(',') + '）----')
    console.log('  〔「J 占本档」过半 = 这一档主要是运气在发钱，不是决策在发钱〕')
    console.log('    档        次数     次数占比    占总分 |   其中J    J占本档   J占全局分')
    console.log('  ' + '-'.repeat(72))
    const btag = ['2/3 档', '4/5 档', '6+ 档']
    for (let k = 0; k < 3; k++) {
      console.log('   ' + btag[k].padStart(6)
        + '  ' + ('' + bandHit[k]).padStart(9)
        + '  ' + pct(avg(bandHit[k], totalHit)).padStart(9)
        + '  ' + pct(avg(bandScore[k], totalScore)).padStart(8)
        + '  |' + ('' + bandJ[k]).padStart(8)
        + '  ' + pct(avg(bandJ[k], bandHit[k])).padStart(9)
        + '  ' + pct(avg(bandJScore[k], totalScore)).padStart(9))
    }
  }
  console.log('')
  console.log('  ---- 出牌时堆有多厚（上面那条曲线的另一半）----')
  console.log('  〔收 N 张的**天花板**就在这儿：堆厚 < N−1 的那些手根本不可能收 N 张〕')
  let line = '   '
  for (let b = 0; b <= B; b++) {
    line += (b === B ? '≥' + b : '' + b) + ' ' + pct(avg(play[b], totalPlay)) + '　'
  }
  console.log(line)
  // ---- `DUMP_HIST=1`：把直方图按侧吐成机器可读的一行一条 ----
  //
  // 上面那张表是**两人合计**的，而要判「养堆在 f(N) 下翻不翻正」必须
  // 按侧分开（旋钮只给 ME 开，差值全在两侧之间）。所以这儿另出一份。
  //
  // 为什么离线重算是**精确**的，不是近似：
  //   对任何**单调递增**的 f，`argmax f(N) = argmax N` ——
  //   贪心挑牌（`ai.js` 比的是 caught）一张都不会变；
  //   `HOLD_MIN` 的门槛也是对 N 的门槛，同样不变。
  //   **两套打法在 f 下的出牌完全不动**，于是 Σ count(N)×f(N) 就是真分。
  //   它唯一答不了的是「会不会冒出第三种更优打法」。
  // ⚠ 这条前提**只对单调递增的 f 成立**。f 要是非单调（比如「收 4 张
  //   反而扣分」），贪心就会改挑别的牌，这份直方图当场失效。
  if (process.env.DUMP_HIST) {
    const tag = process.env.DUMP_HIST + (tagSuffix === undefined ? '' : '-' + tagSuffix)
    for (let s = 0; s < 2; s++) {
      const nm = (s === R.ME ? 'me' : 'foe')
      const all = []
      const jj = []
      for (let b = 0; b <= B; b++) {
        all.push(sum.catchHist[s][b])
        jj.push(sum.catchHistJ[s][b])
      }
      console.log('#HIST ' + tag + ' ' + nm + ' all ' + all.join(' '))
      console.log('#HIST ' + tag + ' ' + nm + ' J   ' + jj.join(' '))
    }
    console.log('#GAMES ' + tag + ' ' + g)
  }
  // ---- 两条行和自检 ----
  //
  // 分布是**另记一份**的，所以它跟 catches / caught / plays 对不上就说明
  // 记漏了一个出口（这个项目反复栽的「复制一份逻辑，两份必然分叉」）。
  // ⚠ 加权和那一条**溢出桶一进来就不成立**（它按下沿 B 计，真值更大），
  //   所以溢出桶非空时只报「≥」而不报等号
  const catches = sum.catches[0] + sum.catches[1]
  const caught = sum.caught[0] + sum.caught[1]
  const plays = sum.plays[0] + sum.plays[1]
  console.log('')
  console.log('  自检：收牌次数 ' + totalHit + ' == catches ' + catches
    + (totalHit === catches ? ' ✓' : ' ✗ 分布漏了一个出口'))
  console.log('  自检：出牌次数 ' + totalPlay + ' == plays ' + plays
    + (totalPlay === plays ? ' ✓' : ' ✗'))
  if (hit[B] > 0) {
    console.log('  自检：收牌张数 ' + totalCardN + ' ≤ caught ' + caught
      + (totalCardN <= caught ? ' ✓（溢出桶按下沿算，所以只能是 ≤）' : ' ✗'))
  } else {
    console.log('  自检：收牌张数 ' + totalCardN + ' == caught ' + caught
      + (totalCardN === caught ? ' ✓' : ' ✗ 分布的加权和对不上'))
  }
}

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
  //
  // ---- ⚠ **参考值现在有两套，按 `HOLD_ONCE` 分**〔2026-10-23 晚些〕 ----
  //
  // 决策层默认开了之后**五行的期望值全变了**（忍 1 手改的是打法，
  // 不只是计分）—— 两套都是 20000 局实测的：
  //
  //            钓到   钓到占比  每次平均收  积分   J占   J每次吃
  //   会忍（~~现默认~~）  7.1    30.8%     3.08     14.9   27.5%   3.63
  //   不忍（HOLD_ONCE=0） 7.7  33.3%  2.85     14.0   25.7%   3.25
  //
  // ⚠ 「现默认」那三个字**同日晚些就作废了**，见紧接着的下一段 —— 两行都是
  //   `JACK_HOLD=0`。留着不删是为了记住这一栏**翻过两次默认值**
  //
  // 「每人每局出牌 23」两套相同（局长由终局规则定，不由打法定）。
  //
  // ⚠ 写死一套的后果跟上面那条积分一样：**每跑一次都在说谎**，
  //   而且是往「看着正常」的方向说 —— 7.1 对着 7.7 的参考值只差 8%，
  //   没人会因此去查，于是「忍 1 手真的改了打法」这件事就被参考值盖住了。
  // ---- ⚠ **同一天晚些又分叉了一层：现在是三套**〔2026-10-23〕 ----
  //
  // `JACK_HOLD` 的默认值从 0 定成了 **3**（用户拍板，见 `ai.js` 那段），
  // 于是上面那两套**都不是现行默认了** —— 它们都在 `JACK_HOLD=0` 下量的。
  // 现行默认（不带任何 env）实测：
  //
  //            钓到   钓到占比  每次平均收  积分   J占   J每次吃
  //   守 J=3（现默认） 6.7    29.3%     3.25     16.6   26.3%   4.56
  //
  // 口径自检过了：这一套的按档汇总跟 `run-jack12.sh` 乙3 段**逐位相同**。
  //
  // ⚠ **`JACK_HOLD` 取 0/3 以外的 k（2、4、5）在 base 口径下没量过**
  //   —— `run-jack12.sh` 量的是 `pick` 过滤后的几行，不含这六个。
  //   所以那几档打 `?`，**不拿最近的一套顶上去**：顶上去就又是
  //   上面那条「往看着正常的方向说谎」，而这一次连 8% 的差都没有。
  //
  // ---- ⚠⚠ **2026-10-27：R5 定稿，整列第三次重量，而且这次 a/b 两套也废了** ----
  //
  // 同一天翻了三个默认值（`STEAL_ON`→开 / `SCORE_BANDS`→off / `HOLD_MIX`→keep），
  // 三个**都改这六行**，所以上面三套（含刚刚那一套「守 J=3」）全部作废：
  //
  //              钓到   钓到占比  每次平均收  积分   J占   J每次吃
  //   ~~R4 现默认~~ ~~6.7~~ ~~29.3%~~ ~~3.25~~ ~~16.6~~ ~~26.3%~~ ~~4.56~~
  //   ~~R5~~      ~~5.0~~ ~~21.4%~~ ~~4.41~~ ~~21.9~~ ~~32.4%~~ ~~5.43~~
  //   **R6 现默认**  5.5    21.7%     4.35    23.9   30.2%   5.44
  //
  //   〔R5 实测：`out-r5-base.txt`，20000 局，不带任何 env，分差 −0.06（se 0.10）〕
  //
  // ---- ⚠⚠ **2026-10-27 同日第二次：R6（`TAIL` 2→6），整列第四次重量** ----
  //
  // 这一次改的不是计分也不是 AI，是**终局长度**：牌库空后双方合计
  // 再打 6 手（各 3 手），把【抢牌】带来的先手优势推回 0
  //（−0.88 → +0.08，四档实测在 `rules.js` 的 `TAIL` 那段）。
  //
  // **R5 那一行跟着全废** —— 局长从 23.2 涨到 25.3 手/人（+9%），
  // 六个数里有五个在动。形状上是「多打两手 ⇒ 多钓 0.5 次」：
  // 钓到 5.0→5.5、积分 21.9→23.9，而每次收的张数**反倒薄了一点**
  //（4.41→4.35）—— 终局那几手是无补充阶段，堆养不厚。
  // J 占比 32.4%→30.2% 同一个因：多出来的那几次钓牌里 J 的比重低。
  //
  // ⚠ **R5 和 R6 的数一个都不能相减** —— 中间隔着一整条规则，
  //   而且隔的是**改局长**那一类（CLAUDE.md 第四节：按整回合算）。
  //   全表 40 件技能的 X 同样作废，要在 R6 下重跑一遍 `all`。
  //
  // 形状变了而不只是数变了：**钓牌次数掉三成、每次收的张数涨三成半**，
  // 乘起来守恒（积分 21.9 ≈ 张数）。抢牌把「收 2 张」这档几乎抹掉了
  //（P(2) 从 45.2% 掉到 4.1% 的占分 / 次数占比 9.9%），于是收成整体变厚。
  //
  // ⚠ **a / b 两套（`JACK_HOLD=0` 的两档）现在打 `?`** —— 它们是
  //   R4 + 无抢牌 + 硬阈值下量的，三个前提全没了。旧值留在上面划掉的那几行里，
  //   要用得在 R5 下重跑：`JACK_HOLD=0 node sim.js base -n 20000`
  //   （再加 `HOLD_ONCE=0` 拿 b 那一套）。
  //   **不拿 now 顶上去**，理由跟上面那条一模一样。
  //
  // ⚠ 别叫 `held` —— 这个函数下面（牌数守恒那段）已经有一个
  //   `const held = avg(sum.handLeft, g)`，同名会直接 SyntaxError
  const holdOn = AI.HOLD_ONCE
  const jk = AI.JACK_HOLD
  // 三套参考值：now = 现行默认（会忍 + 守 J=3）/ a = 会忍不守 J / b = 不忍不守 J
  const ref = function (now, a, b) {
    if (jk !== 0 && jk !== 3) return '?'
    if (!holdOn) return jk === 0 ? b : '?'
    return jk === 3 ? now : a
  }
  const rows = [
    // ⚠ 这一行原先写死 '23 次'，理由是「局长由终局规则定，不由打法定」——
    //   **抢牌破了那条**：被抢的那一方这一手不收牌，于是牌离场慢了半拍，
    //   一局多打 0.2 手（23.0 → 23.2）。所以它也进 `ref`
    ['每人每局出牌',
      f1(avg(sum.plays[R.ME], g)), f1(avg(sum.plays[R.FOE], g)),
      f1(both(function (s) { return avg(sum.plays[s], g) })),
    //   〔R6：局长不只由终局规则定了，`TAIL` 本身就是那条规则 ——
    //     2→6 把它从 23.2 推到 25.3〕
      ref('25.3 次', '?', '?')],
    ['每人每局钓到',
      f1(catches(R.ME)), f1(catches(R.FOE)), f1(both(catches)),
      ref('约 5.5 次', '?', '?')],
    ['钓到占出牌',
      pct(avg(sum.catches[R.ME], sum.plays[R.ME])),
      pct(avg(sum.catches[R.FOE], sum.plays[R.FOE])),
      pct(both(function (s) { return avg(sum.catches[s], sum.plays[s]) })),
      ref('21.7%', '?', '?')],
    ['每次平均收',
      f2(avg(sum.caught[R.ME], sum.catches[R.ME])),
      f2(avg(sum.caught[R.FOE], sum.catches[R.FOE])),
      f2(both(function (s) { return avg(sum.caught[s], sum.catches[s]) })),
      ref('4.35 张', '?', '?')],
    // ⚠ 期望值那一栏**必须跟着口径走**〔2026-10-23〕。R4（分档）下是 14.0、
    //   退回「分 = 张数」才是 21.8。
    //   写死 21.8 的话 R4 每跑一次都在说谎 —— 而旁边四列（出牌 / 钓到 /
    //   钓到占比 / 每次平均收）**两档逐位相同**，所以它们的期望值不用分叉
    //   〔实证 `out-r4.txt` 甲 vs 乙段；原因是 `scoreWith` 对 n 单调不减，
    //     加上「平手取张数多」那条 tie-break → `argmax score == argmax n`〕
    //
    // ⚠ **2026-10-27：「分 = 张数」这一支现在有两个数，按抢牌分**
    //   —— R3（张=分 + 无抢牌）21.8，**R5（张=分 + 抢牌）21.9**。
    //   两者都是「分 = 收走的张数」，差的那 0.1 是终局剩堆的分布变了
    //   （抢牌让牌离场慢半拍，局末手里/堆上剩的牌多一点点）。
    //   它们**不能相减** —— 中间隔着一整条规则。
    ['每人每局积分',
      f1(perGame(R.ME)), f1(perGame(R.FOE)), f1(both(perGame)),
    // ⚠ **2026-10-27 再分一层：`TAIL`**。原先只按抢牌分两档
    //   （21.9 / 21.8），而那两个数都是 `TAIL=2` 下量的 ——
    //   R6 把终局拉到 6 手，局长 +9%，积分跟着到 **23.9**。
    //   「无抢牌」那一支在 R6 下**没量过**，所以打 `?` 而不是沿用 21.8：
    //   沿用就是上面反复写的那条「往看着正常的方向说谎」。
    //   要补它：`STEAL_ON=0 node sim.js base -n 20000`
      R.SCORE_BANDS === null
        ? (R.TAIL === 6
          ? (R.STEAL_ON ? '约 23.9 分' : '?')
          : (R.TAIL === 2 ? (R.STEAL_ON ? '约 21.9 分' : '约 21.8 分') : '?'))
        : ref('约 16.6 分', '约 14.9 分', '约 14.0 分')],
    ['J 通吃占所有钓牌',
      pct(avg(sum.jackCatches[R.ME], sum.catches[R.ME])),
      pct(avg(sum.jackCatches[R.FOE], sum.catches[R.FOE])),
      pct(both(function (s) { return avg(sum.jackCatches[s], sum.catches[s]) })),
      ref('30.2%', '?', '?')],
    // ---- 【养堆】诊断口〔2026-10-22〕：J 一下吃多肥 ----
    //
    // 上面那一行（J 占所有钓牌）**答不了「要不要忍 J」** —— J 迟早都会
    // 打出去，忍不忍那个百分比都差不多。这一行才是：`JACK_HOLD` 开了
    // 之后它要是**纹丝不动**，说明那道闸根本没咬上（堆本来就够厚），
    // 两列的分差就不能当养堆的价值读。
    // 参考值是现行代码上的基线，没量过之前留空
    // 标签**故意不带空格**（不写「J 每次吃几张」）—— 上面那一行
    // 「J 通吃占所有钓牌」里的空格会把 awk 的字段号错开一位，
    // 取数脚本在它身上栽过（run-flood-each.sh 那个 $5/$6）
    ['J每次吃几张',
      f2(avg(sum.jackTook[R.ME], sum.jackCatches[R.ME])),
      f2(avg(sum.jackTook[R.FOE], sum.jackCatches[R.FOE])),
      f2(both(function (s) { return avg(sum.jackTook[s], sum.jackCatches[s]) })),
      // 2026-10-23 三档都量了（各 20000 局），不再是「没量过」
      // ⚠ 这一行是**守 J 咬合与否最灵敏的一格**（上面那段注释说的就是它）：
      //   ~~3.63 → 4.56，涨了 0.93 张~~。它要是跟不守 J 那档一样，闸没咬上
      // ⚠ R5 下是 **5.43**（抢牌让 J 更晚打出去 —— J 是最强的抢牌工具，
      //   所以它常常被留到「对方匹配上了」那一刻才用，那时堆最肥）
      ref('5.43 张', '?', '?')]
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
    //   ⚠ 那个 3.7% 是 **R3** 的；R4 现行默认实测 **3.5%**〔2026-10-23〕；
    //     **R5（抢牌 + 张=分 + 按概率忍）实测 2.9%**〔2026-10-27〕——
    //     又少一截，因为抢牌把收成拉厚、分差更容易拉开。
    //     胜率那个「约 48%」三档都对（R4 48.0% / R5 48.4%），所以下面没分叉
    //
    // **默认值跟 rules.js 一致（'old'）** —— 那边 2026-10-15 把默认从
    // pileNotLast 换过来了，这儿读 env 要用同一个默认，不然不设变量时报错档
    + ((process.env.BALANCE || 'old') === 'old'
      ? '（现行约 48%）' : '（剩堆归没打最后一手的那档：约 46.5%）')
    + '· 先手 ' + pct(avg(sum.wins[R.FOE], g))
    + ' · 平局 ' + pct(avg(sum.draws, g)))
  console.log('  后手分差（你 − 庄家）：' + (meanDiff(sum) >= 0 ? '+' : '') + f2(meanDiff(sum))
    + ' 分（标准误 ' + f2(stderrOf(sum)) + '）—— 量技能时要扣掉这个数')

  // ---- 【抢牌】的诊断口：只在旋钮开着时印〔2026-10-27〕 ----
  //
  // 用户把考量标准定成**平均收牌张数**（「牌堆常态就不适合作为考量标准
  // 了，应该把平均收牌张数作为考量标准」），所以这一段的主角是
  // **拆路之后那四格**，不是「抢了几次」。
  //
  // ⚠⚠ **上面那行「每次平均收」在抢牌下会涨，而那涨幅是同义反复** ——
  //   抢牌的判定条件**就是**「收得比对方多」，于是抢来的每一手
  //   天生落在分布右端。混在一个平均里报，「抢牌提高了平均收牌张数」
  //   这句话不含任何信息量。真正要读的是**非抢那两路有没有动**：
  //     动了   ⇒ 抢牌改变了双方的养堆行为（用户预测的那条机制：
  //              「我手里有对子，在堆底打出 1 张 3 后就可以放心堆牌了」）
  //     没动   ⇒ 它只是把同样的牌换了个人收，总量没变
  //
  // ⚠ `R.STEAL_ON` 从模块取，**不读 env** —— 照 `JACK_HOLD` 那条
  //   （不写 env 时 `process.env.X || '-'` 会打 `-`，而 `-` 在说
  //   「这一跑没开」，那是最坏的一种谎）
  if (R.STEAL_ON) {
    console.log('')
    console.log('  ---- 抢牌诊断（STEAL_ON=1 · '
      + (R.STEAL_AGAIN ? '可反复互抢' : '单轮') + '）----')
    const sideName = function (s) { return s === R.ME ? '你  ' : '庄家' }
    for (let s = 0; s < 2; s++) {
      const foe = s === R.ME ? R.FOE : R.ME
      // 「被问」= 这一方匹配成功、规则问了对方要不要抢。
      // `able/asked` 是**抢牌这条规则的咬合率** —— 它接近 0 的话
      // 这条规则在实战里等于不存在，后面所有数都不用读了
      console.log('    ' + sideName(s)
        + '  匹配成功 ' + f2(avg(sum.stAsked[s], g)) + ' 次/局'
        + ' → 对方能抢 ' + pct(avg(sum.stAble[s], sum.stAsked[s]))
        + '　被抢掉 ' + f2(avg(sum.stLost[s], g)) + ' 张/局')
      if (sum.stStolen[s] > 0) {
        console.log('    ' + sideName(s)
          + '  抢走 ' + f2(avg(sum.stStolen[s], g)) + ' 次/局'
          + '（其中 J 抢 ' + pct(avg(sum.stByJack[s], sum.stStolen[s])) + '）'
          // ⚠ `gain` 是**预估**（`catchCountAt` 算的）、`took` 是**实收**
          //   （`collect` 返回的）。两者该接近，差出来的是叠放 / 保护 /
          //   结冰（预估不含那三样）。差得离谱 ⇒ 口径接错了，这是免费自检
          + '　实收 ' + f2(avg(sum.stTook[s], sum.stCatches[s])) + ' 张/次'
          + '（预估 ' + f2(avg(sum.stGain[s], sum.stStolen[s])) + '）')
      }
      // 「对方能抢」那个百分比**是个合成量**，这一行把它拆开〔2026-10-27〕。
      // 分母一律 `stAsked`（每问一次记一笔），理由见 rules.js `stat.steal` 那段
      console.log('    ' + sideName(s)
        + '  └ 拆开：这手本来能收 ' + f2(avg(sum.stMine[s], sum.stAsked[s])) + ' 张'
        + '　问时堆厚 ' + f2(avg(sum.stPileAt[s], sum.stAsked[s]))
        + '　对方手里 ' + f2(avg(sum.stFoeHand[s], sum.stAsked[s])) + ' 张'
        + ' / 能超过 ' + f2(avg(sum.stOver[s], sum.stAsked[s])) + ' 张'
        + '（密度 ' + pct(avg(sum.stOver[s], sum.stFoeHand[s])) + '）')
    }
    // 读这四个数的**唯一正确姿势**：先看「这手本来能收」差多少。
    //
    // 门槛是**严格大于 `myCount`**，所以 myCount 低 1 张 ≈ 把抢牌门槛
    // 整降一档 —— 它比「对方手里有几张」更能解释转化率的差。
    // 两边 myCount 一样时才轮到「超越密度」，再往后才是堆厚。
    //
    // ⚠ 别拿这四个数去跟**别的口径**的跑相减：`base` 走自由切牌
    //   （`freeFirst`），而其余命令是固定庄家先手 —— 要读先后手的差
    //   必须 `CUT=0`（庄家恒先手），不然「你/庄家」是**座位**不是先后手
    //
    // ---- 再把可抢率按 `myCount` 分档，拆「构成差 / 档内差」 ----
    //
    // 上面那四个口只说了「后手的匹配薄 0.05 张」，而薄**怎么**变成
    // 可抢率高 1.9pp 有两条路，补偿方向相反（见 rules.js `mAsk` 那段）：
    //   每档可抢率两边一样  ⇒ 纯构成差，真因在「为什么后手打得薄」
    //   每档可抢率后手更高  ⇒ 档内差，那 0.05 只是陪跑
    console.log('    可抢率按「这手本来能收几张」分档（占比 % · 该档可抢率）：')
    {
      // Σ mAsk == asked 是一条免费自检 —— 对不上就是直方图没接在
      // 跟 `asked++` 同一条路上（而那种分叉是静默的）
      const chk = [0, 0]
      for (let s = 0; s < 2; s++) {
        for (let b = 0; b < sum.stMAsk[s].length; b++) chk[s] += sum.stMAsk[s][b]
      }
      for (let b = 0; b < sum.stMAsk[R.ME].length; b++) {
        if (sum.stMAsk[R.ME][b] + sum.stMAsk[R.FOE][b] === 0) continue
        let line = '      收 ' + (b === 8 ? '8+' : '' + b) + ' 张：'
        for (let s = 0; s < 2; s++) {
          line += '  ' + (s === R.ME ? '你' : '庄家') + ' '
            + pct(avg(sum.stMAsk[s][b], chk[s])) + ' · 可抢 '
            + pct(avg(sum.stMAble[s][b], sum.stMAsk[s][b]))
        }
        console.log(line)
      }
      for (let s = 0; s < 2; s++) {
        if (chk[s] !== sum.stAsked[s]) {
          console.log('    ⚠ 直方图对不上：Σ mAsk=' + chk[s]
            + ' 但 asked=' + sum.stAsked[s] + ' —— 两处没接在同一条路上')
        }
      }
    }
    // ---- 收牌拆四路：**必须互斥**，而「抢」和「J」本来有交集 ----
    //
    // J 抢牌那一手同时落进 `jackCatches` 和 `steal.catches`，所以
    // 减两次要加回一次（容斥）。不加回的话「普通匹配」那一格的
    // 分母偏小、每次张数偏大 —— 而它正是这一轮最该看准的一格
    console.log('    收牌拆四路（次数/局 · 每次张数 —— 四路互斥，和 == 总钓牌）：')
    const paths = [
      ['普通匹配  ',
        sum.catches[R.ME] + sum.catches[R.FOE]
          - (sum.jackCatches[R.ME] + sum.jackCatches[R.FOE])
          - (sum.stCatches[R.ME] + sum.stCatches[R.FOE])
          + (sum.stJCatches[R.ME] + sum.stJCatches[R.FOE]),
        sum.caught[R.ME] + sum.caught[R.FOE]
          - (sum.jackTook[R.ME] + sum.jackTook[R.FOE])
          - (sum.stTook[R.ME] + sum.stTook[R.FOE])
          + (sum.stJTook[R.ME] + sum.stJTook[R.FOE])],
      ['J 通吃    ',
        sum.jackCatches[R.ME] + sum.jackCatches[R.FOE]
          - (sum.stJCatches[R.ME] + sum.stJCatches[R.FOE]),
        sum.jackTook[R.ME] + sum.jackTook[R.FOE]
          - (sum.stJTook[R.ME] + sum.stJTook[R.FOE])],
      ['抢·非J    ',
        sum.stCatches[R.ME] + sum.stCatches[R.FOE]
          - (sum.stJCatches[R.ME] + sum.stJCatches[R.FOE]),
        sum.stTook[R.ME] + sum.stTook[R.FOE]
          - (sum.stJTook[R.ME] + sum.stJTook[R.FOE])],
      ['抢·J      ',
        sum.stJCatches[R.ME] + sum.stJCatches[R.FOE],
        sum.stJTook[R.ME] + sum.stJTook[R.FOE]]
    ]
    let ckN = 0
    let ckC = 0
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i]
      ckN += p[1]
      ckC += p[2]
      console.log('      ' + p[0] + f2(avg(p[1], g * 2)) + ' 次 · '
        + f2(avg(p[2], p[1])) + ' 张')
    }
    const allN = sum.catches[R.ME] + sum.catches[R.FOE]
    const allC = sum.caught[R.ME] + sum.caught[R.FOE]
    if (ckN !== allN || ckC !== allC) {
      console.log('    ⚠⚠ 四路和对不上总数（次数 ' + ckN + ' vs ' + allN
        + ' · 张数 ' + ckC + ' vs ' + allC + '）—— 容斥写错了或多了一条收牌路，'
        + '**这张表不能读**')
    }
    if (sum.stAsked[R.ME] + sum.stAsked[R.FOE] === 0) {
      console.log('    ⚠ STEAL_ON=1 却一次都没问过 —— `stealTry` 没接上，'
        + '查代码别解释数')
    }
  }

  // ---- 【养堆】的诊断口：只在旋钮开着时印〔2026-10-22〕 ----
  //
  // 用户定的对照实验：「一方有匹配就打，一方养堆直到 3/4/5 张才收」。
  // **分差一个数答不了它** —— 「忍 2 次换一个大的」和「忍 12 次换一个
  // 大的」能得出同一个分差，而两者对设计的含义相反。
  if (sum.holdSkip[R.ME] + sum.holdSkip[R.FOE] > 0) {
    console.log('')
    // ⚠ `JACK_HOLD` 从 `AI` 取，**不读 env**〔2026-10-23 默认 0 → 3〕——
    //   跟下面那段「忍 1 手诊断」同一条规矩、同一个理由：
    //   不写 env 时 `process.env.JACK_HOLD || '-'` 会打 `-`，而 `-` 在说
    //  「这一跑没守闸」，实际守着 3 张。`HOLD_MIN` 默认仍是 0，可以读 env
    console.log('  ---- 养堆诊断（HOLD_MIN=' + (process.env.HOLD_MIN || '-')
      + ' / JACK_HOLD=' + (AI.JACK_HOLD || '关') + '）----')
    for (let s = 0; s < 2; s++) {
      if (sum.holdSkip[s] === 0) continue
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  忍了 ' + f2(avg(sum.holdSkip[s], g)) + ' 手/局'
        + '（占出牌 ' + pct(avg(sum.holdSkip[s], sum.plays[s])) + '）'
        + '　每次放弃 ' + f2(avg(sum.holdSkipSum[s], sum.holdSkip[s])) + ' 张'
        + '　合计放弃 ' + f2(avg(sum.holdSkipSum[s], g)) + ' 张/局')
      // 忍不住的那些手：手里全是能钓到的牌，只好照打。
      // **这一行不补的话上面那个「忍了 N 手」是虚的** —— 第一跑就是
      // 这么栽的（`HOLD_MIN=3` 的「收 2 张」本该是 0，量出 1.72 次/局）
      if (sum.holdForced[s] > 0) {
        console.log('    ' + (s === R.ME ? '你  ' : '庄家')
          + '  其中**忍不住** ' + f2(avg(sum.holdForced[s], g)) + ' 手/局'
          + '（占忍的 ' + pct(avg(sum.holdForced[s], sum.holdSkip[s])) + '）'
          + ' —— 手里全是能钓到的牌，只好照打')
      }
    }
    console.log('    〔「合计放弃」要跟分差一起读：它是**账面成本**，'
      + '而分差是净值 —— 两者的差就是养堆真正赚回来的那部分〕')
  }

  // ---- 【忍 1 手】的诊断口：**这一组才是验收判据**〔2026-10-22〕 ----
  //
  // 用户的话：「等到对局 AI 开始考虑是忍 1 手还是现在就收，这个改动才是合格的」。
  // 那不是一个分差能答的 —— 分差 0 可能是「从没忍过」，也可能是
  // 「忍了很多次、赚的赔的正好抵消」，而两者对设计的含义完全相反。
  //
  // 合格要**两条一起**〔2026-10-22 第一跑之后加的第二条〕：
  //
  //   甲 `忍了` 不为 0，而且 **hit / miss 两边都不空** ——
  //      全 hit = 忍是白给的（没有赌，又变回最优解法了）；
  //      全 miss = 忍是纯亏的（没人会忍，等于没加这个决策）。
  //   乙 **上面那一行的「后手分差」≥ 0** —— 忍不能是严格劣势策略。
  //
  // ⚠ 乙是第一跑逼出来的：四组档值**全部满足甲**（hit 24~28% / miss 63~66%），
  //   而分差是 −1.24 ~ −3.33。光有甲会放行一个「忍了必亏、所以没人会忍」
  //   的设计 —— 那正是用户要去掉的「永远有最优解法」，只是换了个解法。
  //
  // ⚠ 闸上**带了 `holdCapped`**：`HOLD_BAND_MAX` 要是把所有忍都拦掉，
  //   `holdOnce` 就是 0，整段诊断连同那个计数口一起不打 ——
  //   而「一次都没忍」恰恰是最该看见的结果，不是该被静默掉的结果。
  if (sum.holdOnce[R.ME] + sum.holdOnce[R.FOE]
    + sum.holdCapped[R.ME] + sum.holdCapped[R.FOE]
    + sum.holdEvFlip[R.ME] + sum.holdEvFlip[R.FOE]
    + sum.holdEvN[R.ME] + sum.holdEvN[R.FOE] > 0) {
    console.log('')
    // ⚠ **凡是默认值翻过的，一律从 rules / ai 取，不读 env**〔2026-10-23〕——
    //   `SCORE_BANDS`=1,4,12、`HOLD_RUN` 锁死 1、`HOLD_ONCE` / `HOLD_EV` /
    //   `HOLD_BOTH` 默认开。读 env 的话「不写」会打成 `-`，而那是在说谎：
    //   `-` 在说「没开」，实际开着。这一行是整段诊断的口径标签，
    //   它说谎的代价是**一整批数被记成另一个口径的数**。
    console.log('  ---- 忍 1 手诊断（SCORE_BANDS='
      + (R.SCORE_BANDS ? R.SCORE_BANDS.join(',') : 'off')
      + ' / HOLD_ONCE=' + (AI.HOLD_ONCE ? '开' : '关')
      + ' / HOLD_BOTH=' + (AI.HOLD_BOTH ? '两侧' : '只有你')
      + ' / HOLD_LEAD=' + (process.env.HOLD_LEAD || '-')
      + ' / HOLD_RUN=' + AI.HOLD_RUN + '（锁死）'
      + ' / HOLD_BAND_MAX=' + (process.env.HOLD_BAND_MAX || '-')
      + ' / HOLD_P=' + (process.env.HOLD_P || '100')
      + ' / HOLD_EV=' + (AI.HOLD_EV ? '开' : '关')
      // 第四个翻过默认的〔2026-10-23，0 → 3〕，同样从 AI 取
      + ' / JACK_HOLD=' + (AI.JACK_HOLD || '关')
      + ' / HOLD_EV_FOE=' + (process.env.HOLD_EV_FOE || '1') + '）----')
    for (let s = 0; s < 2; s++) {
      if (sum.holdOnce[s] === 0) continue
      const n = sum.holdOnce[s]
      const hit = sum.holdOnceHit[s]
      const miss = sum.holdOnceMiss[s]
      // ⚠ **这儿打的是「放掉 / 收回」两个毛数，不打它们的差。**
      //   第一版打的是「净赚 +2.28 分/局」，而同一跑的分差是 −3.06 ——
      //   两个数反向。反向不是噪声：在贪心世界里那两次收牌**都拿得到**，
      //   忍把两次并成一次，而那个差只扣了前一次的档值、没扣掉「少收一次」。
      //   毛数不会骗人，差会 —— 所以差不打了，净值去看上面那行分差。
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  忍了 ' + f2(avg(n, g)) + ' 手/局'
        + '　升档 ' + pct(avg(hit, n))
        + '　没升 ' + pct(avg(miss, n))
        + '　放掉 ' + f2(avg(sum.holdOnceGave[s], g))
        + ' / 收回 ' + f2(avg(sum.holdOnceGot[s], g)) + ' 分每局')
      // ⚠ 这一行不能省：忍完**再也没收到牌**的那些次（局结束了、
      //   或者后面一直配不上）既不是 hit 也不是 miss，
      //   不单列的话上面那两个百分比加起来不到 100%，看着像算错了
      const dangle = n - hit - miss
      if (dangle !== 0) {
        console.log('      其中 ' + pct(avg(dangle, n)) + ' **忍完再没收到牌**'
          + '（局结束 / 后面一直配不上。⚠ `HOLD_RUN` 2026-10-23 锁死在 1，'
          + '所以这一栏**不再含连忍**；读历史数据时它含）'
          + ' —— 这些的「放掉」记了、「收回」是 0')
      }
    }
    // ---- HOLD_RUN 的计数口：**锁死 1 拦掉了多少**〔2026-10-23〕 ----
    //
    // 它回答的是「把连忍锁死在 1 手，到底改了几次决策」。在这之前
    // 这个问题只能从分差残差反推 —— 台账里那条 ⚠ 标的就是那个弱证据。
    //
    // ⚠ **这是上界，不是精确值**（理由写在 ai.js 那道闸上：
    //   要精确得把闸挪到 EV 之后，而那会污染 `holdEvN` / `holdEvYes`）。
    //   上界已经滤掉了「升不了档」的手 —— 那些在闸后面也活不过两行。
    //
    // ⚠ **不跟 env 挂钩，永远打**：`HOLD_RUN` 是写死的常量，
    //   没有「没开这个旋钮」这种状态。而 0 本身是个结论
    //   （锁死没花钱），不是该被静默掉的空值。
    for (let s = 0; s < 2; s++) {
      if (!sum.holdRunBlocked[s]) continue
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  想连忍被拦下 ≤' + f2(avg(sum.holdRunBlocked[s], g)) + ' 手/局'
        + '（已忍过 1 手、这一手还升得了档，被 HOLD_RUN=1 拦回去收了。'
        + '上界：里面还含「EV 本来也判不忍」的那些）')
    }
    if (!sum.holdRunBlocked[R.ME] && !sum.holdRunBlocked[R.FOE]) {
      console.log('    连忍上限一次都没拦下 —— 这一跑里 HOLD_RUN=1 没花钱，')
      console.log('    放开它也不会变（**上界是 0，所以这一条是结论不是弱证据**）。')
    }
    // ---- HOLD_BAND_MAX 的计数口 ----
    //
    // 它回答的是「**这个旋钮到底改了几次决策**」。两种读法都要命：
    //   0 次  = 这支代码没触发过 → 这一跑跟不设上限是同一跑，
    //           别把它当成「用户说得对」的证据
    //   很多  = 上限真的在拦 → g1 末档系数的变化才是它造成的
    if (process.env.HOLD_BAND_MAX) {
      for (let s = 0; s < 2; s++) {
        if (!sum.holdCapped[s]) continue
        console.log('    ' + (s === R.ME ? '你  ' : '庄家')
          + '  被档位上限拦下 ' + f2(avg(sum.holdCapped[s], g)) + ' 手/局'
          + '（本来会忍、因为目标落在第 '
          + (parseInt(process.env.HOLD_BAND_MAX, 10) + 2) + ' 档往后而改收）')
      }
      if (!sum.holdCapped[R.ME] && !sum.holdCapped[R.FOE]) {
        console.log('    ⚠ **档位上限一次都没拦下** —— 这一跑等同于不设上限，')
        console.log('      它的数不能当成「限制打法之后的数」用。')
      }
    }
    // HOLD_P 的计数口。同一个道理：翻了 0 次 = 这一跑等同于不折
    if (process.env.HOLD_P && process.env.HOLD_P !== '100') {
      for (let s = 0; s < 2; s++) {
        if (!sum.holdEvFlip[s]) continue
        console.log('    ' + (s === R.ME ? '你  ' : '庄家')
          + '  期望值折扣改掉 ' + f2(avg(sum.holdEvFlip[s], g)) + ' 次判断/局'
          + '（不折会忍、折完不值）')
      }
      if (!sum.holdEvFlip[R.ME] && !sum.holdEvFlip[R.FOE]) {
        console.log('    ⚠ **期望值折扣一次都没改变判断** —— 这一跑等同于 HOLD_P=100。')
      }
    }
    // ---------- 【埋锚】/【够得着才养堆】的计数口〔2026-10-27〕 ----------
    //
    // **永远打，不跟 env 挂钩** —— 两对数关着也记，而关着那一跑正是对照组
    //（见 sum 那一段的 ⚠）。跟 env 挂钩的话对照组看不见自己的基准值，
    // 于是「开了之后变没变」就得靠跨跑相减，而那是台账上栽过的事。
    console.log('  ---- 【埋锚】/【够得着才养堆】（用户 2026-10-27 的两条规格）----')
    // ⚠ 两个开关的状态**从 `AI` 取**，别在这儿写 `process.env.X === '1'` ——
    //   那是 `ai.js` 导出块那几条墓碑的形状：默认值哪天一翻，这份副本当场
    //   说谎，而且说的谎是「这一跑没开」（最坏的一种）
    console.log('    HOLD_ANCHOR=' + (AI.HOLD_ANCHOR ? '1 开' : '关')
      + '  HOLD_REACH=' + (AI.HOLD_REACH ? '1 开' : '关')
      + '  HOLD_MIX=' + AI.HOLD_MIX)
    // 【按概率忍】的计数口。⚠ 开着这一跑的局面流跟别的跑**不是同一批牌**
    //（掷骰子要从 `G.rng` 取数，见 ai.js 那段 ⚠⚠）
    for (let s = 0; s < 2; s++) {
      if (!sum.mixOn[s]) continue
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  掷骰 ' + f2(avg(sum.mixOn[s], g)) + ' 次/局'
        + '，平均概率 ' + pct(avg(sum.mixPsum[s], sum.mixOn[s]))
        + '　**改掉的决策**：多忍了 ' + f2(avg(sum.mixAdd[s], g))
        + ' 次/局、少忍了 ' + f2(avg(sum.mixDrop[s], g)) + ' 次/局'
        + '（合计占掷骰的 '
        + pct(avg(sum.mixAdd[s] + sum.mixDrop[s], sum.mixOn[s])) + '）')
    }
    if (AI.HOLD_MIX !== 'off' && !sum.mixOn[R.ME] && !sum.mixOn[R.FOE]) {
      console.log('    ⚠ **HOLD_MIX 设了却一次都没掷骰** —— 它只在 `HOLD_EV`')
      console.log('      那一支里，`HOLD_EV=0` 的话整段到不了。先查代码。')
    }
    for (let s = 0; s < 2; s++) {
      const bury = sum.anchorBury[s]
      const none = sum.anchorNone[s]
      if (bury + none === 0) continue
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  扔出去的饵**自己还收得回来** ' + pct(avg(bury, bury + none))
        + '（' + f2(avg(bury, g)) + ' / ' + f2(avg(bury + none, g)) + ' 次每局）')
    }
    if (!sum.anchorBury[R.ME] && !sum.anchorBury[R.FOE]
      && (sum.anchorNone[R.ME] || sum.anchorNone[R.FOE])) {
      console.log('    ⚠ **一次都没埋到带钥匙的饵** —— 手里从来没有对子是不可能的，')
      console.log('      所以这更像是 `keysFor` 没接上（口径瞎了），先查代码再解释数。')
    }
    for (let s = 0; s < 2; s++) {
      const deep = sum.reachDeep[s]
      const shal = sum.reachShal[s]
      if (deep + shal === 0) continue
      const on = AI.HOLD_REACH
      console.log('    ' + (s === R.ME ? '你  ' : '庄家')
        + '  忍的时候**够得着堆底**（a 支）' + f2(avg(deep, g)) + ' 手每局'
        + '；够不着（b 支）' + f2(avg(shal, g)) + ' 手每局'
        + '  = ' + pct(avg(deep, deep + shal)) + ' 是 a'
        + (on ? '（b 支已被这道闸拦掉、没真忍）' : '（旋钮关着，b 支照旧忍了）'))
    }
    // ---------- HOLD_EV：真算概率那一套的诊断口 ----------
    //
    // 三件事要在这儿看得见，而且**缺一件就会误读**：
    //
    //   一、「算了几次 / 忍了几次」—— 忍的比例落在 0% 或 100% 的话，
    //       这个 AI 还是个阈值开关，只是阈值挪了位置，**没有决策**；
    //   二、「它信的成功率」vs 事后实测的升档率 —— 对不上说明模型有偏，
    //       而光看 X 永远查不出来（`HOLD_P=25` 就是这么混过去的）；
    //   三、**按用户那三条分桶** —— 外面还剩 0 张那一桶该几乎全忍
    //       （「极力推荐」），剩 2 张那一桶该很少忍。三桶的忍率
    //       要是长得一样，那就是概率没真的进判据。
    // ⚠ 闸从 `process.env.HOLD_EV === '1'` 换成 `AI.HOLD_EV`〔2026-10-23〕——
    //   默认值翻成开之后那个 env 判定恒 false，**整段诊断会静默消失**，
    //   而消失的正好是上面这三件「缺一件就会误读」的东西
    if (AI.HOLD_EV) {
      for (let s = 0; s < 2; s++) {
        if (!sum.holdEvN[s]) continue
        const n = sum.holdEvN[s]
        const yes = sum.holdEvYes[s]
        console.log('    ' + (s === R.ME ? '你  ' : '庄家')
          + '  算了 ' + f2(avg(n, g)) + ' 次/局'
          + '　判忍 ' + pct(avg(yes, n))
          + '　它信的成功率 ' + (yes ? pct(sum.holdEvPsum[s] / yes) : '—'))
        // 【HOLD_EV_SPLIT 的诊断口】「平」拆开之后两支各占多少，
        // 以及没拆时高估了多少分。**旋钮关着也打**，所以这一行就是
        // 「拆了值不值」的对照 —— 高估那一截≈0 的话，拆了也白拆
        console.log('      　　其中「平」拆两支：浅层被吃 '
          + pct(avg(sum.holdEvPShal[s], n))
          + '　只有饵被吃 ' + pct(avg(sum.holdEvPBait[s], n))
          + '　**没拆时每次高估 ' + f2(avg(sum.holdEvOver[s], n)) + ' 分**'
          // ⚠ **从 AI 取，别在这儿重写一遍 env 判断** —— 2026-10-23 默认值
          //   从「关」翻成「开」，写死 `=== '1'` 的那份副本当场就会说谎
          + (AI.HOLD_EV_SPLIT ? '（已拆）' : '（没拆）'))
        // 用户那三条判据，一桶一行
        // ⚠ 桶键是**目标点数**外面还剩几张，而判据里的 `d` 比它大 ——
        //   `holdEV` 把所有「能切到我目标那一格或更深」的点数都算进 `d`，
        //   而 **J 通吃（catchStart 返回 0）所以 J 永远在 `d` 里**。
        //   于是「外面还剩 0 张」**不等于**对手拿不走：他还可能有 J。
        //   这一行原先写的是「对手不可能有」，那句话是错的〔2026-10-23 改〕
        const tag = ['外面还剩 0 张（已收 2 张；对手仍可能有 J）',
          '外面还剩 1 张', '外面还剩 2 张以上']
        for (let b = 0; b < 3; b++) {
          const bn = sum.holdEvOut[s][b]
          if (!bn) continue
          // 【按桶兑现率】〔2026-10-27，用户的 c〕判忍率是**信念**，
          // 这一截是**结果**。两者差得远的那一格就是模型在那儿骗自己。
          //
          // ⚠ 分母是「**结过账的笔数**」，不是判忍次数 —— 两者不等，
          //   差额是「判了忍、可后面一直没收到牌」那些（整体口径下约 5%）
          //   以及被 `HOLD_BAND_MAX` / `HOLD_REACH` 这类后置闸拦掉的。
          //   拿判忍次数当分母会把兑现率系统性压低，而那是个看不出来的偏差
          const hb = sum.holdOnceHitB[s][b]
          const mb = sum.holdOnceMissB[s][b]
          console.log('        ' + tag[b] + '：遇到 ' + f2(avg(bn, g))
            + ' 次/局，判忍 ' + pct(avg(sum.holdEvOutYes[s][b], bn))
            + (hb + mb > 0
              ? '　忍完**真升档** ' + pct(avg(hb, hb + mb))
                + '（结账 ' + (hb + mb) + ' 笔）'
              : '　⚠ 一笔账都没结过（查代码，别解释数）'))
        }
        // 从哪一档起忍。用户：「2 升 4 的例子，3 升 5 一样的算法；
        // 4 升 6 也可以算，但我相信一定是不推荐忍的」—— 第二行就是那句的检验
        const ftag = ['2/3 档起（2→4、3→5）', '4/5 档起（4→6）', '6 张及以上起']
        for (let b = 0; b < 3; b++) {
          const bn = sum.holdEvFrom[s][b]
          if (!bn) continue
          console.log('        ' + ftag[b] + '：遇到 ' + f2(avg(bn, g))
            + ' 次/局，判忍 ' + pct(avg(sum.holdEvFromYes[s][b], bn)))
        }
        // 情况 3 × 牌组厚度。用户：「我希望在情况 3 且牌组还很厚的条件下，
        // 忍 1 手还是有价值的，4/5 档的积分要有这样的价值」
        // ⚠ 30 / 15 是报表切点，不进判据（判据里的厚度是 missP 连乘的那个 U）
        const ttag = ['情况 3 · 牌组厚（没见过的 ≥ 30 张）← **这一格是验收线**',
          '情况 3 · 牌组中（15~29 张）', '情况 3 · 牌组薄（≤ 14 张）']
        for (let b = 0; b < 3; b++) {
          const bn = sum.holdEvThick[s][b]
          if (!bn) continue
          console.log('        ' + ttag[b] + '：遇到 ' + f2(avg(bn, g))
            + ' 次/局，判忍 ' + pct(avg(sum.holdEvThickYes[s][b], bn)))
        }
      }
      if (!sum.holdEvN[R.ME] && !sum.holdEvN[R.FOE]) {
        console.log('    ⚠ **EV 一次都没算过** —— 决策点没到达（多半是 HOLD_ONCE 没开），')
        console.log('      这一跑跟 HOLD_EV=0 是同一跑。')
      } else {
        console.log('    〔判忍率落在 0% 或 100% = 还是阈值开关，**没有决策**；')
        console.log('      三桶的判忍率要拉得开 —— 拉不开就是概率没真进判据。')
        console.log('      「它信的成功率」要跟上面那行实测的「升档」对得上，')
        console.log('      对不上说明模型有偏，而光看分差查不出来。')
        console.log('      起始档那三行：**「4/5 档起」的判忍率该远低于「2/3 档起」**。')
        console.log('      它不是写死的（没开 HOLD_BAND_MAX 就没有任何上限拦它），')
        console.log('      所以那一行高了的话，是模型跟直觉打架，得查谁对。')
        console.log('      情况 3 那三行：**「牌组厚」那一格的判忍率要明显高于「牌组薄」**，')
        console.log('      而且厚的那一格本身不能贴着 0% —— 贴着 0% 就是 4/5 档的 b 还没给够。〕')
      }
    }
    console.log('    〔验收要**两条一起**：甲 hit / miss 两边都不空（有赢有输）；')
    console.log('      乙 **上面那行的后手分差 ≥ 0**（忍不是严格劣势策略）。')
    console.log('      只有甲会放行「忍了必亏所以没人忍」—— 那还是「永远有最优解法」。')
    console.log('      「放掉 / 收回」是两个毛数，**它们的差不是净赚**，净值看分差。〕')
  }

  printCatchCurve(sum, g)

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

  // ⚠ **这一行 2026-10-23 晚些修的：原来是 `perGame(ME) + perGame(FOE)`，
  //   而 `perGame` 返回的是 `sum.score` —— 积分，不是张数。**
  //
  // R3 下「积分 = 收走的张数」，所以它一直是对的。R4 一分档就散了：
  // 实测它报「收走 28.0 + 2.4 + 6.0 = 36.4（一副 52 张）← 对不上，
  // 去查 collect / harvestPile」。那 28.0 正好是 14.0 分 × 2 人。
  //
  // **这条误报比没有自检更坏**：它把人指向 `collect` / `harvestPile`，
  // 而那两处一个字都没错。改用 `sum.caught`（真·张数）之后
  // 43.6 + 2.4 + 6.0 = 52.0 ✓。
  //
  // 这是 R4 的第三个「口径随规则变了而代码没跟上」的点，
  // 另两个在 `printCatchCurve`（占总分的分母、收牌张数那条自检）
  // 和 `cmdVs` 的「拆开双方得分」那张表（「和」那一列）。
  //
  // ⚠ **第一版修的时候用的是 `sum.caught`，后来换成了 `sum.taken`。**
  //   两个在空槽基线下逐位相同，所以 `caught` 跑出来也是 ✓ —— 可
  //   `rules.js:11762` 写明守恒认的是 `taken`（易流把手牌也算离场，
  //   那一笔只进 `taken`）。接一个「今天刚好相等」的量，就是这个项目
  //   栽过好几次的那种分叉；`base` 哪天带上技能，它会**静默**开始误报。
  const collected = avg(sum.taken[R.ME], g) + avg(sum.taken[R.FOE], g)
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
    winGain: avg(D.wins[R.ME], D.games) - avg(C.wins[R.ME], C.games),
    // `winX` 2026-10-27 补的 —— 两侧平均的胜率增量，口径跟上面的 `x` 同构
    // （`winGain` 是单侧的 back，两个都留着：`winGain` 有老调用方）
    winX: ((avg(D.wins[R.ME], D.games) - avg(C.wins[R.ME], C.games))
      + (avg(C.wins[R.ME], C.games) - avg(A.wins[R.ME], A.games))) / 2 * 100
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
// 两侧都量**任意配装** —— 不限于「插一件」〔2026-10-26 从 measureBoth 拆出来〕。
//
// 拆它的理由是用户定的那条合格判据：「需要配合的技能，跟特定技能一起用之后
// X 能比单用那件多 1 也算合格，**而这个增量要量出来当它的 X**」。
// 那需要「两件都带」这个配装在**两侧**各跑一遍，而原先 `measureBoth`
// 把 `kitWithOne` 焊在函数体里，只量得了单件 —— 于是 `pair` 只能走
// `measure`（单侧），报出来的是 `back` 不是 X，**换算不回去**
//（要转得知道「两件都带」那一格的 D，而那一格的对手侧从来没跑过）。
//
// `preC` 是可选的预算基线格：同一个 `args` / `role` 下基线跟配装无关，
// 所以 `pair` 那三次调用可以共用一次 —— 9 格降到 7 格。
// ⚠ 传 `preC` 的前提是**同一个 `o`**（同 args、同 role），别跨调用传。
function measureBothLo(args, role, lo, preC) {
  const o = rolesFor(args, role, true)
  const empty = R.emptyLoadout()
  // 三格：基线（都空）/ 我带 / 对手带。照 cmdAll
  const C = preC || run(args.n, args.seed, empty, empty, o)
  const D = run(args.n, args.seed, lo, empty, o)
  const A = run(args.n, args.seed, empty, lo, o)
  const baseDiff = meanDiff(C)
  const back = meanDiff(D) - baseDiff
  const front = baseDiff - meanDiff(A)
  return {
    // `foeTest` 2026-10-26 补的 —— 算「边际 X」的标准误要用到对手格。
    // 边际 X = X(两件) − X(单件)，展开后**基线项消掉了**：
    //   margin = [meanDiff(D_两) − meanDiff(A_两)]/2 − [meanDiff(D_单) − meanDiff(A_单)]/2
    // 所以它的 se 由四个格子定，跟基线格无关
    base: C, test: D, foeTest: A, baseDiff: baseDiff,
    back: back, front: front,
    x: (back + front) / 2,
    d: (front - back) / 2,
    se: Math.sqrt(stderrOf(D) * stderrOf(D) + stderrOf(C) * stderrOf(C)),
    winGain: avg(D.wins[R.ME], D.games) - avg(C.wins[R.ME], C.games)
  }
}

function measureBoth(args, role, slotAt, skillAt) {
  return measureBothLo(args, role, R.kitWithOne(role, slotAt, skillAt))
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
  //
  // ⚠ **这一行 2026-10-23 补了 R4 分支，而在那之前它是坏的。**
  //   上面那句「跟 cmdAll 逐字一致」10-23 早些时候就不成立了：cmdAll 加了
  //   `SCORE_BANDS !== null → '待定'` 的闸，**cmdOne 没加**。于是
  //   `one soft --slot 2` 在 R4 下照旧印出「建议价：40」—— 那是拿 R3 的锚
  //   （21 金币/分，每人每局 21.8 分时拟的）去算 R4 的 X（每人每局 16.6 分）。
  //
  //   抓到它纯属偶然：当时正在补软点那一格，而 0.68 × 21 + 25 = 39.3 → 40
  //   恰好跟它现行的价 45 只差一档，**看着像个合理的结论**。
  //   这就是 CLAUDE.md 第四节那条同色闸 bug 的同一种病 ——
  //   **一个「看起来合理」的数不能当成机制对了**。
  //
  //   教训是结构性的：**同一个口径在两处各写一份，必然分叉**（rules.js 里
  //   反复写的那句）。这儿是「两份公式 + 一份闸」，闸只长在其中一处。
  //   真正的修法是把这段抽成一个 priceHint(x, d) 给两边调，
  //   **这儿只补了闸**（改动面小、这一轮不动结构），所以分叉的根还在。
  //
  //   而现行定价**根本不走锚**：用户 2026-10-23 定的是「按 X 排名套现有价位池」
  //   （价位一个不加一个不减 → 金币经济不动）。所以 R4 下这儿永远是「待定」，
  //   锚那条分支只为 `SCORE_BANDS=off` 退回 R3 对照时留着
  // ⚠ 闸跟 cmdAll 同步改了（2026-10-27）—— 锚是 R3 拟的，而 R3 = 张=分
  //   **且无抢牌**。只认 `SCORE_BANDS` 的话 R5 会漏过去，见 cmdAll 那段
  const priceHint = !(R.SCORE_BANDS === null && !R.STEAL_ON)
    ? '待定　—— 现行不走锚，走「按 X 排名套现有价位池」（见台账第二节那条 🔴 全表重定价）'
    : m.x <= 0 ? '—（X ≤ 0 是效果问题，不是定价问题）'
      : String(Math.round((25 + m.x * 21) / 5) * 5)
        + (Math.abs(m.d) > 1 ? '?　—— |D| > 1，先修平衡再谈价' : '')
  console.log('  建议价：' + priceHint)
  console.log('\n  胜率：' + pct(avg(m.test.wins[R.ME], m.test.games))
    + '（基线 ' + pct(avg(m.base.wins[R.ME], m.base.games)) + '，'
    + (m.winGain >= 0 ? '+' : '') + pct(m.winGain) + '）')
  // 〔2026-10-29〕两侧平均的 Δ胜率 —— 公式跟 cmdAll 的 winX **逐字一致**，所以这个数能直接填进全表那一列。
  // 上面那行只是后手一侧（D 格），跟全表那列不同口径
  const baseWin = avg(m.base.wins[R.ME], m.base.games)
  const winX = ((avg(m.test.wins[R.ME], m.test.games) - baseWin) + (baseWin - avg(m.foeTest.wins[R.ME], m.foeTest.games))) / 2 * 100
  console.log('  Δ胜率（两侧平均，跟 all 那列同口径）：' + (winX >= 0 ? '+' : '') + winX.toFixed(2) + ' 点')
  console.log('  带技能那方（后手格）：每局钓到 '
    + f1(avg(m.test.catches[R.ME], m.test.games))
    + ' 次（基线 ' + f1(avg(m.base.catches[R.ME], m.base.games)) + '），每次收 '
    + f2(avg(m.test.caught[R.ME], m.test.catches[R.ME])) + ' 张（基线 '
    + f2(avg(m.base.caught[R.ME], m.base.catches[R.ME])) + '）')
  // ---- 局长那一行〔2026-10-28 补到 `one` 上〕----
  //
  // **为什么每件技能都该看一眼**：局长（双方合计出牌数）是这个玩法的
  // 全局预算，而 CLAUDE.md 四条陷阱的第一条就是「**牌库张数 = 局长**」。
  // 一件技能把牌从牌库搬走（堆牌 / 推牌 / 填塘…）或让牌不经手离场，
  // 就是在花这笔预算 —— 而**光看 X 看不出它花了多少**。
  //
  // 这一行原先只长在 `cmdRole` 的「推牌诊断」里（2026-10-20 为逆涌加的），
  // 10-28 逆涌换成堆牌之后那段整体不印了，局长这一行**跟着丢了** ——
  // 而堆牌恰恰也动牌库。所以把它挪到这儿：`one` 量的就是单件技能
  //
  // **无条件印**（不加闸）：加闸就只有「已知会动局长」的件印得出来，
  // 而「本来不该动、结果动了」才是要抓的那一类
  const basePlays = (m.base.plays[R.ME] + m.base.plays[R.FOE]) / m.base.games
  const testPlays = (m.test.plays[R.ME] + m.test.plays[R.FOE]) / m.test.games
  console.log('  双方出牌 ' + f2(testPlays) + '（基线 ' + f2(basePlays)
    + '）→ **局长 ' + (testPlays >= basePlays ? '+' : '')
    + f2((testPlays / basePlays - 1) * 100) + '%**')
  // ---- 三个桶：总分池 / 剩堆蒸发 / 手里剩〔2026-10-28 补到 `one` 上〕----
  //
  // **这是「张 = 分」专属的一笔账，而原先 `one` 一个字都不印。**
  //
  // R6 下「分 = 收走的张数」，所以**双方收走的张数之和就是这一局的总分池**，
  // 而一副牌是定死的 52 张 —— 于是：
  //
  //   52 = 收走（有人得分） + 终局剩堆（**谁都不算分**） + 手里剩（同样不算分）
  //
  // 后两个桶是**蒸发**。一件技能可以在完全不改变「我占多少比例」的前提下，
  // 把总分池做大或做小 —— 而 `cmdBase` 有这条守恒（`:1473`），
  // **`one` 没有**，于是「这件技能让多少张牌蒸发了」在量单件时取不到。
  //
  // 加厚堆的那一族（堆牌 / 推牌）正撞在这儿：它把牌从牌库提前搬上堆，
  // 而**堆常驻更厚 ⇒ 终局剩堆更厚 ⇒ 蒸发更多**。
  // 这跟「我先有机会匹配」不矛盾 —— 那是分配，这是总量
  const baseTook = (m.base.taken[R.ME] + m.base.taken[R.FOE]) / m.base.games
  const testTook = (m.test.taken[R.ME] + m.test.taken[R.FOE]) / m.test.games
  const baseLeft = m.base.leftover / m.base.games
  const testLeft = m.test.leftover / m.test.games
  const baseHeld = m.base.handLeft / m.base.games
  const testHeld = m.test.handLeft / m.test.games
  console.log('  **总分池**（双方收走合计）' + f2(testTook) + ' 张（基线 '
    + f2(baseTook) + '，' + (testTook >= baseTook ? '+' : '') + f2(testTook - baseTook)
    + '）　剩堆蒸发 ' + f2(testLeft) + '（基线 ' + f2(baseLeft) + '，'
    + (testLeft >= baseLeft ? '+' : '') + f2(testLeft - baseLeft)
    + '）　手里剩 ' + f2(testHeld) + '（基线 ' + f2(baseHeld) + '）')
  // ---- 【燃烧】闭合归谁〔2026-10-28 补到 `one` 上〕----
  //
  // **为什么非补不可**：【燃烧】的实际规则是「**全堆带火 → 整堆归当时的
  // 出牌方**」（`burnStep`），而火会蔓延 —— 所以堆上有火之后就是一场
  // 「**谁先凑满全堆带火谁拿整堆**」的竞赛，而**点火的人不一定是收走的人**。
  //
  // 于是这一族有一类效果**单看 X 完全读不出来**：往谁的回合开头塞一张
  // 不带火的新牌，就是**打断谁的燃尽**。【薪潮】「双方各堆 1 张」正是这个
  // ——「给对方堆」= 用一张脏牌掐掉他这一手的闭合，把火的收成留给自己。
  //
  // 实测它值 **1.98 分**（给对方 1 张 X +2.36 对 给自己 1 张 X +0.38，
  // 20000 局 · se 0.15），而两格的**总量账几乎逐项相同**（局长 −2.67%
  // 对 −2.66%、总分池 48.45 对 48.49）—— 也就是这 1.98 **全是分配**。
  // 没有这个计数口的话，那 1.98 分只能靠猜。
  //
  // 这张表原先只长在野火那个专用命令的「格 D」里（见下面那段），
  // 而 `one` 取不到 —— 同一种漏法这个文件记过三次（堆牌诊断的闸、
  // jsurge 的 fires、石化那一套）
  const swT = m.test.wild
  const swB = m.base.wild
  if (swT.sweeps[R.ME] + swT.sweeps[R.FOE]
    + swB.sweeps[R.ME] + swB.sweeps[R.FOE] > 0) {
    const srow = function (label, sum, s, games) {
      const n = sum.sweeps[s]
      if (n === 0) return label + '（没闭合过）'
      return label + f2(avg(n, games)) + ' 次/局 × '
        + f2(avg(sum.sweepSum[s], n)) + ' 张 = **'
        + f2(avg(sum.sweepSum[s], games)) + ' 张/局**'
    }
    console.log('  ---- 【燃烧】闭合扫堆（全堆带火 → 整堆归**出牌方**）----')
    console.log('    带技能这一格：' + srow('我 ', swT, R.ME, m.test.games)
      + '　｜　' + srow('对手 ', swT, R.FOE, m.test.games))
    console.log('    基线那一格：　' + srow('我 ', swB, R.ME, m.base.games)
      + '　｜　' + srow('对手 ', swB, R.FOE, m.base.games))
    console.log('    👉 **两边差不多 = 这条规则 washed out**（我点的火被对手闭合，'
      + '净值趋零）；我明显多 = 闭合的归属被这件技能掰过来了。')
  }
  // ---- 「D 的上限 = 基线优势」那句话 2026-10-15 删了 ----
  //
  // 它是基线 +3.03 时代的判据。终局规则改成「牌库空 + 各打 1 手」之后
  // 基线只剩 +0.3，于是**任何正 D 都"超限"**，那条判据没意义了。
  // 现在两条合用：相对标准误显著 + 相对比例模型偏离（见下面那行）
  // 胜率三项 2026-10-27 补上，跟 `cmdAll` 那条基线行同形
  //（`wins` 两侧 + `draws` 才凑满 100%，所以「后手 46.0%」的另一面不是 54.0%）
  console.log('\n  基线（双方同角色、槽全空、**固定庄家先手**）：后手分差 '
    + sign(m.baseDiff)
    + '，后手胜率 ' + pct(avg(m.base.wins[R.ME], m.base.games))
    + ' · 先手 ' + pct(avg(m.base.wins[R.FOE], m.base.games))
    + ' · 平局 ' + pct(avg(m.base.draws, m.base.games)))
  console.log('  ⚠ 这一行**不能跟 `base` 的后手分差相减** —— `base` 走自由切牌'
    + '（只有它传 freeFirst），这儿是固定庄家先手，两个口径。')
  console.log('  **D 要跟标准误比，别跟基线比** —— |D| < ' + f2(m.se * 2)
    + '（两个标准误）统计上分不开。')
  console.log('  口径跟 `all` 一致：双方同角色、各插同一个槽、**两侧都量**，'
    + '所以这几个数可以直接跟全表比。')
  // ---- `CATCH_CURVE=1`：连「收 N 张」的分布一起打〔2026-10-24 加的〕 ----
  //
  // **为什么非加不可**：R4 之下「这件技能值几分」和「它被档结构怎么对待」
  // 是两个问题，而 X 只答得出第一个。典型是【撒网】【退潮】这一类
  // 「一次收走一片」—— 一片要够 4 张才跨进第二档，够不够**只能看分布**。
  //
  // 加之前这个诊断**取不到**：`printCatchCurve` 唯一的调用方是 `cmdBase`，
  // 而 `cmdBase` 把双方的 loadout 写死成 `R.emptyLoadout()`（见那行）——
  // 于是「带着技能的那一侧收 N 张的分布」在整个工具里没有出口。
  //
  // 默认不打，理由是 `one` 的输出会长出三张表；它不改任何既有数字。
  //
  // ⚠ **这两张表跟 `base` 打的那张不是同一个口径，三者都别相减**：
  //   · `base` —— 自由切牌（只有它传 `freeFirst`）、双方空手
  //   · 这儿的「我带」 —— 固定庄家先手、ME 带 FOE 空手（**不对称**）
  //   · 这儿的「基线」 —— 固定庄家先手、双方空手
  //   第三条跟 `base` 只差一个切牌口径，看着最像可比的，**恰恰是最容易栽的**。
  printStoneDiag()
  printHeapDiag()
  printDraftTagDiag()
  if (process.env.CATCH_CURVE) {
    console.log('\n  ======== 我带那一格（m.test：ME 带、FOE 空手）========')
    console.log('  ⚠ 下面是**两人合计**，而这一格两侧不对称 ——'
      + '带技能那方的分布被不带的那方稀释了一半。')
    console.log('  要按侧分开：`DUMP_HIST=x` 的 `#HIST x-test me` 那一行。')
    // 局数走 `sum.games` 不走 `args.n`，照 `cmdBase` 那行
    printCatchCurve(m.test, m.test.games, 'test')
    console.log('\n  ======== 基线那一格（m.base：双方空手，**对照用**）========')
    printCatchCurve(m.base, m.base.games, 'base')
  }
}

// ---------- 【堆牌】/【上牌区】的诊断口〔2026-10-26〕 ----------
//
// 照 `printStoneDiag` 那三条先例：**问计数器别问旋钮**、**不印「每局」**
//（`PROTO_STAT` 跨 `measureBoth` 的三格累加，绝对数不可读、比值可读）、
// **读数有顺序**。
//
// 这一套的读数顺序：
//   `staged/fires`（≈ HEAP_N=2 才算取成了 —— 2026-10-28 起这个 2
//     就是词条里的 N「一次盖几张」，不再是「层 × 每层几张」）
//     → `flushes/fires`（≈1 才算都落下去了，明显小 = 卡在区里到终局）
//       → `hits/flushed`（撞点数置 0 的占比 = 这个机制的损耗面）
//         → **最后才看分**。
function printHeapDiag() {
  const h = R.PROTO_STAT.heap
  const b = R.PROTO_STAT.board
  if (h.fires === 0 && h.tags === 0 && b.forced === 0) return
  console.log('\n  ---- 诊断：【堆牌】/【上牌区】 ----')
  if (h.fires > 0 || h.tags > 0) {
    // 「该 ≈ 几」读 `want/fires`，**不读 `R.HEAP_N`**〔2026-10-28 改〕——
    // 三个载体的 N 不一样（原型 2 / 薪潮 2 / **逆涌 4**），拿旋钮当分母时
    // 开河工那一行印「3.33 张/次，该 ≈ 2」，看着像少取了一半
    console.log('    贴 ' + h.tags + ' 张 / 发动 ' + h.fires + ' 次 → 盖进堆牌区 '
      + h.staged + ' 张（' + f2(avg(h.staged, h.fires)) + ' 张/次，**该 ≈ '
      + f2(avg(h.want, h.fires)) + '**；牌库凑不满那一笔 ' + h.short + ' 次 → '
      + '闸咬掉 ' + (h.want > 0 ? pct(1 - h.staged / h.want) : '—') + '）')
    // 「其中盖给对方的几张」〔2026-10-28 加〕——【薪潮】「双方各堆1张」
    // 把一件技能拆成了两笔，而两笔走同一个入口、同一份 `fires`/`staged`，
    // **单看上面那一行分不出第二笔有没有真盖出去**。
    // `want − staged` 那一截是「闸按每笔各判一次」咬掉的，它 > 0 的那几手
    // 合计只搬 1 张（奇数）→ **牌库奇偶翻一次**，而单看 X 查不到
    if (h.toFoeWant > 0) {
      console.log('    其中**盖进对方区** ' + h.toFoeStaged + ' 张 / 想盖 '
        + h.toFoeWant + ' 张（占真盖出去的 ' + pct(avg(h.toFoeStaged, h.staged))
        + '；这一笔被牌库挡掉 ' + (h.toFoeWant - h.toFoeStaged) + ' 张 = '
        + pct(1 - h.toFoeStaged / h.toFoeWant) + '）')
    }
    console.log('    落到牌堆 ' + h.flushes + ' 回合 / ' + h.flushed + ' 张 → '
      + '**兑现率 ' + pct(avg(h.flushes, h.fires)) + '**'
      + '（卡在区里没落 ' + (h.staged - h.flushed) + ' 张）')
    console.log('    其中撞点数按 0 点落 ' + h.hits + ' 张 → **损耗面 '
      + pct(avg(h.hits, h.flushed)) + '**（0 点牌只贡献堆深、不贡献钩点）')
    // ⚠ `depthBefore === 0` 要**单独说一句**〔2026-10-28〕——
    //   `pct(avg(x, 0))` 印出来是 `0.0%`，而那读起来是「一点都没加厚」，
    //   真相正好相反：**落在空堆上** = 加厚无穷倍。
    //   这不是假想的边界，它就是【逆涌】的常态（对方打 J 刚把场清空）
    console.log('    落之前堆平均 ' + f2(avg(h.depthBefore, h.flushes))
      + ' 张 → 这一下把堆加厚 '
      + (h.depthBefore > 0 ? pct(h.flushed / h.depthBefore)
        : '**从空堆起**（堆一直是空的 —— 逆涌那种「对方 J 清场之后才落」就是这样）'))
    // 【逆涌】自己那一句条件的计数〔2026-10-28 接上〕。
    //
    // 它在 `rules.js` 里累加着、**而整个工具一个字都不印** ——
    // 同一种漏法这个文件为【石化】那一套记过一次。
    // 读法写在 `PROTO_STAT.jsurge` 头上：产出固定（堆牌4），
    // **触发频率是这件技能唯一的变量**，所以这个数就是它的全部机制口
    const js = R.PROTO_STAT.jsurge
    if (js.fires > 0) {
      console.log('    其中【逆涌】「对方打出 J」兑现 ' + js.fires + ' 次（占发动 '
        + pct(avg(js.fires, h.fires)) + '）')
    }
    if (h.staged === 0) {
      console.log('    ⚠ **一张都没盖进去** —— 不是幅度问题。'
        + '查 `heapStage` 有没有被调到（`SK.HEAP` / `heapCountOf` 两条路）。')
    }
    // ---- 堆牌 ×【21 匹配】的交互口〔2026-10-26 ·〈heapdraft〉要的那一列〕 ----
    //
    // **这一格只看 X 查不到**：「堆变厚了所以我收得多」和「我铺的牌全给
    // 对手垫了脚」在分上长得一模一样。`freshSum/gotSum` 直接回答
    // 「我这一手吃到的那一段里，有几张是我自己这回合刚铺下去的」
    const td = R.PROTO_STAT.tagdraft
    if (td.fired > 0) {
      console.log('    ×【21 匹配】：这条线发动 ' + td.fired + ' 次 / 收 '
        + td.gotSum + ' 张，其中**刚铺下去的 ' + td.freshSum + ' 张**（'
        + pct(avg(td.freshSum, td.gotSum)) + '，够着 '
        + f2(avg(td.gotSum, td.fired)) + ' 张/次）')
    }
  }
  if (b.forced > 0 || b.played > 0) {
    console.log('    上牌区：被迫出牌 ' + b.forced + ' 回合 / 真打出 ' + b.played
      + ' 张（**该逐位相等**）；终局还卡着 ' + b.left + ' 张')
    console.log('    被迫那一手收了 ' + b.gotSum + ' 张 → '
      + f2(avg(b.gotSum, b.played)) + ' 张/手（**跟全局「每手收几张」比才有意义**）')
    if (b.forced !== b.played) {
      console.log('    ⚠ **两个数不等** —— 规则是「必须出 1 张」，'
        + '不等就是有一条路绕过了 `takeFromBoard`。')
    }
  }
  // 〔**〈boardgive〉/【顶钩】那一块 2026-10-27 删了**（技能删了，X −1.14）。
  //   它留下的读数顺序是通用的，下一件往上牌区放牌的技能照抄：
  //   **先问它做了几次，最后才看分** ——
  //     `fires vs idle`（空转占一大半 = 根本没发动）
  //       → `(bestSum − gaveSum)/fires`（名义上剥夺了几张）
  //         → 上面那条 `b.gotSum/b.played`（他**实际**亏了多少）
  //   上面那个 `b.*` 块（`PROTO_STAT.board`）留着 —— 它是规则层那一区的口，
  //   现在往那一区放牌的只有 `BOARD_TEST`〕
}

// ---------- 【石化】/【花色匹配】钥匙的诊断口〔2026-10-26 接上〕 ----------
//
// **为什么非加不可**：这两组计数在 `rules.js` 里累加了一整季，而
// `sim.js` 一个字都不印 —— 唯一读它们的是 `proto-diag.js`，那是**单侧口径**。
// 于是「X 口径下这件技能的机制到底跑没跑」在整个工具里取不到。
// 这正是 PROTO_STAT 那段注释自己写的病（「计数有了，口没接上」）的第二遍。
//
// 照 ranklink / heartwild / printColdDiag 那三条先例：
//   · **问计数器，别问旋钮**（旋钮关着也可能有载体卡发动）；
//   · **不印「每局」** —— `PROTO_STAT` 是全局累加，而 `measureBoth` 跑三格
//     （基线 / 我带 / 对手带）。基线格不带技能、贡献 0，剩下两格各带一侧，
//     所以**绝对数不可读、比值可读**，而比值正是要看的那几个。
//
// ⚠ 读数顺序是硬规矩：`used` → `hits/used` → `selfBlocks/blocks` → **最后才看分**。
function printStoneDiag() {
  const p = R.PROTO_STAT.stone
  const k = R.PROTO_STAT.matchkey
  // ⚠ `k.used` 2026-10-28 加进这道闸：**自带【花色匹配】的件一把钥匙都不发**
  //（传色 / 传遍 / 雪覆 / 一色 / 〈huetag〉色递 —— 线在载体自己身上）。
  //   原先只看 `p.tags`/`k.given`，于是量那几件时整张诊断表**一个字都不打**，
  //   而「成功率」正是判这条线死活的第一列。同一种漏法这个文件记过两次了
  if (p.tags === 0 && k.given === 0 && k.used === 0
    && p.handTags === 0 && p.deckTags === 0) return
  console.log('\n  ---- 诊断：【石墙】/【花色匹配】钥匙 · FATE=' + R.STONE_FATE + ' ----')
  if (p.handTags > 0 || p.handLands > 0 || p.handNone > 0) {
    console.log('    手牌贴墙 ' + p.handTags + '（贴不上 ' + p.handNone
      + '）→ 落堆成墙 ' + p.handLands + '（SHAND_MODE=' + R.SHAND_MODE + '）')
  }
  if (p.deckTags > 0 || p.deckLands > 0 || p.deckNone > 0) {
    console.log('    库顶贴墙 ' + p.deckTags + '（贴不上 ' + p.deckNone
      + '）→ 落堆成墙 ' + p.deckLands)
  }
  if (k.given > 0 || k.none > 0 || k.used > 0) {
    console.log('    发出钥匙 ' + k.given + ' 把（手里挑不出牌 ' + k.none + ' 次）'
      + '，带钥匙那张真打出去 ' + k.used + ' 次 → **兑现率 ' + pct(avg(k.used, k.given)) + '**')
    if (k.given === 0) {
      console.log('    ⚠ 这一跑**没有「发钥匙」那一步** —— 载体自带【花色匹配】，'
        + '所以上一行的「兑现率」无意义（分母 0），只读下面那个**成功率**。')
    }
    console.log('    其中匹配成功 ' + k.hits + ' 次 → **成功率 '
      + pct(avg(k.hits, k.used)) + '**，共收 ' + k.got + ' 张（'
      + f2(avg(k.got, k.hits)) + ' 张/次）')
    console.log('    **两个率低的死因完全不同**：兑现率低 = 钥匙发给了一张我不想打的牌；'
      + '成功率低 = 堆上同花色凑不够 ' + R.SM_MIN + ' 张（『条件撞局面常量』那条死因，'
      + '堆常年只有 0~3 张，均值 2.4）。`SM_MIN=1` 跑一格就知道是不是它。')
    if (k.used === 0) {
      console.log('    ⚠ **钥匙一次都没打出去** —— 那不是幅度问题。'
        + '查 `matchKeyPick` 挑没挑到牌、以及 AI 的 `catchCountAt` 看不看得见这条线。')
    }
  }
  if (p.suitKeys > 0) {
    console.log('    ⚠ **旧的连续花色线也在跑**（suitKeys ' + p.suitKeys
      + ' / suitHits ' + p.suitHits + '）—— 石影默认档下这两个该是 0。'
      + '两条路同时接着的话这一格的数是脏的（HUE_KEY=' + R.HUE_KEY + '）。')
  }
  if (p.passGiven > 0 || p.passUsed > 0) {
    console.log('    破墙钥匙 ' + p.passGiven + ' 把 → 带它那张打出 ' + p.passUsed + ' 次（兑现率 '
      + pct(avg(p.passUsed, p.passGiven)) + '），其中**真穿过墙 ' + p.pierced + ' 次**（'
      + pct(avg(p.pierced, p.passUsed)) + '）')
  }
  if (p.tags === 0) return
  console.log('    堆上贴墙 ' + p.tags + ' 张，拦下连续匹配 ' + p.blocks + ' 次（'
    + f2(avg(p.blocks, p.tags)) + ' 次/张），墙平均在堆上活 '
    + f2(avg(p.liveSum, p.tags)) + ' 手')
  console.log('    拦下 ' + p.kept + ' 张 → **' + f2(p.keptScore) + ' 分**（'
    + f2(avg(p.keptScore, p.blocks)) + ' 分/次）'
    + (R.SCORE_BANDS === null ? '　〔SCORE_BANDS=off，R3 下分 ≈ 张数〕' : ''))
  console.log('    **R4 下看 keptScore，不看张数** —— 阶梯计分之下'
    + '「6 张截成 2 张」掉 11 分，「5 张截成 4 张」掉 0 分，两者都记 1 次 block。')
  console.log('    其中拦到自己 ' + p.selfBlocks + ' 次 / ' + p.selfKept + ' 张 → **自伤 '
    + pct(avg(p.selfBlocks, p.blocks)) + '**（这一族的墙不分敌我）')
  if (p.jBlocks > 0) console.log('    其中拦的是 J 通吃 ' + p.jBlocks + ' 次（STONE_J=' + R.STONE_J + '）')
}

// ---------- 【21 匹配】标签那一族的诊断口〔2026-10-28〕 ----------
//
// **为什么非加不可**：`PROTO_STAT.tagdraft` 从 2026-10-21 就在累加，而
// `sim.js` 唯一印它的地方在 `printHeapDiag` 里面 —— 那一段挂在
// `h.fires > 0 || h.tags > 0` 下面（堆牌发动过才打）。于是量零递 / 递吃 /
// 减递 / 多递 / 连递这些**不带堆牌**的件时，「兑现率」整条读不到。
// 这正是 `PROTO_STAT` 那段注释自己写的病（「计数有了，口没接上」）的第三遍。
//
// 照既有三条先例：**问计数器别问旋钮**、**不印「每局」**
//（`PROTO_STAT` 跨 `measureBoth` 三格累加 —— 绝对数不可读、**比值可读**）。
//
// ⚠ 读数有顺序，错了会把两种病混成一种：
//   `cashed/tagged`（**兑现率** —— 低 = 标签发给了一张我不想打的牌）
//     → `fired/cashed`（打出去了但这条线没开 = 被 `draftLineOpen` / 沉底闸掉）
//       → 凑成率那一列（在上面那张 `DRAFT_HEAD` 表里）
//         → **最后才看分**。
function printDraftTagDiag() {
  const td = R.PROTO_STAT.tagdraft
  const ht = R.PROTO_STAT.holdtag
  const ct = R.PROTO_STAT.chaintag
  // 【隔凌】〔2026-10-30〕
  const lc = R.PROTO_STAT.lockcolor
  if (lc && lc.fires > 0) {
    console.log('\n  ---- 诊断：【隔凌】（LOCKCOLOR_REF=' + R.LOCKCOLOR_REF + '）----')
    console.log('    发动 ' + lc.fires + ' 次：贴冰 ' + f2(lc.iced / lc.fires) + ' 张/次 · 牌库空没摸到 ' + pct(lc.nodraw / lc.fires)
      + ' · 摸上来那张跟打出那张同颜色 ' + pct(lc.sameAsPlayed / Math.max(1, lc.fires - lc.nodraw)))
  }
  // 【引火】〔2026-10-30〕
  const kd = R.PROTO_STAT.kindle
  if (kd && kd.fires > 0) {
    console.log('\n  ---- 诊断：【引火】（KINDLE_HUE=' + R.KINDLE_HUE + '）----')
    console.log('    发动 ' + kd.fires + ' 次：贴火 ' + f2(kd.tagged / kd.fires) + ' 张/次 · 堆底就是它自己 ' + pct(kd.bottomSelf / kd.fires)
      + ' · 堆底跟它同颜色 ' + pct(kd.sameAsPlayed / kd.fires) + ' · 堆空 ' + pct(kd.noPile / kd.fires))
  }
  // 【传火】bottom 档〔2026-10-30〕
  const cb = R.PROTO_STAT.chainbottom
  if (cb && cb.fires > 0) {
    console.log('\n  ---- 诊断：【传火】（CHAIN_HUE=' + R.CHAIN_HUE + ' · CHAIN_BOTTOM_SELF=' + (R.CHAIN_BOTTOM_SELF ? 1 : 0) + '）----')
    console.log('    发动 ' + cb.fires + ' 次：点着别的 ' + f2(cb.lit / cb.fires) + ' 张/次 · 点着它自己 ' + pct(cb.selfLit / cb.fires)
      + ' · 堆上只有它一张 ' + pct(cb.solo / cb.fires) + ' · 堆空 ' + pct(cb.noPile / cb.fires))
  }
  const csx = R.PROTO_STAT.chainseat
  if (csx && csx.front.fires + csx.back.fires > 0) {
    console.log('  ---- 【传火】按持有方座位拆（只算 bottom 档）----')
    for (const k of ['front', 'back']) {
      const v = csx[k]
      if (v.fires === 0) continue
      console.log('    ' + (k === 'front' ? '持有方先手' : '持有方后手') + '：发动 ' + v.fires + ' 次 · 堆厚 ' + f2(v.pileSum / v.fires)
        + ' · 堆上只有它 ' + pct(v.solo / v.fires) + '（第一手 ' + pct(v.opening / v.fires) + ' / 局中 ' + pct(v.soloMid / v.fires) + '）' + ' · 堆 ≥2 张时堆底是持有方自己打的 ' + pct(v.bottomMine / Math.max(1, v.multi)) + ' · 堆底跟它同色 ' + pct(v.selfSame / v.fires)
        + ' · 当手燃尽 ' + pct(v.instant / v.fires) + '（' + f2(v.instantCards / Math.max(1, v.instant)) + ' 张）'
        + ' · 持有方扫堆 ' + v.mySweeps + ' 次 / ' + v.myCards + ' 张 · 对手扫堆 ' + v.foeSweeps + ' 次 / ' + v.foeCards + ' 张')
    }
  }
  // 【野火】新版〔2026-10-30〕
  const ws = R.PROTO_STAT.wildself
  if (ws && ws.fires > 0) {
    console.log('\n  ---- 诊断：【野火】（WILD_SELF=' + (R.WILD_SELF ? 1 : 0) + '）----')
    console.log('    发动 ' + ws.fires + ' 次：它自己点着 ' + pct(ws.lit / ws.fires) + ' · 另挑 1 张点着 ' + pct(ws.picked / ws.fires))
  }
  // 〈zerodrop〉〔2026-10-30〕
  const zd = R.PROTO_STAT.zerodrop
  if (zd && zd.fires > 0) {
    console.log('\n  ---- 诊断：〈zerodrop〉（ZD_WHO=' + R.ZD_WHO + '）----')
    console.log('    发动 ' + zd.fires + ' 次：置 0 他 ' + f2(zd.killed / zd.fires) + ' 张/次，「手里几张 0」平均 ' + f2(zd.zSum / zd.fires)
      + '，全堆减出新 0 ' + f2(zd.newZero / zd.fires) + ' 张/次 · 收零判 ' + zd.cashed + ' 次、收成 ' + pct(zd.hits / Math.max(1, zd.cashed))
      + '、每次收 ' + f2(zd.got / Math.max(1, zd.hits)) + ' 张')
  }
  // 〈foeflow〉〔2026-10-30〕
  const ff = R.PROTO_STAT.foeflow
  if (ff && ff.fires > 0) {
    console.log('\n  ---- 诊断：〈foeflow〉（FF_HAND=' + R.FF_HAND + ' · FF_HEAP=' + R.FF_HEAP + '）----')
    console.log('    发动 ' + ff.fires + ' 次：手牌补进顺子 ' + f2(ff.handUsed / ff.fires) + ' 张/次')
  }
  // 【回水】〔2026-10-30〕
  const zs = R.PROTO_STAT.backwater
  if (zs && zs.fires > 0) {
    const at = R.PROTO_STAT.atag
    console.log('\n  ---- 诊断：【回水】----')
    console.log('    发动 ' + zs.fires + ' 次：置 0 他 ' + f2(zs.killed / zs.fires) + ' 张/次（J ' + f2(zs.jack / zs.fires) + '）'
      + '，贴收零 ' + pct(zs.tagged / zs.fires) + ' · 收零打出 ' + at.cashed + ' 次、收成 ' + pct(at.hits / Math.max(1, at.cashed))
      + '、每次收 ' + f2(at.got / Math.max(1, at.hits)) + ' 张')
  }
  // 〈drawzero〉〔2026-10-30〕
  const dz = R.PROTO_STAT.drawzero
  if (dz && dz.fires > 0) {
    console.log('\n  ---- 诊断：〈drawzero〉（DZ_MODE=' + R.DZ_MODE + '）----')
    console.log('    发动 ' + dz.fires + ' 次：对方抽 ' + f2(dz.drawn / dz.fires) + ' 张/次（J ' + dz.drawnJack + '，牌库不够 ' + dz.deckShort + ' 次）'
      + '，置 0 ' + f2(dz.zeroed / dz.fires) + ' 张/次（其中挑的 ' + f2(dz.picked / dz.fires) + '）'
      + (dz.blindJack > 0 ? '，盲选中 J ' + f2(dz.blindJack / dz.fires) + ' 张/次' : ''))
  }
  // 〈wildkey〉〔2026-10-29〕：贴了几次 + 钥匙兑现（flowHand 那条线记在 chaingift）
  const wk = R.PROTO_STAT.wildkey
  if (wk && wk.fires > 0) {
    const cg = R.PROTO_STAT.chaingift
    console.log('\n  ---- 诊断：〈wildkey〉（WILDKEY=' + R.WILDKEY + '）----')
    console.log('    发动 ' + wk.fires + ' 次：贴成钥匙 ' + pct(wk.keyed / wk.fires) + '、贴成通配 ' + pct(wk.wild / wk.fires)
      + ' · 钥匙牌打出 ' + cg.fired + ' 次，靠它收 ' + f2(cg.gotSum / Math.max(1, cg.fired)) + ' 张/次')
  }
  // 〈stackdraft〉〔2026-10-29〕：它不贴标签，所以排在下面那道早退前面
  const sk = R.PROTO_STAT.stackdraft
  if (sk && sk.fires > 0) {
    console.log('\n  ---- 诊断：〈stackdraft〉（STACK21_DIR=' + R.STACK21_DIR + '）----')
    console.log('    叠了 ' + sk.fires + ' 次：21 匹配凑成 ' + pct(sk.drafted / sk.fires)
      + '（每次收 ' + f2(sk.got / Math.max(1, sk.drafted)) + ' 张，含锚、不含垫的那张）'
      + ' · 退回普通匹配 ' + pct(sk.normal / sk.fires) + ' · 什么都没收 ' + pct(sk.none / sk.fires))
  }
  if (td.tagged === 0 && ht.fires === 0 && ct.cashed === 0) return
  console.log('\n  ---- 诊断：【21 匹配】的手牌标签 ----')
  // 〈sortdraft〉〔2026-10-29〕：排序真动了没有 —— 「挪了几步 / 次」是 0 就是排序没接上
  const sd = R.PROTO_STAT.sortdraft
  if (sd && sd.fires > 0) {
    console.log('    〈sortdraft〉SORT_ZERO=' + R.SORT_ZERO + '：发动 ' + sd.fires + ' 次，发动时堆厚 '
      + f2(sd.depth / sd.fires) + ' 张，排序挪了 ' + f2(sd.moved / sd.fires) + ' 步/次，贴成 '
      + sd.tagged + ' 张（' + pct(sd.tagged / sd.fires) + '）')
  }
  if (td.tagged > 0) {
    console.log('    贴出标签 ' + td.tagged + ' 张，带它的牌真打出去 ' + td.cashed
      + ' 张 → **兑现率 ' + pct(avg(td.cashed, td.tagged)) + '**')
    console.log('    其中这条线真判了 ' + td.fired + ' 次（占兑现 '
      + pct(avg(td.fired, td.cashed)) + '），平均预算 '
      + f2(avg(td.budSum, td.fired)) + '、用掉 ' + f2(avg(td.sumSum, td.fired))
      + '（**' + pct(avg(td.sumSum, td.budSum)) + '**），够着 '
      + f2(avg(td.gotSum, td.fired)) + ' 张/次')
    if (td.cashed === 0) {
      console.log('    ⚠ **标签一次都没打出去** —— 那不是幅度问题。'
        + '查 `doDraftTag` 挑没挑到牌、以及 AI 看不看得见这条线。')
    }
  }
  // 〈holdtag〉忍递：`empty/fires` **就是它的触发率** ——
  // 这一件是不是撞『条件太窄·形状错』那条死因，只看这一个数
  if (ht.fires > 0) {
    console.log('    ×〈holdtag〉忍递：打出 ' + ht.fires + ' 次，其中**这一手一张都没收到 '
      + ht.empty + ' 次（' + pct(avg(ht.empty, ht.fires)) + '）** → 真贴成 '
      + ht.tagged + ' 张（占空手 ' + pct(avg(ht.tagged, ht.empty)) + '）')
    console.log('      **这个百分比比 X 先看**：它是「忍手」这个条件的宽窄。'
      + '贴着 0 = 条件撞局面常量；贴着 1 = 这个条件等于没有（退化成零递少一句）。'
      + '两头之间才有「奖励忍手」可言。')
  }
  // 〈chaintag〉连递：`relink/cashed` 是链的存活率 ——
  // 跟燃烧族那个燃尽率同一个诊断（兑现间隔压到留存之下，数才回得来）
  if (ct.cashed > 0) {
    console.log('    ×〈chaintag〉连递：带链标签的牌打出 ' + ct.cashed + ' 张，凑成 '
      + ct.hits + ' 次（' + pct(avg(ct.hits, ct.cashed)) + '）→ 续上 '
      + ct.relink + ' 次 → **链存活率 ' + pct(avg(ct.relink, ct.cashed))
      + '**，一局里最长同时挂着 ' + ct.maxLen + ' 张')
    console.log('      存活率贴着 0 = 「成功才续」这个形状不成立（自循环点不着）；'
      + '`relink < hits` = 凑成了却挑不出牌贴（手里全贴过 / 全是 J / 全无点数）。')
  }
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
  // ⚠ 表头里原先还有一列「现价」，而**行里从来没打过它**〔2026-10-23 摘掉〕。
  // 模拟器侧没有价：`rules.js` 的 SKILLS 是手写副本，只抄了效果，
  // 没有 `unlock` 字段（grep `unlock|price|金币` → 0 命中）。
  // 要真打这一列得去读 `pages/examples/blackjack/draw-skills.uts`，
  // 那是另一件事；在那之前**表头不能挂一个空列** ——
  // 跟 ruleTag() 那次同一类错：标签跟底下的东西对不上，而没有检查会报。
  // ---- 「Δ胜率」这一列 2026-10-27 补的 ----
  //
  // 补它的理由是**目标档位的下限一直没有读数**：下限 1.0 是用户的体感线
  //（「带着它要能明确增加胜率」），而这张表从来只打分差 ——
  // 于是「X = 1 对应几个胜率点」这个问题，整个工具里没有一处回答得了。
  //
  // 口径跟 X 逐字同构（两侧平均，所以它跟 X 可以并排读）：
  //   winBack  = 我带那格我的胜率 − 基线我的胜率
  //   winFront = 基线我的胜率 − 对手带那格我的胜率
  //   Δ胜率 = (winBack + winFront) / 2，单位是**百分点**
  //
  // ⚠ 它不是「我带着它能赢几成」—— 那个绝对值在下面的基线行里。
  //   跟 X 一样，这是个**差**，而且两侧都算进来了
  console.log('  技能      覆盖面       后手    先手       X       D   Δ胜率    建议价')
  console.log('  ' + '-'.repeat(74))
  const o = rolesFor(args, role, true)
  const empty = R.emptyLoadout()
  // 基线格全表共用 —— 它不含任何槽技能，所以跟量哪一件无关
  const C = run(args.n, args.seed, empty, empty, o)
  const baseDiff = meanDiff(C)
  const baseWin = avg(C.wins[R.ME], C.games)
  const lines = []
  // ---- 原型过滤〔2026-10-27，用户定「只在模拟器里的技能不用再量了」〕----
  //
  // 判据是**名字带尖括号**：上架那天改中文名、`key` 一个字母不动
  //（《技能与关卡设计.md:5087》），所以 `〈〉` 恰好等于「还没上架」。
  // ⚠ 不拿 `refs.js` 的 `SIM_ONLY` 当判据 —— 那是**另一份手写名单**，
  //   两份必然分叉；而 `name` 是技能表自己带的，改名就是上架那一刀。
  //
  // **丢掉多少要打出来，不许静默截断** —— 一张少了 49 行的表看着跟
  // 「全量跑完」一模一样，而下一个人会以为原型都没过线
  // ⚠ 49 不是 59：`name: '〈'` 全文 59 处，其中 **10 处在角色表**
  //（`rules.js:3832-3924`），而 `all` 只遍历 `R.SKILLS` ——
  //   我报过一次 59，那是把两张表的匹配数加在一起了
  let skipped = 0
  for (let i = 0; i < R.SKILLS.length; i++) {
    const def = R.SKILLS[i]
    if (!args.proto && def.name.indexOf('〈') === 0) { skipped++; continue }
    const lo = R.kitWithOne(role, slotAt, i)
    const D = run(args.n, args.seed, lo, empty, o)
    const A = run(args.n, args.seed, empty, lo, o)
    const back = meanDiff(D) - baseDiff
    const front = baseDiff - meanDiff(A)
    const winBack = avg(D.wins[R.ME], D.games) - baseWin
    const winFront = baseWin - avg(A.wins[R.ME], A.games)
    lines.push({
      name: def.name,
      cover: R.coverageOf(lo, i),
      back: back,
      front: front,
      x: (back + front) / 2,
      d: (front - back) / 2,
      winX: (winBack + winFront) / 2 * 100,
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
    //
    // ⚠ **R4 下这一列不印数**〔2026-10-23〕。`25 + X × 21` 的 21 是
    //   **R3 的锚**（每人每局 21.8 分时拟的），R4 每人每局 16.6 分，
    //   而且**不能按比例缩** —— 档值非线性，一件技能多收 1 张在 2/3 档里
    //   值 0 分、跨进 4/5 档值 3 分。缩出来的是估算不是测量。
    //
    //   印一列用旧锚算的价，比不印坏得多：它看着像个结论，而**这一跑
    //   恰恰就是用来定新锚的那一跑**（台账第四步）。所以 R4 打 `待定`，
    //   等新的 X 分布出来、新锚定了，再把常数换掉、把这个分支去掉
    //
    // ⚠ **这个闸 2026-10-27 从「`SCORE_BANDS !== null`」改成下面这样。**
    //   原先的闸只认 R4：R5 把 `SCORE_BANDS` 翻回 `null`（张=分），
    //   于是这一列**又开始印 R3 的锚算出来的价** —— 实测小样本印出
    //   「〈stonesurge〉220 / 洪水 170」，而现行最高价是 120。
    //   那正是上面那段注释预先警告过的错法（「印一列用旧锚算的价，
    //   比不印坏得多」），只是它防的是 R4，没防住 R5。
    //
    //   锚 `25 + X × 21` 是 **R3** 拟的，而 R3 = 张=分 **且无抢牌**。
    //   所以闸要同时认两件事，不能只认计分口径
    const anchorOK = R.SCORE_BANDS === null && !R.STEAL_ON
    const want = !anchorOK ? '待定'
      : l.x <= 0 ? '—'
        : String(Math.round((25 + l.x * 21) / 5) * 5) + (Math.abs(l.d) > 1 ? '?' : '')
    console.log('  ' + l.name.padEnd(10) + l.cover.padEnd(13)
      + sign(l.back).padStart(7) + sign(l.front).padStart(8)
      + sign(l.x).padStart(8) + sign(l.d).padStart(8)
      + (sign(l.winX) + '点').padStart(9)
      + want.padStart(8))
  }
  // 平局那一项 2026-10-27 补上 —— 用户要的。**没它读不出先手胜率**：
  // `wins` 两侧 + `draws` 才凑满 100%（平局谁都不记一笔，不是各记半笔），
  // 所以「后手 46.0%」的另一面不是 54.0%
  console.log('\n  基线（双方同角色、槽全空、**固定庄家先手**）：后手分差 '
    + sign(baseDiff) + '（标准误 ' + f2(stderrOf(C)) + '）'
    + '，后手胜率 ' + pct(baseWin)
    + ' · 先手 ' + pct(avg(C.wins[R.FOE], C.games))
    + ' · 平局 ' + pct(avg(C.draws, C.games)))
  // ⚠ 口径标签不能省（2026-10-23 栽的）：这一行跟 `base` 打的「后手分差」
  // 同名但**不同口径** —— `cmdBase` 是唯一传 freeFirst 的命令（自由切牌），
  // 别的一律 fixFirst = FOE。R4 下两者分别是 −0.08 和 +0.56，差 7σ，
  // 我当场把它当成了基线漂移去查 bug。标签长在打印处，才不会再查第二遍。
  console.log('  ⚠ 这一行**不能跟 `base` 的后手分差相减**（那边是自由切牌）。')
  console.log('  每件的标准误约 ' + f2(lines.length > 0 ? lines[0].se : 0)
    + ' —— 比它小的差异不作数')
  // 丢了几件要说出来（见上面那段）。`--proto` 下 skipped 恒 0，这一行不印
  if (skipped > 0) {
    console.log('  上表 ' + lines.length + ' 件 = 上架件；'
      + '另有 **' + skipped + ' 件模拟器专属原型（名字带〈〉）没量** —— '
      + '要连原型一起跑加 `--proto`。')
  }
  // 目标档位 2026-10-15 从「+3~5」降下来：每人每局积分从 24.4 掉到 21.8
  //（终局规则换了），比例没变、绝对值跟着走
  //
  // ⚠ **2026-10-23 R4（分档计分）之后这个区间作废。**
  //   每人每局积分 21.8 → 14.0（**同一个决策档** —— 两个数都是
  //   `JACK_HOLD=0` + 不忍那套下量的，所以这个对比成立），
  //   所以 +2.7~4.5 在 R4 下**一定不是对的区间**。
  //   但新区间**不能按比例缩** —— 档值是非线性的，一件技能多收 1 张在
  //   2/3 档里值 0 分、跨到 4/5 档里值 3 分。按比例推出来的数是估算，不是测量。
  //
  // ---- 新区间 +1.0 ~ +5.5〔2026-10-26 用户定〕----
  //
  // 下限 1.0 —— 用户原话：「**我带这个技能要能明确为我增加胜率**」。
  //   注意这是条**体感线**，不是统计线。统计上 2σ = 0.26 就跟空槽分得开了，
  //   而 1.0 比它高近 4 倍 —— 那是故意的：分得开 ≠ 玩家感觉得到。
  //
  // 上限 5.5 —— 用户定。现表两件在线上（对换 6.15、引潮 5.94）。
  // 〔2026-10-30 用户定：**上限 5.5 → 4.8**（「目标档位改成：单件 X +0.6 ~ +4.8」）。数在文件头的 X_CAP，打印都读它〕
  //
  // ⚠ **这个区间不是按比例从 2.7~4.5 推来的**（那条路前面刚判死）。
  //   它是用户直接定的体感线，所以**不要拿 16.6 去反算百分比给它找依据** ——
  //   那个百分比的分子是分差、分母是单侧积分，口径本来就是混的。
  //
  // ---- 配合件走「边际 X」〔同日用户定〕----
  //
  //   「一些需要配合的技能，跟特定的技能一起使用后 X 能比单用那个技能多 1
  //     也算作合格。**这个组合使用而增加的 X 也要量出来作为这个技能的 X**」
  //
  // 所以单带 X < 1 的件不是立刻判死，而是**改用 `pair` 量边际 X**
  // （= X(两件都带) − X(只带搭档)），拿那个数当它的 X 再对这条线。
  // `cmdPair` 2026-10-26 为此改成了两侧都量 —— 在那之前它报 `back`，
  // 换算不回 X，这条判据**根本量不出来**。
  //
  // ⚠ **下面那行打印原先说「而这一跑是 14.0」—— 错的**〔2026-10-26 修〕。
  //   14.0 是 `ref` 的第三档（`sim.js:746`：不忍 + 不守 J）。这一跑走
  //   **现行默认**（`HOLD_ONCE` 开、`JACK_HOLD=3`），而那一档是 **16.6**。
  //   实证：`vs swapcard swapcard -n 20000` 的基线格 16.88 / 16.31，
  //   平均 16.60，跟 `ref` 的 now 值逐位吻合；后手分差 +0.56 也跟这张表的
  //   基线行相同，所以是同一格。
  //
  //   代价是实打实的：这行印出来的 14.0 被抄进了《全技能速查》的口径行，
  //   于是「X=6.15 在 14 分的盘子里占 44%」看着像个硬结论 —— 而真数是
  //   16.6，而且 **X 是分差不是单侧积分**（对换实测我只涨 3.48，占 20.6%）。
  //   **一个口径标签错了，会让读它的人算出一个自洽但错的比例。**
  //
  // ⚠ **这个闸 2026-10-27 一起改了**，病跟上面那一列同形：
  //   它拿「`SCORE_BANDS === null`」当「这是 R3」，而 R5 也是 null ——
  //   于是 R5 下印的是 R3 的旧区间 +2.7~4.5（已作废两次的那个）。
  //   R3 的标志是**张=分且无抢牌**，两件都要认
  if (R.SCORE_BANDS === null && !R.STEAL_ON) {
    console.log('\n  目标档位：单件每局 +2.7 ~ +4.5 分（看 **X** 这一列）。')
    console.log('  〔这是 R3「分 = 张数」口径的旧区间，只在退回 R3 时有效。〕')
  } else {
    // ---- 下限 2026-10-27 从体感线换成**胜率线**，而且**现算不写死** ----
    //
    // 用户原话：「**把胜率提高到 50%，X 需要多少，这个作为区间起点**」。
    // 口径用户定：**座位平均（跟 X 同口径）**。
    //
    // 推导的第一步是个**恒等式，不用量**：座位平均口径下，基线那一格的胜率
    // **恒等于 `(100 − 平局%) / 2`** —— 基线格双方配装完全相同，于是
    // `wins[ME] + wins[FOE] + draws = games`，取两侧平均就是各占非平局的一半。
    // （R5 验过逐位相等：(46.0 + 51.2)/2 = 48.60 == (100 − 2.8)/2。）
    // 所以「补到 50%」要补的正好是 **平局% / 2**，再除以 Δ胜率/X 的斜率。
    //
    // ⚠⚠ **为什么现算而不是填一个常数。**
    //   它随**平局率**浮动，而平局率是**规则档的属性**、不是技能的属性
    //   （R5 2.8% → R6 2.6%）。写死的话，下次换规则档这条线会**静默过期**
    //   —— 而本项目栽过的那一整类（`WADE_SELF` 改定稿忘翻默认值、
    //   `CHAIN_SELF` 默认值不等于 desc、`FLOW_SPAN` 注释自称的默认值
    //   不等于代码的）全是同一个病：**一个跟着别处走的量被抄成了常数。**
    //
    // 两种算法都打出来，取**偏严**那个（见下面「为什么取严的」）：
    //   甲 **斜率法**：门槛附近那一档（x ∈ [0.6, 1.6]）过原点拟合。
    //     不取全表平均 —— 高 X 段比值明显低（胜率有天花板，洪水是全表最低），
    //     把它放进来会**压低斜率、抬高门槛**。
    //   乙 **夹逼法**：直接在表里找夹住目标 Δ胜率 的那两件，线性插值。
    //     它**不用模型**，而且正好落在关心的那一点上；代价是只吃两格的噪声。
    const drawPct = 100 * avg(C.draws, C.games)
    const target = drawPct / 2      // = 要补的 Δ胜率（百分点）
    // 甲
    const near = lines.filter(function (l) { return l.x >= 0.6 && l.x <= 1.6 })
    let sx = 0, sw = 0
    for (let i = 0; i < near.length; i++) { sx += near[i].x; sw += near[i].winX }
    const slope = sx > 0 ? sw / sx : 0
    const xSlope = slope > 0 ? target / slope : -1
    // 乙：按 x 升序扫，找第一对在 Δ胜率 上夹住 target 的相邻件
    const asc = lines.slice().sort(function (a, b) { return a.x - b.x })
    let xBrack = -1, loName = '', hiName = ''
    for (let i = 0; i + 1 < asc.length; i++) {
      const lo = asc[i], hi = asc[i + 1]
      if (lo.winX <= target && target <= hi.winX && hi.winX > lo.winX) {
        xBrack = lo.x + (target - lo.winX) / (hi.winX - lo.winX) * (hi.x - lo.x)
        loName = lo.name; hiName = hi.name
        break
      }
    }
    const cands = [xSlope, xBrack].filter(function (v) { return v > 0 })
    // 取偏严（大的那端）再向上取整到 0.1。**理由是代价不对称**：
    // 挡松了 = 一件该重做的件留在表里（没人会再查它）；
    // 挡严了 = 一件边缘件去量一次边际 X（而那条补救口本来就有）。
    const floor = cands.length > 0 ? Math.ceil(Math.max.apply(null, cands) * 10) / 10 : 0
    if (floor > 0) {
      console.log('\n  目标档位：**单件 X +' + f1(floor) + ' ~ +' + f1(X_CAP) + '**')
      console.log('    上限 ' + f1(X_CAP) + '〔2026-10-30 用户定；原 5.5〕· 下限**这一跑现算的**'
        + '〔2026-10-27 用户定：「把胜率提高到 50%」· 座位平均口径〕：')
      console.log('      基线胜率 ≡ (100 − 平局 ' + f1(drawPct) + '%) / 2 = '
        + f2((100 - drawPct) / 2) + '%  ⇒ 要补 Δ胜率 ' + f2(target) + ' 点')
      if (xSlope > 0) {
        console.log('      甲 斜率法：x∈[0.6,1.6] 共 ' + near.length
          + ' 件，斜率 ' + f2(slope) + ' ⇒ X_min ' + f2(xSlope))
      }
      if (xBrack > 0) {
        console.log('      乙 夹逼法：' + loName + ' / ' + hiName
          + ' 两件夹住 ⇒ X_min ' + f2(xBrack))
      }
      console.log('      取偏严那端、向上取整到 0.1 ⇒ **+' + f1(floor) + '**'
        + '（每件 se ' + f2(lines.length > 0 ? lines[0].se : 0)
        + '，所以别读小数点后第二位）')
    } else {
      // 算不出来要说清是哪一步断的，别打一个假的 0
      console.log('\n  目标档位：上限 +' + f1(X_CAP) + '〔2026-10-30 用户定；原 5.5〕· '
        + '**下限这一跑算不出来**')
      console.log('    两种算法都没落地：门槛档（x∈[0.6,1.6]）'
        + (near.length === 0 ? '一件都没有' : '有 ' + near.length + ' 件但斜率 ≤ 0')
        + '，且没有两件在 Δ胜率 上夹住 ' + f2(target) + ' 点。')
      console.log('    多半是表太短或口径不对 —— 别退回写死的 1.0，那是已作废的体感线。')
    }
    console.log('    低于下限的件**先别判死**：配合件改量**边际 X**')
    console.log('      （`pair <这件> <搭档>`，看「已有搭档再加这件」那一行），')
    console.log('      边际 X ≥ 1 也算合格，而且那个数就当它的 X。')
    console.log('    ~~旧下限 1.0~~ 是**体感线**（「带着它要能明确增加胜率」，'
      + '2026-10-26 定），2026-10-27 换成上面这条胜率线；')
    console.log('      ~~更旧的 +2.7~4.5~~ 是 R3「分 = 张数」口径的。'
      + '要退回 R3 对照：`SCORE_BANDS=off`。')
  }
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
  // ⚠ 这一行 2026-10-26 补的，补的是**这张表从来没打过自己的单位**。
  //   X / D 都是 `meanDiff` 的差，而 `meanDiff` = 我的分 − 对手的分
  //   （`sim.js:424`）—— 于是「我多拿的」和「对手少拿的」都算在里面。
  //   零和件（对换、摘钩这类抢归属的）X ≈ 单侧收益的两倍，
  //   拿 X 直接除「每人每局 16.6」会把占比**算成两倍**。
  //
  // 🔴 **那个 16.6 写死了，于是 R5 下它每跑一次都在说谎**〔2026-10-27 修〕。
  //   16.6 是 R4（阶梯计分）的数，而 R5（张 = 分 + 抢牌）是 **21.9** ——
  //   差 **32%**，拿它去算任何占比都偏三成。
  //   ⚠ **这是同一个坑的第三次**：`:769-772` 那段注释（「写死一套的后果是
  //   每跑一次都在说谎，而且是往『看着正常』的方向说」）写的就是它，
  //   而 `cmdBase` 那边早就改成跟着口径走了（`:856-858` 的三档 `ref`）——
  //   **这一行是漏改的那个**。所以这回不填常量，**直接从这一跑的基线格算**：
  //   `C.score` 是两侧积分之和的累加（`:204`），除以 2 再除局数就是每人每局。
  const perSide = (C.score[R.ME] + C.score[R.FOE]) / 2 / Math.max(1, C.games)
  console.log('  ⚠ **X 是分差，不是「我多拿几分」** —— 我多拿的 + 对手少拿的。')
  console.log('    参照系每人每局 ' + f1(perSide) + ' 分（**这一跑的基线格算出来的**），'
    + '但零和件的 X ≈ 单侧收益 ×2，')
  console.log('    要拆单侧看 `vs <技能> <技能>` 的「拆开双方得分」那张表。')
  console.log('\n  换 --role / --slot 会改覆盖面，数就不能跟这一列比了。')
  console.log('  常驻特殊技能用 `roles` 子命令。')
}

// ---------- roles：八个角色的常驻技能各值多少分 ----------

function cmdRoles(args) {
  // ⚠ 这儿原先硬编码「八个角色」〔2026-10-23 改掉〕。它早就不是 8 了 ——
  //   `R.DRAW_ROLES` 比上架的那几条多，其余是模拟器专属原型
  //   （潮主·花色 / 通号人·双槽 …）。硬编码一个数的坏处跟
  //   上面参考值那一列同形：**每跑一次都在说谎，而且往「看着正常」的方向说**
  console.log('共 ' + R.DRAW_ROLES.length + ' 个角色（含模拟器专属原型，'
    + '上架的以 `draw-skills.uts` 的 `DRAW_ROLES` 为准）的**常驻特殊技能**，'
    + '各跑 ' + args.n + ' 局（种子 ' + args.seed + ' 起）')
  console.log('槽一律空着 —— 量的是那件常驻技能本身，不含槽里插的东西')
  // X / D 两列是 2026-10-15 补的（原先只有单侧的「分差」）——
  // 口径跟 `all` / `one` 一致，所以这几个数可以直接跟全表比
  console.log('口径跟 `all` 一致：三格（基线 / 我带 / 对手带），**两侧都量**\n')
  // 「Δ胜率」= 常驻技的两侧平均胜率增量（百分点，口径同 `all`）；
  // 「满配胜率」= 插满槽那一格我方的**绝对**胜率 —— 定档看的是满配，
  // 所以这一列给绝对值，跟常驻技那个增量不是一个东西，别相减
  console.log('  角色    特殊技      槽数  覆盖    常驻 X      D'
    + '   Δ胜率    满配    每槽  满配胜率')
  console.log('  ' + '-'.repeat(90))
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
      // 双装把「槽数」和「件数」拆开了〔2026-10-28〕。`perSlot` 照旧除槽数
      //（那一列的定义就是「每槽」），但**两个数不等的卡要标出来** ——
      // 不标的话 riggertwin 的「每槽」是 3 件的值除以 2 个槽，
      // 而它跟别的卡那一列**不是同一把尺子**，照旧能横着排、看不出来
      nKit: R.roleKitCount(i),
      back: m.back, front: m.front, x: m.x, d: m.d, se: m.se,
      full: fullGain,
      perSlot: nSlots > 0 ? (fullGain - m.back) / nSlots : 0,
      win: m.winGain,
      winX: m.winX,
      fullWin: avg(full.wins[R.ME], full.games),
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
      + (sign(l.winX) + '点').padStart(9)
      + sign(l.full).padStart(8)
      + sign(l.perSlot).padStart(8)
      + pct(l.fullWin).padStart(9)
      // 带双装的卡：槽数 ≠ 件数，于是「每槽」那一列跟别的卡不同口径。
      // **标出来**，别让它看着像可以横比〔2026-10-28〕
      + (l.nKit !== l.nSlots ? '  ⚠' + l.nKit + ' 件' : ''))
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
// 花色槽 / 点数槽的区别。
//
// ⚠ 这句只管**这儿怎么配装**，不是说两种槽等价 —— 设计文档那一章的
// 四条补充条款全是「某种槽里失效 / 坑自己」的实例，而**条款四（颜色）
// 在花色槽里差 4.15 分**。设计一件新技能的时候照那四条量，别照这一句
// ⚠⚠ **这张名单 2026-10-27 按 R5 的 X 重排了**，原文留着当对照：
//
//     旧：chain, kindle, swapcard, flow, wild, peak, draft, coldhue
//
//   重排的理由是它**已经不按 X 降序了**，而那正是它存在的全部依据：
//
//     **前两件在 R5 下是全表最弱的几件**。传火（`chain`）R5 X **+0.96**、
//       引火（`kindle`）+3.31 —— 而传火排第一是 R2 时代的事（那时它 4.86）。
//       于是上面那段「原先插表序前 N 件、系统性低估角色」的病**又回来了**，
//       只是换了个入口：这一次偏的不是表序，是**过期的排序**。
//     **末两件已经不存在**：`draft`（吃水）2026-10-25 删、`coldhue`（冰色）
//       更早。`skAt` 对它们返回 −1 → 记一笔警告然后**静默插一个空槽**，
//       所以 7 槽以上的卡（现在没有）会少一件。这是「失败是静默的」第 N 例。
//
//   新序 = 全技能速查那张 R5 表的前八件（`all -n 20000`，江口闸官 A 槽）：
//     洪水 6.86 / 对换 5.55 / 伏流 4.81 / 分饵 4.67 /
//     易流 4.64 / 涉水 4.50 / 摘钩 3.65 / 齐顶 3.50
//
//   ⚠ **这一改让「满配 / 每槽 / 满配胜率」三列的所有旧数作废** ——
//     包括全技能速查第三张表和 `out-roles-r5win.txt`。必须重跑
//     `sim.js roles -n 8000`。
//
//   ⚠ **顺子族三件（伏流 / 易流 / 涉水）现在挤在第 3、5、6 位**，
//     而它们之间有实测协同（`pair` 那一批：+0.46~0.62）。所以 3 槽以上的卡
//     的「满配」含一笔**族内协同**，不是八件各自 X 的和。
//     旧名单同样有这个毛病（传火 / 引火同是燃烧族，排 1、2），
//     所以这不是新引入的偏，但**换族之后偏的方向和大小都变了**，
//     别拿新满配去减旧满配。
//
// ⚠⚠ **2026-10-27 当天又改了一次（第二刀）：对换删了。**
//
//   上面那个新序的第 2 位是【对换】（5.55），而它同日被删了
//（拆成【摘钩】+【倒饵】，墓碑在 `draw-skills.uts` 的 `DEAD_SKILLS`）。
//   留着它的后果跟上面 `draft` / `coldhue` 那一条**一模一样**：
//   `skAt` 返回 −1 → 记一笔警告 → **静默插一个空槽**，2 槽以上的卡少一件。
//
//   按这张名单自己的口径（「X 降序 + 游戏里在卖」）补第 9 位的
//   **【引火】（R5 +3.31）**，名单仍是八件：
//     洪水 6.86 / 伏流 4.81 / 分饵 4.67 / 易流 4.64 /
//     涉水 4.50 / 摘钩 3.65 / 齐顶 3.50 / **引火 3.31**
//
//   ⚠ **没有拿【倒饵】（同日上架）补这一位**：它 R6 X 只有 +2.75，
//     够不着第八位，进来就破了「X 降序」这条唯一依据。
//   ⚠ **「满配 / 每槽 / 满配胜率」三列又一次全废** —— 上面那一刀的重跑
//     （如果已经跑了）也作废。要重跑 `sim.js roles -n 8000`。
//
// ---- 🔴 2026-10-28：名单**又不按 X 降序了**（这回是数变了，不是件没了）----
//
//   【洪水】翻牌数 6 → 4（`FLOOD_CAP` 默认值跟着改了），
//   X 从 **+6.41 掉到 +3.95**〔R6 · one · A 槽 · 20000 局 · se 0.15〕。
//   按这张名单自己的唯一依据（X 降序）它该从**第 1 位挪到第 6 位**：
//     伏流 5.04 / 易流 4.75 / 涉水 4.71 / 分饵 4.67 / 摘钩 4.13 /
//     **洪水 3.95** / 齐顶 3.65 / 引火 ?
//
//   **没有重排** —— 重排一次就把「满配 / 每槽 / 满配胜率」三列再废一轮，
//   而那三列这个月已经废过两次、一次都还没重跑。排不排是单独一个决定，
//   要排就连着 `sim.js roles -n 8000` 一起跑。
//   在那之前：**这张名单的第 1 位不再是最强那件**，所有拿
//  「♥ 槽排第几」做文章的推论（`rules.js` peachlast / heartslot 那几段）
//   都要先回来看这一行。
// 〔2026-10-29：**洪水删了**，第 1 位换成名单外 X 最高的上架件【满墙】（R6 A 槽 +4.87）。
//   照 10-27 删对换时那个先例。**满配那几列再废一次**〕
// 〔2026-10-29：**涉水撤了**，那一位换成名单外 X 最高的上架件【插流】（R7 A 槽 +5.18）。照删对换 / 洪水的先例。满配那几列再废一次〕
// 〔2026-10-30：**易流（swapflow）10-29 就下架了，这一位一直没换**（fingerprint 审计顺带查出）——
//   江口闸官 / 流钥客的满配因此带着一件不存在的技能。照删对换 / 洪水 / 涉水的先例，换成名单外 X 最高的上架件【一色】
//  （R7 A 槽 +4.62）。只有插满 4 槽的卡用得到第 4 位。名单其余位置没动（**仍不是严格 X 降序**，见上面 10-28 那段）〕
const KIT_ORDER = [
  'stonefull', 'flow', 'gift', 'suitify', 'orderins', 'unhook', 'peak', 'kindle'
]

// ⚠ 上界走 **`roleKitCount`**，不是 `slots.length`〔2026-10-28 改〕——
// 带双装槽的卡（`twin` 字段）插得下 **槽数 + 1** 件，而 `kitFromRole` 读的是
// `slotSkills[slots.length]` 那一格。写 `slots.length` 的后果是
// **双装那一格永远空着**，而那是静默的：报表照样打三个槽、数照样出，
// 只是少插一件（这一类坑的实例见 CLAUDE.md 第四节的同色闸传参）
function kitFor(role) {
  const n = R.roleKitCount(role)
  const picks = []
  for (let i = 0; i < n; i++) {
    // `KIT=a,b,c` 覆写插件序（第 i 件插第 i 格，双装第 2 件在末尾）〔2026-10-29，量〈twinval〉加的：
    // 默认序把洪水 / 伏流插进双装槽，而两件都清空点数 ⇒ 互通永远用不上〕
    const order = process.env.KIT ? process.env.KIT.split(',') : KIT_ORDER
    picks.push(skillIndexOf(order[i % order.length]))
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
  // ---- 双装槽的第 2 件〔2026-10-28 补〕----
  //
  // **为什么非补不可**：上面那个循环走的是 `r.slots.length`，而 `kitFor`
  // 走的是 `R.roleKitCount`（= 槽数 + 双装那一件）。双装把这两个数**拆开**
  // 之后，带 `twin` 的卡**插了 3 件却只印 2 件** —— 于是那一跑的
  //「我到底插了什么」在报表里是**残的**，而分值照旧有数、一眼看不出来。
  //
  // 这正是 CLAUDE.md 第四节那条的形状（同色闸：bug 下 4.89 / 修好 4.88）。
  // 实际损失已经发生过一次：`role riggertwin -n 8000` 跑出 +14.68，
  // 而报表只列了「洪水 / 伏流」，第 3 件（分饵）**查代码才知道**
  const twin = R.twinSlotOf(role)
  if (twin >= 0 && picks.length > r.slots.length) {
    const extra = picks[r.slots.length]
    console.log('  槽 ' + (twin + 1) + '（' + r.slots[twin]
      + '）**双装第 2 件**：'
      + (extra >= 0 ? R.SKILLS[extra].name : '（空）')
      + '　← 跟上面同一个槽，命中时两件都响')
    console.log('  〔槽数 ' + r.slots.length + '、**技能件数 '
      + R.roleKitCount(role) + '** —— 这两个数不再恒等。'
      + '零点那一档是 `TWIN_SLOT=off`（少这一件）〕')
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
  // ---- 【堆牌】的诊断口〔2026-10-28 补〕----
  //
  // **为什么非补不可**：上面那段「推牌诊断」是 2026-10-20 为【逆涌】
  // （开河工的常驻技）加的，而 10-28 逆涌从【推牌】换成【堆牌】之后
  // `surge.flipped` 恒为 0 → **那一段静默地不再打印**，于是
  // 「这张卡的常驻技到底发动了几次」在 `role` 这个命令里取不到了。
  // 这正是 CLAUDE.md 那条「新机制必须配一个『它做了几次』的计数」的反面：
  // 计数器一直在累加（`heapStage` 记 `PROTO_STAT.heap`），只是没人印。
  //
  // 复用 `cmdOne` / `cmdVs` 用的那一个 `printHeapDiag()`，**不要再写一份**
  // —— 它自己带闸（`fires`/`tags`/`forced` 全 0 就不印），所以别的角色
  // 跑这个命令时这一段不会冒出来
  printHeapDiag()
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
  // ---- 〈twinval〉的诊断行〔2026-10-29〕：它到底做了几次 ----
  const tvs = R.PROTO_STAT.twinval
  if (tvs && tvs.plays > 0) {
    console.log('')
    console.log('  ---- 〈twinval〉诊断（TWINVAL=' + R.TWINVAL + '）----')
    console.log('    双装槽点数的牌打出 ' + f2(tvs.plays / args.n) + ' 张/局，'
      + '其中**只靠互通才钓到** ' + f2(tvs.gained / args.n) + ' 张/局（'
      + pct(avg(tvs.gained, tvs.plays)) + '），互通让起点更深 ' + f2(tvs.deeper / args.n) + ' 张/局')
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
// ---------- 【攒组合】的诊断口〔2026-10-26〕 ----------
//
// 用户的问题是「留在手中等集齐再打 / 原打法 哪一种分数比较高」，
// 而**分差一个数答不了它**（跟养堆那一组同一个理由）：
// 分差 0 可能是「一次都没忍成」，也可能是「忍了很多次、赚赔抵消」。
//
// 所以三件事要分开看：
//   甲 **忍成了没有** —— `忍了 N 手` 不为 0，而且「忍不住」占比不高；
//   乙 **集齐发生得够频繁吗** —— 集齐率太低的话这个打法根本没机会兑现；
//   丙 **接连打出发生了没有** —— 用户那句话的后半句。接连率低就说明
//      光「忍」不够，还要再给一个连击旋钮；高就说明贪心自己会接。
function printComboDiag(sum, g, label) {
  if (sum.comboHold[R.ME] + sum.comboHold[R.FOE]
    + sum.comboReady[R.ME] + sum.comboReady[R.FOE] === 0) return
  console.log('\n  ---- 攒组合诊断' + (label ? '·' + label : '')
    + '（COMBO_HOLD=' + (AI.COMBO_HOLD || '关')
    + ' / ' + (AI.COMBO_HOLD_BOTH ? '两侧' : '只有你')
    // 这一档改的是**忍的语义**（纯形态 / 只忍闲着的那张），
    // 不标出来的话两档的数长得一样、混进台账就分不开了
    + ' / ' + (AI.COMBO_HOLD_IDLE ? '只忍钓不着的' : '纯形态·一律忍')
    + '）----')
  for (let s = 0; s < 2; s++) {
    if (sum.comboReady[s] === 0 && sum.comboHold[s] === 0) continue
    const who = s === R.ME ? '你  ' : '庄家'
    console.log('    ' + who
      + '  忍了 ' + f2(avg(sum.comboHold[s], g)) + ' 手/局'
      + '（占出牌 ' + pct(avg(sum.comboHold[s], sum.plays[s])) + '）'
      + '　集齐 ' + pct(avg(sum.comboReady[s], sum.plays[s])) + ' 的手'
      + '　账面放弃 ' + f2(avg(sum.comboHoldSum[s], g)) + ' 张/局')
    if (sum.comboForced[s] > 0) {
      console.log('    ' + who + '  其中**忍不住** '
        + f2(avg(sum.comboForced[s], g)) + ' 手/局'
        + '（占忍的 ' + pct(avg(sum.comboForced[s], sum.comboHold[s])) + '）'
        + ' —— 手里只剩料牌，randomFree 兜底打出去了')
    }
    if (sum.comboBaitPlay[s] > 0) {
      const chain = sum.comboChain[s]
      const broke = sum.comboBroke[s]
      console.log('    ' + who + '  料牌打出 '
        + f2(avg(sum.comboBaitPlay[s], g)) + ' 次/局'
        + '　**下一手接上提款牌 ' + pct(avg(chain, sum.comboBaitPlay[s])) + '**'
        + '（没接上 ' + pct(avg(broke, sum.comboBaitPlay[s])) + '）')
      const dangle = sum.comboBaitPlay[s] - chain - broke
      if (dangle !== 0) {
        console.log('      其中 ' + pct(avg(dangle, sum.comboBaitPlay[s]))
          + ' **打完料牌这一局就结束了**，没有下一手 —— 既不算接上也不算没接上')
      }
    }
  }
  console.log('    〔「账面放弃」是**毛数**，而且里面有不少 0'
    + '（本来也钓不着的料牌放弃 0 张）。净值看上面的 X / back，别拿它减〕')
}

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
  // ---- 2026-10-26 改成两侧都量 ----
  //
  // 原先走 `measure`（单侧），报的三个数都是 `back`，于是：
  //   · 不能跟全表的 X 相减（差一个 D）；
  //   · 协同**换算不成 X**（要「两件都带」那一格的 D，而对手侧没跑）。
  // 两条都是真障碍，而用户定的合格判据正好要那个换算。现在三个配装
  // 各跑两侧，基线格共用一次 → 7 格。
  const o0 = rolesFor(args, role, true)
  const C = run(args.n, args.seed, R.emptyLoadout(), R.emptyLoadout(), o0)
  const both = measureBothLo(args, role, lo, C)
  const onlyA = measureBothLo(args, role, R.kitWithOne(role, 0, atA), C)
  const onlyB = measureBothLo(args, role, R.kitWithOne(role, 1, atB), C)
  const nameA = R.SKILLS[atA].name
  const nameB = R.SKILLS[atB].name
  console.log('【' + nameA + '】(槽 1：' + slots[0] + ') + 【'
    + nameB + '】(槽 2：' + slots[1] + ')'
    + ' · ' + R.DRAW_ROLES[role].name + ' · ' + args.n + ' 局'
    + ' · ' + specialNote(args, role) + '\n')
  console.log('  口径：三个配装**各跑两侧**，基线格共用 —— 所以下面的 X / D'
    + '**可以直接跟全表相减**。')
  console.log('  〔2026-10-26 之前这儿只跑单侧，报的是 `back`。'
    + '那一批旧数要换算 `back = X − D` 才能比。〕\n')
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  const row = function (label, m) {
    console.log('  ' + label.padEnd(18) + 'X ' + sign(m.x)
      + '   D ' + sign(m.d) + '   back ' + sign(m.back))
  }
  row('只带' + nameA, onlyA)
  row('只带' + nameB, onlyB)
  row('两件都带', both)
  console.log('  （标准误：单件约 ' + f2(onlyA.se) + '，两件都带 ' + f2(both.se) + '）')
  // ---- 边际 X：用户 2026-10-26 定的「配合件」合格口径 ----
  //
  // 原话：「一些需要配合的技能，跟特定的技能一起使用后 X 能比单用那个技能
  // 多 1 也算作合格。**这个组合使用而增加的 X 也要量出来作为这个技能的 X**」。
  //
  // 所以配合件的 X 记作**边际 X** = X(两件都带) − X(只带搭档)。
  // 它跟「协同」不是一回事，差的正好是这件自己的单带 X：
  //   边际X(A) = 协同 + X(A)   〔协同 = X(两件) − X(A) − X(B)〕
  // 边际口径更宽松，而它恰好是**玩家的实感**：牌组里已经有 B 了，
  // 再塞一个 A 进来值多少 —— 这也是【拢水】上架时用的那个「自带 + 协同」。
  //
  // se：边际 X 展开后基线项消掉（见 measureBothLo 的注释），
  // 由四个格子定 —— 系数 1/2 来自 X = (back + front)/2
  const sq = function (v) { return v * v }
  const marginSe = function (m, solo) {
    return 0.5 * Math.sqrt(sq(stderrOf(m.test)) + sq(stderrOf(m.foeTest))
      + sq(stderrOf(solo.test)) + sq(stderrOf(solo.foeTest)))
  }
  const mA = both.x - onlyB.x
  const mB = both.x - onlyA.x
  const seA = marginSe(both, onlyB)
  const seB = marginSe(both, onlyA)
  // 合格线 ≥ 1（用户定）。判的时候**要扣掉标准误**：
  // 1.0 这条线上，一个 se 0.2 的数报 1.05 其实跟 1 分不开
  const verdict = function (v, se) {
    if (v - 2 * se >= 1) return '✓ 合格（减 2σ 仍 ≥ 1）'
    if (v >= 1) return '? 过线但 2σ 内含 1 —— 加局数再判'
    return '✗ 不合格（< 1）'
  }
  console.log('\n  ---- 边际 X（配合件的合格口径，用户 2026-10-26 定）----')
  console.log('  已有' + nameB + '，再加' + nameA + '：' + sign(mA)
    + '   se ' + f2(seA) + '   ' + verdict(mA, seA))
  console.log('  已有' + nameA + '，再加' + nameB + '：' + sign(mB)
    + '   se ' + f2(seB) + '   ' + verdict(mB, seB))
  console.log('  合格线：**边际 X ≥ 1**。配合件拿这个数当它的 X，'
    + '不拿单带 X（单带近 0 可以是设计意图）。')
  const synergy = both.x - onlyA.x - onlyB.x
  console.log('\n  协同（两件都带 − 各自单带之和）：' + sign(synergy) + ' 分')
  console.log('  协同和边际 X 差的正好是单带 X：边际X(' + nameA + ') = 协同 + X('
    + nameA + ')。**判合格看边际，不看协同。**')
  console.log('  这个数是**现在**的协同（没有组合技，纯粹是两件技能互相影响）。')
  console.log('  第九节的组合技做完之后再跑一遍，差额就是组合技自己的贡献。')
  console.log('\n  注意槽不一样大的角色会让这个数偏 —— 默认的江口闸官四个槽等大。')
  // 【攒组合】两格分开打：`both.test` 是「我带两件」那一格，
  // `both.foeTest` 是「对手带两件」那一格 —— `COMBO_HOLD_BOTH=1` 时
  // 后者才有数。**两格要分开看**：一格的忍法影响的是 back，另一格影响 front
  printComboDiag(both.test, both.test.games, '我带两件')
  printComboDiag(both.foeTest, both.foeTest.games, '对手带两件')
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
// 别的子命令里**只有 `pair` 给不出后者**（它走 `measure`，只跑两格）。
//
// ⚠ 这一行 2026-10-26 更正过。原文是「all / one / pair 一律只量后手那一侧」，
//   而那是**2026-10-12 换口径之前的老实况**：`cmdOne` 现在走 `measureBoth`
//   （1264）、`cmdAll` 两侧各跑一格（1398-1399 的 `D` / `A`），两条都报 X 和 D。
//   代价是实打实的 —— CLAUDE.md 记着因为这句话白补量了四格，
//   而正确的查法是 `sed -n '/function cmdOne/,+10p'`，**10 行之内**。
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
  //〔⚠ `deepline`（深海钓手）2026-10-23 删了，上面那条命令**跑不起来了** ——
  //  留着是因为这段记的是 `--slot` 那个 bug，换个角色名就对不上当时的数〕
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
  // ---- 【21 匹配】诊断表的两个行渲染器〔2026-10-26 从 mirror 块里提出来〕----
  //
  // 为什么提出来：不对称那一跑（`vs tagdraft suitcolor`）**原先一张诊断表都不打** ——
  // 它走 2590 那条分支，而诊断块整个在 `if (mirror)` 里面。
  // 后果是实打实的：量「穿过无点数」在**有人造堆上无点数**的棋盘上值多少，
  // 只能靠不对称跑（对称跑里 `stopVoid` 恒 0.0%，没人造），
  // 而那一跑恰好读不到「用掉几成」和「整堆吃完」—— **那两列比 X 先看**
  //（它们判这条轴是活的还是死的）。于是 X 读到了、判读它的两列读不到。
  //
  // 提出来而不是在下面再写一份：`rules.js` 反复写的那句 ——
  //「**复制一份逻辑，两份必然分叉**」。这张表的输出格式进过台账，分叉就对不上。
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
  const DRAFT_HEAD = '            发动   凑成率   堆厚   预算   用掉   用掉几成   够着几张'
  const DRAFT_STOP_HEAD = '            超预算   无点数断链   0点断链   被护   整堆吃完   空堆'
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
    console.log('  `all` / `one` 的口径跟这儿一致（两侧都量、报 X 和 D），'
      + '所以那两张表的数**可以直接跟这儿相减**；')
    console.log('  只有 `pair` 是单侧的（它只跑「基线 / 我带」两格，'
      + '报的是 `back` = X − D），**那一张不能**。')
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
      sdRow('易流·后手', D.swapflow, R.ME), sdRow('易流·先手', A.swapflow, R.FOE)
    ].filter(function (r) { return r !== null })
    if (sdRows.length > 0) {
      console.log('\n  ---- 诊断：成段的那几件怎么凑成的（顺子 / 排序）----')
      console.log('            打出次数   凑成率   平均段长   每次收成')
      for (let i = 0; i < sdRows.length; i++) console.log(sdRows[i])
      console.log('\n  「凑成率」低 → 瓶颈在**发动条件**；')
      console.log('  「每次收成」低 → 瓶颈在**收法**；')
      console.log('  两样都不低而分差仍低 → 收的那几张**本来也钓得到**')
      console.log('  （洪水那场查出来的那个机制，见 rules.js 的 stat.flood）。')
      // 【顺子匹配】失败带通配〔2026-10-30〕：这一手凑不成、它带上了【通配】的次数
      if (D.straight.failWild[R.ME] > 0 || A.straight.failWild[R.FOE] > 0) {
        console.log('  顺子失败带上【通配】：后手 ' + f2(avg(D.straight.failWild[R.ME], args.n))
          + ' 次/局 / 先手 ' + f2(avg(A.straight.failWild[R.FOE], args.n)) + ' 次/局'
          + '（≤ 打出 × (1 − 凑成率)：已带通配的不重贴）')
      }
      // 换序 / 调序多一个数：**真换了几次**（可选，换了不如不换就不换）
      if (D.order.swapped && D.order.swapped[R.ME] > 0) {
        console.log('  真换位置 ' + f2(avg(D.order.swapped[R.ME], args.n))
          + ' 次/局（后手）/ '
          + f2(avg(A.order.swapped[R.FOE], args.n)) + ' 次/局（先手）'
          + ' —— ÷打出次数 = 有几成手在动堆')
      }
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
      console.log(DRAFT_HEAD)
      console.log('    ' + dRow('后手（我）', drMe, R.ME))
      console.log('    ' + dRow('先手（对手）', drFoe, R.FOE))
      console.log('\n  ---- 为什么停（占发动次数的比例）----')
      console.log(DRAFT_STOP_HEAD)
      console.log('    ' + sRow('后手（我）', drMe, R.ME))
      console.log('    ' + sRow('先手（对手）', drFoe, R.FOE))
      console.log('\n  **「整堆吃完」高 = 瓶颈是堆太薄，不是预算不够** ——')
      console.log('  那样「调 CAP / 自己不占预算」这条轴是死的（条件撞局面常量）。')
      // ---- 【穿过无点数】那一档的计数口〔2026-10-26〕----
      //
      // **单独一行、只在真穿过时打**，不往上面那张表加列 ——
      // 加列会动表头宽度，而那张表的输出格式进过台账。
      //
      // 要的是「它做了几次」：这一档开着而这行是 0，就是
      // **一次都没穿过**（那件技能撞死因三，不是「弱」）；
      // 而上面停因表的 `无点数断链` 那一列在这一档下会**归零**
      // —— 两件事互为自检，对不上就是有一头接错了
      if (drMe.thruSum[R.ME] > 0 || drFoe.thruSum[R.FOE] > 0) {
        console.log('\n  ---- 【穿过无点数】穿过几张（每次发动平均）----')
        console.log('    后手（我）  ' + f2(avg(drMe.thruSum[R.ME], drMe.fires[R.ME]))
          + '      先手（对手）  ' + f2(avg(drFoe.thruSum[R.FOE], drFoe.fires[R.FOE])))
        console.log('  ⚠ 对着上面停因表的「无点数断链」读 —— 这一档下那一列该是 0.0%。')
      }
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
      // ---- `freshSum` 的自检，**只在违约时打**〔2026-10-27〕----
      //
      // `freshSum`（这一段里有几张是自己刚从堆牌区铺下去的）的自检本来是
      // 「零递 / 递吃 / 减递 / 多递那几格必须恒为 0」，而**那个自检第一次跑
      // 就读不到** —— 它印在 `printHeapDiag` 里，而那个函数开头
      //（`h.fires === 0 && h.tags === 0 && b.forced === 0`）会整段早退，
      // 于是**最该验它的那几格恰恰一个字都不印**。
      //
      // 所以把断言挪到这儿：21 匹配的诊断段零递是进得来的，而「堆牌一次
      // 都没发动过，却有牌被认成刚铺的」是个纯粹的矛盾 —— 真出现就是
      // `heapFresh` 没在回合开头清干净（`heapFlush` 那条早退前面那行）
      if (R.PROTO_STAT.heap.fires === 0 && R.PROTO_STAT.tagdraft.freshSum > 0) {
        console.log('\n  ⚠⚠ **自检不过**：堆牌一次都没发动，而「刚铺下去的」却有 '
          + R.PROTO_STAT.tagdraft.freshSum + ' 张 —— `G.heapFresh` 没清干净。')
      }
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
    //
    // ⚠ **「和」那一列 2026-10-23 拆成了两列：和(分) 和 和(张)。**
    //
    // 原先只有一列，而下面那句解释写的是「**它跌说明有牌被留在了堆上没人收**」
    // —— 那句话只在 **R3（积分 == 收走的张数）**下成立。R4 一分档就散了：
    // 和(分) 跌也可能是**档位挪了**（同样的牌数分成更多次小收），
    // 跟「牌留在堆上」毫无关系，而那恰好是洪水这类技能最可能干的事。
    //
    // 这是 R4 第三处「把分当张数用」，前两处在 `printCatchCurve`
    //（占总分的分母、收牌张数那条自检）和 `cmdBase` 的牌数守恒。
    // 三处的共同点：**R3 下两个量同名同值，所以混用了很久都没事；
    // R4 把它们劈开，而混用的地方不报错，只给一个看着合理的数。**
    console.log('\n  ---- 拆开双方得分（每局平均）----')
    console.log('            我的分   对手的分    和(分)   和(张)')
    const scoreRow = function (label, sum) {
      const me = avg(sum.score[R.ME], sum.games)
      const foe = avg(sum.score[R.FOE], sum.games)
      // 「牌去哪了」只能看这个 —— `sum.taken` 是**规则层的张数守恒账**
      //（`rules.js:8121`，跟 score 并排记）。不用 `sum.caught`：
      // 那是诊断口，易流那条路只进 taken 不进 caught（`rules.js:11759`）
      const cards = avg(sum.taken[R.ME] + sum.taken[R.FOE], sum.games)
      return label.padEnd(16)
        + f2(me).padStart(7) + f2(foe).padStart(11)
        + f2(me + foe).padStart(9) + f2(cards).padStart(9)
    }
    console.log('    ' + scoreRow('我空 / 对手空', C))
    console.log('    ' + scoreRow('我带 / 对手空', D))
    console.log('    ' + scoreRow('我空 / 对手带', A))
    console.log('    ' + scoreRow('我带 / 对手带', B))
    console.log('\n  对着基线行看：「我带」那行我涨了多少、对手跌了多少；')
    console.log('  「对手带」那行反过来。**两个「跌」不一样大**就是溢价的来源。')
    console.log('  **「牌去哪了」只能看「和(张)」** —— 它跌才说明有牌没人收（留在堆上或手里）。')
    console.log('  「和(分)」跌可以只是档位挪了（同样的牌分成更多次小收），别混着读。')
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
    console.log('  对手是**先手**，所以这是「技能在先手手里值多少」'
      + '（`all` / `one` 也给这个数，`pair` 不给）。')
    console.log('  负数说明那件技能是**自损**的。')
    console.log('  想干净地对比先后手就把同一件传两次：`vs '
      + R.SKILLS[atTheirs].key + ' ' + R.SKILLS[atTheirs].key + '`')
    // ---- 不对称跑的【21 匹配】诊断〔2026-10-26 补〕----
    //
    // **两行比的不是先后手，是两块棋盘。** 都取 `R.ME`（我这一侧），
    // 变的只有对手手里那件：`D` 格 = 我带 / 对手空（干净棋盘），
    // `B` 格 = 我带 / 对手带（主场）。所以这两行的差**就是对手那件
    // 对我这条线做了什么** —— 而上面那个「差中之差」只给它值几分。
    //
    // 为什么非打不可：这条线的判读**两列在 X 之前** ——
    //「用掉几成」趋 0 + 「整堆吃完」趋 100% = **压吃病**
    //（预算是这条线唯一的决策，病了就是决策被自己抹掉，X 落在档里也救不了）。
    // 不对称跑原先只给 X，于是主场那一格**读不到它有没有病**。
    const bdMe = B.draft
    const ddMe = D.draft
    if (bdMe.fires[R.ME] > 0 || ddMe.fires[R.ME] > 0) {
      console.log('\n  ---- 诊断：【21 匹配】我这一侧，两块棋盘（' + args.n + ' 局合计）----')
      console.log(DRAFT_HEAD)
      console.log('    ' + dRow('对手空手', ddMe, R.ME))
      console.log('    ' + dRow('对手带' + nameTheirs, bdMe, R.ME))
      console.log('\n  ---- 为什么停（占发动次数的比例）----')
      console.log(DRAFT_STOP_HEAD)
      console.log('    ' + sRow('对手空手', ddMe, R.ME))
      console.log('    ' + sRow('对手带' + nameTheirs, bdMe, R.ME))
      console.log('\n  ⚠ **先看「用掉几成」和「整堆吃完」，再看 X** ——')
      console.log('  用掉趋 0 + 整堆吃完趋 100% = 压吃病（预算这个决策被自己抹掉），')
      console.log('  那样 X 落在档里也不能用。两行的差就是对手那件对这条线做的事。')
      if (bdMe.thruSum[R.ME] > 0 || ddMe.thruSum[R.ME] > 0) {
        console.log('\n  ---- 【穿过无点数】穿过几张（每次发动平均）----')
        console.log('    对手空手  ' + f2(avg(ddMe.thruSum[R.ME], ddMe.fires[R.ME]))
          + '      对手带' + nameTheirs + '  '
          + f2(avg(bdMe.thruSum[R.ME], bdMe.fires[R.ME])))
        console.log('  ⚠ 对着上面停因表的「无点数断链」读 —— 这一档下那一列该是 0.0%。')
      }
    }
  }
  console.log('\n  四个格子全在同一个口径里（双方同角色），所以上面那些减法成立 ——')
  // ⚠ 这两行 2026-10-26 改了。原文是「**别拿它跟 `one X` 相减**，那条的
  //   对手不带角色，口径不一样」—— 那是 2026-10-12 换口径之前的实况，
  //   而这句打印一直留着。现在 `cmdOne` 走 `measureBoth`，两条逐位相同
  //   （实测 `one freeze` == `vs freeze freeze`）。真正不能减的是 `pair`
  console.log('  跟 `one ' + R.SKILLS[atMine].key
    + '` **同口径**（两侧都量），可以相减；')
  console.log('  不能减的是 `pair` —— 它只跑两格，报的是 `back` = X − D。')
  console.log('\n  四个格子的后手分差：')
  console.log('    我空 / 对手空　　　 ' + (meanDiff(C) >= 0 ? '+' : '') + f2(meanDiff(C))
    + '   胜率 ' + pct(avg(C.wins[R.ME], C.games)))
  console.log('    我空 / 对手带　　　 ' + (meanDiff(A) >= 0 ? '+' : '') + f2(meanDiff(A))
    + '   胜率 ' + pct(avg(A.wins[R.ME], A.games)))
  console.log('    我带 / 对手空　　　 ' + (meanDiff(D) >= 0 ? '+' : '') + f2(meanDiff(D))
    + '   胜率 ' + pct(avg(D.wins[R.ME], D.games)))
  console.log('    我带 / 对手带　　　 ' + (meanDiff(B) >= 0 ? '+' : '') + f2(meanDiff(B))
    + '   胜率 ' + pct(avg(B.wins[R.ME], B.games)))
  // ---- 【堆牌】/【上牌区】的诊断口〔2026-10-26 加到 `vs` 上〕----
  //
  // 加这一行的理由跟上面 `dRow` 被提出 `if (mirror)` 那次**一模一样**：
  // 原先 `printHeapDiag()` 只挂在 `cmdOne` 上，而这两件原型的量测脚本
  // 跑的是 `vs X X`（要跟零递 / 压舱那两个已上架的锚同口径相减）——
  // 于是 X 读得到，而「它到底做了几次」那几列一行都读不到。
  // 这个仓库为「数读到了、判读它的那几列读不到」付过两次钱了。
  //
  // 挂在函数末尾、不在 `if (mirror)` 里面：不对称跑（`vs heapdraft press`
  // 那种）同样要这几列，而那恰恰是对称跑答不了的问题
  printHeapDiag()
  // 同一条理由（2026-10-28）：这一族的量测脚本也是 `vs X X`，
  // 而「兑现率 / 触发率 / 链存活率」三列在 `vs` 下原先一行都读不到
  printStoneDiag()
  printDraftTagDiag()
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

// ---------- slottag：〈槽钥〉四档（顺子/顺序/21/花色）----------
//
// 口径：
//   空槽  = measureSpecial（常驻技本身；预期 ≈ 0，因为触发不了「触发技能槽」）
//   满配  = measureBothLo（KIT_ORDER 前 4 件，两侧都量）—— **真数在这儿**
//   边际  = 满配 X(KIND) − 满配 X(off)（同槽同装，只差贴不贴）
//
// KIND 走 env `SLOTTAG_KIND`（rules 加载时读）。一次进程只能量一档，
// 四档 + off 对照要五个进程（见跑法注释）
function cmdSlottag(args) {
  const role = R.roleIndexOf('flowkey')
  if (role < 0) {
    console.log('找不到角色 flowkey —— rules.js 的 DRAW_ROLES 里没有')
    return
  }
  const r = R.DRAW_ROLES[role]
  // 强制带常驻技 —— 这一命令量的就是它；rolesFor 默认关掉
  args.special = true
  const sign = function (v) { return (v >= 0 ? '+' : '') + f2(v) }
  const kind = R.SLOTTAG_KIND
  const skipEmpty = !!args.full
  console.log('【流钥客】flowkey · KIND=' + kind
    + ' · 槽 ' + r.slots.join('/')
    + '（' + R.roleCover(role) + ' 张）· ' + args.n + ' 局'
    + (skipEmpty ? ' · 只跑满配' : ''))
  console.log('口径：空槽 = measureSpecial；满配 = measureBothLo（两侧，可跟全表减）')
  console.log('满配插 KIT_ORDER 前 ' + R.roleKitCount(role) + ' 件\n')

  if (!skipEmpty) {
    const emptyM = measureSpecial(args, role)
    console.log('  空槽常驻  后手 ' + sign(emptyM.back)
      + '  先手 ' + sign(emptyM.front)
      + '  X ' + sign(emptyM.x)
      + '  D ' + sign(emptyM.d)
      + '  se ' + f2(emptyM.se))
  } else {
    console.log('  空槽常驻  （本跑跳过；smoke 已确认 X=+0.00）')
  }

  const picks = kitFor(role)
  for (let i = 0; i < picks.length; i++) {
    console.log('  满配槽 ' + (i + 1) + '（' + r.slots[i] + '）：'
      + R.SKILLS[picks[i]].name)
  }
  // 诊断口清零 —— 只要满配这一段的比值（空槽段 fires 恒 0，混进去只稀释分母）
  const st = R.PROTO_STAT.slottag
  st.fires = 0
  st.tagged = 0
  st.cashed = 0
  st.orderFired = 0
  st.orderGot = 0
  R.PROTO_STAT.tagdraft.tagged = 0
  R.PROTO_STAT.tagdraft.cashed = 0
  R.PROTO_STAT.chaingift.tagged = 0
  R.PROTO_STAT.chaingift.cashed = 0
  R.PROTO_STAT.chaingift.fired = 0
  R.PROTO_STAT.matchkey.given = 0
  R.PROTO_STAT.matchkey.used = 0
  R.PROTO_STAT.matchkey.hits = 0

  const full = measureBothLo(args, role, R.kitFromRole(role, picks))
  console.log('\n  满配      后手 ' + sign(full.back)
    + '  先手 ' + sign(full.front)
    + '  X ' + sign(full.x)
    + '  D ' + sign(full.d)
    + '  se ' + f2(full.se))

  console.log('\n  ---- 诊断：【流钥】----')
  console.log('    KIND=' + kind
    + '  触发贴标 ' + st.fires + ' 次，真贴成 ' + st.tagged
    + '（' + pct(avg(st.tagged, st.fires)) + '）'
    + '，带标签打出 ' + st.cashed
    + ' → 兑现率 ' + pct(avg(st.cashed, st.tagged)))
  if (kind === 'off' && st.fires === 0) {
    console.log('    off 档 fires=0 —— 对照格干净（没走进贴标签）')
  }
  if (kind === 'straight') {
    const cg = R.PROTO_STAT.chaingift
    console.log('    顺子线：贴 ' + cg.tagged + ' / 兑现 ' + cg.cashed
      + ' / 真跑 ' + cg.fired)
  }
  if (kind === 'order') {
    console.log('    顺序线：真跑 ' + st.orderFired + ' 次，收 '
      + f2(avg(st.orderGot, st.orderFired)) + ' 张/次')
  }
  if (kind === 'draft') {
    const td = R.PROTO_STAT.tagdraft
    console.log('    21 线：贴 ' + td.tagged + ' / 兑现 ' + td.cashed)
  }
  if (kind === 'suit') {
    const mk = R.PROTO_STAT.matchkey
    console.log('    花色线：发钥匙 ' + mk.given + ' / 用掉 ' + mk.used
      + ' / 凑成 ' + mk.hits)
  }
  if (kind !== 'off' && st.fires === 0) {
    console.log('    ⚠ fires=0 —— 满配下「触发技能槽」一次都没成立，接线没接上')
  }
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
  if (cmd === 'slottag') return cmdSlottag(args)
  console.log('不认识的命令：' + cmd + '\n看文件头的注释，或者 README.md')
}

main()
