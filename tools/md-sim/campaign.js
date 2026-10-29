'use strict'

// ============================================================
//  闯关难度校准（2026-10-14）
// ============================================================
//
// 为什么有它：**难度表是建在「玩家恒后手、而后手有 +3 分结构性优势」
// 这个假设上的** —— 生命、金币倍率、庄家记不记牌全是在那上面调出来的。
// 那个假设 2026-10-14 起被连着拆了三次，每次都得重新对一遍。
//
// ---- 三次改动，这个脚本每次都要重跑 ----
//
// **2026-10-14 剩堆归「没打最后一手」的一方** —— 后手那 +3 分补贴没了，
//   量出每轮多输约 1 次，于是生命 3/2/1 → 4/3/2。
// **2026-10-15 切牌定庄**（`rules.js` 的 `CUT`）—— 先手不再写死，
//   玩家一半的局是先手。这个脚本**走自由切牌**（不传 `fixFirst`），
//   所以跑出来的就是实机的样子。连同「平局算过关」（见 `runOdds`），
//   两件事都从宽松那头推，于是 4/3/2 退回 3/2/1。
// **2026-10-15 终局换成「牌库空 + 双方各打 1 手，剩堆不算分」** ——
//   **这一次的数还没跑。** 三件事同时变了，方向互相抵：
//
//     一局从 52 手掉到 46 手 → 技能触发次数少了（**对玩家不利**，
//       因为闯关里玩家才是靠技能堆强度的那一方）；
//     剩堆不再归任何人 → 双方都少了约 3 分，而那笔原先在闯关里
//       **每局都归庄家**（庄家恒先手那会儿）→ 对玩家有利；
//     平局率 6.5% → 3.7% → 「平局算过关」那份补贴缩水近一半
//       → **对玩家不利**。
//
//   净效果算不出来，只能跑。**生命数要照这一轮的数重定。**
//
//   node campaign.js                        ← 现行规则，三档难度各跑一遍
//   BALANCE=pileNotLast TAIL=999 node campaign.js   ← 10-14 那档（对照）
//   TAIL=999 node campaign.js               ← 最早那档：剩堆不算分 + 打完手牌
//   node campaign.js --lives 4,3,2          ← 改生命
//   node campaign.js --kshift 1             ← 玩家配装提前 1 关成形（= 多给金币）
//   node campaign.js --ease 1               ← 庄家「记牌」推迟 1 关、随机关多 1 关
//   node campaign.js -n 3000 --seed 7
//     ⚠ **`--seed` 的步长是 1，而局号也是 1** —— 相邻两个种子的 n 局里
//       有 n-1 局重合。要独立重采样，种子之间得差得比 `-n` 大，
//       现成一组：`1 / 10007 / 20014 / 30021 / 40028`。判据在 `levelOdds` 里。
//   PLAYER_SP=1 node campaign.js            ← 把玩家的**常驻技**打开（默认一件都没模）
//   PLAYER_ROLE=linkman PLAYER_SP=1 node campaign.js   ← 换一张玩家卡
//     〔后两条 2026-10-20 加，**默认关着** —— 不加环境变量时输出跟 10-19 逐位相同。
//       细节和三个坑见下面 PLAYER_ROLE 那一段〕
//
// ---- 它量的是什么、不量什么 ----
//
// **能信的是「新旧规则之差」，不是绝对数。** 下面三样都是假设，
// 但新旧两边用的是同一套假设，相减时大部分抵掉：
//
//   玩家配装 —— 江口闸官（四个单点数槽），装的技能数按关号涨（见 kitSize），
//     技能从「实测 X ≥ 1.5 的那些」里每局随机抽。真人会挑、会配，这边不会；
//   庄家配装 —— 照 draw-levels 的 DRAW_FOE_ROLES，标签每局现摇（照 rollFoeSlots）；
//   庄家规矩 —— **只做了两条**：【添手】（庄家手牌 +1）和【掐口】（你只补到 3 张）。
//     其余（淤滩 / 偏流 / 硬壳 / 枯水 / 守滩 / 再钩 / 封竿）改的是规则本身，
//     模拟器的规则层没有它们（README「有意的差异」那张表里的硬壳是同一类）。
//     所以 5 关往后的胜率**偏高**，而且偏多少新旧两边一样。
//
// 闯关的流程照 draw-save：赢了进下一关；**平局也算过关**（2026-10-15 改，
// 只是拿不到胜分那一笔）；输了扣 1 点生命、重打这一关；生命扣光整轮作废

