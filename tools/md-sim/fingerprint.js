// 漂移检测
//
//   node fingerprint.js          对一遍，报哪几个函数变了
//   node fingerprint.js --save   把现在的状态存成基准（改完模拟器之后跑这个）
//
// ---- 它解决的问题 ----
//
// rules.js 和 ai.js 是 ap-fishing.uvue 的**手写副本**（项目没有 npm 依赖，
// 没法 import .uts，理由见 rules.js 文件头）。副本的老毛病是悄悄过期：
// 源码加了一件技能、改了一条判定，模拟器还在按老规则跑，
// 跑出来的数看着一本正经，其实已经不作数了。
//
// 消灭漂移做不到，但**让漂移看得见**很便宜：把源码里那几个关键函数的正文
// 存一份哈希，对不上就说一声。于是「模拟器可能过期了」从一件想不起来的事
// 变成一行红字。
//
// 它不判断改动有没有影响 —— 那得人看。它只回答「源码动过没有」。

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..', '..', 'pages', 'examples', 'blackjack')
const BASE_FILE = path.join(__dirname, 'baseline.json')

// 跟哪些函数。分三组，报告里也按组摆 —— 哪一组变了，就知道要改模拟器的哪一块
const WATCH = [
  {
    file: 'ap-fishing.uvue',
    group: '钓牌判定与出牌',
    // 「先结算技能、再匹配」那次重构把 afterPlay 拆成了 head / tail 两段，
    // 匹配挪进了 resolveMatch —— 这几个都得盯着
    // 2026-10-14 补了五个，各有各的理由（都是以前漏的）：
    //   **takeAt / blockedAt** —— 全局**唯一的收牌闸门**。结冰、保护、
    //     叠放全挂在这两个上，漏掉它们等于漏掉「牌到底收不收得走」；
    //   **rawVals** —— 「写 pileVals 必须读 rawVals」那条判据的落点。
    //     读错会把在场效果**永久烙进**堆上那张牌（合流 / 焦壳那一类 bug）；
    //   **suitLeads** —— 一色的条件本体。`suitifyFor` 原先在名单里，可
    //     判定在 suitLeads 里，所以把「打平算不算」改掉是**报不出来的**
    //    （2026-10-14 那次改条件就正好落在这个盲区上）；
    //   **landVals 已在** —— 留着这条注记提醒：点数那一层有三个入口
    //     （valuesOf / landVals / rawVals），三个都得盯
    names: ['catchStart', 'canCatch', 'playFor', 'resolveMatch', 'removePileAt',
      'afterPlay', 'afterPlayHead', 'afterPlayTail', 'measureFor', 'valuesOf',
      'landVals', 'cardVals', 'anyEquals', 'guardedAgainst', 'finishCatch',
      'pushPile', 'unshiftPile', 'suitifyFor', 'suitLeads', 'pileValsAt',
      'pileSuitAt', 'pileRed', 'takeAt', 'blockedAt', 'rawVals']
  },
  {
    file: 'ap-fishing.uvue',
    group: '关键词：燃烧 / 结冰 / 通配',
    // ---- 这一组整个是 2026-10-14 新加的〔以前完全没盯〕----
    //
    // 三套关键词是这一季加的，而**它们一个都不在监视里** ——
    // 也就是说这张网恰好没覆盖最新、最没定下来的那部分代码。
    //
    // 三套各自的要紧处：
    //   **燃烧** —— burnStep 是「燃尽」的判定（排在 resolveMatch 之前，
    //     次序本身是规则的一部分）；spreadFire 是关键词级的蔓延，
    //     不挂在任何技能上，所以改了没人会想起来；
    //   **结冰** —— frostAt / frostOnLand 管「冰贴在哪」，
    //     iceMeltsFire 是冰火相消，coldHueOn 是寒流的持续钥匙；
    //   **通配** —— bestChainAt / markChain 是顺子匹配的本体，
    //     而 straightCount / wadeCount 是**庄家的估值**：
    //     那两个漏掉的后果不是「庄家笨一点」，是整件技能在庄家手里作废
    names: ['burnStep', 'spreadFire', 'wildfireFor', 'pickBurnAt', 'pileBurnAt',
      'frostAt', 'frostOnLand', 'coldHueOn', 'iceMeltsFire',
      'isWildAt', 'bestChainAt', 'markChain', 'straightFor',
      'straightCount', 'wadeCount']
  },
  {
    file: 'ap-fishing.uvue',
    group: '技能结算',
    names: ['lowTideFor', 'ebbTideFor', 'ebbFor', 'dropPile', 'dropVals', 'anyLive',
      'floodFor', 'hueFor', 'castFor', 'harvestIndices', 'harvestCount',
      'dumpFor', 'spillFor', 'peekFor', 'doPickDeck', 'sinkTops',
      'topCards', 'shuffleBack', 'doFreeze', 'expireHeld', 'heldOn', 'isFrozen',
      'inPile', 'foeOpen', 'foeKnows']
  },
  {
    file: 'ap-fishing.uvue',
    group: '回合流转与庄家策略',
    // trimDeck 是 2026-10-15 加的（现在是「把发完牌之后的牌库凑成偶数」）。
    //
    // **盯它而不盯 newGame**：切牌定庄那套规则落在 newGame 里，可那个函数
    // 几百行、什么都碰，盯它等于天天报警（而噪音多了就没人看警报了）。
    // trimDeck 小而且只做一件事，它一动就是流通张数的口径动了 ——
    // 那是模拟器必须跟上的那一类改动。
    //
    // checkOver 同一个理由、而且**比它更要紧**：终局规则就在那儿
    //（牌库空 + 双方各打 1 手 + 出牌数要相等），那三条每一条动了
    // 都会让整套平衡数作废
    names: ['refill', 'expireGuards', 'checkOver', 'passTurn', 'buildPlainDeck',
      'trimDeck', 'drawFor', 'takeFromHand', 'foePickCard', 'baitRisk',
      'outsideCount', 'foeSwapPick', 'foePickDeck', 'foeFreezePick',
      'randomFree', 'buildRankTotals']
  },
  {
    file: 'ap-fishing.uvue',
    group: '角色与特殊技能',
    // refill 也在这儿：【涨落】和庄家的【枯水】都拦在它开头
    //（「只有一张牌都打不出时才补」）
    names: ['hasSpecial', 'sameSuit', 'wantSink', 'baitFor', 'handLimit',
      'refill', 'playableCount']
  },
  {
    file: 'draw-skills.uts',
    group: '配装规则',
    // rankSizeOf / suitSizeOf / partnerSuit / rankCapOf 都删了
    //（那是「技能自带覆盖面 + 等级占几格」那套旧模型）。
    // 现在盯的是角色卡那一层：槽怎么解析、怎么摊进 loadout
    names: ['triggersOf', 'kitFromRole', 'kitFromSlots', 'slotLabels',
      'slotCover', 'isSuitSlot', 'roleCover', 'baitRankOf', 'specialIndexOf',
      'roleIndexOf', 'rollRoleKit']
  }
]

