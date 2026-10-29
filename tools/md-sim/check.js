'use strict'

// ============================================================
//  规则层不变量自检
// ============================================================
//
// `sim.js base` 只能告诉你「六个数对不上」；这个告诉你**哪条不变量、
// 第几局第几手**断的，并把现场摊出来。
//
// 为什么要它：结冰那一族改了**收牌闸门**（takeAt / blockedAt）和
// **落堆入口**（pushPile / unshiftPile），填塘改了 **endPlay** ——
// 全是规则层最核心的几个函数。它们要是坏了，游戏是坏的，不只是数不准。
// 所以这一关先过，再谈分值。
//
//   node check.js                  ← 四组配置各 400 局
//   node check.js -n 2000
//   node check.js --only frost     ← 只跑一组
//   node check.js --seed 7
//
// 第一次断裂就停下打印现场。全过的话最后报一张「观察表」——
// 那几项不是断言（我对它们的语义没有十足把握），只报数，不判对错。

const R = require('./rules.js')
const AI = require('./ai.js')

// ---------- 桶 ----------
//
// 52 张牌只能待在这六个地方。
//
// 要是局首总和不等于 52，那就是这份清单漏了地方，
// 脚本会直接说「该补桶」而不是甩锅给规则。
//
// 〔原先这儿写着「G.dead 不是桶」—— 那张清单 2026-10-14 删了
//   （死水改成直接把牌变成 0 点牌）。**那种「标记集合不算桶」的提醒
//   仍然有效**，现在的实例是 G.wild（通配）和 G.frostHand / G.burnHand：
//   牌本身照旧待在 deck / hands / pile 里，别重复计数〕
//
// 〔2026-10-22 第七个桶：`waste`（白放离场）。**它不能并进 `gone`** ——
//   `gone` 被下面断言三锁着（score 合计 == gone.length），而白放的牌
//   没人收走、不计分。它是这天 wardice 组那个 −1 的落点，见 rules.js
//   `stacking` 那一段。在此之前这份清单确实「漏了一个地方」，
//   而上面那句「漏桶就说该补桶」只在**局首**生效，局中漏的照旧报不守恒〕
// 〔2026-10-26 第八、九个桶：`heap`（堆牌区）和 `board`（上牌区）。
//   两个新区的牌**既不在牌库也不在堆上**，而且是**跨回合**待着的
//   （堆牌区取牌在打出那一刻、落牌在下一个自己的回合）——
//   不认它们的话第一张牌盖进去就报不守恒。
//   ⚠ 它们跟 `wildTag` / `heapHand` 那类**标记集合**不是一回事：
//   标记集合里的牌本人还在 deck / hands / pile，不能重复计数；
//   这两个区**持有牌本身**，所以必须进桶〕
const BUCKETS = ['deck', 'handME', 'handFOE', 'pile', 'stacked', 'gone', 'waste',
  'heap', 'board']

function buckets(G) {
  return {
    deck: G.deck.length,
    handME: G.hands[R.ME].length,
    handFOE: G.hands[R.FOE].length,
    pile: G.pile.length,
    stacked: G.stacked.length,
    gone: G.gone.length,
    waste: G.waste.length,
    heap: G.heapZone[R.ME].length + G.heapZone[R.FOE].length,
    board: G.boardZone[R.ME].length + G.boardZone[R.FOE].length
  }
}

function sumOf(b) {
  let n = 0
  for (let i = 0; i < BUCKETS.length; i++) n += b[BUCKETS[i]]
  return n
}

function bucketText(b) {
  return BUCKETS.map(function (k) { return k + '=' + b[k] }).join(' ')
}

// 堆上第 i 张挂着几条【结冰】。**直接读 G.held**，不借 frostAt ——
// 那个函数没导出，而且自检本来就该独立实现一遍判据：
// 跟被测代码共用同一个实现，它错了自检也跟着错
function frostCountOn(G, card) {
  let k = 0
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === R.HELD_FROST && G.held[i].source === card) k++
  }
  return k
}

// 堆上第 i 张带不带【保护】。**自己判一遍**，理由同上 ——
// `wardAt` 没导出，而且共用实现就一起错。
//
// ⚠ 只在**标签档**（默认 = 游戏里的样子）判。`WARD_TAG=0` 那条老路
// 认的是「底下垫着一条 `STACK_WARD`」，而 `STACK_WARD` 这个常量
// **没有导出**（`kind` 的数值不能在自检里硬编，那是另一种共用实现）——
// 所以那一档下面这条断言**跳过**，main 里会印一行说它跳过了。
// 不印的话「全过」就是过的空气，而那正是这条断言补上来要治的病
const WARD_TAG = process.env.WARD_TAG !== '0'

function wardOnCard(G, card) {
  return WARD_TAG && G.wardTag.indexOf(card) >= 0
}

