#!/usr/bin/env node
// ---------- 手搭局面，把「忍不忍 / 出不出 J」真算一遍〔2026-10-23〕 ----------
//
// 用户给的两个局面：
//   **情景 2**：堆上有 2、3（3 在顶），我手牌有 3 —— 吃 1 手还是忍 1 手？
//   **情景 3**：堆上有 2、3，我手牌有 J —— 出不出 J？
//
// 这个脚本**不重写任何判据** —— `holdEV` / `missP` / `foeReachOf` / `catchStart`
// 全从 `ai.js` / `rules.js` 取。手写一份超几何或者手写「哪些点数够得着」
// 正是这个项目栽过的那两类分叉（`addFrostAt`、`baitRisk`）。
//
// ⚠ **情景 3 那一半是新模型，游戏里没有。** 现行 AI 对 J 走的是
//   `JACK_HOLD=k` 那道**硬闸**（堆不足 k 张就不打），不算概率 ——
//   理由见下面『为什么 J 不能套 holdEV』。这儿把该有的算式写出来，
//   是为了回答「解法是什么」，**不是说代码里有**。
//
// 跑法：
//   node tools/md-sim/scene.js                 两个情景 + 自检
//   SCORE_BANDS=1,4,12 node tools/md-sim/scene.js   ← **要带档值才有意义**
'use strict'
const R = require('./rules.js')
const AI = require('./ai.js')

function f2(x) { return (Math.round(x * 100) / 100).toFixed(2) }
function pct(x) { return (100 * x).toFixed(1) + '%' }

// ---- 搭一个空局面。`newGame` 先造一次是为了拿 `rankTotal`（每个点数几张）----
// outsideCount 读的是它，而**它不看牌库**，所以清空牌库不影响那个底数
function blank() {
  // ⚠ `newGame` **不给 loadouts 兜底** —— `opts.mine` / `opts.foe` 不传的话
  //   `G.loadouts` 是 `[undefined, undefined]`，而 `skillsOf` 第一行就读它
  //   （`triggersOf(lo, …)` → `lo.suitOwner` → TypeError）。
  //   两个空槽 = 空槽基线，正是这两个情景要的口径
  const G = R.newGame({
    rng: R.makeRng(1), mine: R.emptyLoadout(), foe: R.emptyLoadout()
  })
  G.deck = []
  G.hands = [[], []]
  G.pile = []; G.pileByFoe = []; G.pileGuard = []
  G.pileVals = []; G.pileSuit = []; G.pileBurn = []
  G.gone = []
  return G
}

// 往堆上放一张。**六条并行数组必须同时动**（rules.js:6211 那条）——
// 这儿照 `pushPile` 的字段逐条给，而它那三个落堆钩子
//（frostOnLand / riseOnLand / burnHandOnLand）在**空槽基线**下全是 no-op
function land(G, rank, suit) {
  const c = R.makeCard(suit || R.SUITS[0], rank, [])
  G.pile.push(c)
  G.pileByFoe.push(true)
  G.pileGuard.push(R.GUARD_NONE)
  G.pileVals.push(R.cardVals(c))
  G.pileSuit.push(c.suit)
  G.pileBurn.push(0)
}

// ---- 搭局面：堆 = pileRanks（**底→顶**），我手牌 = myRanks，
//      已被钓走 = goneRanks，牌库 deckN 张，对手手牌 h 张 ----
function scene(pileRanks, myRanks, goneRanks, deckN, h) {
  const G = blank()
  for (let i = 0; i < pileRanks.length; i++) land(G, pileRanks[i])
  for (let i = 0; i < myRanks.length; i++) {
    G.hands[R.ME].push(R.makeCard(R.SUITS[1], myRanks[i], []))
  }
  for (let i = 0; i < h; i++) {
    // 对手手牌的**内容我看不见** —— 占位即可，判据只用 `hands[other].length`
    G.hands[R.FOE].push(R.makeCard(R.SUITS[2], 'K', []))
  }
  G.gone = goneRanks.slice(0)
  for (let i = 0; i < deckN; i++) {
    G.deck.push(R.makeCard(R.SUITS[3], 'K', []))
  }
  return G
}

