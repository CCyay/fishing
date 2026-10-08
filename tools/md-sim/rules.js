// 摸打钓鱼 · 对局规则（离线重实现）
//
// 这是 pages/examples/blackjack/ap-fishing.uvue 里那套规则的 node 版本。
// 存在的理由：技能强度要靠跑几万局才定得下来，而 .uvue 跑不起来
// （它是 UTS + Vue 组件，带 ref 和 setTimeout）。
//
// ---- 它是**副本**，所以忠实度是它的全部价值 ----
//
// 每个函数都标了它对应源码里的哪个函数。改游戏规则的时候这边要跟着改 ——
// 跑 `node fingerprint.js` 会告诉你源码里哪几个函数动过了（见 README）。
//
// 没有 npm 依赖（项目的 package.json 里 dependencies 是空的），
// 所以不能 import .uts，只能重写一遍。这是明知的代价。

// ---------- 牌 ----------

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RANK_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const JACK = 'J'
const RED = ['♥', '♦']

// 点数槽能指定的点数：A–10、Q、K。J 不给指定（它本身就通吃）
const SKILL_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K']

const HAND_SIZE = 4
const TIDE_LOOK = 2
const PICK_LOOK = 5

const GUARD_NONE = 0
const GUARD_ME = 1
const GUARD_FOE = 2

// 两方用下标表示：0 = 你，1 = 庄家。
// 源码里是 byFoe 布尔，所以 ME/FOE 和 !byFoe/byFoe 一一对应
const ME = 0
const FOE = 1

// ---------- 技能 ----------
//
// 下标必须和 draw-skills.uts 的 SK_* 完全一致 —— 存档和关卡表存的是下标

const SK = {
  GUARD: 0, HOOK: 1, TIDE: 2, PEEK: 3, TOP: 4, STIR: 5,
  SWAP: 6, SUITED: 7, LANTERN: 8, FREEZE: 9, LOWTIDE: 10, FLOOD: 11,
  PICK: 12, SUITIFY: 13, SINK: 14, AGAIN: 15,
  // 第二批十一件（照钓鱼的贴纸、排竿的道具移植）
  DEEP: 16, PEAK: 17, HUE: 18, CAST: 19, PRESS: 20, UNHOOK: 21,
  SWAPCARD: 22, NARROW: 23, CREEL: 24, TWIN: 25, SUITFIND: 26
}

const KIND_ANY = 0
const KIND_RANK = 2

// 和 DRAW_SKILLS 对齐（key / kind / maxLevel）。
// name 只用来打印报表
const SKILLS = [
  { key: 'guard', name: '护饵', kind: KIND_ANY, maxLevel: 2 },
  { key: 'hook', name: '磁钩', kind: KIND_ANY, maxLevel: 2 },
  { key: 'tide', name: '观潮', kind: KIND_ANY, maxLevel: 2 },
  { key: 'peek', name: '窥视', kind: KIND_ANY, maxLevel: 2 },
  { key: 'top', name: '钩顶', kind: KIND_RANK, maxLevel: 0 },
  { key: 'stir', name: '搅水', kind: KIND_RANK, maxLevel: 0 },
  { key: 'swap', name: '换水', kind: KIND_ANY, maxLevel: 2 },
  { key: 'suited', name: '顺色', kind: KIND_ANY, maxLevel: 2 },
  { key: 'lantern', name: '照水', kind: KIND_ANY, maxLevel: 2 },
  { key: 'freeze', name: '冻结', kind: KIND_ANY, maxLevel: 2 },
  { key: 'lowtide', name: '见底', kind: KIND_RANK, maxLevel: 0 },
  { key: 'flood', name: '洪水', kind: KIND_RANK, maxLevel: 0 },
  { key: 'pick', name: '择饵', kind: KIND_ANY, maxLevel: 2 },
  { key: 'suitify', name: '染水', kind: KIND_ANY, maxLevel: 2 },
  { key: 'sink', name: '沉底', kind: KIND_ANY, maxLevel: 2 },
  { key: 'again', name: '连竿', kind: KIND_ANY, maxLevel: 2 },
  { key: 'deep', name: '归深', kind: KIND_ANY, maxLevel: 2 },
  { key: 'peak', name: '齐顶', kind: KIND_RANK, maxLevel: 0 },
  { key: 'hue', name: '收色', kind: KIND_RANK, maxLevel: 0 },
  { key: 'cast', name: '撒网', kind: KIND_RANK, maxLevel: 0 },
  { key: 'press', name: '压舱', kind: KIND_ANY, maxLevel: 2 },
  { key: 'unhook', name: '摘钩', kind: KIND_RANK, maxLevel: 0 },
  { key: 'swapcard', name: '对换', kind: KIND_RANK, maxLevel: 0 },
  { key: 'narrow', name: '窄口', kind: KIND_ANY, maxLevel: 2 },
  { key: 'creel', name: '满篓', kind: KIND_ANY, maxLevel: 2 },
  { key: 'twin', name: '同号', kind: KIND_ANY, maxLevel: 2 },
  { key: 'suitfind', name: '同花', kind: KIND_ANY, maxLevel: 2 }
]