// ---------- 不变量 ----------
//
// 返回 null = 全过；返回字符串 = 哪条断了（带现场）。
//
// 硬断言只放**我有明文依据**的那几条：
//   · 牌数守恒 —— 52 张就是 52 张
//   · 六条并行数组等长 —— pushPile 的注释：「少一条就错位」
//   · 分数 == gone 张数 —— takeAt 的注释：「算分和记牌口径一致，
//     推进 gone 的张数就是返回的张数」
//   · 冰不叠加 —— 【结冰】的规则原文
//   · 冰火不共存 —— 「遇到【燃烧】，两个一起消失」
//   · stacked 的 host 都在堆上 —— expireStacked 的职责
//
// 剩下三项进「观察表」，见 note()
function check(G, st, where) {
  const b = buckets(G)
  const n = sumOf(b)

  // 一、牌数守恒。**自校准**：以局首那次为基准，而不是写死 52 ——
  // 这样桶清单万一不全，报的是「该补桶」而不是一串假的泄漏
  if (st.total === null) {
    st.total = n
    // ---- 判据 2026-10-15 换了：盯**牌库**的奇偶，不盯总数 ----
    //
    // 原先判的是「总数 ≤52 而且是偶数」。两半都过期了：
    //
    //   **「≤52」** —— DECK_SIZE 那道上限删了，牌组现在可以任意厚；
    //   **「总数偶数」** —— 剔牌闸锁的是「牌组 − 发牌数」，而发牌数走
    //     handLimit，**添手（庄家 +1）/ 掐口（玩家 −1）会让它变成奇数** ——
    //     那时总数正好是奇数。所以总数的奇偶不再是不变量，
    //     **局首牌库的奇偶**才是（那正是闸保证的东西）。
    //
    // 总数那一条换成了个下限，目的没变：抓「桶清单漏了一个」——
    // 漏一个桶总数会掉到 47 之类，那种错要当场报出来，
    // 而不是被下面「以局首为基准」那条自校准吞掉。40 是 DECK_MIN。
    //
    // 切出来那张**仍在局内**（进了先手的手牌），所以照样数得到。
    // 〔跑 `DROP=k` 那个实验旋钮时这条会报 —— 它就是故意去改奇偶的〕
    if (b.deck % 2 === 1 || n < 40) {
      return '局首牌库 ' + b.deck + ' 张、总数 ' + n
        + ' —— 牌库该是偶数、总数不该低于 40（见 rules.js 那道剔牌闸）\n'
        + '    现在数的是：' + BUCKETS.join(' + ') + '\n'
        + '    明细：' + bucketText(b) + '\n'
        + '    （另外 held=' + G.held.length + '）\n'
        + '    **这多半不是规则 bug，是 check.js 要补桶。**'
    }
  } else if (n !== st.total) {
    return '牌数不守恒：' + st.total + ' → ' + n + '（' + (n - st.total > 0 ? '+' : '')
      + (n - st.total) + '）\n'
      + '    上一手：' + bucketText(st.lastB) + '\n'
      + '    这一手：' + bucketText(b)
  }
  st.lastB = b

  // 二、六条并行数组等长
  const L = G.pile.length
  const par = [
    ['pileByFoe', G.pileByFoe.length], ['pileGuard', G.pileGuard.length],
    ['pileVals', G.pileVals.length], ['pileSuit', G.pileSuit.length],
    ['pileBurn', G.pileBurn.length]
  ]
  for (let i = 0; i < par.length; i++) {
    if (par[i][1] !== L) {
      return '六条并行数组错位：pile=' + L + ' 但 ' + par[i][0] + '=' + par[i][1] + '\n'
        + '    全部：pile=' + L + ' '
        + par.map(function (p) { return p[0] + '=' + p[1] }).join(' ')
    }
  }

  // 三、**收走的张数** == gone 的张数
  //
  // ⚠ 查的是 `G.taken` 不是 `G.score`〔2026-10-22 改〕。`SCORE_BANDS`
  //   开着时 score 是档值、不再等于张数，而这一条自检量的是**张数守恒**
  //   （「有牌离场却没进 gone」），跟计分规则无关。
  const took = G.taken[R.ME] + G.taken[R.FOE]
  if (took !== G.gone.length) {
    return '收牌张数跟记牌口径不一致：taken 合计 ' + took + ' ≠ gone ' + G.gone.length + '\n'
      + '    你 ' + G.taken[R.ME] + ' 庄 ' + G.taken[R.FOE] + '\n'
      + '    差 ' + (took - G.gone.length)
      + ' —— 有牌离场却没进 gone（或者反过来）。'
      + 'takeAt 的 `if (shield)` 那一支最可能'
  }
  // 三之二、**旋钮关着时 score 必须逐位等于 taken**。
  // 这一条是上面那个改动的「它坏得了吗」—— 把 `scoreOf` 写错
  //（比如忘了 `n <= 1` 那一支）当场在这儿炸，而不是悄悄改掉全表的数。
  // ⚠ 判据**从 `R.SCORE_BANDS` 取，不读 env**〔2026-10-23 默认值翻成 `1,4,12` 之后〕。
  //   读 env 的话「不写 = 关着」，而现在不写是**开着**，这一条会当场误报。
  if (R.SCORE_BANDS === null) {
    for (const s of [R.ME, R.FOE]) {
      if (G.score[s] !== G.taken[s]) {
        return '铁律破了：SCORE_BANDS 没开，但 score ≠ taken\n'
          + '    side=' + s + ' score=' + G.score[s] + ' taken=' + G.taken[s] + '\n'
          + '    —— `scoreOf` 在旋钮关着时必须逐字返回 n'
      }
    }
  }

  // 四、冰不叠加 / 冰火不共存 / **冰盾不共存**
  for (let i = 0; i < G.pile.length; i++) {
    const k = frostCountOn(G, G.pile[i])
    // 带【保护】的牌贴不上冰 —— 两个方向都该拦住：`addFrostAt` 第一道闸
    // 不给带盾的贴冰，而 `addWardAt` 贴盾那一下会把已有的冰清掉。
    //
    // ⚠ 这条 2026-10-22 才补上，而**那天正是它该拦的 bug 被查出来的日子**：
    // 模拟器的 `addFrostAt` 漏了那道闸（源码 10-19 就加了），漏了三天 ——
    // 而本文件此前**一条保护相关的不变量都没有**，所以规则层查不出来；
    // 受影响的格子又恰好一格都没跑过（保护件不在 KIT_ORDER 前 4、
    // 不在 PLAYER_POOL、不在任何庄家配装），所以 X 也不反常。
    // **两头都静默，只有 fingerprint.js 抖出来。** 这条就是补那个洞
    if (k > 0 && wardOnCard(G, G.pile[i])) {
      return '冰盾共存：堆上第 ' + i + ' 张（' + G.pile[i].rank + G.pile[i].suit
        + '）同时带【保护】和【结冰】 —— '
        + '两道闸（addFrostAt 开头那个 wardAt / addWardAt 里的清冰）有一个没拦住'
    }
    if (k > 1) {
      return '【结冰】叠加了：堆上第 ' + i + ' 张（' + G.pile[i].rank + G.pile[i].suit
        + '）挂着 ' + k + ' 条 —— addFrostAt 的不可叠加那道闸漏了'
    }
    if (k > 0 && G.pileBurn[i] > 0) {
      return '冰火共存：堆上第 ' + i + ' 张（' + G.pile[i].rank + G.pile[i].suit
        + '）同时有冰和 ' + G.pileBurn[i] + ' 层火 —— '
        + '相消的两个方向（addFrostAt / iceMeltsFire）有一个没拦住'
    }
  }

  // 五、stacked 的 host 都在堆上
  for (let i = 0; i < G.stacked.length; i++) {
    if (G.pile.indexOf(G.stacked[i].host) < 0) {
      return '叠放的宿主不在堆上了：第 ' + i + ' 条（kind=' + G.stacked[i].kind
        + '）—— expireStacked 没清掉它，那几张牌从此谁也收不走'
    }
  }

  // ---- 观察项（不判对错，只累计）----
  note(G, st, where)
  return null
}