// ---- 自检：底数对不对、`catchStart` 落在哪一格 ----
function selfCheck() {
  const G = scene(['2', '3'], ['3'], [], 30, 4)
  console.log('#### 自检（对不上就别读下面的数）')
  console.log('  每个点数总共几张：2 → ' + G.rankTotal['2']
    + '　3 → ' + G.rankTotal['3'] + '　J → ' + G.rankTotal['J'] + '（该都是 4）')
  const my3 = G.hands[R.ME][0]
  const at = R.catchStart(G, my3, R.ME, [], false)
  console.log('  我那张 3 打出去钓到堆上第 ' + at + ' 格（0 = 堆底），'
    + '收 ' + (G.pile.length - at + 1) + ' 张（该是 1 / 2 张）')
  const j = R.makeCard(R.SUITS[1], 'J', [])
  console.log('  J 钓到第 ' + R.catchStart(G, j, R.ME, [], false) + ' 格，'
    + '收 ' + (G.pile.length + 1) + ' 张（该是 0 / 3 张）')
  console.log('  档值：' + (R.SCORE_BANDS ? R.SCORE_BANDS.join(',') : '（没设，积分 = 张数）')
    + '　收 2 张 = ' + R.scoreOf(2) + ' 分、收 4 张 = ' + R.scoreOf(4)
    + ' 分、收 6 张 = ' + R.scoreOf(6) + ' 分')
  console.log('')
}

// ================= 情景 2：手里是普通牌（3），忍不忍 =================
//
// 堆 = [2, 3]（3 在顶），我打 3 → 钓第 1 格 → 收 **2 张**（2/3 档）。
// 忍 1 手 = 压一张钓不着的饵，堆变 3 张；对手再压一张 → 我下一手收 **4 张**（4/5 档）。
//
// 危险点数（`foeReachOf ≤ at=1`，全部进 `deep`）：
//   2 → 第 0 格　3 → 第 1 格　**J → 第 0 格**（`catchStart` 对 J 恒返回 0）
// 所以用户那句「**2 和 J** 在对方手牌的概率」—— 这儿是「2、3、J」三个点数一起。
// `deep` 里有几张是 J —— 台账第七节记的「没量过」那一格。
// **拿 J 的那一份单独报出来**，因为它是唯一一个「跟堆长什么样无关」的危险源：
// `catchStart` 对 J 恒返回 0，所以 4 张 J 永远在 `deep` 里
function deepSplit(G, at) {
  let all = 0
  let jack = 0
  for (let r = 0; r < R.RANKS.length; r++) {
    const rank = R.RANKS[r]
    const out = Math.max(0, AI.outsideCount(G, R.ME, rank))
    if (out === 0) continue
    const j = AI.foeReachOf(G, R.FOE, rank)
    if (j < 0 || j > at) continue
    all += out
    if (rank === R.JACK) jack += out
  }
  return { all: all, jack: jack }
}

// 一行：搭局面 → 算 → 印
function row(label, pileRanks, myRank, goneBase, deckN, watch) {
  const pad = []
  for (let i = 0; i < 34 - deckN; i++) pad.push('K')
  const G = scene(pileRanks, [myRank], goneBase.concat(pad), deckN, 4)
  const mine = G.hands[R.ME][0]
  const at = R.catchStart(G, mine, R.ME, [], false)
  const caught = G.pile.length - at + 1
  const ev = AI.holdEV(G, R.ME, caught, mine)
  const outs = watch.map(function (r) {
    return Math.max(0, AI.outsideCount(G, R.ME, r))
  })
  const d = deepSplit(G, at)
  const now = R.scoreOf(caught)
  console.log('  ' + label.padEnd(6)
    + '| ' + ('' + deckN).padStart(4)
    + ' | ' + outs.join('/').padEnd(7)
    + ' | ' + ('' + d.all).padStart(2) + ' 张，其中 J ' + ('' + d.jack).padStart(2)
    + ' = ' + pct(d.jack / d.all).padStart(6)
    + ' | ' + pct(ev.pLose).padEnd(7) + pct(ev.pBait).padEnd(7) + pct(ev.pWin).padEnd(6)
    + '| ' + f2(ev.ev).padStart(6) + ' | ' + f2(now).padStart(5)
    + ' | ' + (ev.ev > now ? '**忍**' : '收'))
}