const R = require('./rules.js')
const AI = require('./ai.js')

// ---------- 庄家：照 draw-levels 的 DRAW_FOE_ROLES（按关号） ----------
//
// slots 里是 [技能 key, 几个标签, 是不是花色]。specials 只认 hand / pinch，
// 其余写着是为了让人看得见「这一关少模了什么」
const FOE_ROLES = [
  { name: '试竿学徒', specials: [], slots: [] },
  { name: '游荡钓客', specials: [], slots: [] },
  { name: '守河老汉', specials: [], slots: [] },
  { name: '滩头老翁', specials: ['hand'], slots: [] },
  { name: '回漩摆渡人', specials: ['silt'], slots: [['hook', 1, false]] },
  // 冻结 → 压舱（2026-10-20，冻结升级成自带结冰之后这一关太陡）
  { name: '礁石海女', specials: ['pinch'], slots: [['press', 2, false]] },
  { name: '潮眼引水人', specials: ['drift'], slots: [['tide', 2, false], ['hook', 1, false]] },
  { name: '湾口税吏', specials: ['shell'], slots: [['suited', 1, true]] },
  // 〔2026-10-16 照水 ×2 → **死水 ×1**（照水删了）。理由见 draw-levels 那一关的注释。
  //   对这个报表的意义：这一关**第一次有了模拟器量得到的槽技能**（枯水仍然没模），
  //   所以它的数字从「两件白板」变成「一件白板」—— 还是下限，但下限抬高了〕
  { name: '雾港守灯人', specials: ['dryup'], slots: [['dead', 1, false], ['freeze', 2, false]] },
  // 〔见底 2026-10-19 删了，那一格**空出来没补**（用户定「其他不用」）——
  //   所以这一关从三条腿（守滩 / 见底 / 染水）变两条腿，跟着变简单。
  //   它养厚堆的手段（守滩）还在，**把厚堆变现的手段没了**〕
  { name: '涡心祭司', specials: ['guard'], slots: [['suitify', 1, true]] },
  // ---- 11 / 12 关 2026-10-15 改过两轮（曲线倒挂：11 关比关底难 21 个点）----
  //
  // **第一轮改错了**：把关底的结冰两件换成吃水 + 撒网（理由是「各自独立兑现」），
  //   跑出来关底**又弱了 5 个点**（普通档 49.9% → 55.3%），方向正好反。
  //
  // **第二轮**：把 11 关那套实测最凶的名单（野火 + 磁钩）搬去当关底，
  //   11 关换成吃水 + 撒网。病因是**这个脚本量出来的**，不是推的 ——
  //
  //     **庄家 AI 对两类技能的发挥完全不同。**
  //     野火的「获取下一张【野火】」自带连锁、磁钩改匹配规则（`catchStart`
  //       算得到）→ **不需要决策，全额发挥**；
  //     吃水 / 撒网那一族的收成在 `afterPlay` 结算，`pickCard` 的
  //       `catchStart` **算不到** → 庄家不为它们挑牌，**打折**。
  //
  //   所以「标称 X 之和」在庄家侧不是强度。判据改成
  //   **「它需不需要 AI 主动决策」**，详见 draw-levels 那张卡的注释。
  //
  // 特殊技那一处（再钩 ↔ 封竿）**两条都没模**，所以它不改变任何数 ——
  // 同步只为别让副本跟源码分叉
  { name: '鲸落拾骨人', specials: ['seal'], slots: [['zerodraft', 1, true], ['cast', 2, false]] },
  { name: '深渊君主', specials: ['again'], slots: [['wild', 1, true], ['hook', 1, false], ['suited', 1, false]] }
]
const MODELED_SP = ['hand', 'pinch']