// 这三项我对语义没有十足把握，所以**只报数不报错** ——
// 刷一串假警报比不报更糟。数不为 0 就值得人去看一眼
function note(G, st, where) {
  // 甲之前：**检查器得自证它在工作**。
  // SK.FROST 的下标要是重排过，frostCountOn 会永远返回 0 ——
  // 冰那两条断言一路绿灯，其实一张冰都没验过。
  // 所以数一下「见过冰」的手数，跑完让 main 去问
  for (let i = 0; i < G.pile.length; i++) {
    if (frostCountOn(G, G.pile[i]) > 0) { st.frostSeen++; break }
  }
  if (G.frostHand.length > 0) st.keySeen++

  // 保护那一边同理 —— 而「冰盾不共存」那条断言**更容易过空气**：
  // 它要堆上同时存在盾和冰才算验过，而全表没有一个配装会让两者碰面。
  // 所以必须正面数「见过盾」的手数，不然那条断言永远在报喜
  for (let i = 0; i < G.pile.length; i++) {
    if (wardOnCard(G, G.pile[i])) { st.wardSeen++; break }
  }

  // 火那一边同理，而且**这一边更要紧**：「七条硬断言全过」在一个
  // 一张火都没点着的局里也会全过 —— 那时候过的是空气。
  // 新搬进来那三件是不是真的在贴火，只有正面数才知道
  for (let i = 0; i < G.pile.length; i++) {
    if (G.pileBurn[i] > 0) { st.burnSeen++; break }
  }
  if (G.burnHand.length > 0) st.burnKeySeen++

  // 甲、iceBlind 在两手之间还是 true。
  //
  // 它在 playFor 开头被重设、在 harvestAt 末尾被清 —— 可是
  // 「打了带冰的钥匙但没钓到」那一手不跑 harvestAt，于是这面豁免旗
  // 会挂到下一手开头才被覆盖。中间要是有别的收牌路径跑了
  //（burnStep 的全堆带火、庄家规矩…），它就蹭上了不该有的豁免
  if (G.iceBlind) st.iceBlindBetween++

  // 乙、held 里的 source 已经不在堆上。
  // expireHeld 只在 harvestAt 末尾跑，所以不收牌的手之后可能残留
  for (let i = 0; i < G.held.length; i++) {
    if (G.pile.indexOf(G.held[i].source) < 0) { st.heldStale++; break }
  }

  // 丙、frostHand 里的牌已经不在任何人手里。
  // frostOnLand 会在落堆时把它摘掉 —— 可是被【掏手】掏走、
  // 被【换牌】换掉的那张谁来摘？这是真实的 bug 候选
  for (let i = 0; i < G.frostHand.length; i++) {
    const c = G.frostHand[i]
    if (G.hands[R.ME].indexOf(c) < 0 && G.hands[R.FOE].indexOf(c) < 0) {
      st.frostLeak++
      break
    }
  }

  // 丁、burnHand 同上（【引火】预约的那层火）。两个数组同一个形状，
  // 所以同一个漏法 —— 分开数是为了知道是哪一族漏的
  for (let i = 0; i < G.burnHand.length; i++) {
    const c = G.burnHand[i]
    if (G.hands[R.ME].indexOf(c) < 0 && G.hands[R.FOE].indexOf(c) < 0) {
      st.burnLeak++
      break
    }
  }

  // 〔戊、原先查 `emberFired` 跨手立着（【余烬】的死亡触发旗）。
  //   余烬 2026-10-14 删了，这一条跟着删。
  //
  //   它留下一条还能复用的检查形状：**凡是「立旗 → 下一步兑现」的机制，
  //   都要查那面旗会不会跨手立着** —— 立着说明有一条路绕过了兑现点。
  //   现在还活着的同形状机制只剩**对流**（G.forceStep / G.forceUsed）。〕
}