function scene2() {
  console.log('######## 情景 2：堆 [2,3]（3 在顶），我手里有 3 ########')
  console.log('  打出去 = 收 2 张 = ' + R.scoreOf(2) + ' 分｜忍 1 手成功 = 收 4 张 = '
    + R.scoreOf(4) + ' 分')
  console.log('')
  console.log('  已收3 | 牌库 | 剩2/3/J | 危险牌合计，J 那一份  '
    + '| 输     只吃饵 赢    | 忍的EV | 收现在| 判')
  console.log('  ' + '-'.repeat(104))
  const goneSets = [
    { tag: '2 张', gone: ['3', '3'] },
    { tag: '1 张', gone: ['3'] },
    { tag: '0 张', gone: [] }
  ]
  const decks = [34, 20, 8]
  for (let gi = 0; gi < goneSets.length; gi++) {
    for (let di = 0; di < decks.length; di++) {
      // ⚠ 牌库厚度要能单独扫，所以**用无关点数（K）填 `gone`** ——
      //   直接从牌库里拿会把 2/3/J 的「外面还剩几张」一起改掉，两个变量就缠在一起
      row(di === 0 ? goneSets[gi].tag : '', ['2', '3'], '3',
        goneSets[gi].gone, decks[di], ['2', '3', 'J'])
    }
  }
  console.log('')
  console.log('  读法：「输」= 他够得着我那张 3 或更深（他有 2 / 3 / J）→ 我那张被一起端走。')
  console.log('        「赢」= 他 2、3、J、还有我那张饵的点数**一样都没有**。')
  console.log('        EV 里还减掉了「输掉时他收走多少」—— 这是一场赌，')
  console.log('        输的不是「我没收到」，是「他收走了」。')
  console.log('        「浅层」那一列省了：我钓的就是堆顶那张，上面只有我自己压的饵，')
  console.log('        所以 S 恒为 0 —— 这一格 holdEV 是**精确值**，不是上限。')
  console.log('')
}

// 用户最早给的那个局面，当对照：**堆上就一张 2，我手里有 2**。
// 跟情景 2 的差别只有一处 —— 堆底下没有那张压着的牌，所以
//「够得着我那张」的点数少一个。这一行是用来看**那一张牌值多少**的
function scene2b() {
  console.log('######## 对照 · 用户最早那个局面：堆 [2]，我手里有 2 ########')
  console.log('  打出去 = 收 2 张 = ' + R.scoreOf(2) + ' 分｜忍 1 手成功 = 收 4 张 = '
    + R.scoreOf(4) + ' 分')
  console.log('')
  console.log('  已收2 | 牌库 | 剩2/-/J | 危险牌合计，J 那一份  '
    + '| 输     只吃饵 赢    | 忍的EV | 收现在| 判')
  console.log('  ' + '-'.repeat(104))
  const goneSets = [
    { tag: '2 张', gone: ['2', '2'] },
    { tag: '1 张', gone: ['2'] },
    { tag: '0 张', gone: [] }
  ]
  const decks = [34, 20, 8]
  for (let gi = 0; gi < goneSets.length; gi++) {
    for (let di = 0; di < decks.length; di++) {
      row(di === 0 ? goneSets[gi].tag : '', ['2'], '2',
        goneSets[gi].gone, decks[di], ['2', 'J'])
    }
  }
  console.log('')
}