// ---------- 难度：照 draw-levels 的 levelForDiff ----------
//
// 关卡表原样：第 1 关随机、第 2 关不记牌、第 3 关起记牌（DRAW_LEVELS 的 random / smart）
const LEVEL_RANDOM = [true, false, false, false, false, false, false, false, false, false, false, false]
const LEVEL_SMART = [false, false, true, true, true, true, true, true, true, true, true, true]
const EASY_RANDOM_UNTIL = 4
const DIFFS = [
  // 生命**照 draw-levels 的 DIFF_LIVES**，现在是 3/2/1。
  //
  // 〔这个默认值错过一次 10-14 那次改动（游戏改成 4/3/2 而这儿还是 3/2/1），
  //   所以那几天默认跑出来的是一套不存在的难度。10-15 游戏退回 3/2/1 之后
  //   两边又对上了 —— 但**改难度表的时候要顺手过来对一眼**。
  //   量别的档就加 `--lives 4,3,2`〕
  { key: 'easy', name: '简单', lives: 3 },
  { key: 'normal', name: '普通', lives: 2 },
  { key: 'hard', name: '困难', lives: 1 }
]

// ease = 庄家放水几关：随机关多 ease 关、「开始记牌」推迟 ease 关。
// 那是难度表里**唯一一个按关调**的旋钮，所以单独给它一个参数
function foeMode(diff, level, ease) {
  const id = level + 1
  if (diff === 'easy') {
    return { random: id <= EASY_RANDOM_UNTIL + ease, smart: false }
  }
  if (diff === 'hard') {
    return { random: id <= ease, smart: id > ease * 2 }
  }
  const at = Math.max(0, level - ease)
  return {
    random: LEVEL_RANDOM[at] || id <= 1 + ease,
    smart: level >= ease ? LEVEL_SMART[at] && id > 2 + ease : false
  }
}