// ---------- 随机数：种子化 ----------
//
// 源码用 Math.random，这边用 mulberry32。理由是**可复现**：
// 同一个种子跑出同一批牌，调完一个数值再跑一遍，差异全来自那个数值
// 而不是来自运气。设计文档 8.9 想要的「种子」也是这个东西

function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng, n) {
  return Math.floor(rng() * n)
}

function pickOne(rng, list) {
  return list[randInt(rng, list.length)]
}

// ---------- 牌与牌组 ----------

function valueOfRank(rank) {
  const at = RANKS.indexOf(rank)
  return at < 0 ? 0 : RANK_VALUES[at]
}

function isRedSuit(suit) {
  return RED.indexOf(suit) >= 0
}

function makeCard(suit, rank, extra) {
  return { suit: suit, rank: rank, value: valueOfRank(rank), extra: extra || [] }
}

// 标准 52 张（照 draw-save.uts 的 standardDeck：按点数外层、花色内层）
function standardDeck() {
  const out = []
  for (let r = 0; r < RANKS.length; r++) {
    for (let s = 0; s < SUITS.length; s++) {
      out.push(makeCard(SUITS[s], RANKS[r], []))
    }
  }
  return out
}

// Fisher-Yates（照 buildPlainDeck）
function shuffle(rng, list) {
  const out = list.slice(0)
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

// ---------- 配装 ----------
//
// 照 draw-skills.uts：suitOwner 和 SUITS 对齐、rankOwner 和 SKILL_RANKS 对齐，
// -1 是空着。levels 和 SKILLS 对齐，-1 是没有这个技能

function emptyLoadout() {
  return {
    suitOwner: [-1, -1, -1, -1],
    rankOwner: SKILL_RANKS.map(function () { return -1 }),
    levels: SKILLS.map(function () { return -1 })
  }
}

// 一个技能在花色槽占几格（照 suitSizeOf）：初始 1 格，升过级就是一整个颜色
function suitSizeOf(level) {
  return level >= 1 ? 2 : 1
}

// 在点数槽占几格（照 rankSizeOf）：初始 1 格，每升一级多 1 格
function rankSizeOf(level) {
  return level < 0 ? 0 : level + 1
}

// 同色的另一个花色：♠♣ 一对、♥♦ 一对（照 partnerSuit）
function partnerSuit(at) {
  if (at === 0) return 3
  if (at === 3) return 0
  return at === 1 ? 2 : 1
}

// 打这张牌会触发哪几个技能（照 triggersOf）。最多两个：花色槽一个、点数槽一个
function triggersOf(lo, card) {
  const out = []
  const s = SUITS.indexOf(card.suit)
  if (s >= 0 && lo.suitOwner[s] >= 0) {
    out.push(lo.suitOwner[s])
  }
  const r = SKILL_RANKS.indexOf(card.rank)
  if (r >= 0 && lo.rankOwner[r] >= 0 && out.indexOf(lo.rankOwner[r]) < 0) {
    out.push(lo.rankOwner[r])
  }
  return out
}

function has(list, skill) {
  return list.indexOf(skill) >= 0
}

// 把一个技能按指定等级装进点数槽的前几个空格。
// **给模拟用的确定性装法** —— 游戏里位置是摇出来的（rollPlace），
// 但要量一件技能的强度，位置得固定，不然测的是运气。
// 想量「摇出来的位置有多大影响」就用 spots 参数指定格子
function putRank(lo, skill, level, spots) {
  lo.levels[skill] = level
  const want = rankSizeOf(level)
  let put = 0
  if (spots) {
    for (let i = 0; i < spots.length && put < want; i++) {
      const at = SKILL_RANKS.indexOf(spots[i])
      if (at >= 0 && lo.rankOwner[at] < 0) {
        lo.rankOwner[at] = skill
        put++
      }
    }
    return lo
  }
  for (let i = 0; i < lo.rankOwner.length && put < want; i++) {
    if (lo.rankOwner[i] < 0) {
      lo.rankOwner[i] = skill
      put++
    }
  }
  return lo
}

// 装进花色槽。升过级的占一整个颜色
function putSuit(lo, skill, level, suit) {
  lo.levels[skill] = level
  let at = suit ? SUITS.indexOf(suit) : -1
  if (at < 0) {
    for (let i = 0; i < lo.suitOwner.length; i++) {
      if (lo.suitOwner[i] < 0) { at = i; break }
    }
  }
  if (at < 0) return lo
  lo.suitOwner[at] = skill
  if (suitSizeOf(level) === 2 && lo.suitOwner[partnerSuit(at)] < 0) {
    lo.suitOwner[partnerSuit(at)] = skill
  }
  return lo
}

// ---------- 对局状态 ----------

function newGame(opts) {
  const rng = opts.rng
  const deck = shuffle(rng, opts.deck || standardDeck())
  const G = {
    rng: rng,
    deck: deck,
    // 两方的手牌、以及「这张被对方看见了吗」
    hands: [[], []],
    seen: [[], []],
    pile: [],
    // 堆上每张的：谁打的、被谁护着、现在算哪几个点数、现在算什么花色
    pileByFoe: [],
    pileGuard: [],
    pileVals: [],
    pileSuit: [],
    // 已经被钓走的点数（庄家记牌要用）
    gone: [],
    score: [0, 0],
    // 挂在牌上的效果：{ source, skill, target, side }
    held: [],
    // 连竿的两个标记（照源码的 againPending / againUsed）：
    //   pending —— 刚打那张触发了连竿，还没兑现；
    //   used    —— 这个回合已经加打过一次，加打的那张不再给加打
    againPending: false,
    againUsed: false,
    loadouts: [opts.mine, opts.foe],
    // 这一方会不会记牌（关卡表的 smart）
    smart: [opts.mineSmart !== false, opts.foeSmart !== false],
    // 统计
    stat: {
      plays: [0, 0], catches: [0, 0], caught: [0, 0],
      jackCatches: [0, 0], skillCatch: [0, 0], turns: 0
    },
    rankTotal: {},
    over: false
  }
  // 每个点数一共几张（照 buildRankTotals）—— 改造过的牌组不是恒定的 4 张
  for (let i = 0; i < deck.length; i++) {
    G.rankTotal[deck[i].rank] = (G.rankTotal[deck[i].rank] || 0) + 1
  }
  // 开局各发满 HAND_SIZE，庄家先发、交替（照 newGame 末尾那个循环）
  for (let i = 0; i < HAND_SIZE; i++) {
    drawFor(G, FOE)
    drawFor(G, ME)
  }
  return G
}

// 从牌库顶摸一张。**数组末尾是牌库顶**（照 drawFor 的 pop）
function drawFor(G, side) {
  if (G.deck.length === 0) return null
  const card = G.deck.pop()
  G.hands[side].push(card)
  G.seen[side].push(false)
  return card
}

function takeFromHand(G, side, index) {
  const card = G.hands[side][index]
  G.hands[side].splice(index, 1)
  G.seen[side].splice(index, 1)
  return card
}

function pushPile(G, card, side, guard, vals) {
  G.pile.push(card)
  G.pileByFoe.push(side === FOE)
  G.pileGuard.push(guard)
  G.pileVals.push(vals)
  // 落堆时花色就是牌面那个；染水之后才会不一样
  G.pileSuit.push(card.suit)
}

// 沉底：插到堆底（照 unshiftPile）
function unshiftPile(G, card, side, guard, vals) {
  G.pile.unshift(card)
  G.pileByFoe.unshift(side === FOE)
  G.pileGuard.unshift(guard)
  G.pileVals.unshift(vals)
  G.pileSuit.unshift(card.suit)
}

function pileValsAt(G, i) {
  return i < G.pileVals.length ? G.pileVals[i] : cardVals(G.pile[i])
}

function pileSuitAt(G, i) {
  return i < G.pileSuit.length ? G.pileSuit[i] : G.pile[i].suit
}

function pileRed(G, i) {
  return isRedSuit(pileSuitAt(G, i))
}

// 这张牌**印着**的那几个点数：牌面那个 + 点数卡贴上来的（照 cardVals）
function cardVals(card) {
  const out = [card.value]
  for (let i = 0; i < card.extra.length; i++) {
    if (out.indexOf(card.extra[i]) < 0) {
      out.push(card.extra[i])
    }
  }
  return out
}

// 打出这张算哪几个点数（照 valuesOf）：
// 顺色拿整个点数换一次按花色钓，洪水拿点数换一串翻牌 —— 两件都是「点数整个不算」
// 收色也在「拿点数换一次按花色的清扫」这一类里，所以跟顺色、洪水一起。
// G 是为了齐顶 —— 它要读堆才算得出「最大的那个点数」
function valuesOf(G, card, skills) {
  if (has(skills, SK.SUITED) || has(skills, SK.FLOOD) || has(skills, SK.HUE)) {
    return []
  }
  // 齐顶：算堆上最大的那个点数，覆盖掉牌面和点数卡。空堆算 0（白打一张）
  if (has(skills, SK.PEAK)) {
    let top = 0
    for (let i = 0; i < G.pile.length; i++) {
      const vals = pileValsAt(G, i)
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] > top) top = vals[k]
      }
    }
    return [top]
  }
  const out = cardVals(card)
  // 归深：**追加** 11 这个候选。11 是 J 的数，而 J 从不落堆 ——
  // 所以那是一个只有归深牌够得到的私有钓点
  if (has(skills, SK.DEEP) && out.indexOf(11) < 0) {
    out.push(11)
  }
  return out
}