// ================= 情景 3：手里是 J，出不出 =================
//
// ---- 为什么 J **不能**套 holdEV ----
//
// holdEV 的三支是围着「**我那张目标牌还在不在**」建的（`at` 这个下标）。
// 而 J 通吃整堆 → `catchStart` 恒返回 0 → `at = 0` → **所有点数都落进 `deep`**，
// 于是 `pLose` 逼近 1，算出来永远是「别忍」。
//
// 可那个结论是**模型错**，不是答案：J 没有「目标牌被端走」这回事。
// 对手收走一截，J 只是**面对一个更薄的堆**，照样打得出去。
// 真正的灾难只有一种 —— 他把堆**清空**（他有 J，或者他够得着堆底），
// 那时 `catchStart` 对空堆返回 −1，我的 J 这一手打不出去。
//
// 所以 J 的算式是**按「他能切到多深」分支**，不是按「我那张在不在」：
//   他最深够到第 j 格 → 堆剩 j 张 → 我的 J 下一手收 j+1 张（j=0 时 **0 分**）
//   他一格都够不着     → 堆长到 L'+1 → 我的 J 收 L'+2 张
//
// 而 `P(最深 = j) = missP(D(j−1)) − missP(D(j))`，`D(j)` = 够得着 ≤ j 格的点数
// 外面总共还剩几张。**又是累加口径的 missP 相减，不是乘积**（超几何不放回）。
function scene3() {
  console.log('######## 情景 3：堆 [2,3]，我手里有 J ########')
  console.log('  现在出 J = 收 3 张 = ' + R.scoreOf(3)
    + ' 分｜守 1 手、对手也没收 = 收 5 张 = ' + R.scoreOf(5) + ' 分')
  console.log('')
  console.log('  牌库 | 他清空堆 | 他切到第1格 | 他只吃饵 | 他啥也没 '
    + '| 守的EV(悲观) | (J没丢) | 出现在 | 判')
  console.log('  ' + '-'.repeat(104))
  const decks = [34, 20, 8]
  for (let di = 0; di < decks.length; di++) {
    const deckN = decks[di]
    const pad = []
    for (let i = 0; i < 34 - deckN; i++) pad.push('K')
    // **守 J 之后的那个堆**：我压一张饵上去 → [2, 3, 饵]。饵用 Q（堆上没有、我手上没有）
    const G = scene(['2', '3', 'Q'], ['J'], pad, deckN, 4)
    const L = G.pile.length
    const U = G.deck.length + G.hands[R.FOE].length
    const h = G.hands[R.FOE].length
    // D(j) = 够得着 ≤ j 格的点数，外面总共还剩几张（累加口径）
    const D = []
    for (let j = 0; j < L; j++) D.push(0)
    for (let r = 0; r < R.RANKS.length; r++) {
      const rank = R.RANKS[r]
      const out = Math.max(0, AI.outsideCount(G, R.ME, rank))
      if (out === 0) continue
      const reach = AI.foeReachOf(G, R.FOE, rank)
      if (reach < 0) continue
      for (let j = reach; j < L; j++) D[j] += out
    }
    // P(最深 = j) = missP(D(j−1)) − missP(D(j))；j=0 时前一项是 missP(0)=1
    const p = []
    let prev = 1
    for (let j = 0; j < L; j++) {
      const cur = AI.missP(U, h, D[j])
      p.push(Math.max(0, prev - cur))
      prev = cur
    }
    const pNone = prev
    // 我的收益：他切到第 j 格 → 堆剩 j 张 → J 收 j+1 张。
    //
    // ⚠ j=0（堆被清空）那一格**两种记法都不对，所以两种都印**，当上下夹：
    //   · 悲观 = **0 分**。这是「一步模型」的直记法，可它**默认 J 跟着作废了**。
    //     而 J 并没有离手 —— 它还在我手上，下一手堆重建了照样能打。
    //   · 「J 没丢」= 记 `now`（= 我现在出 J 本来能拿的分）。
    //     假设是「下一轮至少能拿回今天这个价」。**这也是假设，不是实测。**
    // 真值夹在两者之间。拿哪一档去判都要说清是哪一档 ——
    // 这正是 CLAUDE.md 那条：别拿自己写的模型去否一个设计
    let evPess = 0
    let evOpt = 0
    for (let j = 0; j < L; j++) {
      const got = j === 0 ? 0 : R.scoreOf(j + 1)
      evPess += p[j] * got
      evOpt += p[j] * (j === 0 ? R.scoreOf(2 + 1) : got)
    }
    evPess += pNone * R.scoreOf(L + 2)
    evOpt += pNone * R.scoreOf(L + 2)
    // 减掉他收走的那一份（跟 holdEV 的 foeGain 同一个口径：他那一刀 + 他自己那张）
    let foe = 0
    for (let j = 0; j < L; j++) foe += p[j] * R.scoreOf(L - j + 1)
    const net = evPess - foe
    const netOpt = evOpt - foe
    const now = R.scoreOf(2 + 1)
    console.log('  ' + ('' + deckN).padStart(4)
      + ' | ' + pct(p[0]).padEnd(9) + '| ' + pct(p[1]).padEnd(12)
      + '| ' + pct(p[2]).padEnd(9) + '| ' + pct(pNone).padEnd(10)
      + '| ' + f2(net).padStart(12) + ' | ' + f2(netOpt).padStart(7)
      + ' | ' + f2(now).padStart(6)
      + ' | ' + (net > now ? '**守**' : (netOpt > now ? '夹着' : '出')))
  }
  console.log('')
  console.log('  ⚠ **这张表是新模型，游戏里没有。** 现行 AI 对 J 走 `JACK_HOLD=3` 那道硬闸')
  console.log('    （堆不足 3 张就不打，**2026-10-23 定稿的默认值**），一行概率都不算 —— 见文件头那段。')
  console.log('  ⚠ **而实测跟这张表的「悲观」档是反的**：20000 局上 `JACK_HOLD=3`')
  console.log('    是正收益（台账六之二）。一步模型算不出那个收益，因为它只看下一手 ——')
  console.log('    守 J 的回报铺在**后面好几手**（堆越垒越高，J 一刀端走）。')
  console.log('    所以这张表能回答「这一手的即时账怎么算」，**不能**用来判「该不该守 J」。')
  console.log('')
}

