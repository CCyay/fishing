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
// **G.dead 不是桶** —— 它是「这张是废牌」的标记集合，牌本身照旧待在
// deck / hands / pile 里（见 isDead）。要是局首总和不等于 52，那就是
// 这份清单漏了地方，脚本会直接说「该补桶」而不是甩锅给规则。
const BUCKETS = ['deck', 'handME', 'handFOE', 'pile', 'stacked', 'gone']

function buckets(G) {
  return {
    deck: G.deck.length,
    handME: G.hands[R.ME].length,
    handFOE: G.hands[R.FOE].length,
    pile: G.pile.length,
    stacked: G.stacked.length,
    gone: G.gone.length
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
    if (G.held[i].skill === R.SK.FROST && G.held[i].source === card) k++
  }
  return k
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
    if (n !== 52) {
      return '局首总张数 ' + n + ' ≠ 52 —— 桶清单漏了地方\n'
        + '    现在数的是：' + BUCKETS.join(' + ') + '\n'
        + '    明细：' + bucketText(b) + '\n'
        + '    （另外 dead=' + G.dead.length + ' held=' + G.held.length + '）\n'
        + '    **这不是规则 bug，是 check.js 要补桶。**'
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

  // 三、分数 == gone 的张数
  const score = G.score[R.ME] + G.score[R.FOE]
  if (score !== G.gone.length) {
    return '分数跟记牌口径不一致：score 合计 ' + score + ' ≠ gone ' + G.gone.length + '\n'
      + '    你 ' + G.score[R.ME] + ' 庄 ' + G.score[R.FOE] + '\n'
      + '    差 ' + (score - G.gone.length)
      + ' —— 有牌离场却没进 gone（或者反过来）。'
      + 'takeAt 的 `if (shield)` 那一支最可能'
  }

  // 四、冰不叠加 / 冰火不共存
  for (let i = 0; i < G.pile.length; i++) {
    const k = frostCountOn(G, G.pile[i])
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

// ---------- 四组配置 ----------
//
// 顺序是故意的：base 过不了就不用看后面三组 —— 那说明坏的不是新东西
const CASES = [
  {
    key: 'base', label: '基线（双方空装、无角色）',
    build: function () { return { mine: R.emptyLoadout(), foe: R.emptyLoadout(), myRole: -1 } }
  },
  {
    key: 'frostfall', label: '霜降单件（驻场效果，最容易出错）',
    build: function () {
      return { mine: kitOf('lock', ['frostfall']), foe: R.emptyLoadout(), myRole: -1 }
    }
  },
  {
    key: 'frost', label: '结冰四件全上（我方）',
    build: function () {
      return {
        mine: kitOf('lock', ['frost', 'hide', 'coldhue', 'frostfall']),
        foe: R.emptyLoadout(), myRole: -1
      }
    }
  },
  {
    key: 'fire', label: '结冰四件 vs 燃烧两件（冰火相消的对撞）',
    build: function () {
      return {
        mine: kitOf('lock', ['frost', 'hide', 'coldhue', 'frostfall']),
        foe: kitOf('lock', ['wild', 'boil']), myRole: -1
      }
    }
  },
  {
    key: 'filler', label: '填河工（填塘 —— 它动的是 endPlay）',
    build: function () {
      return { mine: R.emptyLoadout(), foe: R.emptyLoadout(), myRole: roleAt('filler') }
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
    frostSeen: 0, keySeen: 0,
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
  if (R.SK.FROST === undefined) {
    console.log('rules.js 的 SK 里没有 FROST —— 冰那两条断言会静默失效。')
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
    console.log('    ' + st.games + ' 局 / ' + st.steps + ' 手，六条硬断言全过')
    // 带冰的那三组要是一张冰都没见过，那是**检查器没在工作**，
    // 不是「冰很干净」。这一行就是来掀掉那种假绿灯的
    if (cs.key !== 'base' && cs.key !== 'filler') {
      if (st.frostSeen === 0) {
        console.log('    ⚠ 一张堆上的冰都没见过 —— 冰那两条断言等于没跑。'
          + '对一下 SK.FROST 的下标和这几件技能的 key')
        failed++
      } else {
        console.log('    冰出现在 ' + st.frostSeen + ' 手、手里的钥匙 '
          + st.keySeen + ' 手（断言确实跑到了）')
      }
    }
    const obs = []
    if (st.iceBlindBetween > 0) obs.push('iceBlind 手间为真 ' + st.iceBlindBetween + ' 次')
    if (st.heldStale > 0) obs.push('held 有过期 source ' + st.heldStale + ' 手')
    if (st.frostLeak > 0) obs.push('frostHand 有离手的牌 ' + st.frostLeak + ' 手')
    if (obs.length > 0) console.log('    观察：' + obs.join('、'))
    console.log('')
  }

  if (failed > 0) {
    console.log('—— ' + failed + ' / ' + list.length + ' 组断了。上面第一条就是断点。')
    process.exit(1)
  }
  console.log('—— 全过。规则层没被碰坏，可以去看 `base` 的六个数了。')
}

main()
