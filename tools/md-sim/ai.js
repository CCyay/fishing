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
    risk += outsideCount(G, side, faceOfValue(vals[i]))
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
function pickCard(G, side) {
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
    const sink = R.has(skills, SK.SINK)
    const at = R.catchStart(G, card, side, skills, sink)
    let caught = 0
    if (at >= 0) {
      // 收几张：普通是「匹配那张到堆顶」再加自己，沉底是「堆底到匹配那张」
      caught = sink ? at + 2 : G.pile.length - at + 1
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
    // 想当饵顺手发动的那几件。挂效果的三件（照水、冻结、见底）也算 ——
    // 它们正好要求「这张别钓到牌」
    const wants = R.has(skills, SK.PEEK) || R.has(skills, SK.TIDE)
      || R.has(skills, SK.LANTERN) || R.has(skills, SK.FREEZE)
      || R.has(skills, SK.LOWTIDE) || R.has(skills, SK.SWAP)
      || R.has(skills, SK.PICK) || R.has(skills, SK.SUITIFY)
      // 连竿空钩也照样再给一张 —— 当饵顺手白拿一次出牌机会
      || R.has(skills, SK.AGAIN)
      // 挂在牌上的两件新的（窄口、满篓）要求这张留在堆上，跟照水同理
      || R.has(skills, SK.NARROW) || R.has(skills, SK.CREEL)
      // 动对方手牌、从牌库检索这几件钓不钓到都照样发动，当饵白赚一次
      || R.has(skills, SK.PRESS) || R.has(skills, SK.UNHOOK)
      || R.has(skills, SK.SWAPCARD) || R.has(skills, SK.TWIN)
      || R.has(skills, SK.SUITFIND)
      // 抹点数那一族：三件在场效果得让这张留在堆上（照照水），
      // 掏手、掏库钓不钓到都照样发动，拿来当饵是白赚
      || R.has(skills, SK.VOID) || R.has(skills, SK.HUEVOID)
      || R.has(skills, SK.ODD)
      || R.has(skills, SK.DUMP) || R.has(skills, SK.SPILL)
      // 退潮自己算 0 点，永远钓不到 —— 拿它当饵是它唯一的用法
      || R.has(skills, SK.EBB)
      // 凝水 / 净水 / 抬水**压根不落堆**（叠到别的牌上去了），所以也
      // 谈不上钓 —— 它们换的是一次精确操作。拿它们当「饵」是唯一的用法，
      // 而且比别的饵更安全：牌出场了，对手连收都收不着
      || R.has(skills, SK.CALM) || R.has(skills, SK.CLEAN)
      || R.has(skills, SK.RAISE)
      // 抄底无点数 → 它**永远钓不到牌**，所以「当饵」是它唯一的落地方式。
      // 效果（掀走叠放的牌）在 afterPlay 里立刻结算，钓不钓到都一样发动
      || R.has(skills, SK.DREDGE)
    if (wants && score <= fewest + 1) {
      score = score - 1.5
    }
    // 抹点数那四件自己**没有点数**（分水有），所以当饵格外安全 ——
    // 落堆之后没人按点数钓得上它。那正是这一族「堆冻住、让它长厚」的根基。
    // 退潮也在这儿：0 点互不匹配，按点数一样钓不上它
    if (R.has(skills, SK.VOID) || R.has(skills, SK.HUEVOID)
      || R.has(skills, SK.DUMP) || R.has(skills, SK.SPILL)
      || R.has(skills, SK.EBB)
      // 抄底也无点数，同一条理由
      || R.has(skills, SK.DREDGE)) {
      score = score - 1.0
    }
    // ---- 【抄底】：**场上叠着几张，它就值几分** ----
    //
    // 全表唯一一件「收益当场数得出来」的技能 —— 掀几张就是几分，
    // 没有匹配、没有运气。所以判断只有一条：**现在叠着几张**。
    //
    // 场上一张都没叠的时候这儿不减分，它就退回上面那两支（无点数的安全饵）
    // —— 那正是「无点数是它的兜底不是代价」想要的结果。
    // 0.8 一张：三张起就压过下面沉底空钩那条风险
    if (R.has(skills, SK.DREDGE)) {
      score = score - G.stacked.length * 0.8
    }
    // **沉底空钩是最危险的下饵**：那张躺在堆底，谁匹配到它就通吃整堆
    if (R.has(skills, SK.SINK)) {
      score = score + G.pile.length * 0.5
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
function tideSink(G, tops) {
  for (let i = 0; i < tops.length; i++) {
    if (tops[i].rank === R.JACK) return false
    for (let k = 0; k < G.pile.length; k++) {
      if (G.pile[k].rank === tops[i].rank) return false
    }
  }
  return true
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

module.exports = {
  pickCard, swapPick, pickDeck, tideSink, freezePick, takePick, twinPick,
  deadPick, outsideCount, baitRisk, faceOfValue
}
