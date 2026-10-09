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

// 下标照 draw-skills.uts 的表序。源码那边改成了「key 查下标」
//（SK_HOOK = skillIndexOf('hook')），这边仍然写死 —— 它是个副本，
// 对不上的时候 fingerprint.js 会报「技能表变了」
const SK = {
  HOOK: 0, TIDE: 1, PEEK: 2,
  SWAP: 3, SUITED: 4, LANTERN: 5, FREEZE: 6, LOWTIDE: 7, FLOOD: 8,
  PICK: 9, SUITIFY: 10, SINK: 11, AGAIN: 12,
  // 第二批十一件（照钓鱼的贴纸、排竿的道具移植）
  DEEP: 13, PEAK: 14, HUE: 15, CAST: 16, PRESS: 17, UNHOOK: 18,
  SWAPCARD: 19, NARROW: 20, CREEL: 21, TWIN: 22, SUITFIND: 23,
  // 第三批五件：**抹点数那一族**（压底路线）
  VOID: 24, DUMP: 25, SPILL: 26, ODD: 27, HUEVOID: 28,
  // 第四批两件：**主动控堆**那条新轴
  EBB: 29, MEASURE: 30
}
// 删掉的三件：护饵（guard）、钩顶（top）、搅水（stir）。
// 删它们的时候这边的下标全前移了三位 —— 那正是源码改成 key 认身份
// 要避免的事，而模拟器是副本，它只要跟着对齐就行

// 掏手、掏库各掏几张。2 是按手牌 4 张定的 —— 掏一半
const DUMP_COUNT = 2
const SPILL_COUNT = 2
// 退潮：左侧几张（连自己）各减它的牌面点数（照 draw-skills 的 EBB_COUNT）
const EBB_COUNT = 2
// 见底：整堆压几点（照 ap-fishing 的 LOW_TIDE_STEP）
const LOW_TIDE_STEP = 1