// ============== 解法 · 阈值表 ==============
//
// 上面三张表回答的是「这三个局面判什么」。**这一节回答「坐在牌桌前怎么自己算」。**
//
// 把 `holdEV` 那条式子里跟局面有关的量拎出来，只剩五个：
//
//   n0 = 我现在收几张 = L − at + 1
//   n1 = 忍成功收几张 = n0 + 2          （HOLD_GROW：他压一张、我压一张）
//   n2 = 他那一刀收几张 = L + 2 − deepest
//   D  = 危险牌 = 「够得着第 at 格或更深」的点数，外面总共还剩几张
//   B  = 饵的危险牌 = 我要压上去那张的点数，外面还剩几张
//
// 在 `at = L−1`（我钓的就是堆顶）的局面下 S=0，于是三支化简成：
//
//   赢   missP(U,h,D+B)              → 收 score(n1)
//   平   missP(U,h,D) − missP(U,h,D+B) → 收 score(n0)   ← 只有饵被吃
//   输   1 − missP(U,h,D)            → 他收 score(n2)，我 0
//
//   忍 ⟺ pWin·score(n1) + pBait·score(n0) − pLose·score(n2) > score(n0)
//
// **这张表就是把上面那个不等式对 D 解出来**：给定牌库厚度，
// 危险牌最多几张还值得忍。D 超过它就收手。
//
// ⚠ 用的是导出的 `missP` / `scoreOf`，**没有重写判据**。
//   跟 `holdEV` 的唯一差别是 S=0（见上）—— 所以它只适用于「我钓堆顶」那一类，
//   而那正是用户给的两个局面。
// `v` = 档值向量。**走导出的 `scoreWith`**，不在这儿写第二份分档算法
//（rules.js:8005 那条：「这是档位算法的唯一实现」）。
// 传 `null` = 用当前 `SCORE_BANDS`
function holdThreshold(U, h, n0, n1, n2, B, v) {
  const sc = function (n) { return v ? R.scoreWith(v, n) : R.scoreOf(n) }
  const now = sc(n0)
  let best = -1
  for (let D = 0; D <= U; D++) {
    const pNoDeep = AI.missP(U, h, D)
    const pWin = AI.missP(U, h, D + B)
    const ev = pWin * sc(n1) + Math.max(0, pNoDeep - pWin) * now
      - Math.max(0, 1 - pNoDeep) * sc(n2)
    if (ev > now) best = D
    else break   // EV 对 D 单调递减，第一次不过就是上界
  }
  return best
}