// mine 里有没有哪个数 +gap 等于 theirs 里的某个数（照 anyEquals）。
// **0 点和 0 点不算相等** —— 两张都见了底的牌不该还能互相钓
function anyEquals(mine, theirs, gap) {
  for (let a = 0; a < mine.length; a++) {
    if (gap === 0 && mine[a] === 0) continue
    for (let b = 0; b < theirs.length; b++) {
      if (theirs[b] === mine[a] + gap) return true
    }
  }
  return false
}

// 堆里这张对出牌那一方来说是不是被护着（照 guardedAgainst）：
// 对方护的才挡，自己护的不挡自己
function guardedAgainst(G, i, side) {
  const g = G.pileGuard[i]
  if (g === GUARD_NONE) return false
  return side === FOE ? g === GUARD_ME : g === GUARD_FOE
}

// ---------- 钓牌判定（照 catchStart） ----------
//
// 返回从堆里第几张开始收，-1 表示钓不到。
// sink（沉底）把搜索方向整个反过来：普通从堆底往上找（命中最深那张），
// 沉底从堆顶往下找（命中最高那张）—— 两条都是「尽量多收」，只是镜像
function catchStart(G, card, side, skills, sink) {
  const size = G.pile.length
  if (card.rank === JACK) {
    if (size === 0) return -1
    return sink ? size - 1 : 0
  }
  const hook = has(skills, SK.HOOK)
  const suited = has(skills, SK.SUITED)
  const mine = valuesOf(G, card, skills)
  for (let n = 0; n < size; n++) {
    const i = sink ? size - 1 - n : n
    if (guardedAgainst(G, i, side)) continue
    const theirs = pileValsAt(G, i)
    // 花色比的是 pileSuitAt（染水改过的算改后的）
    if (suited && pileSuitAt(G, i) === card.suit) return i
    if (anyEquals(mine, theirs, 0)) return i
    // 磁钩：对得上比它大 1 的点数。J 不吃这条
    if (hook && G.pile[i].rank !== JACK && anyEquals(mine, theirs, 1)) return i
  }
  // 钩顶：都对不上就钓**紧贴着你这张**的那一张（沉底时镜像到堆底）
  const near = sink ? 0 : size - 1
  if (has(skills, SK.TOP) && size > 0 && !guardedAgainst(G, near, side)) {
    return near
  }
  return -1
}