// 和 DRAW_SKILLS 对齐。name 只用来打印报表。
//
// 原先每行还有 kind（KIND_ANY / KIND_RANK）和 maxLevel —— 两样都删了：
// 源码的 DrawSkill 去掉了 kind（花色槽砍了之后「这件能不能放花色槽」
// 不再是个问题），等级整套也没了。留着它们会让 sim.js 按一个
// 游戏里不存在的模型构配装
const SKILLS = [
  { key: 'hook', name: '磁钩' },
  { key: 'tide', name: '观潮' },
  { key: 'peek', name: '窥视' },
  { key: 'swap', name: '换水' },
  { key: 'suited', name: '顺色' },
  { key: 'lantern', name: '照水' },
  { key: 'freeze', name: '冻结' },
  { key: 'lowtide', name: '见底' },
  { key: 'flood', name: '洪水' },
  { key: 'pick', name: '择饵' },
  { key: 'suitify', name: '染水' },
  { key: 'sink', name: '沉底' },
  { key: 'again', name: '连竿' },
  { key: 'deep', name: '归深' },
  { key: 'peak', name: '齐顶' },
  { key: 'hue', name: '收色' },
  { key: 'cast', name: '撒网' },
  { key: 'press', name: '压舱' },
  { key: 'unhook', name: '摘钩' },
  { key: 'swapcard', name: '对换' },
  { key: 'narrow', name: '窄口' },
  { key: 'creel', name: '满篓' },
  { key: 'twin', name: '同号' },
  { key: 'suitfind', name: '同花' },
  { key: 'void', name: '压邻' },
  { key: 'dump', name: '掏手' },
  { key: 'spill', name: '掏库' },
  { key: 'odd', name: '分水' },
  { key: 'huevoid', name: '封色' },
  { key: 'ebb', name: '退潮' },
  { key: 'measure', name: '量水' }
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

// 这两门花色对出牌那一方算不算同色（照源码的 sameSuit）。
//
// 【两色】（夜钓带的）把 ♠♣ 并成一门、♦♥ 并成一门。
// 口径跟源码一样只覆盖「匹配类」三处（顺色、收色 + harvestCount、同花），
// 封色（suitSealed）照旧按单门花色算 —— 放大一个禁止类效果等于封掉半副牌
function sameSuit(G, a, b, side) {
  if (a === b) return true
  if (!hasSpecial(G, side, SP.TWOCOLOR)) return false
  return isRedSuit(a) === isRedSuit(b)
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

// ---------- 特殊技能与角色 ----------
//
// ---- 为什么特殊技能用 key、点数技能用下标 ----
//
// 上面的 SK 是下标表（HOOK: 0、TIDE: 1…），必须和 draw-skills.uts 的表序
// 一字不差 —— triggersOf 返回的是下标数组，而 fingerprint.js 守着那个顺序。
//
// 特殊技能这边是**后搬过来的**，所以直接用 key 认身份（照源码的
// specialIndexOf）。好处是删一件不会错位 —— 而那正是源码当初把技能
// 从数字编号改成 key 的理由。两边不一致是有意的：下标那张表改起来
// 代价太大（每一处 has(skills, SK.X) 都要动），新加的这张没有包袱

const SP = {
  CREEL: 'creel', NARROW: 'narrow', CLEAR: 'clear', DEEPHOOK: 'deephook',
  FIRMHOOK: 'firmhook', REVERSE: 'reverse', LIVEWATER: 'livewater',
  BAIT: 'bait', TWOCOLOR: 'twocolor'
}

// 各自那个数（照 SPECIAL_SKILLS 表里挑定的值）
const CLEAR_OPEN = 2      // 清水：对方几张手牌明着
const DEEP_EXTRA = 1      // 深钩：钓到时额外收堆底几张
const FIRM_GUARD = 4      // 稳钩：每局前几张落堆自带护
const LIVE_OPEN = 2       // 活水：牌库顶几张明着
const BAIT_COUNT = 3      // 囤饵：开局塞几张

// 哪几件特殊技能在模拟器里**跑不出效果**，以及为什么。
// 报表里标出来 —— 不标的话那几行会是 0 分差，看着像实现错了。
//
// 【稳钩】不在这儿：它的效果实现了（firmGuardFor），但**没有角色带它**
//（磐石删了），所以它压根不会出现在 roles 那张表里
const SP_NOTE = {
  livewater: 'AI 不读情报（README 第 1 条），所以恒为 0',
  clear: '同上 —— 看得见对方手牌，但 AI 的挑牌不读这个'
}

// 角色表，照 DRAW_ROLES。desc 不搬（报表不用）。
//
// **顺序照源码**，因为 ROLE_UNLOCK 那张平行数组按下标对齐 ——
// 虽然模拟器不管解锁，但跑报表时「第几个角色」要对得上
const DRAW_ROLES = [
  { key: 'basket', name: '篓翁', special: SP.CREEL, slots: ['6 7', '8 9'] },
  { key: 'flood', name: '望汛', special: SP.LIVEWATER, slots: ['2 4', '6 8'] },
  { key: 'lock', name: '锁江', special: SP.NARROW, slots: ['A', '2', '3', '4'] },
  { key: 'upstream', name: '溯流', special: SP.REVERSE, slots: ['5 6 7', '4'] },
  { key: 'mirror', name: '明镜', special: SP.CLEAR, slots: ['♥', '3 4'] },
  { key: 'deepline', name: '沉钩', special: SP.DEEPHOOK, slots: ['♣', 'K'] },
  { key: 'pond', name: '养塘', special: SP.BAIT, slots: ['7', '3 5', 'K'] },
  { key: 'night', name: '夜钓', special: SP.TWOCOLOR, slots: ['A', '5', '9'] }
]
// 角色 key 'flood'（望汛）和技能 key 'flood'（洪水）撞字 —— 源码里也是这样，
// 两张表独立查，不会串。【稳钩】没有角色带（磐石删了），所以它的效果
// 在这儿实现了但跑不到；【听浪】连着【记谱】一起删了

function roleIndexOf(key) {
  for (let i = 0; i < DRAW_ROLES.length; i++) {
    if (DRAW_ROLES[i].key === key) return i
  }
  return -1
}

// 这一方带的是不是这件特殊技能（照 hasSpecial）
function hasSpecial(G, side, sp) {
  const r = G.roles[side]
  if (r < 0 || r >= DRAW_ROLES.length) return false
  return DRAW_ROLES[r].special === sp
}

// ---------- 配装 ----------
//
// 照 draw-skills.uts：suitOwner 和 SUITS 对齐、rankOwner 和 SKILL_RANKS 对齐，
// -1 是空着。
//
// ---- 这一层整个重做过 ----
//
// 原先是 putSuit / putRank / suitSizeOf / rankSizeOf / partnerSuit +
// 一个 levels 数组，模型是「一件技能升到几级、因此占几格」。
// 源码那边**花色槽砍了、等级整套删了**，现在是「角色卡的槽上印死标签，
// 技能插进去就管那几个标签」。所以那五个函数和 levels 全删了 ——
// 留着它们只会让 sim.js 按一个游戏里不存在的模型构配装（README 第 7 条）

function emptyLoadout() {
  return {
    suitOwner: [-1, -1, -1, -1],
    rankOwner: SKILL_RANKS.map(function () { return -1 })
  }
}

// 一个槽上印着哪几样，空格分隔（照 slotLabels）
function slotLabels(slot) {
  return slot.split(' ').filter(function (s) { return s !== '' })
}

// 槽上印的是花色吗（照 isSuitSlot）
function isSuitSlot(label) {
  return SUITS.indexOf(label) >= 0
}

// 一个槽盖住多少张牌：花色 13、点数 4（照 slotCover）
function slotCover(slot) {
  const labels = slotLabels(slot)
  let n = 0
  for (let i = 0; i < labels.length; i++) {
    n += isSuitSlot(labels[i]) ? 13 : 4
  }
  return n
}

// 这个角色一共盖住多少张（照 roleCover）。
// 它是比较角色强弱时唯一可比的那个数 —— 但有一个已知反例【夜钓】，
// 见源码 rollRoleKit 上面那段
function roleCover(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return 0
  const slots = DRAW_ROLES[role].slots
  let n = 0
  for (let i = 0; i < slots.length; i++) {
    n += slotCover(slots[i])
  }
  return n
}

function roleSlotCount(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return 0
  return DRAW_ROLES[role].slots.length
}

// 角色 + 每个槽嵌了什么 → loadout（照 kitFromRole / kitFromSlots）。
// slotSkills[i] 是第 i 个槽里那件技能的下标，-1 = 空槽。
//
// **一个槽可能印着好几样**（'2 3'、'5 6 7'），那就每一样都落一格 ——
// 嵌进那个槽的技能因此同时管那几个点数
function kitFromRole(role, slotSkills) {
  const lo = emptyLoadout()
  if (role < 0 || role >= DRAW_ROLES.length) return lo
  const slots = DRAW_ROLES[role].slots
  for (let i = 0; i < slots.length && i < slotSkills.length; i++) {
    const skill = slotSkills[i]
    if (skill < 0) continue
    const labels = slotLabels(slots[i])
    for (let j = 0; j < labels.length; j++) {
      if (isSuitSlot(labels[j])) {
        lo.suitOwner[SUITS.indexOf(labels[j])] = skill
      } else {
        const at = SKILL_RANKS.indexOf(labels[j])
        if (at >= 0) lo.rankOwner[at] = skill
      }
    }
  }
  return lo
}

// 【囤饵】往牌库塞哪个点数：这个角色**第一个数字槽**上的第一个标签
//（照 baitRankOf）。跳过花色槽 —— 「插入 4 张 ♥」没有意义
function baitRankOf(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return ''
  const slots = DRAW_ROLES[role].slots
  for (let i = 0; i < slots.length; i++) {
    const labels = slotLabels(slots[i])
    for (let j = 0; j < labels.length; j++) {
      if (!isSuitSlot(labels[j])) return labels[j]
    }
  }
  return ''
}

// 打这张牌会触发哪几个技能（照 triggersOf）。最多两个：花色槽一个、点数槽一个
function triggersOf(lo, card) {
  const out = []
  // J 只有通吃，不触发任何技能（照 draw-skills 的 triggersOf）
  if (card.rank === JACK) return out
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

// 一个角色 + 一件技能：把那件技能嵌进**指定的**那个槽，其余槽空着。
//
// 这是量单件技能的标准装法 —— 槽是角色印死的，所以「这件技能管哪几张牌」
// 由 (角色, 槽号) 唯一确定，不像从前那样要摇位置。
// 槽号越界就返回空配装（那样跑出来一定是 0 分差，看报表能发现）
function kitWithOne(role, slotAt, skill) {
  const n = roleSlotCount(role)
  const picks = []
  for (let i = 0; i < n; i++) {
    picks.push(i === slotAt ? skill : -1)
  }
  return kitFromRole(role, picks)
}

// 这个技能在这套配装里管着哪几张标签，写成「♥ 5 7」（照 coverageText）
function coverageOf(lo, skill) {
  const out = []
  for (let i = 0; i < lo.suitOwner.length; i++) {
    if (lo.suitOwner[i] === skill) out.push(SUITS[i])
  }
  for (let i = 0; i < lo.rankOwner.length; i++) {
    if (lo.rankOwner[i] === skill) out.push(SKILL_RANKS[i])
  }
  return out.join(' ')
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
    // 两方的角色（DRAW_ROLES 下标，-1 = 不带角色）。那件常驻特殊技能
    // 靠它现查 —— 见 hasSpecial。
    //
    // 原先这儿是个 twocolor: [bool, bool] 的权宜之计（当时只接了一件
    // 特殊技能，为那一个布尔搬整套角色卡不值）。现在整套搬过来了
    roles: [
      opts.myRole === undefined ? -1 : opts.myRole,
      opts.foeRole === undefined ? -1 : opts.foeRole
    ],
    // 这一方会不会记牌（关卡表的 smart）
    smart: [opts.mineSmart !== false, opts.foeSmart !== false],
    // 统计。plays 兼作【稳钩】的计数（照源码 myPlayed / foePlayed）
    stat: {
      plays: [0, 0], catches: [0, 0], caught: [0, 0],
      jackCatches: [0, 0], skillCatch: [0, 0], turns: 0
    },
    rankTotal: {},
    over: false
  }
  // ---- 【囤饵】：开局往牌库塞牌，**必须排在 rankTotal 之前** ----
  //
  // 照源码 baitFor 的位置（在 buildRankTotals 之前）。排在后面的话
  // 庄家的记牌（outsideCount 读 rankTotal）会漏掉塞进去的那几张 ——
  // 那等于给对手一份错账，而不是给自己一个优势
  baitFor(G, ME)
  baitFor(G, FOE)
  // 每个点数一共几张（照 buildRankTotals）—— 改造过的牌组不是恒定的 4 张
  for (let i = 0; i < G.deck.length; i++) {
    G.rankTotal[G.deck[i].rank] = (G.rankTotal[G.deck[i].rank] || 0) + 1
  }
  // 开局各发满 HAND_SIZE，庄家先发、交替（照 newGame 末尾那个循环）
  for (let i = 0; i < HAND_SIZE; i++) {
    drawFor(G, FOE)
    drawFor(G, ME)
  }
  return G
}

// 【囤饵】：往牌库塞 BAIT_COUNT 张「这一方第一个数字槽那个点数」的牌，再洗。
//
// 花色随便挑一门（源码那边也是循环着取），因为这件技能卖的是点数 ——
// 塞进去的牌花色是什么不影响它要解决的事（那个槽的触发率）
function baitFor(G, side) {
  if (!hasSpecial(G, side, SP.BAIT)) return
  const rank = baitRankOf(G.roles[side])
  if (rank === '') return
  const add = []
  for (let i = 0; i < BAIT_COUNT; i++) {
    add.push(makeCard(SUITS[i % SUITS.length], rank, []))
  }
  G.deck = shuffle(G.rng, G.deck.concat(add))
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
  // 抹点数那一族里的四件也在这儿（压邻、掏手、掏库、封色）——
  // 它们的说明第一句就是「它自己没有点数」。
  // 【分水】不在：它是全族唯一保留自己点数的，那是它能被钓走、
  // 因此敢封那么大面积的前提
  if (has(skills, SK.SUITED) || has(skills, SK.FLOOD) || has(skills, SK.HUE)
    || has(skills, SK.VOID) || has(skills, SK.DUMP)
    || has(skills, SK.SPILL) || has(skills, SK.HUEVOID)) {
    return []
  }
  // 退潮和见底：它们自己也归 0（在自己造的那阵退潮里），盖掉点数卡贴的那几个。
  // 0 点谁也钓不上 —— 这一手是用来施工的
  if (has(skills, SK.EBB) || has(skills, SK.LOWTIDE)) {
    return [0]
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

// ---------- 场上挂着的「抹点数」效果（照 landVals） ----------
//
// valuesOf 回答「**这张牌自己**算几点」—— 只看它身上的技能。
// 可抹点数那一族里有三件是**在场效果**（压邻、封色、分水）：堆上挂着一张，
// 就把后面落下来的牌抹掉，跟打出的是谁、带什么技能无关。
//
// 所以凡是「牌落到堆上」的路都走 landVals，**判定那条路走 valuesOf** ——
// 源码里 catchStart 用的是 valuesOf（见那边第 853 行）。
// 分水因此不阻止钓牌，它只是让「没钓到的牌」变成死牌
function landVals(G, card, skills, sink) {
  const own = valuesOf(G, card, skills)
  if (own.length === 0) {
    return own
  }
  // 压邻：抹掉紧挨着它右边（= 落在它上面）那一张。
  // 沉底落在堆底，左边没东西，一概不受影响
  if (!sink && topCarriesVoid(G)) {
    return []
  }
  // 封色：跟场上那张封色牌**现在的花色**同色就没点数（染水能把整堆染成一色）
  if (suitSealed(G, card.suit)) {
    return []
  }
  // 分水：牌面点数的奇偶跟场上那张分水牌不同，就落成 0 点
  if (parityBlocked(G, card.value)) {
    return [0]
  }
  return own
}

function pileIndexOf(G, card) {
  for (let i = 0; i < G.pile.length; i++) {
    if (G.pile[i] === card) return i
  }
  return -1
}

// 堆顶那张带着【压邻】吗（而且还挂着）
function topCarriesVoid(G) {
  if (G.pile.length === 0) return false
  const top = G.pile[G.pile.length - 1]
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === SK.VOID && G.held[i].source === top) return true
  }
  return false
}

function suitSealed(G, suit) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill !== SK.HUEVOID) continue
    const at = pileIndexOf(G, G.held[i].source)
    if (at >= 0 && pileSuitAt(G, at) === suit) return true
  }
  return false
}

