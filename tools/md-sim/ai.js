// 摸打钓鱼 · 决策策略（离线重实现）
//
// 照 ap-fishing.uvue 里庄家那套（foePickCard / baitRisk / outsideCount /
// foeSwapPick / foePickDeck / foeFreezePick，以及 afterPlay 里观潮那段判断）。
//
// ---- 两侧用同一套 ----
//
// 游戏里你是人，庄家是这套启发式。模拟里**两侧都用它** ——
// 设计文档那些基础数据（每人每局钓到约 9 次、后手赢 57–59%）标的口径就是
// 「双方都会记牌」，所以要复现那几个数就得两侧同策略。
//
// 要量「人比这套聪明多少」是另一个课题，不在这个脚本的范围里

const R = require('./rules.js')
const SK = R.SK

// 这个点数除了自己手里、堆上、已被钓走的，外面还剩几张（照 outsideCount）。
// 数的是**牌面那个点数**，点数卡贴上来的不算 —— 一张 ♠3·7 不是一张 7
function outsideCount(G, side, rank) {
  let seen = 0
  const mine = G.hands[side]
  for (let i = 0; i < mine.length; i++) {
    if (mine[i].rank === rank) seen++
  }
  for (let i = 0; i < G.pile.length; i++) {
    if (G.pile[i].rank === rank) seen++
  }
  for (let i = 0; i < G.gone.length; i++) {
    if (G.gone[i] === rank) seen++
  }
  return (G.rankTotal[rank] || 0) - seen
}