// ---------- 配装 ----------

function skillAt(key) {
  const at = R.SKILLS.findIndex(function (s) { return s.key === key })
  if (at < 0) {
    throw new Error('没有这个技能：' + key + '\n  有的是：'
      + R.SKILLS.map(function (s) { return s.key }).join(' '))
  }
  return at
}

function roleAt(key) {
  const at = R.roleIndexOf(key)
  if (at < 0) {
    throw new Error('没有这个角色：' + key + '\n  有的是：'
      + R.DRAW_ROLES.map(function (r) { return r.key }).join(' '))
  }
  return at
}

// 把几件技能插进一个角色的头几个槽
function kitOf(roleKey, keys) {
  const role = roleAt(roleKey)
  const slots = R.DRAW_ROLES[role].slots
  if (keys.length > slots.length) {
    throw new Error('【' + R.DRAW_ROLES[role].name + '】只有 ' + slots.length
      + ' 个槽，装不下 ' + keys.length + ' 件')
  }
  return R.kitFromRole(role, slots.map(function (s, i) {
    return i < keys.length ? skillAt(keys[i]) : -1
  }))
}

// 哪几组**该**见到冰 / 火。见 main 里那段：正面点名，不靠 key 猜
// 〔'frostfall' 那一组 2026-10-15 改名成 'coldhue' —— 霜降删了，
//   驻场那一组换寒流当代表〕
// 〔2026-10-20：结凌 / 藏凌 / 寒流删了，'coldhue' 组换成 'lockdraw'（封凌单件）〕
// 〔2026-10-28：'wardice' 那一组删了（【保护】整个撤了，凝水跟着删），
//   所以它从这张名单里一起拿掉〕
const FROST_CASES = ['lockdraw', 'frost', 'lockice', 'fire']
const BURN_CASES = ['burn', 'fire']
// 〔2026-10-22 加〕哪几组该见到**堆上的保护**。只有一组 ——
// 而「只有一组」本身就是那条断言此前永远在报喜的原因
//
// ⚠ **2026-10-28 这张名单空了**：【保护】整个撤了，两条来路（凝水 / 拢水）
//   同日删，全表**没有任何技能贴得出保护**，所以 'wardice' 那一组也删了。
//   下面那段检查留着（空名单 = 永不触发），**因为实现是按「死代码」留的** ——
//   哪天保护回来，加回一个载体 + 把组名填回这儿就能重新验。
//   ⚠ 留空的代价要知道：**「冰盾不共存」那条断言现在一辈子不跑了**。
//   那正是 2026-10-22 加这一组要治的病，现在病因换成「没有载体」而已
const WARD_CASES = []