function parityBlocked(G, value) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill !== SK.ODD) continue
    if (!inPile(G, G.held[i].source)) continue
    if (G.held[i].source.value % 2 !== value % 2) return true
  }
  return false
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
  // 量水：点数正好等于牌堆张数 → 整堆。判在遍历之前（它收得最多）。
  // 被护着的牌挡得住它 —— 绕过一张就不叫整堆了
  // 这一支只剩**估算**用（AI 挑牌、逆流选落点 —— 都在落堆之前，堆里还没有这张，
  // 所以 +1 把它自己算上）。真正的量水在 measureFor，resolveMatch 匹配时会把它剔掉
  if (has(skills, SK.MEASURE) && anyEquals(mine, [size + 1], 0)) {
    let blocked = false
    for (let i = 0; i < size; i++) {
      if (guardedAgainst(G, i, side)) { blocked = true; break }
    }
    if (!blocked) return sink ? size - 1 : 0
  }
  for (let n = 0; n < size; n++) {
    const i = sink ? size - 1 - n : n
    if (guardedAgainst(G, i, side)) continue
    const theirs = pileValsAt(G, i)
    // 花色比的是 pileSuitAt（染水改过的算改后的）
    if (suited && sameSuit(G, pileSuitAt(G, i), card.suit, side)) return i
    if (anyEquals(mine, theirs, 0)) return i
    // 磁钩：对得上比它大 1 的点数。J 不吃这条
    if (hook && G.pile[i].rank !== JACK && anyEquals(mine, theirs, 1)) return i
  }
  // 这儿原先有一支【钩顶】（都对不上就钓紧贴着你这张的那一张，
  // 沉底时镜像到堆底）。那件技能删了
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
  // 【清水】：对方前 CLEAR_OPEN 张一直明着。
  // 认的是**位置**而不是具体哪张 —— 对方打掉一张之后后面的往前挪，
  // 于是明着的始终是最前面那两个位置。源码那边也是这样（foeOpen 比下标）
  if (hasSpecial(G, side, SP.CLEAR) && index < CLEAR_OPEN) return true
  return index < G.seen[other].length && G.seen[other][index]
}