// 源码里这几个常量的值也要盯着 —— 手牌 4 张变 5 张，整套数据全废
const CONSTS = [
  { file: 'ap-fishing.uvue', name: 'HAND_SIZE' },
  { file: 'ap-fishing.uvue', name: 'TIDE_LOOK' },
  { file: 'ap-fishing.uvue', name: 'PICK_LOOK' },
  { file: 'ap-fishing.uvue', name: 'LOW_TIDE_STEP' },
  { file: 'ap-fishing.uvue', name: 'CLEAR_OPEN' },
  { file: 'ap-fishing.uvue', name: 'FIRM_GUARD' },
  { file: 'ap-fishing.uvue', name: 'DEEP_EXTRA' },
  // 〔DUMP_COUNT / SPILL_COUNT / EBB_COUNT 撤掉了（掏手 / 掏库 / 退潮
  //   三件技能 2026-10-14 删了）—— 照 SUIT_CAPACITY 那次的办法撤，
  //   留着只会每次报一条 MISSING〕
  // SUIT_CAPACITY 删了（花色槽砍成了一个特殊技能槽），所以这儿也撤掉 ——
  // 留着只会每次都报一条 MISSING，而噪音多了就没人看警报了
  { file: 'draw-skills.uts', name: 'RANK_CAPACITY' },
  { file: 'draw-skills.uts', name: 'BAIT_COUNT' },
  { file: 'draw-skills.uts', name: 'CYCLE_REFILL' },
  // 〔DECK_PLAY 撤掉了（2026-10-15 当天加、当天删）——「一局只进场 52 张」
  //   那道上限随终局规则一起退场。模拟器那边对应的 DECK_SIZE 也删了。
  //   留着只会每次报一条 MISSING〕
  //
  // 终局那两手（2026-10-15）。**模拟器那边是 rules.js 的 TAIL，两个数
  // 必须一样** —— 这一个动了而那一个没跟上的话，整套平衡数的口径就对不上，
  // 而那是最难看出来的一类漂移（分差只差零点几分，看着像噪声）
  { file: 'ap-fishing.uvue', name: 'TAIL_PLAYS' }
]

const cache = {}

function read(file) {
  if (!cache[file]) {
    cache[file] = fs.readFileSync(path.join(ROOT, file), 'utf8')
  }
  return cache[file]
}

// 抽出 `function name(` 开始、到花括号配平为止的那一段。
// 注释和空白全剥掉再算哈希 —— 改一句注释不该报警
function bodyOf(text, name) {
  const at = text.indexOf('function ' + name + '(')
  if (at < 0) return null
  let i = text.indexOf('{', at)
  if (i < 0) return null
  let depth = 0
  let end = -1
  // 字符串里的花括号会把计数带偏，所以跳过引号段
  let quote = ''
  for (let k = i; k < text.length; k++) {
    const c = text[k]
    if (quote) {
      if (c === quote && text[k - 1] !== '\\') quote = ''
      continue
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) { end = k; break }
    }
  }
  if (end < 0) return null
  return text.slice(at, end + 1)
}