// ---------- 玩家：配装随关号成形 ----------
//
// 这几件是新规则下 `sim.js all` 量出 X ≥ 1.5、而且**游戏里在卖**的。
// 不放更弱的：真人在商店里不会去买 +0.3 的东西
// 〔2026-10-15 去掉两件，都是**技能删了**：`flood`（洪水）、`frostfall`（霜降）。
//   **留着的后果是静默的**：`playerKit` 查不到它就往槽里塞 −1（空槽），
//   于是玩家的配装会随机少一件，而通关率跟着虚低。
//   删技能的时候**一定要过一遍这个池子**
//
//   ⚠ **2026-10-21：`flood` 加回来了** —— 洪水换形状上架了
//   （恒翻 **6** 张、撞上当场收，实测 X **+4.05**、价 110，
//    过「X ≥ 1.5 且游戏里在卖」那条闸）。
//   〔⚠ 这儿原先写的是「恒翻 4 张、X +3.28」—— **那两个数都作废了**：
//     +3.28 量的是我读错原话做出来的另一件技能，而「4 张」是照着那张
//     废表挑的。定稿形状下 4 张只有 +1.79，用户据此改定 6 张〕
//   **上架也要过一遍这个池子，跟删技能一样** —— 方向相反、后果同样静默：
//   漏了它，模拟出来的玩家永远买不到一件 +4.05 的货，通关率虚低。
//   〔🔴 2026-10-28：**6 张 → 4 张**，X +6.41 → **+3.95**、价 120 → **105**
//     〔R6 · one · A 槽 · 20000 局 · se 0.15〕。上面那个 +4.05 是 R3 的数，
//     跟 R6 不可比（同一个 6 张在 R6 下是 6.41）。**仍然过 1.5 那条闸，
//     所以池子不动** —— 记在这儿是因为「池子的理由」变了，不是成员变了。
//     ⚠ 另：价钱改了而 `campaign.js` **根本不读价**（`unlock`/`price`/`cost`
//     在这个文件里 0 处），所以这一改在闯关模拟里**看不见** —— 要验只能实机〕
//   这个池子的真正口径是「商店里值得买的那批」，而它靠**手维护** ——
//   `refs.js` 查得出「池子里有已删的 key」，查不出「在卖的没进池子」〕
//
// 🔴 **2026-10-23：R4 下这条口径两头都破了，而池子还是 R3 排名时的样子。**
//   逐件核过 R4 全表（没跑，纯对照），**14 处不符**：
//     在池里但够不着 1.5 —— chain 0.76 / dead 0.87 / hue 0.97 /
//       raise 1.19 / cast 1.40（cast 差 0.10，SE≈0.13，在噪声里）
//     在卖、过了 1.5、却不在池里 —— surge 5.94 / swapflow 3.30 /
//       gift 3.03 / icebomb 2.80 / fuel 2.66 / pick 2.58 /
//       sinktag 2.52 / swap 1.94 / sift 1.74
//   **漏的里头有全表第 2 强的【引潮】。**
//
//   🔴 **2026-10-28：上面这一整段的名单作废了一半。** 那是 R4 的 X，
//   而 R5/R6 换成「张 = 分」之后【引潮】从 +5.94 掉到 −1.08、
//   【退潮】从 2.52 掉到 −0.13，**两件当天都删了**（用户定）。
//   所以「漏的里头有全表第 2 强的引潮」这句**现在是错的** ——
//   池子漏掉它反而是对的。原文留着是因为**下面那个论证不靠这两件**：
//   「campaign 不模价 → 池子兼着『值得买』和『买得起』两份差事」
//   照旧成立（随便换一对贵件和便宜件都能举例）。
//   ⚠ 整张名单要重列得在 R6 下重跑一次 `all`，**没跑**。
//
//   ⚠ **池子没动过，所以它不是 R4 通关率下跌的原因** —— 它破的是
//   「23.7% 这个绝对数的前提」。两件事别混。
//
//   ⚠ **别照着那张表直接改。** campaign **不模价**（kitSize 只看难度和关号、
//   这个池子等概率随机抽），所以池子现在兼着两份差事：「值得买的」
//   和隐含的「买得起的」。把 surge(115)/~~swapcard(120)~~ 跟 sift(70) 丢进
//   同一个均匀分布，模出来的玩家比真人阔得多。
//   〔划掉的那件 2026-10-27 删了，见下面池子里那条一删一补 ——
//     **论证不受影响**：surge(115) 对 sift(70) 这一对还在池子里〕
//   三条路（都没定）：①照 X 更新、接受偏强；②按价加权抽；③真加商店模型。
//   详见《摸打钓鱼-实测数据台账.md》第五节 campaign 那一段。
const PLAYER_POOL = [
  'flow', 'chain', 'kindle', 'wild', 'flood',
  // 〔2026-10-27 一删一补，**两件都走上面那条口径**（「在卖 + X ≥ 1.5」）：
  //   删 `swapcard`（对换，技能删了 —— 留着就是洪水栽过的那个静默空槽）；
  //   补 `dumpbait`（倒饵，同日上架、价 85、R6 X **+2.75**）。
  //   ⚠ 这是「上架也要过一遍这个池子」那一条的正用 —— 漏了它，
  //     模拟出来的玩家永远买不到一件 +2.75 的货，通关率虚低。
  //   ⚠ **池子一动，通关率的绝对数就不可比了**（23.7% 那一批）〕
  'dumpbait',
  'zerodraft', 'peak', 'wade', 'unhook', 'suitify', 'cast', 'raise', 'suited',
  // 〔见底（key 见 DEAD_SKILLS）2026-10-19 从这个池子去掉 —— 技能删了。
  //   **留着的后果是静默的**：
  //   ⚠ 写这条注释时**带引号写了那个 key，refs.js 当场误报成真引用** ——
  //   它扫的是 PLAYER_POOL 块里的字符串字面量，不分代码和注释。
  //   所以墓碑注释里**别带引号写已删的 key**。
  //   留着它的后果：`playerKit` 查不到就往槽里塞 −1（空槽），
  //   玩家配装随机少一件，通关率跟着虚低 —— 洪水栽过的正是这一处〕
  'dead', 'hue', 'press',
  // 2026-10-20 上架的两件，同一天藏凌 / 寒流删了
  'lockdraw', 'lockcolor'
]
// ---------- 玩家是哪张卡、常驻技开不开〔2026-10-20 加的两个环境开关〕 ----------
//
// **两个都默认关着，默认跑出来跟 10-19 那三档逐位相同。** 加它们是为了
// 量【点数互通】的 campaign 口径，而动默认值 = 改掉现行三档通关率的口径。
//
//   node tools/md-sim/campaign.js                         ← 基线，一个字节都没动
//   PLAYER_SP=1 node tools/md-sim/campaign.js             ← 只开常驻技（lock 的【窄口】）
//   PLAYER_ROLE=linkman PLAYER_SP=1 node …/campaign.js    ← 换成【通号人】
//
// ⚠ **`PLAYER_SP` 之前，campaign 一件常驻技都没模。** `playGame` 那边
// 原先没传 `myRole`/`foeRole`，于是两侧都是 −1、`hasSpecial` 恒 false ——
// 连玩家自己那张江口闸官的【窄口】都不在里头。所以 `PLAYER_SP=1` 这一档
// **不是「加了互通」，是「常驻技这一整类从无到有」**，要先跑它当对照。
//
// ⚠ 它只开**玩家这一侧**。庄家那边走的是 `FOE_ROLES`（draw-levels 的表，
// 不是 `DRAW_ROLES` 的下标），特殊技照旧只模了【添手】【掐口】两条。
// 于是 `PLAYER_SP=1` 是**单边加强**，绝对数会虚高 —— 能读的还是两档之差。
//
// ⚠ 第三个坑：**槽数不同的卡，配装件数跟着不同。** 下面 `kitSize` 原先
// 写死封顶 4（= 江口闸官的槽数），现在跟着这张卡的槽数走。通号人 3 个槽
// → 第 7~9 关只装 3 件，比基线少一件。所以 `lock` vs `linkman` 那个差里
// **混着「少插一件」那一份**，不是常驻技的净值（净值在 `--duel` 那边量）。
const PLAYER_ROLE = process.env.PLAYER_ROLE || 'lock'
const PLAYER_SP = process.env.PLAYER_SP === '1'
const PLAYER_ROLE_AT = R.roleIndexOf(PLAYER_ROLE)
if (PLAYER_ROLE_AT < 0) {
  console.error('PLAYER_ROLE 查不到这张卡：' + PLAYER_ROLE)
  process.exit(1)
}
const PLAYER_SLOTS = R.DRAW_ROLES[PLAYER_ROLE_AT].slots.length