// 【逆流】这一手要不要往堆底落（照源码的 wantSink）。
//
// 游戏里玩家是按开关自己选的，模拟里两侧都走庄家那套算法：
// **哪头收得多就往哪头落，钓不到就不落堆底**。
//
// 最后那条是关键 —— 空钩沉底是最危险的下饵（那张躺在堆底，
// 谁匹配到它就通吃整堆）。少了这条，逆流会跑成一件负分技能
function wantReverse(G, side, card, skills) {
  if (!hasSpecial(G, side, SP.REVERSE)) return false
  const normal = catchStart(G, card, side, skills, false)
  const sunk = catchStart(G, card, side, skills, true)
  const nGain = normal >= 0 ? G.pile.length - normal + 1 : 0
  const sGain = sunk >= 0 ? sunk + 2 : 0
  return sGain > nGain
}

/// 【稳钩】：这一方每局**前 FIRM_GUARD 张**打出的牌，没钓到、落下时自带护，
// 对方钓不走。返回写进 pileGuard 的那个值（GUARD_ME / GUARD_FOE / GUARD_NONE）。
//
// 数的是「打出过几张」（照源码 myPlayed / foePlayed，在 playFor 开头 +1），
// 所以钓到牌的那几张也占名额 —— 跟源码一样
function firmGuardFor(G, side) {
  if (!hasSpecial(G, side, SP.FIRMHOOK)) return GUARD_NONE
  if (G.stat.plays[side] > FIRM_GUARD) return GUARD_NONE
  return side === ME ? GUARD_ME : GUARD_FOE
}