// ---------- 让 AI 读明牌（2026-10-16） ----------
//
// **默认关**，开了会改变所有技能的量测结果（基线里的 AI 也变强）——
// 那是一次基准变更，台账要新开一档。
//
// ---- 它治的是什么 ----
//
// 窥视 / 照水 / 清水 / 活水这几件的 X **实测恒等于 0**，而那不是「效果弱」，
// 是 `pickCard` 根本不读 `G.seen`：给对手开全明牌，AI 的出牌一模一样。
// 所以那四件的数是「没量过」，不是「值 0」。
//
// ---- 结局：四件里删了三件〔2026-10-16〕----
//
// 这个旋钮扫完之后那四件各走了各的路，而**理由四种都不一样** ——
// 这正是「工具量不出」时该做的事：靠设计判断，一件一件判。
//
//   **窥视**（1 张、一次性）→ 删。旋钮之下仍是统计零，而且权重 5 和 8
//     **逐位相同**（饱和）。判据：信息的价值对「看得见几张」是**凸的**；
//   **照水**（4 张、挂牌型）→ 删。+0.16，而同一个效果常驻版（清水）
//     有 +1.36 —— **常驻比挂牌值 8 倍以上**；
//   **活水**（牌库顶 2 张）→ 删。连这个旋钮都覆盖不到它
//    （`AI_SEEN` 只拆「对手手牌」那一侧，`pickCard` 压根不读牌库）；
//   **清水**（对方手牌 4 张）→ **留下，而且当天加强了两次**（2 → 3 → 4 张）。
//     它是四件里唯一一件在旋钮下量出实数的：+1.36 / +2.97 / **+4.09**（看 2/3/4 张）。
//     4 这一档原先被照水挡着（会完全重复），照水删了才空出来。
//
// 所以下面那段「旋钮解决不了信息类技能的量测」仍然成立，
// 但它**不等于「信息类技能都做不出来」** —— 清水就做出来了，办法是
//「常驻 + 够量」。两条判据都从这一轮来。
//
// ---- 信息用在哪一侧：风险，不是收益 ----
//
// `outsideCount` 数的是「这个点数我不知道在哪的张数」= **对手手里 + 牌库里**。
// 而风险的真正含义是「对手**现在**能不能钓走我这张饵」—— 牌库里那几张
// 这一手钓不到我。原来那个函数把两者混成一个概率，而**明牌正是用来把
// 前者拆出来变成确定值的**。
//
// 所以 `AI_SEEN=1` 之下：看得见的那几张按 `AI_SEEN_W` 倍计（确定的威胁），
// 剩下看不见的照原样估。`known=0` 时结果跟关掉完全一致 ——
// 所以这个开关只在「真有情报」的局面里起作用。
//
// 另一侧（知道对手手里有什么 → 预测他会打什么 → 提前布局）**没做**：
// 一步贪心做不到那个，而且那是另一个机制。
//
// ---- ⚠ 实测结论：**这个旋钮解决不了信息类技能的量测**〔2026-10-16〕----
//
// 拿【窥视】当探针（它只翻 1 张，所以它的 X 就是「一张明牌值多少」），
// `vs peek peek -n 20000`，标准误 0.12：
//
//   W=1  X=+0.00   ← 自检档（权重 1 = 不加权，所以必须是 0）
//   W=2  X=+0.12
//   W=3  X=+0.05
//   W=5  X=−0.03   ┐ **逐位相同 → 饱和**
//   W=8  X=−0.03   ┘
//
// **所有权重下都是统计零**，而且权重拉到实质无穷大（绝不打能被看见那张
// 钓走的牌）也不涨。原因：
//
//   > **避开风险的代价等于风险本身。**
//   > 知道对手有 ♠7 → 我避开打 7，可我手里可能没有 7（情报白给）、
//   > 可能只有 7 能打（避不开）、或者换打的那张 outsideCount 差不多
//   > （换了个风险）。「改变决策的概率 × 每次的收益」≈ 0。
//
// 这跟 README 记着的那条是同一类：`wants` 列表里「为触发技能打次优牌」
// 白付 1.5 的风险折扣 —— **「那不是技能的成本，是启发式的愚蠢」**。
//
// ---- 所以信息类技能的价值是**工具的边界**，不是旋钮不够 ----
//
// 真人拿照水做的是**多步**的事：预测他下一手打什么 → 提前布局、
// 知道他没有某个点数就放心下饵、看他手里全是大牌就改策略。
// 而 `pickCard` 是一步贪心 —— 这个旋钮只覆盖了信息价值的一个切片
//（风险规避），而那个切片实测是零。
//
// **要量信息类技能，得给 AI 装多步搜索** —— 那是另一个量级的工程。
// 在那之前，信息类技能的价只能靠设计判断，
// 而台账里它们要记成「**工具量不出**」，不是「值 0」。
//
//〔这一族现在只剩【清水】一件，另外三件 2026-10-16 删了 —— 见上面那段。
//  下面那行扫窥视的命令跟着失效（`one peek` 查不到那个 key），
//  **留着是因为那张权重表是「这条路走不通」的证据**，换一件技能重跑
//  只会再得一张统计零的表〕
//
// 旋钮留着（默认关，不影响任何现有数据）—— 它是「这条路走不通」的证据，
// 删了下一个人会再实现一遍。
//
//   AI_SEEN=1 node sim.js base -n 20000            ← 先量新基线（切牌那张是公开的）
//   AI_SEEN=1 node sim.js all -n 20000             ← 再量全表
//   for w in 2 3 5; do AI_SEEN=1 AI_SEEN_W=$w node sim.js one peek -n 20000; done
const AI_SEEN = process.env.AI_SEEN === '1'
// 看得见的那张威胁算几倍。3 是起点：它让「确定在对手手里」明显重于
// 「可能在牌库里」，但没到「只看情报、不看概率」那一档（那会让 AI
// 对没情报的局面变傻）。**这个数要扫，别当定值**
const AI_SEEN_W = process.env.AI_SEEN_W
  ? parseFloat(process.env.AI_SEEN_W) : 3

// 对手手里**我看得见的**牌里，有几张是这个点数。
//
// ---- 走 `R.opponentOpen`，**别自己读 `G.seen`** ----
//
// 第一版直接读 `G.seen[other][i]`，结果**照水和清水完全不可见** ——
// `vs lantern lantern` 跑出精确 +0.00（三个权重逐位相同），
// 而窥视至少有 ±0.12 的波动。
//
// 因为「看得见」有**三种**来源，而 `G.seen` 只是其中一种：
//
//   逐张标记   窥视翻开一张 → 写 `G.seen[other][i] = true`
//   **总开关** 【照水】在场时对方手牌全明 —— **不写 seen**
//              （源码 foeOpen 的注释：「照水是总开关，它亮着的时候连期间
//                新补的牌也一样明着，所以不能靠往 foeShown 里写标记」）
//   **按位置** 【清水】对方前 CLEAR_OPEN 张一直明着 —— 也是现判
//
// `opponentOpen` 是那三种的统一入口（照源码的 `foeOpen`）。
//
// > 判据：**有现成的判断函数就别读底层数据** —— 底层只覆盖一部分来源，
// > 而「漏掉的那部分」表现为**精确 0.00**，看着像「效果是零」。
function seenRank(G, side, rank) {
  const other = side === R.ME ? R.FOE : R.ME
  const hand = G.hands[other]
  let n = 0
  for (let i = 0; i < hand.length; i++) {
    if (R.opponentOpen(G, side, i) && hand[i].rank === rank) n++
  }
  return n
}