function solver() {
  console.log('######## 解法 · 阈值表：危险牌最多几张还值得忍 ########')
  console.log('  读法：数出 D（够得着我那张或更深的点数、外面还剩几张），')
  console.log('        查表。**D ≤ 表里的数 → 忍；超了 → 收手。** −1 = 一张都不能有')
  console.log('')
  // 两种形状。差别**只在 n2**（他那一刀落哪一档），而那一列就是全部
  const shapes = [
    { tag: '薄堆', note: '堆 1 张（他清堆只收 3 张 = 2/3 档）', n0: 2, n1: 4, n2: 3 },
    { tag: '厚堆', note: '堆 2 张（他清堆收 4 张 = 4/5 档，**跟我赢的同档**）',
      n0: 2, n1: 4, n2: 4 }
  ]
  const Us = [44, 38, 30, 24, 18, 12]
  const Bs = [0, 2, 4]
  for (let si = 0; si < shapes.length; si++) {
    const sh = shapes[si]
    console.log('  ---- ' + sh.tag + '：' + sh.note + ' ----')
    console.log('    收现在 ' + R.scoreOf(sh.n0) + ' 分｜忍赢 ' + R.scoreOf(sh.n1)
      + ' 分｜输了他拿 ' + R.scoreOf(sh.n2) + ' 分')
    let head = '    饵的危险牌 B |'
    for (let i = 0; i < Us.length; i++) head += (' U=' + Us[i]).padStart(8)
    console.log(head)
    for (let bi = 0; bi < Bs.length; bi++) {
      let line = '    B = ' + Bs[bi] + ' 张' + (Bs[bi] === 0 ? '（绝对安全的饵）' : '　　　　　　')
      line = line.slice(0, 18).padEnd(18) + '|'
      for (let ui = 0; ui < Us.length; ui++) {
        line += ('' + holdThreshold(Us[ui], 4, sh.n0, sh.n1, sh.n2, Bs[bi])).padStart(8)
      }
      console.log(line)
    }
    console.log('')
  }
  console.log('  U = 牌库 + 对手手牌（= 我看不见的牌总数）。h 固定 4（对手满手）。')
  console.log('  档值取当前 SCORE_BANDS；换档值这张表要重跑。')
  console.log('')
}

// ============== 档值怎么定 ==============
//
// ⚠ **先说清这个工具能判什么、不能判什么。**
//
// 一步阈值里出现的赔付只有三个：`score(n0)` `score(n1)` `score(n2)`，
// 而 `n0=2 → a`、`n1=4 → b`、`n2∈{3,4} → a 或 b`。
// **`c` 一次都没出现。** 所以这张扫描表**只判得了 a 和 b，判不了 c** ——
// c 管的是「忍 2 手」和 6+ 档的分配，那要 20000 局的跑（见 run-band6.sh）。
// 把 c 写在表里只是为了标明「这一行是在哪个完整档值下算的」。
//
// 五条判据全部来自用户原话，**不是我挑的指标**：
//   ① 情况 1（已收 2 张）「忍 1 手大概率是赚的，**极力推荐**」
//   ② 情况 3（已收 0 张）+「牌组还很厚」→ **仍该忍**   ← 用户点名的验收线
//   ③ 「要考虑**牌组厚度**」→ 厚的忍、中等的收，**两档要分得开**
//   ④ 「到了 4/5 就收手，**不去追 6/7**」→ 厚堆上配额要被 J 单独封死（< 4）
//   ⑤ 「牌组薄时」→ 该收手
function bandSweep() {
  console.log('######## 档值扫描：a / b 怎么定 ########')
  console.log('  ⚠ **这张表判不了 c**（一步阈值里 c 一次都不出现）。c 要跑 20000 局。')
  console.log('')
  const cands = [
    [1, 2, 12], [1, 3, 12], [1, 4, 12], [1, 5, 12], [1, 6, 12], [1, 8, 12],
    [2, 6, 12], [2, 8, 12], [1, 4, 20], [1, 4, 8]
  ]
  // 五条判据各自要查的那一格（U, D, B, 形状）。D 的来源见六之四·二 / 三
  //   薄堆 n2=3（他清堆只收 3 张）／厚堆 n2=4（跟我赢的同档）
  const checks = [
    { tag: '①情况1·厚牌库', U: 38, D: 4, B: 0, n2: 3, want: true },
    { tag: '②验收线(情况3·厚)', U: 38, D: 6, B: 2, n2: 3, want: true },
    { tag: '③情况3·中牌库', U: 24, D: 6, B: 2, n2: 3, want: false },
    { tag: '④厚堆不追6/7', U: 38, D: 4, B: 0, n2: 4, want: false },
    { tag: '⑤情况1·薄牌库', U: 12, D: 4, B: 0, n2: 3, want: false }
  ]
  let head = '  档值      | 薄堆配额 U38/U24 | 厚堆配额 U38/U24 |'
  for (let i = 0; i < checks.length; i++) head += ' ' + checks[i].tag
  console.log(head + ' | 全过？')
  console.log('  ' + '-'.repeat(126))
  for (let ci = 0; ci < cands.length; ci++) {
    const v = cands[ci]
    const thin38 = holdThreshold(38, 4, 2, 4, 3, 0, v)
    const thin24 = holdThreshold(24, 4, 2, 4, 3, 0, v)
    const thick38 = holdThreshold(38, 4, 2, 4, 4, 0, v)
    const thick24 = holdThreshold(24, 4, 2, 4, 4, 0, v)
    let line = '  ' + v.join(',').padEnd(9) + ' |      ' + ('' + thin38).padStart(3)
      + ' /' + ('' + thin24).padStart(4) + '     |      ' + ('' + thick38).padStart(3)
      + ' /' + ('' + thick24).padStart(4) + '     |'
    let all = true
    for (let i = 0; i < checks.length; i++) {
      const k = checks[i]
      const got = k.D <= holdThreshold(k.U, 4, 2, 4, k.n2, k.B, v)
      const ok = got === k.want
      if (!ok) all = false
      line += ('' + (got ? '忍' : '收') + (ok ? '✓' : '✗')).padStart(k.tag.length + 1)
    }
    console.log(line + ' |  ' + (all ? '**全过**' : '✗'))
  }
  console.log('')
  console.log('  「忍/收」= 那一格算出来判什么；✓/✗ = 跟用户那条要求对不对得上。')
  console.log('  判据 ④ 要的是「收」—— 厚堆上**不该**忍，否则就会去追 6/7 档。')
  console.log('')
}