// ---------- 九组配置 ----------
//
// 〔这儿原先写着「六组」，而那时表里已经是八组了 —— 数字写在注释里
//   就会过期。2026-10-22 加 wardice 时一起改成九组，
//   2026-10-26 加 zones（两个新区）改成十组，
//   2026-10-28 删 wardice（【保护】撤了）回到九组〕
//
// 顺序是故意的：base 过不了就不用看后面三组 —— 那说明坏的不是新东西
const CASES = [
  {
    key: 'base', label: '基线（双方空装、无角色）',
    build: function () { return { mine: R.emptyLoadout(), foe: R.emptyLoadout(), myRole: -1 } }
  },
  {
    // 〔原先这一组是**霜降**单件（技能 2026-10-15 删了）。换成寒流 ——
    //   它是这一族现在唯一的驻场件，而「驻场」正是这一组要压的那条路
    //   （效果挂在一张随时被钓走的牌上，`held` + `inPile` 那套）。
    //   寒流还多压两条：**无点数**（ICE_VOID）和**落堆底**（ICE_SINK），
    //   那两条只作用在它身上，没有第二个用例覆盖〕
    // 〔2026-10-20 寒流删了，驻场那条路结冰族里没有代表了。换成封凌单件 ——
    //   它压的是「技能里途摸牌（手牌临时超上限）」+「钥匙打出 → 全场贴冰」那条规则〕
    key: 'lockdraw', label: '封凌单件（摸牌 + 钥匙铺冰）',
    build: function () {
      return { mine: kitOf('lock', ['lockdraw']), foe: R.emptyLoadout(), myRole: -1 }
    }
  },
  {
    // 〔霜降删了，所以这一组从四件变**三件**。名字留着 'frost' ——
    //   它指的是「这一族全上」，不是「四件」〕
    key: 'frost', label: '结冰族全上（我方三件）',
    build: function () {
      return {
        mine: kitOf('lock', ['lockdraw', 'lockcolor', 'icebomb']),
        foe: R.emptyLoadout(), myRole: -1
      }
    }
  },
  {
    // 封凌 / 隔凌（2026-10-20）：铺冰之外还**摸牌**（手牌数临时超上限）、
    // 隔凌还从堆上读不到的颜色贴手冰。对手也带，冰两边一起铺
    key: 'lockice', label: '封凌 / 隔凌（铺冰 + 摸牌钥匙）',
    build: function () {
      return {
        mine: kitOf('lock', ['lockdraw', 'lockcolor']),
        // 庄家也带冰雷：双方的钥匙互相引爆对方的雷那条路在这儿跑
        foe: kitOf('lock', ['lockdraw', 'lockcolor', 'icebomb']), myRole: -1
      }
    }
  },
  // 〔**'wardice' 那一组 2026-10-28 删了** —— 它装的是【凝水】+ 封凌，
  //   而凝水同日删了（【保护】整个撤掉，用户定）。`kitOf` 查不到 'calm'
  //   会抛，所以这一组**必须跟着删，不是「留着也不会跑」**。
  //
  //   它原来的理由照搬在这儿，因为那个理由**现在仍然成立、只是没法兑现**：
  //  「加它的理由不是覆盖率，是『冰盾不共存』那条断言**没有别的组能验**：
  //   `KIT_ORDER` 前 4 里没有保护件，`campaign.js` 的 `PLAYER_POOL` 里
  //   也没有，十二张庄家配装唯一沾冰的那件（第 9 关的冻结）10-21 已经
  //   不带冰了。**所以这条断言要么在这儿跑，要么一辈子在报喜。**」
  //
  //   —— 现在它一辈子在报喜了，而**那是接受了的**：保护零载体，
  //   冰盾压根碰不上。哪天保护回来，把这一组和 `WARD_CASES` 一起填回去。
  {
    // 四个槽，而燃烧那一族现在有七件（野火 + 六个候选）—— 装不下。
    // 挑的是**最可能出错的四件**：两件定稿的（传火的连锁会反复取牌、
    // 引火的手牌火要跨手兑现）、布火（它动了落堆本身，六条数组 splice）、
    // 余烬（死亡触发，唯一会在 takeAt 里立旗的）。
    //
    // 野火**故意不带** —— 它不走 lightAt（自己过滤完再 doWildPick），
    // 所以它压不到新那几件共用的那道闸
    // 〔原先这组是四件 ['chain','kindle','place','ember'] ——
    //   布火和余烬 2026-10-14 删了。**这是同一个坑的第二次**
    //   （见下面 fire 组那条注释：沸水删了没同步，整组抛「没有这个技能」）。
    //   所以这儿留一句：**删技能的时候要搜一遍 check.js 的 CASES。**〕
    key: 'burn', label: '燃烧两件（传火 / 引火）',
    build: function () {
      return {
        mine: kitOf('lock', ['chain', 'kindle']),
        foe: R.emptyLoadout(), myRole: -1
      }
    }
  },
  {
    // **这一组是冲着「冰火不共存」那条断言来的** —— 两边各四件，
    // 相消的两个方向（addFrostAt 清火 / iceMeltsFire 清冰）在这儿
    // 每局要撞上几十次。原先这组写的是 ['wild', 'boil']，
    // 可沸水 2026-10-13 就删了 —— 那会让整组直接抛「没有这个技能」
    key: 'fire', label: '结冰族 vs 燃烧两件（冰火相消的对撞）',
    build: function () {
      return {
        // 〔霜降 2026-10-15 删了，这一组从四件变三件。
        //   **撞击密度因此掉了一档** —— 霜降是唯一「落堆就贴冰」的，
        //   它一走，冰的产出只剩「自带」和「贴手牌」两条路。
        //   要是哪天这组压不出问题了，先怀疑是密度不够、不是 bug 没了〕
        mine: kitOf('lock', ['lockdraw', 'lockcolor']),
        foe: kitOf('lock', ['chain', 'kindle']), myRole: -1
      }
    }
  },
  {
    // 【推牌】洗回牌库那一下绕开了 takeAt（不进 gone、不记分），
    // 牌数守恒和「分数 == gone」两条断言正好压它。双方都带，再配上
    // 结冰那一族，让洗回那一段撞上冰。
    //
    // **没配凝水**：结凌 + 凝水同时在场会丢牌（第 1 局第 10 手 ♥2 凭空消失），
    // 那是既存 bug、跟推牌无关（2026-10-14 在干净工作区上复现过）
    // 〔**2026-10-28：引潮删了，这一组换成【薪潮】。**
    //   换而不是删，是因为要压的那条断言（推牌洗回绕开 takeAt）
    //   跟引潮这一件无关 —— 它压的是 `surgeLayer`，而那套机制还活着
    //  （薪潮 / 逆涌 / 凌涌 / 毒涌 / 漫流 / 分饵 / 吃水 都走它）。
    //   这正是 CLAUDE.md 警告的那一格：`kitOf` 查不到就塞 −1，
    //   **用例静默变空装而且照旧报「全过」**（霜降栽过）。
    //
    //   ⚠ 薪潮**自带【燃烧】**，所以这一组现在多了一路火。
    //   对主断言（牌数守恒 / 分数 == gone）没影响，反而多压一次冰火相消；
    //   但要是哪天这组报出跟火有关的问题，先想起来这一笔。
    //   它的推牌层数是 1（引潮是 2），所以**撞击密度掉了一档**〕
    key: 'surge', label: '薪潮 / 推牌（洗回牌库，绕开了 takeAt）',
    build: function () {
      return {
        mine: kitOf('lock', ['fuel', 'lockdraw', 'lockcolor']),
        // 〔对手那边原先是 ['surge', 'frostfall'] —— 霜降删了，换寒流。
        //   这一组要的是「对手也在产冰」，寒流同样满足〕
        foe: kitOf('lock', ['fuel', 'lockdraw']), myRole: -1
      }
    }
  },
  {
    key: 'filler', label: '填河工（填塘 —— 它动的是 endPlay）',
    build: function () {
      return { mine: R.emptyLoadout(), foe: R.emptyLoadout(), myRole: roleAt('filler') }
    }
  },
  {
    // ---------- 第十组〔2026-10-26〕：两个新区**在真效果下**跑一遍 ----------
    //
    // 加它的理由跟 wardice 那一组一模一样：**不然那两个新桶永远在报喜。**
    // `BOARD_TEST=2` 只在开局往上牌区塞一次，它验不到「对局中途往区里放牌」；
    // 而堆牌区在默认跑里压根不会有牌。这一组让两条路都真跑：
    //
    //   〈heapdraft〉 每打一张 → 从牌库取 2 张进堆牌区 → 下回合落堆
    //                （牌数守恒那条压的就是这段「牌不在牌库也不在堆上」）
    //
    // 双方都带，所以堆牌区两边同时有牌 —— 回合循环里那条
    // 「排在手牌空那道岔之前」的位置要是写反了，这一组会当场炸
    //
    // ⚠ **上牌区那一半 2026-10-27 退化成只能靠旋钮**：这一组原先还带
    //   〈boardgive〉（每打一张 → 把对手一张手牌挪进**他的**上牌区，
    //   压 `board` 桶 + 手牌并行数组 `seen` 的同步），而那件 10-27
    //   上架成【顶钩】**当天就删了**（X −1.14）。现在**没有任何技能**
    //   往上牌区放牌，所以要验那一区得自己开旋钮：
    //
    //       BOARD_TEST=2 node tools/md-sim/check.js --only zones
    //
    //   （`BOARD_TEST` 只在开局塞，验不到「对局中途往区里放牌」——
    //     那一半现在**没有覆盖**，下一件往上牌区放牌的技能要把它补回来）
    key: 'zones', label: '堆牌区（+ 上牌区要 BOARD_TEST=2 才有牌）',
    build: function () {
      return {
        mine: kitOf('lock', ['heapdraft']),
        foe: kitOf('lock', ['heapdraft']), myRole: -1
      }
    }
  }
]

