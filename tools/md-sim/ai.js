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
// ⚠ **这段注释的前提 2026-10-21 翻过来了：洪水回来了，这个旋钮现在真会响。**
//
// 〔原文写的是「洪水当天就删了，所以这个旋钮开了也不会响 —— `SK.FLOOD`
//   是 −1，`rushFlood` 里那个 `has` 永不匹配」。10-21 洪水换形状上架，
//   `SK.FLOOD` 有真下标了，所以**开 `FLOOD_RUSH` 会实际改变 AI 的打法**。
//   它仍然**默认关**，默认口径没变，旧数不受影响〕
//
// 整段留着，因为它还是一个**可复用的量法**：任何「能改变一局长短」的
// 效果都该拿它量一遍（把 `SK.FLOOD` 换成那件技能即可）。而它得出的那条
// 判据比洪水本身值钱 —— 见下面「这个数读作上限」那段，以及设计文档
// 『被删掉的技能』里洪水那一条。
//
// ⚠ **定稿形状（`FLOOD_STOP=each`）下的抽库溢价没量过。** 量过的只有
//   老形状（+0.57 = 基础 X 的 12%）和一个作废的中间形状。命令：
//   `FLOOD_RUSH=16 node tools/md-sim/sim.js one flood -n 20000 --role lock --slot 0`
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

// 【沉降】连击：他刚兑现过，而我手里正好有一张带【沉降】的 —— 打它。
//
// 返回手牌下标，-1 = 不接（窗口没开 / 手里没有 / 那张被冻住了）。
//
// **默认关**（`SINK_COMBO=1` 开）—— 它是一条**只服务一件技能**的启发式，
// 而那种东西开着会污染别的量法（照 `FLOOD_RUSH` 那条先例：
// 它也是默认关的，开着才量洪水的「偷时间」）
function sinkCombo(G, side) {
  if (process.env.SINK_COMBO !== '1') return -1
  if (!R.sinkComboOpen(G, side)) return -1
  const hand = G.hands[side]
  for (let i = 0; i < hand.length; i++) {
    if (R.isFrozen(G, hand[i])) continue
    if (R.sinkTagOn(G, hand[i])) return i
  }
  return -1
}