// 把这张当饵有多危险：**它所有点数**外面各还剩几张，加起来（照 baitRisk）。
// 加起来是因为点数卡 —— 一张 ♠3·7 被 3 也被 7 钓得走，当饵比普通 ♠3 危险
function baitRisk(G, side, card) {
  const vals = R.cardVals(card)
  let risk = 0
  for (let i = 0; i < vals.length; i++) {
    // 0 点谁也按点数钓不走（anyEquals 跳过 0），零点牌这一项不算风险
    if (vals[i] === 0) continue
    const rank = faceOfValue(vals[i])
    // 熔合出来的大点数总张数查不到，减出来可能是负的 —— 最少算 0
    const out = Math.max(0, outsideCount(G, side, rank))
    if (!AI_SEEN) {
      risk += out
      continue
    }
    // ---- 有情报那一档：确定的威胁加权，剩下的照原样 ----
    //
    // `known` 已经算在 `out` 里了（它们在对手手里 = 在「外面」），
    // 所以要先减掉再按权重加回去，不然重复计数
    const known = Math.min(seenRank(G, side, rank), out)
    risk += known * AI_SEEN_W + (out - known)
  }
  return risk
}

// 点数值写回牌面那个字符串（照 draw-save.uts 的 faceOfValue）
function faceOfValue(v) {
  const at = R.RANK_VALUES.indexOf(v)
  return at < 0 ? '' : R.RANKS[at]
}

// 没被冻住的里头随机挑一张（照 randomFree）
function randomFree(G, side) {
  const free = []
  for (let i = 0; i < G.hands[side].length; i++) {
    if (!R.isFrozen(G, G.hands[side][i])) free.push(i)
  }
  return free.length === 0 ? -1 : R.pickOne(G.rng, free)
}

// 要打哪张（照 foePickCard）。
//
// 能钓就挑钓得最多的；钓不到时会记牌的挑「外面剩得最少」的点数当饵，
// 不拿 J 当饵；挑饵时顺手能发动技能的，只要不比最安全那张差 1 张以上就优先
const SURGE_AVOID = process.env.SURGE_AVOID ? parseFloat(process.env.SURGE_AVOID) : 0

// ---------- 【洪水】的「偷时间」打法（FLOOD_RUSH，2026-10-15） ----------
//
// ⚠ **洪水当天就删了**（它量出来的 X 正是删它的依据），所以这个旋钮现在
// **开了也不会响** —— `SK.FLOOD` 是 −1，`rushFlood` 里那个 `has` 永不匹配。
//
// 整段留着，因为它是一个**可复用的量法**：将来任何「能改变一局长短」的
// 效果都该拿它量一遍（把 `SK.FLOOD` 换成那件技能即可）。而它得出的那条
// 判据比洪水本身值钱 —— 见下面「这个数读作上限」那段，以及设计文档
// 『被删掉的技能』里洪水那一条。
//
// **默认关（0）。开启后：领先 + 牌库薄的时候优先打洪水，哪怕它钓不到最多。**
//
// 为什么要专门给一件技能建模 —— 这是终局规则换成「牌库空 + 双方各打 1 手
// 就收摊」之后冒出来的**新病根**：
//
//   **牌库张数现在直接决定这一局还有多长。**
//
// 于是「抽空牌库」成了领先方的锁胜手段，而洪水是全表唯一能一次抽掉好几张
// 牌库的技能（从库顶逐张翻到匹配为止）。这条路**旧规则下不存在** ——
// 那时牌一定会全部打完，谁也没法让游戏早点结束。
//
// 这套启发式 `pickCard` 本来量不出它：它是一步贪心，只问「这张能钓几张」，
// 不读比分、不知道游戏什么时候结束。所以不开这个旋钮量出来的洪水
// （X +4.77 / D +0.73）是「**没人想到这招**」时的值。
//
// ---- 这个数读作上限，不是均值 ----
//
// 真人不会每次都这么打（洪水本身也要钓牌，抽库是放弃一次收成），
// 但他会在该用的时候用。所以开启后量出来的 D 读作
// 「**洪水的先手溢价最多能被推到多少**」。
//
// FLOOD_RUSH = 牌库薄到几张时开始抽。设 8 大致是「还剩两三个回合」。
const FLOOD_RUSH = process.env.FLOOD_RUSH ? parseInt(process.env.FLOOD_RUSH, 10) : 0