// 第 level 关（0 起）开打时装着几件。经济目标照 draw-levels 那段注释：
// 「打到第 9 关攒下的技能数正好对上技能库上限」，而江口闸官只有 4 个槽，
// 所以装着的件数在第 7~9 关封顶 4。简单的钱多（×2）、困难的钱少（×0.75）
// 〔封顶那个 4 2026-10-20 换成 `PLAYER_SLOTS` —— 默认（lock，4 槽）不变〕
function kitSize(diff, level, kshift) {
  const at = level + kshift
  const cap = PLAYER_SLOTS
  if (diff === 'easy') return Math.max(0, Math.min(cap, Math.ceil(at * 0.75)))
  if (diff === 'hard') return Math.max(0, Math.min(cap, Math.floor(at * 0.4)))
  return Math.max(0, Math.min(cap, Math.floor(at * 0.5)))
}

function playerKit(rng, size) {
  const role = PLAYER_ROLE_AT
  const pool = PLAYER_POOL.slice(0)
  const picks = []
  // 循环上界跟着槽数走（原先写死 4）。`kitFromRole` 本来就会把多出来的
  // 挑选**静默丢掉**，可多摇一次 `randInt` 会把 rng 流错开 —— lock 下
  // 两者等价（4 == 4），换卡时不等价
  for (let i = 0; i < PLAYER_SLOTS; i++) {
    if (i >= size || pool.length === 0) { picks.push(-1); continue }
    const at = R.randInt(rng, pool.length)
    picks.push(R.SK[pool[at].toUpperCase()] !== undefined
      ? R.SK[pool[at].toUpperCase()] : R.SKILLS.findIndex(function (s) { return s.key === pool[at] }))
    pool.splice(at, 1)
  }
  return R.kitFromRole(role, picks)
}