// ---------- 跑 ----------

function parse(argv) {
  const out = { n: 400, seed: 1, only: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-n') out.n = parseInt(argv[++i], 10)
    else if (argv[i] === '--seed') out.seed = parseInt(argv[++i], 10)
    else if (argv[i] === '--only') out.only = argv[++i]
  }
  return out
}

function runCase(cs, n, seed) {
  const cfg = cs.build()
  const rng = R.makeRng(seed)
  const st = {
    iceBlindBetween: 0, heldStale: 0, frostLeak: 0,
    frostSeen: 0, keySeen: 0, wardSeen: 0,
    burnSeen: 0, burnKeySeen: 0,
    burnLeak: 0,
    steps: 0, games: 0
  }
  let bad = null

  for (let g = 0; g < n && !bad; g++) {
    // 每局重置守恒基准（gone 是按局算的）
    st.total = null
    st.lastB = null
    let step = 0
    try {
      R.playGame({
        rng: rng,
        mine: cfg.mine, foe: cfg.foe,
        mineSmart: true, foeSmart: true,
        myRole: cfg.myRole === undefined ? -1 : cfg.myRole,
        foeRole: cfg.foeRole === undefined ? -1 : cfg.foeRole,
        onStep: function (G) {
          if (bad) return
          step++
          st.steps++
          const err = check(G, st, step)
          if (err) {
            bad = '第 ' + (g + 1) + ' 局 第 ' + step + ' 手：\n    ' + err
          }
        }
      }, AI)
    } catch (e) {
      bad = '第 ' + (g + 1) + ' 局 第 ' + step + ' 手 抛了异常：\n    '
        + String(e.message || e).split('\n').join('\n    ')
    }
    st.games++
  }
  st.bad = bad
  return st
}

