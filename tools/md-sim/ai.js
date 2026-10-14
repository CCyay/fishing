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

// 把这张当饵有多危险：**它所有点数**外面各还剩几张，加起来（照 baitRisk）。
// 加起来是因为点数卡 —— 一张 ♠3·7 被 3 也被 7 钓得走，当饵比普通 ♠3 危险
function baitRisk(G, side, card) {
  const vals = R.cardVals(card)
  let risk = 0
  for (let i = 0; i < vals.length; i++) {
    // 0 点谁也按点数钓不走（anyEquals 跳过 0），零点牌这一项不算风险
    if (vals[i] === 0) continue
    // 熔合出来的大点数总张数查不到，减出来可能是负的 —— 最少算 0
    risk += Math.max(0, outsideCount(G, side, faceOfValue(vals[i])))
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

function pickCard(G, side) {
  // 关卡表的 random：连钓都不挑（照源码 foePickCard 开头那一支）
  if (G.random[side]) return randomFree(G, side)
  const hand = G.hands[side]
  const lo = G.loadouts[side]
  let best = -1
  let bestCaught = 0
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    if (R.isFrozen(G, card)) continue
    const skills = R.skillsOf(G, side, card)
    // 这儿只看点数槽的【沉底】，**不看角色的【逆流】** ——
    // 照源码（foePickCard 那行 `const sink = hasTrigger(skills, SK_SINK)`）。
    //
    // 那是源码里一个真实的缺口，不是这边搬漏了：挑牌阶段不知道
    // 「这张沉底能钓到」，而 wantSink 只在打出**之后**决定落点，
    // 牌已经挑定了。所以逆流在庄家手里被低估 —— roles 那张表量出来的
    // 是它的**下限**。改源码的话是在上面那一行或上接 wantSink
    //〔点数技能【沉底】删了，这儿原先按它算落堆底那一头。
    //  逆流那个缺口照旧：挑牌阶段不知道「这张落堆底能钓到」〕
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
    const pairFreeze = R.has(skills, SK.FREEZE)
    const pairSuitLine = R.has(skills, SK.SUITED) || R.has(skills, SK.HUE)
    const wants = R.has(skills, SK.TIDE)
      || R.has(skills, SK.FREEZE)
      || R.has(skills, SK.LOWTIDE) || R.has(skills, SK.SWAP)
      || R.has(skills, SK.PICK)
      // 条件性的三件（见上面那段）
      || (R.has(skills, SK.PEEK) && pairFreeze)
      || (R.has(skills, SK.LANTERN) && pairFreeze)
      || (R.has(skills, SK.SUITIFY) && pairSuitLine)
      // 燃烧那两件：落堆就贴火，钓不钓到都发动 —— 当饵白赚一层火
      || R.has(skills, SK.KINDLE) || R.has(skills, SK.CHAIN)
      // 挂在牌上的两件新的（窄口、满篓）要求这张留在堆上，跟照水同理
      || R.has(skills, SK.NARROW) || R.has(skills, SK.CREEL)
      // 动对方手牌、从牌库检索这几件钓不钓到都照样发动，当饵白赚一次
      || R.has(skills, SK.PRESS) || R.has(skills, SK.UNHOOK)
      || R.has(skills, SK.SWAPCARD) || R.has(skills, SK.TWIN)
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
    // 【倒灌】：带它的牌当饵会给对手铺 SURGE_N 张。SURGE_AVOID 是
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

// 【引潮】给对方哪张贴【倒灌】：**他马上会打的那张**。
// 钓得着的最优先（他这手就会打它；收完堆变薄，翻上去的牌更难翻中、
// 留给我钓），其次点数大的（不像小点数那样常被留着当饵）
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