// ---------- 打出一张（照 playFor → afterPlay → resolveMatch） ----------
//
// 顺序是「**先结算这张牌的技能，再拿它去匹配**」：
//   1. 落堆（沉底的落堆底），落的那一刻受场上抹点数效果管（landVals）；
//   2. 「优先」的【染水】最先发动（它自己已经在堆上了）；
//   3. afterPlay 那一串技能 —— 量水、收色、撒网、见底可能连它一起收走；
//   4. resolveMatch：它还在堆上的话拿下来、对剩下的堆判匹配、再放回去。
//
// 源码里收牌要演特效（startSweep / startCatch 定时器），这边直接结算
function playFor(G, side, index, ai) {
  const card = takeFromHand(G, side, index)
  const skills = triggersOf(G.loadouts[side], card)
  G.stat.plays[side]++
  // 「往堆底落」有两条来路：点数槽的【沉底】（强制）和角色的【逆流】（可选）。
  // 源码那边还有第三条（闯关庄家的【偏流】），模拟器不跑闯关关卡规矩。
  // 逆流是在落堆**之前**估的（照 wantSink），那时堆里还没有这张
  const sink = has(skills, SK.SINK) || wantReverse(G, side, card, skills)
  const worth = landVals(G, card, skills, sink)
  if (sink) {
    unshiftPile(G, card, side, GUARD_NONE, worth)
  } else {
    pushPile(G, card, side, GUARD_NONE, worth)
  }
  // 【染水】〔优先〕：整堆的花色改掉，后面那些效果和匹配都按染过的算
  if (has(skills, SK.SUITIFY)) {
    suitifyFor(G, card)
  }
  afterPlay(G, side, skills, card, ai)
  resolveMatch(G, side, card, skills, sink)
  passTurn(G, side)
}

// 技能都结算完了，拿这张牌去匹配（照 resolveMatch）。
//
// 已经被技能收走了（量水 / 收色 / 撒网 / 见底）就没得匹配。
// 还在堆上的话：先拿下来，对**剩下的堆**判匹配，再放回去 ——
// 普通的放回堆顶、沉底的放回堆底（洪水之类可能往它上面又垫了牌，
// 放回去之后那几张也在「匹配那张 → 堆顶」这一段里）。
// 它身上的点数照技能结算完的样子带回去
function resolveMatch(G, side, card, cardSkills, sink) {
  const at0 = pileIndexOf(G, card)
  if (at0 < 0) return
  const vals = pileValsAt(G, at0)
  removePileAt(G, at0)
  // 量水是技能，已经在 afterPlay 里结算过了 —— 匹配这一步不再算它
  const skills = cardSkills.filter(function (s) { return s !== SK.MEASURE })
  // J 落在空堆上：没有可通吃的，就只勾走它自己（记 1 分）
  if (card.rank === JACK && G.pile.length === 0) {
    pushPile(G, card, side, GUARD_NONE, vals)
    finishCatch(G, side, 0, 1, card, skills)
    return
  }
  const at = catchStart(G, card, side, skills, sink)
  if (at < 0) {
    // 没钓到：落下。【稳钩】的头几张在这时候护上
    const guard = firmGuardFor(G, side)
    if (sink) {
      unshiftPile(G, card, side, guard, vals)
    } else {
      pushPile(G, card, side, guard, vals)
    }
    return
  }
  // 钓到了。收走的那一段往哪边算，由落点决定：
  //   普通 —— 落堆顶，收「匹配那张 → 堆顶」；
  //   沉底 —— 落堆底，收「堆底 → 匹配那张」（插在 0，原来的 at 往后挪一格）
  if (sink) {
    unshiftPile(G, card, side, GUARD_NONE, vals)
    finishCatch(G, side, 0, at + 2, card, skills)
  } else {
    pushPile(G, card, side, GUARD_NONE, vals)
    finishCatch(G, side, at, G.pile.length - at, card, skills)
  }
}

// 钓到之后：收那一段、【深钩】再捞堆底、记统计（照 finishCatch）
function finishCatch(G, side, from, count, card, skills) {
  collect(G, side, from, count)
  // 【深钩】：在上面那一段收完之后才收，所以数的是**剩下的**堆 ——
  // 刚才那一钩可能已经把堆底拿走了，那就少收或者收不着
  let extra = 0
  if (hasSpecial(G, side, SP.DEEPHOOK)) {
    extra = Math.min(DEEP_EXTRA, G.pile.length)
    if (extra > 0) collect(G, side, 0, extra)
  }
  G.stat.catches[side]++
  G.stat.caught[side] += count + extra
  if (card.rank === JACK) {
    G.stat.jackCatches[side]++
  } else if (has(skills, SK.HOOK) || has(skills, SK.SUITED)) {
    // 这一钓是靠技能才成立的吗 —— 粗略记一笔，报表里看技能到底在不在起作用
    G.stat.skillCatch[side]++
  }
}

// 把 [from, from+count) 这一段收走记分
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

// 按下标从堆上拿掉一张，**不记分**（照 removePileAt）
function removePileAt(G, at) {
  G.pile.splice(at, 1)
  G.pileByFoe.splice(at, 1)
  G.pileGuard.splice(at, 1)
  G.pileVals.splice(at, 1)
  G.pileSuit.splice(at, 1)
}

// 染水〔优先〕：把场上所有牌的花色改成跟它一样（照 suitifyFor）。
// 它自己已经在堆上了
function suitifyFor(G, card) {
  for (let i = 0; i < G.pileSuit.length; i++) {
    G.pileSuit[i] = card.suit
  }
}