function canCatch(G, card, side) {
  const skills = triggersOf(G.loadouts[side], card)
  return catchStart(G, card, side, skills, has(skills, SK.SINK)) >= 0
}

// ---------- 挂在牌上的效果（照 inPile / expireHeld / heldOn / isFrozen） ----------

function inPile(G, card) {
  return G.pile.indexOf(card) >= 0
}

// 效果牌已经离场的，清掉。每次收完牌调一次
function expireHeld(G) {
  G.held = G.held.filter(function (h) { return inPile(G, h.source) })
}

function heldOn(G, skill, side) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === skill && G.held[i].side === side) return true
  }
  return false
}

function isFrozen(G, card) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === SK.FREEZE && G.held[i].target === card) return true
  }
  return false
}

// 对方手里第 index 张，side 这一方看得见吗（照 foeOpen / foeKnows）。
// 照水是总开关：它亮着的时候连期间新补的牌也明着
function opponentOpen(G, side, index) {
  const other = side === ME ? FOE : ME
  if (heldOn(G, SK.LANTERN, side)) return true
  return index < G.seen[other].length && G.seen[other][index]
}

// ---------- 打出一张（照 playFor） ----------
//
// 返回收走了几张（0 = 没钓到）。源码里收牌要放动画，这边直接结算
function playFor(G, side, index, ai) {
  const card = takeFromHand(G, side, index)
  const skills = triggersOf(G.loadouts[side], card)
  G.stat.plays[side]++
  // ---- 带「优先」的两件在钓牌判定**之前**结算 ----
  // 先染水（定花色），再沉底（定落点）
  if (has(skills, SK.SUITIFY)) {
    suitifyFor(G, card)
  }
  const sink = has(skills, SK.SINK)
  const at = catchStart(G, card, side, skills, sink)
  const worth = valuesOf(G, card, skills)
  if (at < 0) {
    // 没钓到：沉底的插堆底，普通的落堆顶。护饵在这儿挂上
    const guard = has(skills, SK.GUARD)
      ? (side === FOE ? GUARD_FOE : GUARD_ME) : GUARD_NONE
    if (sink) {
      unshiftPile(G, card, side, guard, worth)
    } else {
      pushPile(G, card, side, guard, worth)
    }
    afterPlay(G, side, skills, card, ai)
    return 0
  }
  // 钓到了。收走的那一段往哪边算，由沉底决定（照 playFor 后半）
  let from = at
  let count = 0
  if (sink) {
    unshiftPile(G, card, side, GUARD_NONE, worth)
    from = 0
    count = at + 2
  } else {
    pushPile(G, card, side, GUARD_NONE, worth)
    count = G.pile.length - at
  }
  collect(G, side, from, count)
  G.stat.catches[side]++
  G.stat.caught[side] += count
  if (card.rank === JACK) {
    G.stat.jackCatches[side]++
  } else if (has(skills, SK.HOOK) || has(skills, SK.TOP) || has(skills, SK.SUITED)) {
    // 这一钓是靠技能才成立的吗 —— 粗略记一笔，报表里看技能到底在不在起作用
    G.stat.skillCatch[side]++
  }
  afterPlay(G, side, skills, card, ai)
  return count
}