// 领先而且牌库快空了 —— 手里有洪水就打它，把这一局掐短
function rushFlood(G, side) {
  if (FLOOD_RUSH <= 0) return -1
  if (G.deck.length === 0 || G.deck.length > FLOOD_RUSH) return -1
  const other = side === R.ME ? R.FOE : R.ME
  // **只有领先才抽** —— 落后的时候缩短这一局是在帮对手
  if (G.score[side] <= G.score[other]) return -1
  const hand = G.hands[side]
  for (let i = 0; i < hand.length; i++) {
    if (R.isFrozen(G, hand[i])) continue
    if (R.has(R.skillsOf(G, side, hand[i]), SK.FLOOD)) return i
  }
  return -1
}

function pickCard(G, side) {
  // 关卡表的 random：连钓都不挑（照源码 foePickCard 开头那一支）
  if (G.random[side]) return randomFree(G, side)
  // 【洪水】偷时间：**排在「挑钓得最多的」之前**，因为它要表达的正是
  // 「宁可少收一点，也要把这一局掐短」（默认关，见 FLOOD_RUSH 那段）
  const rush = rushFlood(G, side)
  if (rush >= 0) return rush
  const hand = G.hands[side]
  const lo = G.loadouts[side]
  let best = -1
  let bestCaught = 0
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    if (R.isFrozen(G, card)) continue
    const skills = R.skillsOf(G, side, card)
    // ---- 挑牌时**一律按「正常落堆」算**，不看落堆底那一头 ----
    //
    // 〔点数技能【沉底】2026-10-14 删了。这儿原先按它算落堆底，
    //   照的是源码那行 `const sink = hasTrigger(skills, SK_SINK)`。〕
    //
    // 而**【逆流】那个缺口照旧**，它是源码里一个真实的缺口、不是这边搬漏：
    // 挑牌阶段不知道「这张落堆底能钓到」，而 wantSink 只在打出**之后**
    // 决定落点，牌已经挑定了。所以逆流在庄家手里被低估 ——
    // `roles` 那张表量出来的是它的**下限**。
    // 改的话是在这一行接上 sinkPays
    const at = R.catchStart(G, card, side, skills, false)
    let caught = 0
    if (at >= 0) {
      // 收几张：「匹配那张到堆顶」再加自己
      caught = G.pile.length - at + 1
    }
    // 收色、撒网不走点数判定，所以上面那一下对它们一概是 -1 ——
    // 不单独估一次，AI 就会把一张能扫掉半个堆的牌当普通饵打出去
    const harvest = R.harvestCount(G, card, skills, side)
    if (harvest > caught) caught = harvest
    if (caught > bestCaught) {
      bestCaught = caught
      best = i
    }
  }
  if (best >= 0) return best
  if (!G.smart[side]) return randomFree(G, side)

  let fewest = 99
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank !== R.JACK && !R.isFrozen(G, hand[i])) {
      fewest = Math.min(fewest, baitRisk(G, side, hand[i]))
    }
  }
  let pick = -1
  let pickScore = 99.0
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    if (card.rank === R.JACK || R.isFrozen(G, card)) continue
    let score = baitRisk(G, side, card) * 1.0
    const skills = R.skillsOf(G, side, card)
    // ---------- 【窥视】【照水】【染水】要**带条件**才算「想发动」 ----------
    //
    // 这张列表里其余十几件都是**无条件有用**的（收牌、动手牌、改上限…），
    // 只有这三件是**条件性**的 —— 它们改的东西只被另一件技能读：
    //
    //   窥视 / 照水 → `opponentOpen`（对方哪张明着），只被 freezePick 读
    //   染水       → `pileSuit`（堆上的花色），只被顺色 / 收色的判定读
    //
    // 不写这个条件的后果是量出来的：三件的 X **完全相同，都是 −0.19**
    //（20000 局，标准误 0.12）—— 那是 AI 为一个**对它无效的技能**
    // 打了次优牌，白付 1.5 的风险折扣。
    //
    // 对照组证明了这一点：归深 / 软点 / 沸水 的效果同样是 0，
    // 但它们**不在这张列表里**，X 就是干净的 **0.00**。
    //
    // > 所以那 −0.19 **不是技能的成本，是启发式的愚蠢**。
    // > 真人不会为一张用不上的情报去打危险的饵。
    //
    // 判的是「**这张牌**同时触发了那件搭档技能吗」（一张牌最多触发两件 ——
    // 花色槽一件、点数槽一件，所以双触发只发生在两个槽的交集上）。
    // 不查整个配装是有意的：跨回合的价值这套启发式算不到，
    // 而硬给它一个「以后会用上」的折扣就又回到了白付风险那条路
    //〔`pairFreeze`（有冻结搭档吗）2026-10-16 跟着窥视、照水一起删了 ——
    //  它只给那两件用。上面那段推理留着，下一件情报类技能还会撞上同一个坑〕
    const pairSuitLine = R.has(skills, SK.SUITED) || R.has(skills, SK.HUE)
    const wants = R.has(skills, SK.TIDE)
      || R.has(skills, SK.FREEZE)
      || R.has(skills, SK.LOWTIDE) || R.has(skills, SK.SWAP)
      || R.has(skills, SK.PICK)
      // 条件性的，现在只剩一件
      //〔窥视、照水 2026-10-16 删了。那两行原本是
      //  「有情报技能 + 有冻结搭档 → 才值得为它打危险的饵」，
      //  而上面那段关于「白付风险」的推理是从它们身上得出来的，所以留着〕
      || (R.has(skills, SK.SUITIFY) && pairSuitLine)
      // 燃烧那两件：落堆就贴火，钓不钓到都发动 —— 当饵白赚一层火
      || R.has(skills, SK.KINDLE) || R.has(skills, SK.CHAIN)
      // 挂在牌上的两件（窄口、满篓）要求这张留在堆上 ——
      // 所以「被钓走」对它们是**真损失**，不像下面那几件钓不钓到都发动
      || R.has(skills, SK.NARROW) || R.has(skills, SK.CREEL)
      // 动对方手牌、从牌库检索这几件钓不钓到都照样发动，当饵白赚一次
      || R.has(skills, SK.PRESS) || R.has(skills, SK.UNHOOK)
      || R.has(skills, SK.SWAPCARD) || R.has(skills, SK.TWIN)
      // 【引潮】2026-10-16 补进来 —— 它 10-14 加原型时漏了这一行。
      //
      // 它属于上面那一类（动对方手牌、钓不钓到都照样发动），判据一样：
      // 贴标签那一下跟「这张有没有钓中」完全无关，所以当饵是白赚一次。
      //
      // **漏掉的后果是低估，不是高估**：AI 不会为了发动它打一张次优牌，
      // 于是它的 X 被压着。10-14 量出来的「翻 1 张 X +0.61」是在这个
      // 缺陷下跑的，那个数要当下限看。
      //
      // 〔别照 `SK.FROST` 那一族的样子推断「不在表里就是弱」——
      //   那条是 CLAUDE.md 记着的误读：被动件不需要主动打，
      //   不在这张表里反而说明它不吃那份风险。引潮是**主动件**，所以要在〕
      || R.has(skills, SK.SURGE)
      // 凝水 / 净水 / 抬水**压根不落堆**（叠到别的牌上去了），所以也
      // 谈不上钓 —— 它们换的是一次精确操作。拿它们当「饵」是唯一的用法，
      // 而且比别的饵更安全：牌出场了，对手连收都收不着
      || R.has(skills, SK.CALM) || R.has(skills, SK.CLEAN)
      || R.has(skills, SK.RAISE)
    if (wants && score <= fewest + 1) {
      score = score - 1.5
    }
    // 〔压底族六件、抄底、连竿、同花、余烬 / 接火 / 添柴 / 布火
    //   在 2026-10-14 那一轮全删了，各自的分支跟着删。
    //   删除理由见 rules.js 的 SK 表和设计文档〕
    //
    // 伏流无点数 —— 它凑不成顺子时就留在堆上，而且谁也按点数钓不走它
    //（「当任意点数」**只在它自己那条判定路径上**成立），所以当饵格外安全。
    //
    // **跟着 FLOW_VOID 那个旋钮走**：关掉无点数那一档它就有点数了，
    // 于是不再是钓不走的安全饵，这一分不能给
    if (R.FLOW_VOID && R.has(skills, SK.FLOW)) {
      score = score - 1.0
    }
    // 〔【沉底】原先在这儿加风险：**空钩沉底是最危险的下饵** ——
    //   那张躺在堆底，谁匹配到它就通吃整堆，所以加价 `堆张数 × 0.5`。
    //   技能删了，而这条判据正是它那 0.79 分的来源
    //   （强制 −0.45 → 可选 +0.34）。将来再做「落堆底」类效果要先算这笔〕
    // 【推牌】：带它的牌当饵会给对手铺 SURGE_N 张。SURGE_AVOID 是
    // 受害方「知道它、尽量不拿它当饵」的折扣（0 = 无视标签，量上限用）
    if (SURGE_AVOID > 0 && R.surgeOnHand(G, card)) {
      score = score + SURGE_AVOID
    }
    if (score < pickScore) {
      pickScore = score
      pick = i
    }
  }
  return pick >= 0 ? pick : randomFree(G, side)
}