// ---------- 打出之后的技能（照 afterPlay / afterPlayHead / afterPlayTail） ----------
//
// 顺序严格照源码：
//   量水 → 窥视 → 照水 → 压邻 / 封色 / 分水 → 掏手 → 掏库 → 窄口 → 满篓
//   → 干塘 或 见底 → 退潮 → 洪水 → 收色 → 撒网 → 对换 / 摘钩 / 压舱
//   → 冻结 → 换水 → 择饵 → 同花 → 同号 → 观潮
// 源码里收牌要演特效，拆成了 head / tail 两段靠定时器接力；这边直接顺着跑。
// 玩家那几件要停下来等人选（freezePending 等），模拟里两侧都走 AI 的启发式。
//
// 这时候打出那张**已经在堆上**，所以挂效果的那几件（inPile）一般都挂得上 ——
// 除非量水先把它收走了。挂上之后它要是在匹配那一步钓到牌，效果跟着失效
function afterPlay(G, side, skills, played, ai) {
  // 连竿只在这儿**记个账**，兑现在 passTurn 最前面
  if (has(skills, SK.AGAIN) && !G.againUsed) {
    G.againPending = true
  }
  // 量水排在所有技能的最前面：它收整堆，排在后面的话前面那些技能改过的堆就白改了
  if (has(skills, SK.MEASURE)) {
    measureFor(G, side, skills, played)
  }
  if (has(skills, SK.PEEK)) {
    peekFor(G, side)
  }
  if (has(skills, SK.LANTERN) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.LANTERN, target: null, side: side })
  }
  // ---- 抹点数那一族的三件在场效果 ----
  //
  // 压邻、封色、分水都挂在刚打出那张上，解除条件照旧是「那张被钓走」。
  // 前两件自己无点数（valuesOf 里就返回空），所以极难破；
  // 分水保留点数，对手拿同点数的来就能钩掉它
  if (has(skills, SK.VOID) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.VOID, target: null, side: side })
  }
  if (has(skills, SK.HUEVOID) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.HUEVOID, target: null, side: side })
  }
  if (has(skills, SK.ODD) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.ODD, target: null, side: side })
  }
  // 掏手、掏库：往堆上倒垃圾
  if (has(skills, SK.DUMP)) {
    dumpFor(G, side)
  }
  if (has(skills, SK.SPILL)) {
    spillFor(G, side)
  }
  // 窄口（削对方手牌上限）、满篓（抬自己的），都挂在刚打那张上
  if (has(skills, SK.NARROW) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.NARROW, target: null, side: side })
  }
  if (has(skills, SK.CREEL) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.CREEL, target: null, side: side })
  }
  // 组合技【干塘】：退潮 × 见底撞在同一张牌上时不分别结算 ——
  // 整堆各减这张的牌面点数，收走归零的
  const combo = has(skills, SK.EBB) && has(skills, SK.LOWTIDE)
  if (combo) {
    ebbTideFor(G, side, played)
  } else if (has(skills, SK.LOWTIDE)) {
    lowTideFor(G, side)
  }
  if (!combo && has(skills, SK.EBB)) {
    ebbFor(G, played)
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
  // 动对方手牌那三件，排在冻结**前面**（照「贵的赢」，见源码 afterPlayTail 那段）
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
  if (has(skills, SK.PICK) && G.deck.length > 1) {
    const tops = topCards(G, PICK_LOOK)
    doPickDeck(G, ai.pickDeck(G, tops), tops.length)
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
  // 择饵赢过观潮：两件撞在同一张牌上时只走择饵（源码对两侧都加了这道闸）
  if (has(skills, SK.TIDE) && !has(skills, SK.PICK) && G.deck.length > 1) {
    const tops = topCards(G, TIDE_LOOK)
    if (ai.tideSink(G, tops)) {
      sinkTops(G, tops.length)
    }
  }
}

// 量水：点数正好等于**堆上张数（含它自己）** → 整堆连它一起收走（照 measureFor）。
// 护着的牌是网里的洞：堆上只要有一张钓不走的，这一网就撒不下去
function measureFor(G, side, skills, played) {
  const at = pileIndexOf(G, played)
  if (at < 0) return
  const size = G.pile.length
  if (!anyEquals(valuesOf(G, played, skills), [size], 0)) return
  for (let i = 0; i < size; i++) {
    if (i !== at && guardedAgainst(G, i, side)) return
  }
  G.stat.catches[side]++
  G.stat.caught[side] += size
  collect(G, side, 0, size)
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

// ---------- 掏手 / 掏库：往堆上倒垃圾（照 dumpFor / spillFor） ----------
//
// 两件掏出来的牌点数**写死 0，不走 landVals** —— 它们本来就是当垃圾用的，
// 场上的抹点数效果再抹一遍只会把 0 抹成空，而那恰好破了
// 「0 点见底扫得走」那条设计（无点数见底跳过）

// 掏手：从对方手里随机掏 DUMP_COUNT 张
function dumpFor(G, side) {
  const other = side === ME ? FOE : ME
  for (let n = 0; n < DUMP_COUNT; n++) {
    if (G.hands[other].length === 0) break
    const card = takeFromHand(G, other, randInt(G.rng, G.hands[other].length))
    pushPile(G, card, other, GUARD_NONE, [0])
  }
}

// 掏库：从牌库顶掏 SPILL_COUNT 张。**烧牌库** —— 双方共用一个，
// 烧掉的谁也摸不到，所以这一局提前收场
function spillFor(G, side) {
  for (let n = 0; n < SPILL_COUNT; n++) {
    if (G.deck.length === 0) break
    const card = G.deck.pop()
    pushPile(G, card, side, GUARD_NONE, [0])
  }
}

/// ---------- 减点数那一族（照 dropVals / anyLive / dropPile） ----------

// 每个点数各减 by，减到 0 为止、去重。**空列表原样返回** ——
// 没有点数的牌不在点数这条轴上，减点数的一概跳过它
function dropVals(was, by) {
  if (was.length === 0) return was
  const now = []
  for (let k = 0; k < was.length; k++) {
    const v = Math.max(0, was[k] - by)
    if (now.indexOf(v) < 0) now.push(v)
  }
  return now
}

// 还剩一个非零点数吗。贴过点数卡的牌因此更难被压到底
function anyLive(vals) {
  for (let k = 0; k < vals.length; k++) {
    if (vals[k] !== 0) return true
  }
  return false
}

// 整堆各减 step，**当场写回**，返回减完一个非零点数都不剩的那几张的下标
function dropPile(G, step) {
  const taken = []
  for (let i = 0; i < G.pile.length; i++) {
    const now = dropVals(pileValsAt(G, i), step)
    G.pileVals[i] = now
    if (now.length > 0 && !anyLive(now)) taken.push(i)
  }
  return taken
}

// 把下标列表变成 harvestPile 要的 wanted 数组
function wantedOf(G, list) {
  const wanted = []
  for (let i = 0; i < G.pile.length; i++) wanted.push(list.indexOf(i) >= 0)
  return wanted
}

// 见底：整堆点数往下压 LOW_TIDE_STEP，收走压到 0 的（照 lowTideFor）。
// 它自己是 0 点（valuesOf），而且就在堆上，所以**连自己一起收走** —— 保底 +1
function lowTideFor(G, side) {
  if (G.pile.length === 0) return
  const taken = dropPile(G, LOW_TIDE_STEP)
  if (taken.length > 0) harvestPile(G, side, wantedOf(G, taken))
}

// 组合技【干塘】：退潮 × 见底。整堆各减这张的**牌面点数**，收走归零的（照 ebbTideFor）
function ebbTideFor(G, side, card) {
  const step = card.value
  if (step <= 0 || G.pile.length === 0) return
  const taken = dropPile(G, step)
  if (taken.length > 0) harvestPile(G, side, wantedOf(G, taken))
}

// 退潮：左侧 EBB_COUNT 张**连自己**，各减这张的牌面点数。**不收牌**（照 ebbFor）。
// 读牌面点数，不读 valuesOf（那是 0，减 0 等于没减）。
// 落在堆底（沉底）的时候左边没牌，什么也不发生
function ebbFor(G, card) {
  const at = pileIndexOf(G, card)
  if (at <= 0) return
  const step = card.value
  if (step <= 0) return
  const from = Math.max(0, at - EBB_COUNT)
  for (let i = from; i <= at; i++) {
    G.pileVals[i] = dropVals(pileValsAt(G, i), step)
  }
}

// 洪水：从牌库一张张往堆上翻，直到撞上点数（照 floodFor）。
// 判撞在落堆之前，翻上去的牌不带技能，翻空了就是白打。
// 打出那张这时候还在堆上，所以它也可能被这一下收走
function floodFor(G, side) {
  let hitAt = -1
  let flipped = 0
  while (G.deck.length > 0) {
    const card = G.deck.pop()
    const at = catchStart(G, card, side, [], false)
    // 翻上去的牌不带技能，但场上的抹点数效果照样管它
    pushPile(G, card, side, GUARD_NONE, landVals(G, card, [], false))
    flipped++
    if (at >= 0) { hitAt = at; break }
  }
  if (flipped === 0 || hitAt < 0) return
  const count = G.pile.length - hitAt
  collect(G, side, hitAt, count)
  G.stat.catches[side]++
  G.stat.caught[side] += count
}

// ---------- 收色 / 撒网（照 harvestIndices、hueFor、castFor） ----------

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
    const hit = sameSuit(G, pileSuitAt(G, i), card.suit, side)
    if (hit) hits++
    wanted.push(hit)
  }
  if (hits <= 1) return
  harvestPile(G, side, wanted)
}