// 剥注释和空白
function strip(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '')
}

function hashOf(code) {
  return crypto.createHash('sha1').update(strip(code)).digest('hex').slice(0, 12)
}

function constOf(text, name) {
  const m = new RegExp('const\\s+' + name + '\\s*:\\s*number\\s*=\\s*(-?\\d+)').exec(text)
  return m ? m[1] : null
}

// draw-skills.uts 里所有 `key: 'x', name:` 的顺序。
//
// 它一次抓三张表（DRAW_SKILLS、SPECIAL_SKILLS、DRAW_ROLES），因为三张
// 都是这个写法 —— 而那正好是我们要的：模拟器的 SK 是写死的下标表，
// 点数技能的表序一变它就全错；特殊技能和角色虽然按 key 查（删一件不会错位），
// 但增删本身也该报出来，好去核对 rules.js 那边的 SP / DRAW_ROLES
function skillKeys() {
  const text = read('draw-skills.uts')
  const out = []
  const re = /key:\s*'([a-z0-9]+)',\s*name:/g
  let m
  while ((m = re.exec(text)) !== null) {
    out.push(m[1])
  }
  return out
}

function collect() {
  const now = { funcs: {}, consts: {}, skills: skillKeys().join(',') }
  for (let g = 0; g < WATCH.length; g++) {
    const w = WATCH[g]
    const text = read(w.file)
    for (let i = 0; i < w.names.length; i++) {
      const body = bodyOf(text, w.names[i])
      now.funcs[w.file + ':' + w.names[i]] = body === null ? 'MISSING' : hashOf(body)
    }
  }
  for (let i = 0; i < CONSTS.length; i++) {
    const c = CONSTS[i]
    now.consts[c.file + ':' + c.name] = constOf(read(c.file), c.name) || 'MISSING'
  }
  return now
}

function groupOf(key) {
  const parts = key.split(':')
  for (let g = 0; g < WATCH.length; g++) {
    if (WATCH[g].file === parts[0] && WATCH[g].names.indexOf(parts[1]) >= 0) {
      return WATCH[g].group
    }
  }
  return '其它'
}

function main() {
  const now = collect()
  if (process.argv.indexOf('--save') >= 0) {
    fs.writeFileSync(BASE_FILE, JSON.stringify(now, null, 2) + '\n')
    const n = Object.keys(now.funcs).length
    console.log('已存基准：' + n + ' 个函数、' + Object.keys(now.consts).length
      + ' 个常量、' + now.skills.split(',').length + ' 件技能')
    return
  }
  if (!fs.existsSync(BASE_FILE)) {
    console.log('还没有基准。先跑一次：node fingerprint.js --save')
    process.exit(1)
  }
  const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'))
  const changed = []
  const missing = []
  const added = []
  const keys = Object.keys(now.funcs)
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (now.funcs[k] === 'MISSING') { missing.push(k); continue }
    if (!(k in base.funcs)) { added.push(k); continue }
    if (base.funcs[k] !== now.funcs[k]) changed.push(k)
  }
  const constChanged = []
  const ck = Object.keys(now.consts)
  for (let i = 0; i < ck.length; i++) {
    if (base.consts[ck[i]] !== now.consts[ck[i]]) {
      constChanged.push(ck[i] + '：' + base.consts[ck[i]] + ' → ' + now.consts[ck[i]])
    }
  }
  const skillsChanged = base.skills !== now.skills

  if (!changed.length && !missing.length && !added.length
    && !constChanged.length && !skillsChanged) {
    console.log('✓ 源码没动过，模拟器的数据还作数。')
    return
  }
  console.log('⚠ 源码动过了 —— 下面这些要跟 rules.js / ai.js 核对一遍：\n')
  if (skillsChanged) {
    console.log('  【技能表变了】')
    console.log('    基准：' + base.skills)
    console.log('    现在：' + now.skills)
    console.log('    rules.js 的 SK 常量和 SKILLS 表要跟着改（下标必须一一对应）\n')
  }
  if (constChanged.length) {
    console.log('  【常量变了】')
    for (let i = 0; i < constChanged.length; i++) console.log('    ' + constChanged[i])
    console.log('')
  }
  if (changed.length) {
    console.log('  【函数正文变了】')
    let last = ''
    for (let i = 0; i < changed.length; i++) {
      const g = groupOf(changed[i])
      if (g !== last) { console.log('    · ' + g); last = g }
      console.log('      ' + changed[i])
    }
    console.log('')
  }
  if (missing.length) {
    console.log('  【找不到了】（改名或删了）')
    for (let i = 0; i < missing.length; i++) console.log('    ' + missing[i])
    console.log('')
  }
  if (added.length) {
    console.log('  【新跟踪的】')
    for (let i = 0; i < added.length; i++) console.log('    ' + added[i])
    console.log('')
  }
  console.log('核对完、模拟器也改好了，再跑：node fingerprint.js --save')
  process.exit(2)
}

main()