// 把 [from, from+count) 这一段收走记分（照 finishCatch）
function collect(G, side, from, count) {
  for (let i = from; i < from + count && i < G.pile.length; i++) {
    G.gone.push(G.pile[i].rank)
  }
  G.pile.splice(from, count)
  G.pileByFoe.splice(from, count)
  G.pileGuard.splice(from, count)
  G.pileVals.splice(from, count)
  G.pileSuit.splice(from, count)
  expireHeld(G)
  G.score[side] += count
}

// 染水〔优先〕：把场上所有牌的花色改成跟它一样（照 suitifyFor）
function suitifyFor(G, card) {
  for (let i = 0; i < G.pileSuit.length; i++) {
    G.pileSuit[i] = card.suit
  }
}

// ---------- 打出之后的技能（照 afterPlay） ----------
//
// 顺序严格照源码：窥视 → 搅水 → 照水 → 见底 → 洪水 → 冻结 → 换水 → 择饵 → 观潮。
// 源码里玩家那几件要停下来等人选（freezePending 等），模拟里两侧都走 AI 的启发式
function afterPlay(G, side, skills, played, ai) {
  // 连竿只在这儿**记个账**，兑现在 passTurn 最前面 ——
  // 它要等这一手所有效果都结算完（跟「优先」正好两头）
  if (has(skills, SK.AGAIN) && !G.againUsed) {
    G.againPending = true
  }
  if (has(skills, SK.PEEK)) {
    peekFor(G, side)
  }
  if (has(skills, SK.STIR)) {
    stirFor(G, side)
  }
  // 挂效果的那几件都要求那张牌**还在堆上** —— 钓到牌的话它自己也被收走了，
  // 效果压根挂不上。所以挂效果得用一张钓不到牌的
  if (has(skills, SK.LANTERN) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.LANTERN, target: null, side: side })
  }
  // 窄口（削对方手牌上限）、满篓（抬自己的），都挂在刚打那张上
  if (has(skills, SK.NARROW) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.NARROW, target: null, side: side })
  }
  if (has(skills, SK.CREEL) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.CREEL, target: null, side: side })
  }
  if (has(skills, SK.LOWTIDE)) {
    lowTideFor(G, side)
  }
  if (has(skills, SK.FLOOD)) {
    floodFor(G, side)
  }
  // 收色、撒网：散着收一批
  if (has(skills, SK.HUE)) {
    hueFor(G, side, played)
  }
  if (has(skills, SK.CAST)) {
    castFor(G, side, played)
  }
  // 动对方手牌那三件，排在冻结**前面**（照「贵的赢」，见源码 afterPlay 那段）
  if (has(skills, SK.SWAPCARD) || has(skills, SK.UNHOOK) || has(skills, SK.PRESS)) {
    const which = has(skills, SK.SWAPCARD) ? SK.SWAPCARD
      : (has(skills, SK.UNHOOK) ? SK.UNHOOK : SK.PRESS)
    const other = side === ME ? FOE : ME
    if (G.hands[other].length > 0) {
      doTakeFrom(G, side, which, ai.takePick(G, side), ai)
    }
  }
  if (has(skills, SK.FREEZE) && inPile(G, played)) {
    const other = side === ME ? FOE : ME
    if (G.hands[other].length > 0) {
      const at = ai.freezePick(G, side)
      if (at >= 0) {
        G.held.push({
          source: played, skill: SK.FREEZE, target: G.hands[other][at], side: side
        })
      }
    }
  }
  // 换水排在观潮前面（源码里一个回合只停一次人）
  if (has(skills, SK.SWAP) && G.hands[side].length > 0) {
    const at = ai.swapPick(G, side)
    if (at >= 0) {
      shuffleBack(G, takeFromHand(G, side, at))
    }
  }
  // 择饵赢过观潮：两件撞在同一张牌上时只走择饵（源码对两侧都加了这道闸）
  let pickDone = false
  if (has(skills, SK.PICK) && G.deck.length > 1) {
    const tops = topCards(G, PICK_LOOK)
    doPickDeck(G, ai.pickDeck(G, tops), tops.length)
    pickDone = true
  }
  // 同花：翻牌库顶拿第一张同花色的，翻过的洗回去。不停人
  if (has(skills, SK.SUITFIND) && G.deck.length > 0) {
    suitFindFor(G, side, played)
  }
  // 同号：牌库里同点数的那几张挑一张
  if (has(skills, SK.TWIN)) {
    const pool = twinPool(G, played)
    if (pool.length > 0) {
      pullFromDeck(G, side, pool[ai.twinPick(G, side, pool)])
    }
  }
  if (has(skills, SK.TIDE) && !pickDone && G.deck.length > 1) {
    const tops = topCards(G, TIDE_LOOK)
    if (ai.tideSink(G, tops)) {
      sinkTops(G, tops.length)
    }
  }
  passTurn(G, side)
}