// ---------- 「养堆」两个旋钮（HOLD_MIN / JACK_HOLD，2026-10-22） ----------
//
// 用户的观察：「**游戏决策性弱，能匹配就打不管收多少，没有养堆概念**」。
// 下面这个主循环**原文就是那句话**：`bestCaught` 初值 0、判据
// `caught > bestCaught` —— 任何能收的都收，收得最多的优先，
// **没有任何一支问「堆才这么点，要不要先忍一手」**。
//
// 而这两个旋钮是用来把那句话**拆成两件事**的，因为它们的解法相反：
//
//   甲、**AI 笨**：规则里养堆有收益，只是这套一步贪心算不到
//       → 那所有旧的 X 都被系统性地压着，是量法问题；
//   乙、**游戏真没这个决策**：忍一手在规则层就不划算
//       → 那是设计问题，要加机制才有救。
//
// 分不开这两件事就没法回答用户 —— 所以先量。两个都**默认关**，
// 默认口径一个字节不变，旧数全部不受影响。
//
//   HOLD_MIN=k   这一手收成 < k 就不收，改去挑一张最安全的饵。
//                ⚠ 普通匹配的**最小收成是 2**（匹配那张 + 自己），
//                  所以 k=3 才是第一个有意义的档。
//                ⚠ 它有真风险：忍过去之后堆变了，那张可能再也匹配不上。
//
//   JACK_HOLD=k  堆不足 k 张就不打 J。**这是最干净的一格** ——
//                J 通吃整堆（`catchStart` 对 J 恒返回 0），收益随堆
//                线性增长，而且不挑点数，所以忍它**没有「窗口消失」
//                那份风险**：堆只会越长越肥。换句话说
//                它是这个游戏里唯一一张天然的养堆牌，
//                而现行 AI 一摸到就立刻打掉（J 的 caught = 堆+1，
//                永远是手里的 argmax）。
//
// ---- 怎么量它：**只给一侧开**，然后跑 `base` ----
//
// 这两个旋钮改的是**打法**不是技能，所以 `one` / `all` 那套
//「双方同角色各插同一个槽」的口径量不出来 —— 两边都变聪明的话差值是 0。
// 要的是不对称。
//
// 而 `cmdBase` 正好现成：双方空槽、**`freeFirst: true`**（切牌定庄，
// 两侧先手概率相同），于是「你(后手)」和「庄家(先手)」两列
// 是一组干净的 A/B —— 没有先后手偏差要扣。
//
//   node tools/md-sim/sim.js base -n 20000                 ← 对照（两列应当齐平）
//   JACK_HOLD=4 node tools/md-sim/sim.js base -n 20000     ← 只有「你」忍 J
//   HOLD_MIN=3  node tools/md-sim/sim.js base -n 20000     ← 只有「你」挑收成
//
// 读「每人每局积分」那一行的前两列：带旋钮那侧**高出去的那一截**
// 就是养堆的价值。显著为正 = 甲（AI 笨，所有旧 X 都被压着）；
// 0 或负 = 乙（规则层真的不划算，是设计问题）。
//
// `HOLD_BOTH=1` 让两侧都开 —— 那个档量的是**另一件事**（这套打法
// 对「一局有多长、堆有多肥」的影响），别拿它当 A/B 读。
const HOLD_MIN = process.env.HOLD_MIN ? parseInt(process.env.HOLD_MIN, 10) : 0
const JACK_HOLD = process.env.JACK_HOLD ? parseInt(process.env.JACK_HOLD, 10) : 0
const HOLD_BOTH = process.env.HOLD_BOTH === '1'
// 哪一侧按这套打法走。默认只有 ME（= `base` 里「你(后手)」那一列）
function holdSide(side) { return HOLD_BOTH || side === R.ME }

// ---------- `HOLD_FOE`：两侧**不同**阈值〔2026-10-22〕 ----------
//
// 为什么要它：用户提的是「**加个规则禁止收 2 张**」—— 那是规则，不是打法，
// 所以双方都受约束（`HOLD_BOTH=1 HOLD_MIN=3`）。而那一档是**对称**的，
// 分差必然≈0，什么也证不出来。真正要问的是**在那个新世界里还有没有决策**：
//
//   双方都禁收 2（新基线）
//   我额外等到 4 —— 分差还是不是大负数？
//
// 这要「对手 3 / 我 4」，而 `HOLD_MIN` 是全局的，`HOLD_BOTH` 只是开关。
//
//   HOLD_FOE=k   对手那一侧单独的阈值。**不设 = 旧行为**（照 HOLD_BOTH 走），
//                所以默认口径一个字节不变，旧数照旧可比。
//
//   HOLD_MIN=3 HOLD_BOTH=1                  ← 新基线：双方都禁收 2
//   HOLD_MIN=4 HOLD_FOE=3                   ← 新基线之上，只有「我」等到 4
//
// ⚠ 读第二档的分差时，对照组是**第一档**，不是 `base`。
//   拿它去减 `base` 等于把「规则变了」和「我改打法了」两件事加在一起。
const HOLD_FOE = process.env.HOLD_FOE ? parseInt(process.env.HOLD_FOE, 10) : -1
function holdMinOf(side) {
  if (side === R.ME) return HOLD_MIN
  if (HOLD_FOE >= 0) return HOLD_FOE
  return HOLD_BOTH ? HOLD_MIN : 0
}