// ---- b/a 加密扫描：两条约束各自在哪儿断 ----
//
// 上面那张表露出两件事：
//   · **`a` 是自由标度** —— `1,3,12` 和 `2,6,12` 逐位相同，`1,4,12` 和 `2,8,12`
//     也逐位相同。所以要定的不是 (a,b)，是**比值 b/a**。
//   · **判据 ② 和 ④ 互斥** —— ② 要 `b/a ≥ 4`、④（最严读法）要 `b/a ≤ 3`，
//     而 b 同时抬薄堆和厚堆两个配额，中间没有落脚点。
//
// 所以这儿把 a 固定成 12（够大，b 取整数就能走 1/12 的步长），扫 b/a。
// 判据 ④ 给**两种读法**，因为用户原话是「追 6/7 **是可以的**，但已经不值得」——
// 那是「不值得」不是「不可能」：
//   ④严（存在性）：厚堆最有利的格（D=4，只剩 4 张 J）也该判收 → 配额 ≤ 3
//   ④松（典型）  ：厚堆典型的格（D=7，= 情景 2 已收 2 张那格）该判收 → 配额 ≤ 6
// **哪个才是你要的，得你定。** 这儿只把两条线画出来。
function ratioSweep() {
  console.log('######## b/a 加密扫描：两条约束各自的断点 ########')
  console.log('  a 固定 12（步长 1/12）。c 不参与一步判据，随便填 36。')
  console.log('')
  console.log('  b/a   | 薄堆 U38 | 厚堆 U38 | ②验收线(需薄≥6) | ④严(需厚≤3) | ④松(需厚≤6)')
  console.log('  ' + '-'.repeat(78))
  const A = 12
  for (let b = 24; b <= 84; b += 3) {
    const v = [A, b, 36]
    const thin = holdThreshold(38, 4, 2, 4, 3, 2, v)   // ② 用 B=2（饵有 2 张危险牌）
    const thick = holdThreshold(38, 4, 2, 4, 4, 0, v)
    const ok2 = thin >= 6
    const ok4s = thick <= 3
    const ok4l = thick <= 6
    console.log('  ' + (b / A).toFixed(2).padEnd(6)
      + '|' + ('' + thin).padStart(8) + '  |' + ('' + thick).padStart(8) + '  |'
      + (ok2 ? '      ✓ 忍' : '      ✗ 收').padEnd(18)
      + (ok4s ? '   ✓ 收' : '   ✗ 忍').padEnd(14)
      + (ok4l ? '   ✓ 收' : '   ✗ 忍'))
  }
  console.log('')
  console.log('  ② 和 ④严 之间有没有共存的一行 —— 这就是「档值能不能同时满足两条」的答案。')
  console.log('  ④松 若全程 ✓，说明「厚堆上追 6/7」在典型局面下本来就不划算，')
  console.log('     那 ④ 该交给 20000 局的**频率**来判（4/5 档起判忍率），不是这儿。')
  console.log('')
}

selfCheck()
scene2()
scene2b()
scene3()
solver()
bandSweep()
ratioSweep()