// 换水扔哪张（照 foeSwapPick）：先扔钓不着任何东西的，同类里扔点数最小的
function swapPick(G, side) {
  const hand = G.hands[side]
  let best = -1
  let bestScore = 0
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    const useful = card.rank === R.JACK || R.canCatch(G, card, side)
    const score = (useful ? 100 : 0) + card.extra.length * 20 + card.value
    if (best < 0 || score < bestScore) {
      best = i
      bestScore = score
    }
  }
  return best
}

// 择饵留哪张（照 foePickDeck）：J 最好，其次钓得着堆上某张的，再不然点数最大
function pickDeck(G, tops) {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < tops.length; i++) {
    let score = tops[i].rank === R.JACK ? 100 : tops[i].value
    if (tops[i].rank !== R.JACK) {
      for (let k = 0; k < G.pile.length; k++) {
        if (G.pile[k].rank === tops[i].rank) {
          score += 50
          break
        }
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

// 观潮沉不沉（照 afterPlay 里庄家那段）：看的是自己回合末要补的那两张，
// 一张都用不上才沉。「用得上」= J，或者钓得着堆上某张
// 观潮：牌库顶那几张**一张一张判**沉不沉（照源码 afterPlayTail 里庄家那段）。
// 返回跟 tops 对齐的标记，true = 沉。用不上的沉、用得上的留 ——
// 「用得上」= J（通吃），或者堆上有同点数的牌
function tideSink(G, tops) {
  return tops.map(function (card) {
    if (card.rank === R.JACK) return false
    for (let k = 0; k < G.pile.length; k++) {
      if (G.pile[k].rank === card.rank) return false
    }
    return true
  })
}

// 冻对方哪张（照 foeFreezePick）：看得见的里头挑点数最大的，一张都看不见就随机
function freezePick(G, side) {
  const other = side === R.ME ? R.FOE : R.ME
  const theirs = G.hands[other]
  let best = -1
  let bestValue = -1
  for (let i = 0; i < theirs.length; i++) {
    if (R.isFrozen(G, theirs[i])) continue
    if (!R.opponentOpen(G, side, i)) continue
    if (theirs[i].value > bestValue) {
      best = i
      bestValue = theirs[i].value
    }
  }
  if (best >= 0) return best
  const free = []
  for (let i = 0; i < theirs.length; i++) {
    if (!R.isFrozen(G, theirs[i])) free.push(i)
  }
  return free.length === 0 ? -1 : R.pickOne(G.rng, free)
}

// 压舱 / 摘钩 / 对换挑对方哪张（照 foeTakePick）。
//
// 这三件技能本身就「看对方全部手牌」，所以挑的时候**看得见** ——
// 不像冻结那样要猜位置。尺子：J 最金贵，其次是现在就钓得着的，
// 再不然挑点数最大的
function takePick(G, side) {
  const other = side === R.ME ? R.FOE : R.ME
  const theirs = G.hands[other]
  let best = -1
  let bestScore = -1
  for (let i = 0; i < theirs.length; i++) {
    const card = theirs[i]
    let score = card.rank === R.JACK ? 100 : card.value
    // 用**对方的**装备判「这张在他手里钓不钓得着」—— 拆的是他的牌
    if (card.rank !== R.JACK && R.canCatch(G, card, other)) {
      score += 50
    }
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

// 同号挑哪张（照 foeTwinPick）：挑能触发自己技能的那个花色
function twinPick(G, side, pool) {
  for (let i = 0; i < pool.length; i++) {
    if (R.skillsOf(G, side, pool[i]).length > 0) return i
  }
  return 0
}

// 【死水】废对方哪张（照 foeDeadPick）。
//
// 尺子跟 takePick 同一套，但**挑不了 J**（deadPool 把 J 排掉了 ——
// 理由见 draw-skills 死水那条：能挑 J 的话这件技能单那一下就超标）。
// 多一档：落在对方槽上的牌加分 —— 废掉它顺带掐了一件技能，
// 而「技能不触发」正是这件技能一半的价值
function deadPick(G, side) {
  const other = side === R.ME ? R.FOE : R.ME
  const theirs = G.hands[other]
  const pool = R.deadPool(G, side)
  let best = -1
  let bestScore = -1
  for (let i = 0; i < pool.length; i++) {
    const at = pool[i]
    const card = theirs[at]
    let score = card.value
    if (R.canCatch(G, card, other)) score += 50
    if (R.skillsOf(G, other, card).length > 0) score += 30
    if (score > bestScore) {
      bestScore = score
      best = at
    }
  }
  return best
}

// 【引潮】给对方哪张贴【推牌】：**他马上会打的那张**。
// 钓得着的最优先（他这手就会打它；收完堆变薄，翻上去的牌更难翻中、
// 留给我钓），其次点数大的（不像小点数那样常被留着当饵）
// ---------- 〔量过并否决〕「别往同一张牌上重复堆层」那条启发式 ----------
//
// 2026-10-16 这儿加过一个 `SURGE_RESTACK` 旋钮，而**它是为了查一个
// 根本不存在的问题** —— 当时 X 从 +2.19 掉到 −0.05，我推断是
// 「`surgePick` 打分确定性 + 无上限叠加 → AI 把同一张堆到 3 层 →
//   一次推 12 张 → 抽穿牌库」。
//
// **真因是 `surgeFor` 有一个调用点漏传了 `layers` 参数**
//（`for (n < undefined)` 静默跑成 0 层，整件技能一张牌都不推）。
// 修完之后同档位重跑，那套推断整个不成立：
//
//   避开已带标签的  X **+3.27**
//   **随便堆**      X **+3.32**   ← 差 0.05，差值标准误约 0.17
//
// **统计上完全打平，所以这条启发式不要**（D 也一样：+0.11 对 +0.11，
// 叠加不动奇偶）。于是 AI 回到纯按分挑 —— 顺带跟游戏里的 `foeSurgePick`
// 自然一致，不用维护两套行为。
//
// 两条教训记在这儿，因为它们比旋钮值钱：
//
//   **「集中比分散强 33%」那条判据没有被推翻** —— 我当时据 −0.05 说它
//     「不能外推、最优点在 4 张」，而那建立在 bug 上。原判据（4 张那一档
//     集中强 33%）仍然只有实测支撑，没有反例。
//   **怀疑设计之前先 grep 刚改过的调用点。** 那次我推出一套像有依据的
//     解释、让人白跑四轮测量，而正确的第一步在 10 行代码之内。
//     这正是 CLAUDE.md 开头那条「不是查不到，是没查」。
function surgePick(G, side) {
  const other = side === R.ME ? R.FOE : R.ME
  const theirs = G.hands[other]
  const pool = R.surgePool(G, side)
  let best = -1
  let bestScore = -1
  for (let i = 0; i < pool.length; i++) {
    const card = theirs[pool[i]]
    let score = card.value
    if (R.canCatch(G, card, other)) score += 50
    if (score > bestScore) {
      bestScore = score
      best = pool[i]
    }
  }
  return best
}

module.exports = {
  pickCard, swapPick, pickDeck, tideSink, freezePick, takePick, twinPick,
  deadPick, surgePick, outsideCount, baitRisk, faceOfValue
}
