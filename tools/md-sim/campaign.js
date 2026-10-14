'use strict'

// ============================================================
//  闯关难度校准（2026-10-14）
// ============================================================
//
// 为什么有它：终局剩堆的规则改了（原先「不算分」，现在归「没打最后一手」的一方），
// 而闯关里**永远是庄家先手、玩家后手** —— 旧规则下那 +3 分后手优势是玩家的
// 隐性补贴，难度表（生命、金币倍率、庄家记不记牌）是在它上面调出来的。
// 规则一改补贴没了，整套难度得重新对一遍。
//
//   node campaign.js                        ← 新规则，三档难度各跑一遍
//   BALANCE=old node campaign.js            ← 旧规则（对照）
//   node campaign.js --lives 4,3,2          ← 改生命
//   node campaign.js --kshift 1             ← 玩家配装提前 1 关成形（= 多给金币）
//   node campaign.js --ease 1               ← 庄家「记牌」推迟 1 关、随机关多 1 关
//   node campaign.js -n 3000 --seed 7
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
// 闯关的流程照 draw-save：赢了进下一关；平局重打、不扣命；
// 输了扣 1 点生命、重打这一关；生命扣光整轮作废

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
  { name: '礁石海女', specials: ['pinch'], slots: [['freeze', 2, false]] },
  { name: '潮眼引水人', specials: ['drift'], slots: [['tide', 2, false], ['hook', 1, false]] },
  { name: '湾口税吏', specials: ['shell'], slots: [['suited', 1, true]] },
  { name: '雾港守灯人', specials: ['dryup'], slots: [['lantern', 2, false], ['freeze', 2, false]] },
  { name: '涡心祭司', specials: ['guard'], slots: [['suitify', 1, true], ['lowtide', 1, false]] },
  { name: '鲸落拾骨人', specials: ['again'], slots: [['wild', 1, true], ['hook', 2, false]] },
  { name: '深渊君主', specials: ['seal'], slots: [['suited', 1, true], ['coldhue', 1, false], ['hide', 1, false]] }
]
const MODELED_SP = ['hand', 'pinch']

// ---------- 难度：照 draw-levels 的 levelForDiff ----------
//
// 关卡表原样：第 1 关随机、第 2 关不记牌、第 3 关起记牌（DRAW_LEVELS 的 random / smart）
const LEVEL_RANDOM = [true, false, false, false, false, false, false, false, false, false, false, false]
const LEVEL_SMART = [false, false, true, true, true, true, true, true, true, true, true, true]
const EASY_RANDOM_UNTIL = 4
const DIFFS = [
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
const PLAYER_POOL = [
  'flood', 'flow', 'chain', 'swapcard', 'kindle', 'hide', 'coldhue', 'wild',
  'draft', 'peak', 'wade', 'unhook', 'suitify', 'cast', 'raise', 'suited',
  'dead', 'frostfall', 'hue', 'lowtide', 'press'
]
const PLAYER_ROLE = 'lock'

// 第 level 关（0 起）开打时装着几件。经济目标照 draw-levels 那段注释：
// 「打到第 9 关攒下的技能数正好对上技能库上限」，而江口闸官只有 4 个槽，
// 所以装着的件数在第 7~9 关封顶 4。简单的钱多（×2）、困难的钱少（×0.75）
function kitSize(diff, level, kshift) {
  const at = level + kshift
  if (diff === 'easy') return Math.max(0, Math.min(4, Math.ceil(at * 0.75)))
  if (diff === 'hard') return Math.max(0, Math.min(4, Math.floor(at * 0.4)))
  return Math.max(0, Math.min(4, Math.floor(at * 0.5)))
}

function playerKit(rng, size) {
  const role = R.roleIndexOf(PLAYER_ROLE)
  const pool = PLAYER_POOL.slice(0)
  const picks = []
  for (let i = 0; i < 4; i++) {
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
    const rng = R.makeRng(opt.seed + level * 100003 + i)
    const G = R.playGame({
      rng: rng,
      mine: playerKit(rng, kitSize(diff, level, opt.kshift)),
      foe: foeKit(rng, level),
      mineSmart: true,
      foeSmart: mode.smart,
      foeRandom: mode.random,
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
// 平局重打不扣命，所以每一关只看「分出胜负那一次」：p = w / (w + l)。
// state[k] = 还剩 k 点生命、站在这一关门口的概率
function runOdds(odds, lives) {
  let state = []
  for (let k = 0; k <= lives; k++) state.push(k === lives ? 1 : 0)
  const reach = []
  for (let lv = 0; lv < odds.length; lv++) {
    const p = odds[lv].w + odds[lv].l > 0 ? odds[lv].w / (odds[lv].w + odds[lv].l) : 1
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
  console.log('闯关校准 · 规则 ' + (process.env.BALANCE === 'old' ? '旧（剩堆不算分）' : '新（剩堆归没打最后一手的）')
    + ' · 每关 ' + opt.n + ' 局 · kshift ' + opt.kshift + ' · ease ' + opt.ease)
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
}

main()