// 照 draw-save 的 rollFoeSlots：每个槽摇 count 个标签，花色 / 点数各自不重复
function foeKit(rng, level) {
  const lo = R.emptyLoadout()
  const takenS = []
  const takenR = []
  const role = FOE_ROLES[level]
  for (let i = 0; i < role.slots.length; i++) {
    const key = role.slots[i][0]
    const count = role.slots[i][1]
    const suit = role.slots[i][2]
    const skill = R.SKILLS.findIndex(function (s) { return s.key === key })
    for (let n = 0; n < count; n++) {
      if (suit) {
        const free = R.SUITS.filter(function (s) { return takenS.indexOf(s) < 0 })
        const s = R.pickOne(rng, free)
        takenS.push(s)
        lo.suitOwner[R.SUITS.indexOf(s)] = skill
      } else {
        const free = R.SKILL_RANKS.filter(function (r) { return takenR.indexOf(r) < 0 })
        const r = R.pickOne(rng, free)
        takenR.push(r)
        lo.rankOwner[R.SKILL_RANKS.indexOf(r)] = skill
      }
    }
  }
  return lo
}

// ---------- 一关的胜 / 负 / 平 ----------
function levelOdds(diff, level, opt) {
  const mode = foeMode(diff, level, opt.ease)
  const sp = FOE_ROLES[level].specials
  const adj = [sp.indexOf('pinch') >= 0 ? -1 : 0, sp.indexOf('hand') >= 0 ? 1 : 0]
  let w = 0
  let l = 0
  let d = 0
  let margin = 0
  for (let i = 0; i < opt.n; i++) {
    // 🔴 `--seed` 的步长是 **1**，而局号 `i` 跑 0 ~ n-1 ——
    //   所以 `--seed 2` 的那批局里有 **n-1 局跟 `--seed 1` 一模一样**，只换掉一局。
    //   〔2026-10-24 栽的：为了量通关率的噪声跑了 seed 2/3/4，
    //     拿到 34.1 / 34.1 / 34.0，差点当成「噪声 < 0.1 点」记进台账。
    //     那不是噪声小，是**三跑根本是同一批局**。〕
    //
    //   **要独立重采样，种子之间得差得比 `-n` 大**（而且别撞上关号的 100003 步长）。
    //   现成的一组（n=2000 下不重叠）：`1 / 10007 / 20014 / 30021 / 40028`。
    //
    //   ⚠ 别图省事把这儿改成 `opt.seed * 100003 * 99 + …` —— 默认 `--seed 1`
    //   一动，**第五节那三档通关率全部作废**（它们全是 seed 1 的数）。
    const rng = R.makeRng(opt.seed + level * 100003 + i)
    const G = R.playGame({
      rng: rng,
      mine: playerKit(rng, kitSize(diff, level, opt.kshift)),
      foe: foeKit(rng, level),
      mineSmart: true,
      foeSmart: mode.smart,
      foeRandom: mode.random,
      // `myRole` 不传 = −1 = `hasSpecial` 恒 false = **一件常驻技都不模**，
      // 那是 2026-10-20 之前的样子，也是默认档（PLAYER_SP 关着）
      myRole: PLAYER_SP ? PLAYER_ROLE_AT : -1,
      handAdj: adj
    }, AI)
    const diffScore = G.score[R.ME] - G.score[R.FOE]
    margin += diffScore
    if (diffScore > 0) w++
    else if (diffScore < 0) l++
    else d++
  }
  return { w: w / opt.n, l: l / opt.n, d: d / opt.n, margin: margin / opt.n, mode: mode }
}