// 同奇偶吗：任一个点数跟 odd 同奇偶就算（0 算偶数，一个点数都没有的不算）
function sameParity(vals, odd) {
  for (let k = 0; k < vals.length; k++) {
    if ((vals[k] % 2 === 1) === odd) return true
  }
  return false
}

// 撒网：从它自己起**往左连续**比奇偶，同奇偶就收，遇到不同的就停。
// 它不在堆上了（被前面的技能收走）就从堆顶起算。
// 自己的奇偶按**牌面点数**算，堆上那些按现在的点数算
function castFor(G, side, card) {
  const odd = card.value % 2 === 1
  const wanted = G.pile.map(function () { return false })
  const at = pileIndexOf(G, card)
  const from = at >= 0 ? at : G.pile.length - 1
  let hits = 0
  for (let i = from; i >= 0; i--) {
    if (!sameParity(pileValsAt(G, i), odd)) break
    wanted[i] = true
    hits++
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
    // 认牌面花色 —— 牌库里的牌还没落堆，染水碰不到它们
    if (sameSuit(G, one.suit, card.suit, side)) { got = one; break }
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
// AI 挑牌要用（照源码的 harvestCount）。估在落堆之前，堆里还没有这张：
// 撒网从堆顶往左连续数，收色数同花色的
function harvestCount(G, card, skills, side) {
  const hue = has(skills, SK.HUE)
  const cast = has(skills, SK.CAST)
  if (!hue && !cast) return 0
  const size = G.pile.length
  const odd = card.value % 2 === 1
  const marked = []
  for (let i = 0; i < size; i++) marked.push(false)
  if (hue) {
    for (let i = 0; i < size; i++) {
      if (sameSuit(G, pileSuitAt(G, i), card.suit, side)) marked[i] = true
    }
  }
  if (cast) {
    for (let i = size - 1; i >= 0; i--) {
      if (!sameParity(pileValsAt(G, i), odd)) break
      marked[i] = true
    }
  }
  let n = 0
  for (let i = 0; i < size; i++) {
    if (marked[i]) n++
  }
  return n > 0 ? n + 1 : 0
}

// ---------- 回合流转 ----------

// 这一方这回合补到几张（照 handLimit）：满篓 +1、对方的窄口 −1，最少 1 张。
//
// **四条来路，两件技能各有两个版本** —— 点数槽那件是挂在牌上的
//（heldOn，打出覆盖面里的牌才生效、那张被钓走就失效），
// 角色那件是常驻的（hasSpecial，整局都在）。
// 两个版本**叠加**：带满篓的角色又在槽里插了满篓，上限就是 6
function handLimit(G, side) {
  const other = side === ME ? FOE : ME
  let want = HAND_SIZE
  if (heldOn(G, SK.CREEL, side)) want = want + 1
  if (hasSpecial(G, side, SP.CREEL)) want = want + 1
  if (heldOn(G, SK.NARROW, other)) want = want - 1
  if (hasSpecial(G, other, SP.NARROW)) want = want - 1
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

// 这一方还有牌打得出去吗（被冻住的不算）
function playableCount(G, side) {
  let n = 0
  for (let i = 0; i < G.hands[side].length; i++) {
    if (!isFrozen(G, G.hands[side][i])) n++
  }
  return n
}

// 再没有能做的事了就结束（照 checkOver）。
//
// 判的是「打得出牌吗」而不是「手里有牌吗」—— 原先那条漏了一个死锁：
// 牌库空 + 你 0 张 + 庄家最后一张被【冻结】锁着 = 双方永远轮流跳过，
// 而冻结要「效果牌被钓走」才解，谁都打不出牌它就永远解不了。
//
// **这个 bug 是这个模拟器找出来的**：跑 29 件技能时第一局就撞上了
// （牌库 0、你 0 张、庄家 1 张被冻、堆 3 张、分 32:16，交替跳过 400 回合）。
// 对局页那边一起修了，而且顺带发现 foeTurn 没防 foePickCard 返回 -1
function checkOver(G) {
  if (G.deck.length > 0) return false
  if (playableCount(G, ME) > 0 || playableCount(G, FOE) > 0) return false
  G.over = true
  return true
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
  // 正常一局 52 次出牌上下（牌数守恒决定的），翻倍够宽松了 ——
  // 真撞上就是规则实现出了环
  const TURN_CAP = 400
  // 撞闸之后得看得见是怎么卡住的，所以留一圈轨迹（最近 24 次迭代）。
  // 环形缓冲，一局正常跑完它就扔了 —— 不影响性能
  const trail = []
  let guard = TURN_CAP
  while (!G.over && guard-- > 0) {
    const side = G.turn
    G.stat.turns++
    trail.push(side === ME ? 'me' : 'foe')
    trail.push(G.hands[ME].length + '/' + G.hands[FOE].length)
    trail.push('d' + G.deck.length + 'p' + G.pile.length)
    if (trail.length > 72) {
      trail.splice(0, trail.length - 72)
    }
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
    // 把状态摊出来 —— 「有环」这句话本身没法拿去查，得知道卡在哪
    const steps = []
    for (let i = 0; i + 2 < trail.length; i += 3) {
      steps.push(trail[i] + ' 手' + trail[i + 1] + ' ' + trail[i + 2])
    }
    throw new Error('一局没能在 ' + TURN_CAP + ' 回合内结束 —— 规则实现里有环。\n'
      + '  卡住时：牌库 ' + G.deck.length
      + '、手牌 你' + G.hands[ME].length + ' 庄' + G.hands[FOE].length
      + '、堆 ' + G.pile.length
      + '、分 ' + G.score[ME] + ':' + G.score[FOE]
      + '、该谁 ' + (G.turn === ME ? '你' : '庄家')
      + '、挂着的效果 ' + G.held.length
      + '、连竿 pending=' + G.againPending + ' used=' + G.againUsed + '\n'
      + '  最近 ' + steps.length + ' 次迭代（谁 / 双方手牌 / 牌库+堆）：\n    '
      + steps.join('\n    '))
  }
  return G
}

module.exports = {
  SUITS, RANKS, RANK_VALUES, SKILL_RANKS, JACK, HAND_SIZE,
  GUARD_NONE, GUARD_ME, GUARD_FOE, ME, FOE, SK, SKILLS,
  // 特殊技能与角色（KIND_ANY / KIND_RANK 删了 —— 源码的 DrawSkill 没有 kind 了）
  SP, SP_NOTE, DRAW_ROLES, roleIndexOf, hasSpecial,
  CLEAR_OPEN, DEEP_EXTRA, FIRM_GUARD, LIVE_OPEN, BAIT_COUNT,
  makeRng, randInt, pickOne, isRedSuit, sameSuit, makeCard, standardDeck, shuffle,
  // 配装：旧的那五个（putSuit / putRank / suitSizeOf / rankSizeOf / partnerSuit）
  // 连 levels 一起删了，换成角色模型
  emptyLoadout, slotLabels, isSuitSlot, slotCover, roleCover, roleSlotCount,
  kitFromRole, kitWithOne, coverageOf, baitRankOf,
  triggersOf, has, cardVals, valuesOf, anyEquals, canCatch, catchStart,
  isFrozen, heldOn, opponentOpen, inPile, topCards, handLimit, harvestCount,
  newGame, playFor, playGame, valueOfRank
}