// ---------- 【忍 1 手】`HOLD_ONCE`〔2026-10-22〕 ----------
//
// **这一套替换 `HOLD_MIN`，不是加在它旁边。** 两者是不同的打法类：
//
//   `HOLD_MIN=k`  不到 k 张**永远不收** —— 那是「忍到死」。
//   `HOLD_ONCE`   这一手不收、**下一手无论多少都收** —— 这才是「忍 1 手」。
//
// 换掉它的理由是用户给的三条事实：
//   3「对局中最多也就忍 1 手，忍 2 手几乎不可能」
//   4「应该奖励忍 1 手的行为，这才有决策性」
//   2「当一方占据积分优势时会换成贪心打法」
// 前两条说我的策略集建错了（等5/等6 在真实对局里不存在），
// 第三条说**决策该随比分变**，而那是 `ai.js` 里原本一行都没有的东西。
//
// 忍的判据**不是阈值，是「忍了能不能升一档」**：
//   轮流出牌 → 忍一手期间堆长 +2 → `scoreOf(n+2) > scoreOf(n)` 才值得忍。
// 所以它跟 `SCORE_BANDS` 是配套的：计分不分档，这个旋钮什么也不做。
//
//   HOLD_ONCE=1     开（只有「你」这一侧，照 HOLD_BOTH 扩到两侧）
//   HOLD_LEAD=k     领先 ≥ k 分就不忍了（事实 2）。默认 0 = 不看比分。
//   HOLD_RUN=k      最多连忍几手，默认 1。设 2 是**为了验事实 3**，
//                   不是为了用 —— 用户说忍 2 手几乎不可能，那就量给他看。
//
// 诊断口（CLAUDE.md 第四节：新机制要配「它做了几次」）：
//   holdOnce      忍了几次
//   holdOnceHit   忍完之后**下一次收牌真的升了档**几次
//   holdOnceMiss  忍完之后下一次收牌**没升档**（含一张也没收到）几次
//   holdOnceGave  忍的时候**放掉**的那几次值多少档值（含后来没收成的）
//   holdOnceGot   忍完之后**真收回来**的档值
//
// ⚠ **`Got − Gave` 不是净赚，别那么读。**〔2026-10-22 第一跑之后加的〕
//   第一跑它打出 +2.28 分/局，而同一跑的分差是 **−3.06** —— 两个数反向。
//   反向的原因不是噪声：在贪心世界里那**两次收牌你是都拿得到的**，
//   忍把两次并成了一次，而这个差只扣了前一次的档值，没扣掉「少收一次」。
//   所以它量的是「**档位提升了多少**」，不是净值。
//   真正的净值只有一个地方给得出：**`base` 那一行的分差**。
//
// 验收这个改动要**两条一起**（第一跑证明了光靠下面那条会放行）：
//   甲 hit/miss 两边都不空 —— 忍这件事有赢有输，不是定局
//   乙 **分差 ≥ 0** —— 忍不是严格劣势策略，不然没人会忍，也就没有决策
// 第一跑四组档值全部满足甲、全部违反乙（分差 −1.24 ~ −3.33）。
const HOLD_ONCE = process.env.HOLD_ONCE === '1'
const HOLD_LEAD = process.env.HOLD_LEAD ? parseInt(process.env.HOLD_LEAD, 10) : 0
const HOLD_RUN = process.env.HOLD_RUN ? parseInt(process.env.HOLD_RUN, 10) : 1
// 忍一手期间堆长涨多少：你一张 + 对方一张。改成 1 可以量「只有自己那张」
const HOLD_GROW = process.env.HOLD_GROW ? parseInt(process.env.HOLD_GROW, 10) : 2