// 牌库顶往下数 n 张（照 topCards）。第 0 个是最顶上那张
function topCards(G, n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const at = G.deck.length - 1 - i
    if (at < 0) break
    out.push(G.deck[at])
  }
  return out
}

// 顶上 n 张一起沉到底，**顺序原样搬**（照 sinkTops）
function sinkTops(G, n) {
  const moved = []
  for (let i = 0; i < n && G.deck.length > 0; i++) {
    moved.push(G.deck.pop())
  }
  moved.reverse()
  G.deck = moved.concat(G.deck)
}

// 择饵落地：顶上那几张里留第 keep 张，其余沉底（照 doPickDeck）
function doPickDeck(G, keep, size) {
  const tops = topCards(G, PICK_LOOK)
  if (tops.length === 0) return
  const at = keep < 0 || keep >= tops.length ? 0 : keep
  const card = tops[at]
  sinkTops(G, tops.length)
  G.deck.push(card)
}

// 把一张牌塞回牌库并**真洗进去**（照 shuffleBack）
function shuffleBack(G, card) {
  G.deck.push(card)
  G.deck = shuffle(G.rng, G.deck)
}

// 窥视：翻开对方一张还没被看过的手牌（照 peekFor）
function peekFor(G, side) {
  const other = side === ME ? FOE : ME
  const hidden = []
  for (let i = 0; i < G.seen[other].length; i++) {
    if (!G.seen[other][i]) hidden.push(i)
  }
  if (hidden.length === 0) return
  G.seen[other][pickOne(G.rng, hidden)] = true
}

// 搅水：对方随机一张手牌明着落到堆上，不算钓牌（照 stirFor）。
// 硬塞上去的牌不触发它身上的技能，点数按它自己印的算
function stirFor(G, side) {
  const other = side === ME ? FOE : ME
  if (G.hands[other].length === 0) return
  const card = takeFromHand(G, other, randInt(G.rng, G.hands[other].length))
  pushPile(G, card, other, GUARD_NONE, cardVals(card))
}

// 见底：整堆点数往下压 N（N = 场上黑牌张数），收走压到 0 的那些（照 lowTideFor）
function lowTideFor(G, side) {
  let n = 0
  for (let i = 0; i < G.pile.length; i++) {
    if (!pileRed(G, i)) n++
  }
  if (n === 0 || G.pile.length === 0) return
  const keep = { cards: [], byFoe: [], guard: [], vals: [], suit: [] }
  let taken = 0
  for (let i = 0; i < G.pile.length; i++) {
    const was = pileValsAt(G, i)
    // 一个点数都没有的不参与（顺色那张就是这样）
    if (was.length === 0) {
      keep.cards.push(G.pile[i]); keep.byFoe.push(G.pileByFoe[i])
      keep.guard.push(G.pileGuard[i]); keep.vals.push(was)
      keep.suit.push(pileSuitAt(G, i))
      continue
    }
    // 每个点数各自往下压，压到 0 的从列表里掉出来。
    // 贴过点数卡的牌因此更难被压走 —— 还剩一个点数就还在场上
    const now = []
    for (let k = 0; k < was.length; k++) {
      const v = was[k] - n
      if (v > 0) now.push(v)
    }
    if (now.length === 0) {
      G.gone.push(G.pile[i].rank)
      taken++
      continue
    }
    keep.cards.push(G.pile[i]); keep.byFoe.push(G.pileByFoe[i])
    keep.guard.push(G.pileGuard[i]); keep.vals.push(now)
    keep.suit.push(pileSuitAt(G, i))
  }
  G.pile = keep.cards; G.pileByFoe = keep.byFoe; G.pileGuard = keep.guard
  G.pileVals = keep.vals; G.pileSuit = keep.suit
  expireHeld(G)
  if (taken > 0) {
    G.score[side] += taken
    G.stat.catches[side]++
    G.stat.caught[side] += taken
  }
}