function main() {
  const a = parse(process.argv.slice(2))
  const list = a.only
    ? CASES.filter(function (c) { return c.key === a.only })
    : CASES
  if (list.length === 0) {
    console.log('没有这组：' + a.only + '（有的是 '
      + CASES.map(function (c) { return c.key }).join(' ') + '）')
    process.exit(2)
  }

  // 开跑之前先确认判据对得上。**下标错了的检查器会一路绿灯** ——
  // 那比没有检查器更糟，因为它会让人以为验过了
  if (R.HELD_FROST === undefined) {
    console.log('rules.js 没导出 HELD_FROST —— 冰那两条断言会静默失效。')
    console.log('  现在有的是：' + Object.keys(R.SK).join(' '))
    process.exit(2)
  }

  console.log('规则层不变量自检 · 每组 ' + a.n + ' 局 · seed ' + a.seed + '\n')
  let failed = 0

  for (let i = 0; i < list.length; i++) {
    const cs = list[i]
    let st
    try {
      st = runCase(cs, a.n, a.seed)
    } catch (e) {
      console.log('✗ ' + cs.key + '  ' + cs.label)
      console.log('    配装就没搭起来：' + String(e.message || e).split('\n').join('\n    '))
      console.log('')
      failed++
      continue
    }

    if (st.bad) {
      console.log('✗ ' + cs.key + '  ' + cs.label)
      console.log('  ' + st.bad)
      console.log('')
      failed++
      continue
    }

    console.log('✓ ' + cs.key + '  ' + cs.label)
    console.log('    ' + st.games + ' 局 / ' + st.steps + ' 手，七条硬断言全过')
    // ---- 该见到的标签见到了吗 ----
    //
    // 「七条硬断言全过」在一个**标签根本没生效**的局里也会全过 ——
    // 那时候过的是空气。所以每组正面点名它该见到什么。
    //
    // 名单**显式写，不靠 key 猜**：原先写的是「除了 base 和 filler
    // 都该有冰」，可 burn 组装的是燃烧四件、一件冰技能都没有，
    // 于是被自己的检查器误报成「断言没跑到」。取反的名单每加一组
    // 就得重想一次，正面点名不会
    if (FROST_CASES.indexOf(cs.key) >= 0) {
      if (st.frostSeen === 0) {
        console.log('    ⚠ 一张堆上的冰都没见过 —— 冰那两条断言等于没跑。'
          + '对一下 HELD_FROST 和这几件技能的 key')
        failed++
      } else {
        console.log('    冰：堆上 ' + st.frostSeen + ' 手、手里的钥匙 '
          + st.keySeen + ' 手')
      }
    }
    if (WARD_CASES.indexOf(cs.key) >= 0) {
      if (!WARD_TAG) {
        console.log('    — 冰盾那条断言**跳过了**（WARD_TAG=0 那条老路认的是'
          + ' STACK_WARD，而那个常量没导出）')
      } else if (st.wardSeen === 0) {
        // 〔SK.CALM 2026-10-28 钉了 SK_GONE，这句提示里的 key 名留着是因为
        //   `WARD_CASES` 现在是空的、这一支永不触发；真要恢复保护的话
        //   新载体的 key 得换成那一件〕
        console.log('    ⚠ 一张堆上的保护都没见过 —— 冰盾那条断言等于没跑。'
          + '对一下保护载体那件技能的 key 和 addWardAt 那条路')
        failed++
      } else {
        console.log('    保护：堆上 ' + st.wardSeen + ' 手（冰盾那条断言真跑过了）')
      }
    }
    if (BURN_CASES.indexOf(cs.key) >= 0) {
      if (st.burnSeen === 0) {
        console.log('    ⚠ 一张堆上的火都没见过 —— 燃烧那几件根本没生效。'
          + '对一下 SK.WILD/KINDLE/CHAIN 的 key 和 afterPlay 那一段')
        failed++
      } else {
        console.log('    火：堆上 ' + st.burnSeen + ' 手、手里预约的 '
          + st.burnKeySeen + ' 手')
      }
    }
    const obs = []
    if (st.iceBlindBetween > 0) obs.push('iceBlind 手间为真 ' + st.iceBlindBetween + ' 次')
    if (st.heldStale > 0) obs.push('held 有过期 source ' + st.heldStale + ' 手')
    if (st.frostLeak > 0) obs.push('frostHand 有离手的牌 ' + st.frostLeak + ' 手')
    if (st.burnLeak > 0) obs.push('burnHand 有离手的牌 ' + st.burnLeak + ' 手')
    if (obs.length > 0) console.log('    观察：' + obs.join('、'))
    console.log('')
  }

  // ---- 收尾：叠放的孤儿 ----
  //
  // `expireStacked` 的职责是「宿主离场了，整叠跟着清」，而叠放表里
  // 装的是**真牌** —— 清掉一条就是丢一张牌。正常情况下轮不到它清：
  // 收牌走 `takeStack`（进 gone）、走水走 `returnAt`（回 deck），
  // 两条都先把叠牌搬走了。真清到了就说明有**第三条「宿主离场」的路**
  // 没接账。
  //
  // ⚠ **它跟断言五管的不是同一件事，两条都要有。**
  // 断言五抓的是「`G.stacked` 里残着一条宿主已离场的」，而那是
  // `expireStacked` **还没跑**的状态；跑完之后残条就没了，断言五看不见。
  // 这个计数口抓的是「跑了，而且真清掉了东西」——
  // 同一个毛病的另一头，谁也替不了谁。
  //
  // 〔2026-10-22：这一天 `wardice` 组报牌数 −1，我判在了 `expireStacked`
  //   头上，还加了「没主的叠牌洗回牌库」当兜底。真凶是【凝水】堆空时
  //   那张牌白放（现在进 `G.waste`，第七个桶）。兜底已撤 ——
  //   **留着的话下一次真漏了，守恒会替它圆场**，而那比没有检查更糟〕
  //
  // `PROTO_STAT` 是跨组累加的，所以在所有组跑完之后读一次
  const orph = R.PROTO_STAT.stow.orphan
  if (orph > 0) {
    console.log('⚠ 叠放孤儿 ' + orph + ' 张 —— 宿主从第三条路离场了，'
      + '叠在它底下的牌没人接账（上面的守恒断言应该已经断了）。')
    console.log('    查法：grep 出所有让牌离开 G.pile 的地方'
      + '（removePileAt / G.pile.splice / returnAt / harvestAt），')
    console.log('    看哪一条没先调 takeStack。见 rules.js 的 expireStacked。')
    console.log('')
    failed++
  }

  if (failed > 0) {
    console.log('—— ' + failed + ' / ' + list.length + ' 组断了。上面第一条就是断点。')
    process.exit(1)
  }
  console.log('—— 全过。规则层没被碰坏，可以去看 `base` 的六个数了。')
}

main()