// ---------- 「不去追 6/7」：两种写法，一种会把问题问死〔2026-10-22〕 ----------
//
// 用户的两句话（原话，分两次说的）：
//   ① 「天平永远不会倒向『永远该忍』，无论 6/7 档给的多高，
//      **在 4/5 档双方都会收了，因为双方都不会把 6/7 档给对方**」
//   ② 「**追 6/7 是可以的，但是风险非常大已经不值得了。这个可以只写在 AI 决策里**」
//
// ②把①的性质说清楚了：**规则不禁止追 6/7，是 AI 算出来不划算才不追。**
// 所以这是决策层的事，不碰规则层 —— 下面两个旋钮都只改 `worthHolding`，
// `rules.js` 一个字不动。
//
// 而「不划算」有两种写法，差别不是风格，是**会不会把问题问死**：
//
//   甲 `HOLD_BAND_MAX=1`  硬上限：目标落在 6/7 往后就不忍
//   乙 `HOLD_P=25`        期望值：按 25% 的成功率折一下再比
//
// ⚠ 甲**会把①变成同义反复**。①问的是「6/7 给多高都不动天平吗」，
//   而硬上限不管 c 多大都不追 —— 那 c 当然不动天平，这是写死的，不是测出来的。
//   它能答的只有一件事（而这件事也值得知道）：
//   **把追 6/7 这条路掐掉之后，6/7 档的档值还会不会从别处漏进天平**
//   （堆自己长肥、J 通吃带来的那部分不归任何人决策）。
//
//   乙才是①的真检验，因为它**不写死**：c 抬得够高时折完还是赚，AI 就会去追。
//   于是「无论给多高」有了一个可以证伪的形式 ——
//   **存不存在一个 c，让 6/7 重新变得值得追**。存在的话，①成立的是
//   「在现行量级上」，不是「无论」；而那个 c 就是设计上的天花板。
//
//   乙的 25% 不是我编的：第一跑实测的升档率是 24~28%（四组档值）。
//   默认 100 = 不折，逐字回到旧行为。
const HOLD_BAND_MAX = process.env.HOLD_BAND_MAX
  ? parseInt(process.env.HOLD_BAND_MAX, 10) : -1
const HOLD_P = process.env.HOLD_P ? parseInt(process.env.HOLD_P, 10) : 100

// 这一手值不值得忍。返回 true = 放掉这次 `bestCaught` 张的收成。
function worthHolding(G, side, bestCaught) {
  if (!HOLD_ONCE || !holdSide(side)) return false
  if (bestCaught <= 0) return false
  // 事实 2：领先就落袋为安，换贪心打法
  if (HOLD_LEAD > 0) {
    const other = side === R.ME ? R.FOE : R.ME
    if (G.score[side] - G.score[other] >= HOLD_LEAD) return false
  }
  // 事实 3：最多连忍 HOLD_RUN 手
  if (!G.holdRun) G.holdRun = [0, 0]
  if (G.holdRun[side] >= HOLD_RUN) return false
  // ---- 核心判据：忍一手升得了档吗 ----
  //
  // `HOLD_P=100`（默认）走**原样的比较**，不是走 `*100/100` ——
  // 那一步会引进浮点误差，于是「默认等于旧行为」变成「几乎等于」。
  // 这个旋钮的头一条要求是关着的时候一个字都不改。
  const now = R.scoreOf(bestCaught)
  const later = R.scoreOf(bestCaught + HOLD_GROW)
  if (HOLD_P === 100) {
    if (later <= now) return false
  } else {
    // 乙：按成功率折一下。「风险非常大已经不值得」就是这一行。
    const raw = later > now
    const ok = later * HOLD_P > now * 100
    if (raw !== ok) {
      if (!G.stat.holdEvFlip) G.stat.holdEvFlip = [0, 0]
      G.stat.holdEvFlip[side]++
    }
    if (!ok) return false
  }
  // ---- 档位上限：**排在最后，为的是让计数口有意义** ----
  //
  // 这一支放在前面的话逻辑上等价（都是 AND），但**计数会被污染** ——
  // 那些本来就会被 HOLD_RUN / HOLD_LEAD 拦下的手也会被记成「上限拦的」。
  // 放在最后，`holdCapped` 就精确等于「**这个旋钮改变了多少次决策**」。
  //
  // 这是 CLAUDE.md 第四节那条：旋钮要配一个「它做了几次」的计数。
  // 没有它的话，`HOLD_BAND_MAX=1` 跑出来跟不设一样，分不清是
  // 「用户说得对」还是「这支代码根本没触发过」。
  if (HOLD_BAND_MAX >= 0 && R.bandOf(bestCaught + HOLD_GROW) > HOLD_BAND_MAX) {
    if (!G.stat.holdCapped) G.stat.holdCapped = [0, 0]
    G.stat.holdCapped[side]++
    return false
  }
  return true
}