// ---------- 一整轮：生命怎么扣 ----------
//
// ---- 平局 2026-10-15 改成「算过关」，这个公式跟着改 ----
//
// 原先是 `p = w / (w + l)` —— 平局重打不扣命，所以把它从分母里剔掉，
// 只看「分出胜负那一次」。
//
// 现在平局算过关（拿得到过关奖励和利息，拿不到胜分），所以它跟赢是
// **同一类结局**：`p = w + d`。那让每一关的通过率涨约 6 个点，
// 而「预计输几次」会跟着降 —— 文档「终局剩堆」第四条那张生命表
// （简单 3.51 / 普通 9.19 / 困难 12.14）**要用新公式重跑**。
//
// state[k] = 还剩 k 点生命、站在这一关门口的概率
function runOdds(odds, lives) {
  let state = []
  for (let k = 0; k <= lives; k++) state.push(k === lives ? 1 : 0)
  const reach = []
  for (let lv = 0; lv < odds.length; lv++) {
    const p = odds[lv].w + odds[lv].d
    reach.push(state.reduce(function (a, b) { return a + b }, 0))
    // 在这一关一直打到赢或者命用完：剩 k 点的人，过关时剩 k - j 点（输了 j 次）
    const next = state.map(function () { return 0 })
    for (let k = 1; k <= lives; k++) {
      if (state[k] === 0) continue
      for (let j = 0; j < k; j++) {
        next[k - j] += state[k] * Math.pow(1 - p, j) * p
      }
    }
    state = next
  }
  const clear = state.reduce(function (a, b) { return a + b }, 0)
  // 平均打到第几关（通关算 12）
  let far = 0
  for (let lv = 0; lv < reach.length; lv++) far += reach[lv]
  return { clear: clear, far: far, reach: reach }
}

function parse(argv) {
  const out = { n: 2000, seed: 1, lives: null, kshift: 0, ease: 0, only: null, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-n') out.n = parseInt(argv[++i], 10)
    else if (argv[i] === '--seed') out.seed = parseInt(argv[++i], 10)
    else if (argv[i] === '--lives') out.lives = argv[++i].split(',').map(function (x) { return parseInt(x, 10) })
    else if (argv[i] === '--kshift') out.kshift = parseInt(argv[++i], 10)
    else if (argv[i] === '--ease') out.ease = parseInt(argv[++i], 10)
    else if (argv[i] === '--only') out.only = argv[++i]
    else if (argv[i] === '--quiet') out.quiet = true
  }
  return out
}