// 洪水：从牌库一张张往堆上翻，直到撞上点数（照 floodFor）。
// 判撞在落堆之前，翻上去的牌不带技能，翻空了就是白打
function floodFor(G, side) {
  let hitAt = -1
  let flipped = 0
  while (G.deck.length > 0) {
    const card = G.deck.pop()
    const at = catchStart(G, card, side, [], false)
    pushPile(G, card, side, GUARD_NONE, cardVals(card))
    flipped++
    if (at >= 0) { hitAt = at; break }
  }
  if (flipped === 0 || hitAt < 0) return
  const count = G.pile.length - hitAt
  collect(G, side, hitAt, count)
  G.stat.catches[side]++
  G.stat.caught[side] += count
}

// ---------- 收色 / 撒网（照 harvestPile、hueFor、castFor） ----------

function harvestPile(G, side, wanted) {
  const keep = { cards: [], byFoe: [], guard: [], vals: [], suit: [] }
  let taken = 0
  for (let i = 0; i < G.pile.length; i++) {
    if (wanted[i]) {
      G.gone.push(G.pile[i].rank)
      taken++
      continue
    }
    keep.cards.push(G.pile[i]); keep.byFoe.push(G.pileByFoe[i])
    keep.guard.push(G.pileGuard[i]); keep.vals.push(pileValsAt(G, i))
    keep.suit.push(pileSuitAt(G, i))
  }
  G.pile = keep.cards; G.pileByFoe = keep.byFoe; G.pileGuard = keep.guard
  G.pileVals = keep.vals; G.pileSuit = keep.suit
  expireHeld(G)
  if (taken > 0) {
    G.score[side] += taken
    G.stat.catches[side]++
    G.stat.caught[side] += taken
  }
  return taken
}

// 收色：堆上同花色的一起收走（比的是 pileSuitAt —— 染水改过的算改后的）。
// **只有它自己的时候什么也不收**，不然它就是稳赚 1 分、零风险
function hueFor(G, side, card) {
  const wanted = []
  let hits = 0
  for (let i = 0; i < G.pile.length; i++) {
    const hit = pileSuitAt(G, i) === card.suit
    if (hit) hits++
    wanted.push(hit)
  }
  if (hits <= 1) return
  harvestPile(G, side, wanted)
}

// 撒网：堆上同奇偶的一起收走。自己的奇偶按**牌面点数**算，
// 堆上那些按现在的点数算（0 算偶数，一个点数都没有的不算）
function castFor(G, side, card) {
  const odd = card.value % 2 === 1
  const wanted = []
  let hits = 0
  for (let i = 0; i < G.pile.length; i++) {
    const vals = pileValsAt(G, i)
    let hit = false
    for (let k = 0; k < vals.length; k++) {
      if ((vals[k] % 2 === 1) === odd) { hit = true; break }
    }
    if (hit) hits++
    wanted.push(hit)
  }
  if (hits <= 1) return
  harvestPile(G, side, wanted)
}

// ---------- 压舱 / 摘钩 / 对换（照 doTakeFrom、doGiveBack） ----------

function giveTo(G, side, card, seen) {
  G.hands[side].push(card)
  G.seen[side].push(seen === true)
}

function doTakeFrom(G, side, skill, index, ai) {
  const other = side === ME ? FOE : ME
  if (index < 0 || index >= G.hands[other].length) return
  const card = takeFromHand(G, other, index)
  if (skill === SK.PRESS) {
    shuffleBack(G, card)
    return
  }
  // 摘钩、对换都把牌拿到自己手上（可能超过上限 —— refill 只负责「补到」）。
  // 从对方手里拿的牌，对方当然知道它是什么
  giveTo(G, side, card, true)
  if (skill !== SK.SWAPCARD) return
  // 对换：再挑一张自己的还他
  const back = ai.swapPick(G, side)
  if (back >= 0 && G.hands[side].length > 0) {
    const give = takeFromHand(G, side, back)
    giveTo(G, other, give, true)
  }
}

// ---------- 同号 / 同花（照 twinPool、pullFromDeck、suitFindFor） ----------

function twinPool(G, card) {
  const out = []
  for (let i = G.deck.length - 1; i >= 0; i--) {
    if (G.deck[i].rank === card.rank) out.push(G.deck[i])
  }
  return out
}

function pullFromDeck(G, side, card) {
  let at = -1
  for (let i = 0; i < G.deck.length; i++) {
    if (G.deck[i] === card) { at = i; break }
  }
  if (at < 0) return false
  G.deck.splice(at, 1)
  giveTo(G, side, card, false)
  return true
}

// 同花：翻牌库顶拿第一张同花色的，翻过的其余**洗回牌库**
function suitFindFor(G, side, card) {
  const flipped = []
  let got = null
  while (G.deck.length > 0) {
    const one = G.deck.pop()
    if (one.suit === card.suit) { got = one; break }
    flipped.push(one)
  }
  if (flipped.length > 0) {
    G.deck = shuffle(G.rng, G.deck.concat(flipped))
  }
  if (got !== null) {
    giveTo(G, side, got, false)
  }
}