function pickCard(G, side) {
  // 关卡表的 random：连钓都不挑（照源码 foePickCard 开头那一支）
  if (G.random[side]) return randomFree(G, side)
  // 【洪水】偷时间：**排在「挑钓得最多的」之前**，因为它要表达的正是
  // 「宁可少收一点，也要把这一局掐短」（默认关，见 FLOOD_RUSH 那段）
  const rush = rushFlood(G, side)
  if (rush >= 0) return rush
  // ---- 【沉降】连击：**他刚兑现完，我立刻接一张**〔2026-10-19〕 ----
  //
  // 用户指出的那个用法：两次 −3 累加成 −6，而堆上平均点数才 6.8 ——
  // 于是整堆几乎全归 0，我这一手的【21 匹配】立刻收割。
  // **成本分摊**：第一次压堆的代价是他付的（他那一手的匹配被搅乱）。
  //
  // 排在「挑钓得最多的」**之前**，跟 `rushFlood` 同一个位置、
  // 同一个理由：它表达的是「宁可这一手少收，也要把这个窗口用掉」，
  // 而那正是一步贪心算不出来的东西（它只看这一手收几张）。
  //
  // 窗口只有一手（见 rules 的 sinkComboOpen），所以不接就没了
  const combo = sinkCombo(G, side)
  if (combo >= 0) return combo
  const hand = G.hands[side]
  const lo = G.loadouts[side]
  let best = -1
  let bestCaught = 0
  // ---- 【映照】：选中那一手**花掉的牌**值多少〔2026-10-21〕 ----
  //
  // 它是这个主循环里**唯一一个按「花掉哪张」而不是「收几张」**的判据，
  // 而且它**只在收成打平时**说话（见下面那个 `spend < bestSpend`）——
  // 所以没有映照的跑里它一个字节都不改。加它的理由是实测逼出来的，
  // 见下面那一大段和 `R.reflectPick` 的导出注释
  let bestSpend = 99
  // 【养堆·JACK_HOLD】这一手忍住 J 了吗 + 忍掉的那一下本来能收几张。
  // **两个旋钮共用 `holdSkip` 那一对计数**，因为 run-hold.sh 是
  // 一档一跑、两个旋钮从不同时开。真要同时开的话这个数就混了 ——
  // 那种跑法得先把计数拆成两对
  let jackHeld = false
  let jackWould = 0
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    if (R.isFrozen(G, card)) continue
    // 【养堆·JACK_HOLD】堆不够肥就先不打 J（默认关，见函数上面那段）。
    // 放在这儿 = 把它从**这个**循环里摘掉，于是它落到下面那个「挑饵」
    // 循环 —— 而那个循环 `continue` 掉 J（不拿 J 当饵），所以手里只剩
    // J 时 `pick` 是 −1，最后由 `randomFree` 兜底打出去。
    // 那正是「忍不住了」该有的样子，不是漏判
    if (JACK_HOLD > 0 && holdSide(side)
      && card.rank === R.JACK && G.pile.length < JACK_HOLD) {
      // ⚠ **一手只记一笔**，哪怕手里攥着两张 J —— 诊断口问的是
      //   「忍了几手」不是「忍了几张」。放在循环里直接 ++ 的话
      //   双 J 的那几手会记两笔，而那会让「忍的次数」莫名其妙地
      //   超过「出牌次数」（那种数看一眼就知道错了，可要是只超一点点
      //   就发现不了）
      jackHeld = true
      // 记「本来能收几张」：J 通吃 = 堆 + 它自己
      jackWould = G.pile.length + 1
      continue
    }
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
    // ---------- 【映照】：这一手能收几张，**要按变完之后算**〔2026-10-21〕 ----------
    //
    // 不接这一段的后果是实测过的、而且是**精确的 0**：
    // A / K / ♣ 三个槽、各 20000 局，X 全是 **+0.00**，诊断口
    // `changed = 0.000`、`gainSum = 0.000`、`kept = fires`。
    //
    // 病因不在映照那边，在这儿：**上面那个 `caught` 的公式跟
    // `reflectScore` 逐字相同**，于是 AI 打出的那张永远是手里的 argmax，
    // 而「变成手里另一张」只能更差或者持平 —— 一次都不会触发。
    //
    // ---- 它真正做的那件事，以及为什么要用平手去表达 ----
    //
    // 打一张**点得着槽的垃圾牌**，让它变成手里最好那张的牌面：
    // **收成一模一样，而好牌还留在手里，花掉的是垃圾牌。**
    // 所以它的收益**不在「收几张」这一维上**，恒等于 0 是对的 ——
    // 真正变的是分母。于是这儿分两步接：
    //
    //   一、把能达到的收成提上来（下面这个 if）——
    //      让「打垃圾牌」在收成上**追平**最优牌，而不是被它压着；
    //   二、收成打平时，**花掉的那张谁便宜选谁**（下面那个 `spend`）。
    //
    // ⚠ 第二步是**这一手之内可证的占优**，不是我新编的价值函数 ——
    //   `spend` 用的就是 AI 自己这把尺子（这张牌正常打出能收几张）：
    //   两种打法收成相同，而借脸那种花掉的是 `own`、普通那种花掉的是
    //   `caught`（= 收成本身），所以 `spend < bestSpend` 这一句同时办了
    //   两件事 —— **借脸优先于不借**，以及**几张都能借时花最便宜的**。
    //   不需要「手牌质量」这个 AI 根本没有的维度。
    //
    // ⚠ `sink` 传 `false`，照这个循环上面那条既有约定（挑牌阶段一律按
    //   正常落堆算）。跟 `playFor` 那边传真 `sink` 有分野，而现在两者
    //   取值相同（映照自己不落堆底）—— 将来谁给映照配了落堆底，
    //   **这一行会先于别处出问题**
    //
    // ⚠ **排在 `harvest` 那两行之前是有意的**：收色 / 撒网走的是另一条收成
    //   路径，它要跟变完之后的数取 max，不是被它覆盖掉。
    //   〔而 `harvestCount` 读的是**变之前**那张牌 —— 映照 × 收色 / 撒网
    //     这一格现在没人量过，真要配的时候这儿是第一个要改的地方〕
    // 花掉的那张牌值多少 —— 不借脸时它就等于收成本身（打什么收什么）
    let spend = caught
    // ⚠ **这儿的手牌比 `playFor` 那边多一张：`card` 它自己。**
    //   `playFor` 是在 `takeFromHand`（rules.js:3797）之后才跑的，而这儿
    //   还没出手。所以 `reflectPick` 在这儿会多看见一个候选 —— **而它无害**：
    //   `y === card` 的得分恰好等于 `own`，可选档的 `bestScore` 初值就是
    //   `own`，严格 `>` 过不去；强制档下它可能被选中，但那一手
    //   `spend === caught`，照旧不占便宜。两边因此**估得出同一个收成**。
    //   〔将来谁改了 `reflectPick` 的比较符（`>` → `>=`），
    //     第一个出问题的是这一行，不是 rules 那边〕
    // ⚠ 调 `R.reflectOn` 而不是 `R.has(skills, R.SK.REFLECT)`：
    //   `REFLECT_WITH` 那个旋钮会把映照挂到别的技能上，而判定只有一份
    if (R.reflectOn(skills)) {
      const pick = R.reflectPick(G, side, card, skills, false)
      // ⚠ **不取 max，照抄 `pick.at`**：可选档（定稿）下 `pick.at >= 0`
      //   意味着严格更好，取不取 max 一样；而强制档（`REFLECT_OPT=0`，
      //   已被否掉的那一读）下它**可能更低** —— 取 max 等于让 AI
      //   按一个它根本拿不到的收成去挑牌，那就不是在量那一读了
      if (pick.at >= 0) {
        // `pick.own` 跟上面的 `caught` 是同一个数（同 `skills`、同 `sink=false`），
        // 写 `pick.own` 是为了说清楚「花的是原来那张」
        spend = pick.own
        caught = pick.score
      }
    }
    // 收色、撒网不走点数判定，所以上面那一下对它们一概是 -1 ——
    // 不单独估一次，AI 就会把一张能扫掉半个堆的牌当普通饵打出去
    const harvest = R.harvestCount(G, card, skills, side)
    if (harvest > caught) {
      caught = harvest
      spend = harvest
    }
    // ⚠ **比的是分数，不是张数**〔2026-10-22〕。`SCORE_BANDS` 关着时
    //   `scoreOf` 逐字返回 n，所以这一行等价于原来的 `caught > bestCaught`；
    //   开着时 f(2)=f(3) 会打平，而**平手取张数多的那张** ——
    //   那样「阶梯计分」这个改动的效果能干净归因到「忍不忍」上，
    //   不会掺进「AI 在同档里改挑了别的牌」。
    //   （顺带：多收一张本身也有价值 —— 牌离场、对手配不着了。）
    const sc = R.scoreOf(caught)
    const bestSc = R.scoreOf(bestCaught)
    if (sc > bestSc
      || (sc === bestSc && caught > bestCaught)
      || (sc === bestSc && caught === bestCaught && caught > 0 && spend < bestSpend)) {
      bestCaught = caught
      bestSpend = spend
      best = i
    }
  }
  // 【养堆·HOLD_MIN】收得太少就不收，改去下饵（默认关，见函数上面那段）。
  // 判在 `best >= 0` **之前**：摘掉之后照旧走下面那个挑饵循环，
  // 所以「忍一手」用的是现成的 `baitRisk`，不是新编一套价值函数
  // ⚠ 条件里要有 `bestCaught > 0` —— 没有的话「这一手本来就钓不着」
  //   也会被记一笔「忍」，而那不是忍，是没得忍。
  //   混进来的后果：holdSkip 被灌成「所有没钓到的手」，
  //   HOLD_MIN=5 和 HOLD_MIN=3 的计数会长得差不多，诊断口当场失效
  // `hmin` 是**这一侧**的阈值（见上面 HOLD_FOE 那段）。不设 HOLD_FOE 时
  // 它逐字等于原来的 `HOLD_MIN > 0 && holdSide(side)`
  const hmin = holdMinOf(side)
  if (hmin > 0 && bestCaught > 0 && bestCaught < hmin) {
    G.stat.holdSkip[side]++
    G.stat.holdSkipSum[side] += bestCaught
    best = -1
  }
  // ---------- 【忍 1 手】的决策点（见 worthHolding 那段） ----------
  //
  // 放在 `HOLD_MIN` 之后、`jackHeld` 之前。两套**不该同时开** ——
  // 它们是互斥的打法类（忍到死 / 忍一手），同时开的话 holdSkip 那对
  // 计数会混（现成的教训：JACK_HOLD 和 HOLD_MIN 共用计数那一段）。
  if (!G.holdRun) G.holdRun = [0, 0]
  if (!G.holdWould) G.holdWould = [0, 0]
  const initHoldStat = function (st) {
    if (st.holdOnce) return
    st.holdOnce = [0, 0]; st.holdOnceHit = [0, 0]; st.holdOnceMiss = [0, 0]
    st.holdOnceGave = [0, 0]; st.holdOnceGot = [0, 0]
  }
  if (best >= 0 && worthHolding(G, side, bestCaught)) {
    initHoldStat(G.stat)
    G.stat.holdOnce[side]++
    // **放掉的档值在这儿记，不在结账那儿** —— 结账只在「后来真收到了」
    // 才发生，记在那边的话「忍完再没收到牌」那 10% 放掉的东西白白消失，
    // 账面上就看不出忍是亏的了
    G.stat.holdOnceGave[side] += R.scoreOf(bestCaught)
    G.holdRun[side]++
    // 记下**放掉的是多少张** —— 下一次真收牌时拿它结账（hit / miss）
    G.holdWould[side] = bestCaught
    best = -1
  } else if (best >= 0 && G.holdRun && G.holdRun[side] > 0) {
    // 忍完之后真的收了 —— 这一笔结账。
    // ⚠ **结在「决定要收」这儿，不是在 harvestAt 里**：那边一次 play
    //   可能触发两次收牌（深钩），结两次账就把 hit 灌成两倍。
    initHoldStat(G.stat)
    const was = R.scoreOf(G.holdWould[side])
    const now = R.scoreOf(bestCaught)
    if (now > was) G.stat.holdOnceHit[side]++; else G.stat.holdOnceMiss[side]++
    G.stat.holdOnceGot[side] += now
    G.holdRun[side] = 0
    G.holdWould[side] = 0
  }
  // JACK_HOLD 那一侧的计数。**只在「忍了 J 而且这一手最终没收牌」时记** ——
  // 忍住 J 之后照样用别的牌钓到了的，那不叫忍（什么也没放弃）
  if (jackHeld && best < 0) {
    G.stat.holdSkip[side]++
    G.stat.holdSkipSum[side] += jackWould
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
  // ---------- 【养堆】忍了之后挑饵，**要优先挑钓不着的那张**〔2026-10-22 补的漏〕 ----------
  //
  // 漏掉它的后果是实测抓出来的，而且不小：`HOLD_MIN=3` 的「收 2 张」
  // 那一格本该是 **0**，第一跑量出来是 **1.72 次/局**（对照 2.97）——
  // 忍了 3.72 手，其中 **46% 照样收了牌**。
  //
  // 病根：上面那个 `best = -1` 只摘掉了「**偏好**钓最多的那张」，
  // 而下面这个挑饵循环按 `baitRisk` 排 —— **它压根不看这张牌会不会钓到**，
  // 于是挑出来的饵匹配上堆顶，当场收 2 张。
  //
  // 所以在这之前，「忍」的真实语义是「**不挑钓得多的**」，
  // 而不是用户说的「**养堆直到 3 张/4 张/5 张 才收**」。两者差一截。
  //
  // ⚠ **用分层不用过滤**：手里全是能钓到的牌时必须打一张出去 ——
  //   那一手是真忍不住，不是漏判。`holdForced` 专门记这个，
  //   它就是这个旋钮的「它做了几次」诊断口（CLAUDE.md 第四节）。
  // ⚠ **也不用「加一个大罚分」**：挑饵那边有 −1.5（wants）和 −1.0
  //   （伏流无点数）两处折扣，`baitRisk` 能压到负数，所以任何固定幅度
  //   都不保证压得住。改成先比「钓不钓得着」、再比分数 ——
  //   跟幅度无关，而且 `HOLD_MIN` 关着时逐字退化成原来那一行
  const HOLD_PEN = hmin > 0
  let pickScore = 99.0
  let pickPen = false
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
      // 〔`SK.LOWTIDE`（见底）2026-10-19 从这张清单里去掉 —— 技能删了。
      //   这张表是「**值得为它打一张次优牌**」的清单，见底在里面是因为
      //   它那一手本来就不钓牌（自己算 0 点），所以打什么都不亏〕
      || R.has(skills, SK.SWAP)
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
    // 【养堆】这张饵**自己也钓得着**吗。`sink` 传 false，照这个文件
    // 既有的约定（挑牌阶段一律按正常落堆算，见上面那个主循环）
    const pen = HOLD_PEN && R.catchStart(G, card, side, skills, false) >= 0
    // 原来那一行是 `if (score < pickScore)`，pickScore 初值 99 ——
    // 也就是「分数 ≥ 99 的谁都别选」。那道兜底照旧，只是挪到了前面，
    // 这样下面那个三段比较只管排序、不兼管兜底
    if (score >= 99.0) continue
    // 先比「钓不钓得着」（钓不着的优先），再比分数。平手留给靠前的那张 ——
    // 跟原来的严格 `<` 一致。`HOLD_PEN` 为假时 `pen` 恒 false，
    // 第二项永不成立、第三项退化成 `score < pickScore`，**逐字等于原来那行**
    if (pick < 0 || (pickPen && !pen) || (pen === pickPen && score < pickScore)) {
      pickScore = score
      pick = i
      pickPen = pen
    }
  }
  // 挑出来的饵自己也钓得着 = 手里全是能钓到的牌，这一手真忍不住
  if (pickPen) G.stat.holdForced[side]++
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