function main() {
  const opt = parse(process.argv.slice(2))
  const pct = function (x) { return (100 * x).toFixed(1) + '%' }
  // 规则那一段读 R.ruleTag() —— 原先这儿自己拼 env，而默认值从
  // pileNotLast 翻到 old 之后它把现行规则印成了「新（剩堆归没打最后一手的）」
  console.log('闯关校准 · 规则 ' + R.ruleTag()
    + ' · 每关 ' + opt.n + ' 局 · kshift ' + opt.kshift + ' · ease ' + opt.ease)
  // 玩家那张卡印出来 —— 环境开关是静默的，不印的话两档输出长得一模一样，
  // 而「哪一档跑的」正是台账要的标签（CLAUDE.md：缺标签的数等于没有数）
  console.log('玩家 · ' + R.DRAW_ROLES[PLAYER_ROLE_AT].name
    + '（' + PLAYER_ROLE + '，' + PLAYER_SLOTS + ' 槽 / '
    + R.roleCover(PLAYER_ROLE_AT) + ' 张）· 常驻技 '
    + (PLAYER_SP ? '**开**（' + R.DRAW_ROLES[PLAYER_ROLE_AT].special + '）'
      : '关（PLAYER_SP=1 打开）')
    + (PLAYER_SP || PLAYER_ROLE !== 'lock' ? ' ← 非默认档，别跟基线那三档混着引' : ''))
  const missing = []
  for (let lv = 0; lv < FOE_ROLES.length; lv++) {
    const sp = FOE_ROLES[lv].specials.filter(function (s) { return MODELED_SP.indexOf(s) < 0 })
    if (sp.length > 0) missing.push((lv + 1) + ':' + sp.join('/'))
  }
  console.log('没模的庄家规矩（这几关胜率偏高）：' + missing.join(' '))
  for (let di = 0; di < DIFFS.length; di++) {
    const diff = DIFFS[di]
    if (opt.only && opt.only !== diff.key) continue
    const lives = opt.lives ? opt.lives[di] : diff.lives
    const odds = []
    for (let lv = 0; lv < FOE_ROLES.length; lv++) odds.push(levelOdds(diff.key, lv, opt))
    const run = runOdds(odds, lives)
    console.log('\n【' + diff.name + '】生命 ' + lives + ' · 通关率 ' + pct(run.clear)
      + ' · 平均打到第 ' + run.far.toFixed(2) + ' 关')
    if (opt.quiet) continue
    console.log('  关  庄家        出牌     配装  胜     负     平     分差    走到这关')
    for (let lv = 0; lv < odds.length; lv++) {
      const o = odds[lv]
      const how = o.mode.random ? '随机' : (o.mode.smart ? '记牌' : '不记牌')
      console.log('  ' + String(lv + 1).padStart(2) + '  ' + FOE_ROLES[lv].name.padEnd(6, '　')
        + '  ' + how.padEnd(4, '　') + '  ' + kitSize(diff.key, lv, opt.kshift) + ' 件  '
        + pct(o.w).padStart(6) + ' ' + pct(o.l).padStart(6) + ' ' + pct(o.d).padStart(6)
        + '  ' + (o.margin >= 0 ? '+' : '') + o.margin.toFixed(2).padStart(5)
        + '   ' + pct(run.reach[lv]))
    }
  }
  // ---- 诊断口：这件常驻技**到底发动了几次**〔CLAUDE.md 第四节那条〕 ----
  //
  // 只看通关率查不出「它一次都没响」—— 单边加强本来就会让通关率涨，
  // 而涨的那一份可能全来自别处（配装件数、rng 流错位）。
  // 实际倍率 ×1.00 = 一次都没互通，那一档跑的是原版。
  const lst = R.PROTO_STAT.ranklink
  if (lst.plays > 0) {
    console.log('\n---- 点数互通诊断（累计全部难度 / 全部关）----')
    console.log('  理论倍率 = 这张卡的点数槽数；实际 ×'
      + (lst.base > 0 ? ((lst.base + lst.extra) / lst.base).toFixed(2) : '—')
      + '（触发件次 ' + lst.base + ' → ' + (lst.base + lst.extra) + '）')
    console.log('  我方出牌 ' + lst.plays + ' 张，其中 ' + lst.hit + ' 张真的多触发了技能')
  } else if (PLAYER_SP && R.DRAW_ROLES[PLAYER_ROLE_AT].special === 'ranklink') {
    console.log('\n⚠ 带着【通号人】却一次都没发动 —— 这一档的数不能用，先查 linkOn。')
  }
}

main()