// 这张打出去，收色 / 撒网能扫走几张（含它自己）。两件都没带就是 0。
// 口径跟 hueFor / castFor 一致 —— AI 挑牌要用（照源码的 harvestCount）
function harvestCount(G, card, skills) {
  const hue = has(skills, SK.HUE)
  const cast = has(skills, SK.CAST)
  if (!hue && !cast) return 0
  const odd = card.value % 2 === 1
  let n = 0
  for (let i = 0; i < G.pile.length; i++) {
    if (hue && pileSuitAt(G, i) === card.suit) { n++; continue }
    if (!cast) continue
    const vals = pileValsAt(G, i)
    for (let k = 0; k < vals.length; k++) {
      if ((vals[k] % 2 === 1) === odd) { n++; break }
    }
  }
  return n > 0 ? n + 1 : 0
}

// ---------- 回合流转 ----------

// 这一方这回合补到几张（照 handLimit）：满篓 +1、对方的窄口 −1，最少 1 张
function handLimit(G, side) {
  let want = HAND_SIZE
  if (heldOn(G, SK.CREEL, side)) want = want + 1
  if (heldOn(G, SK.NARROW, side === ME ? FOE : ME)) want = want - 1
  return want < 1 ? 1 : want
}

// 把这一方手牌补足到上限（照 refill）
function refill(G, side) {
  const want = handLimit(G, side)
  while (G.hands[side].length < want) {
    if (drawFor(G, side) === null) break
  }
}

// 一方回合结束：对方之前护着的饵到这里失效（照 expireGuards）
function expireGuards(G, side) {
  const drop = side === FOE ? GUARD_ME : GUARD_FOE
  for (let i = 0; i < G.pileGuard.length; i++) {
    if (G.pileGuard[i] === drop) G.pileGuard[i] = GUARD_NONE
  }
}

// 牌库和两边手牌都空了就结束（照 checkOver）
function checkOver(G) {
  if (G.deck.length === 0 && G.hands[ME].length === 0 && G.hands[FOE].length === 0) {
    G.over = true
    return true
  }
  return false
}

// **补牌在回合末**（照 passTurn）：补完才算得准「是不是都空了」。
//
// ---- 连竿在这儿截住交接 ----
//
// 三条闸照源码：加打那张不再给加打（againUsed）、手里没牌就不给、
// **补牌和护饵过期都压到真交接那一刻**（加打那张是同一个回合里的，
// 中间补牌手牌数就不对了，护饵也会提前失效）
function passTurn(G, side) {
  if (G.againPending && !G.againUsed) {
    G.againPending = false
    G.againUsed = true
    if (G.hands[side].length > 0) {
      // 不交回合、不补牌、不过期护饵 —— 同一方再打一张
      G.turn = side
      return
    }
  }
  G.againPending = false
  G.againUsed = false
  expireGuards(G, side)
  refill(G, side)
  checkOver(G)
  G.turn = side === FOE ? ME : FOE
}

// 跑完一整局。庄家先手（照 newGame 末尾的 startFoeTurn）
function playGame(opts, ai) {
  const G = newGame(opts)
  G.turn = FOE
  // 防死循环的闸：一局最多这么多回合。
  // 正常一局 52 次出牌上下，翻倍够宽松了 —— 真撞上就是规则实现出了环
  let guard = 400
  while (!G.over && guard-- > 0) {
    const side = G.turn
    G.stat.turns++
    if (G.hands[side].length === 0) {
      // 手里没牌：这回合什么也做不了（照 startMyTurn / foeTurn 那道岔）
      passTurn(G, side)
      continue
    }
    const index = ai.pickCard(G, side)
    if (index < 0) {
      // 全被冻住了，打不出牌
      passTurn(G, side)
      continue
    }
    playFor(G, side, index, ai)
  }
  if (guard <= 0) {
    throw new Error('一局没能在 400 回合内结束 —— 规则实现里有环')
  }
  return G
}

module.exports = {
  SUITS, RANKS, RANK_VALUES, SKILL_RANKS, JACK, HAND_SIZE,
  GUARD_NONE, GUARD_ME, GUARD_FOE, ME, FOE, SK, SKILLS,
  KIND_ANY, KIND_RANK,
  makeRng, randInt, pickOne, isRedSuit, makeCard, standardDeck, shuffle,
  emptyLoadout, suitSizeOf, rankSizeOf, partnerSuit, putRank, putSuit,
  triggersOf, has, cardVals, valuesOf, anyEquals, canCatch, catchStart,
  isFrozen, heldOn, opponentOpen, inPile, topCards, handLimit, harvestCount,
  newGame, playFor, playGame, valueOfRank
}
