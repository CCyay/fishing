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
    names: ['catchStart', 'canCatch', 'playFor', 'resolveMatch', 'removePileAt',
      'afterPlay', 'afterPlayHead', 'afterPlayTail', 'measureFor', 'valuesOf',
      'landVals', 'cardVals', 'anyEquals', 'guardedAgainst', 'finishCatch',
      'pushPile', 'unshiftPile', 'suitifyFor', 'pileValsAt', 'pileSuitAt', 'pileRed']
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
    names: ['refill', 'expireGuards', 'checkOver', 'passTurn', 'buildPlainDeck',
      'drawFor', 'takeFromHand', 'foePickCard', 'baitRisk', 'outsideCount',
      'foeSwapPick', 'foePickDeck', 'foeFreezePick', 'randomFree', 'buildRankTotals']
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
  { file: 'draw-skills.uts', name: 'DUMP_COUNT' },
  { file: 'draw-skills.uts', name: 'SPILL_COUNT' },
  { file: 'draw-skills.uts', name: 'EBB_COUNT' },
  // SUIT_CAPACITY 删了（花色槽砍成了一个特殊技能槽），所以这儿也撤掉 ——
  // 留着只会每次都报一条 MISSING，而噪音多了就没人看警报了
  { file: 'draw-skills.uts', name: 'RANK_CAPACITY' },
  { file: 'draw-skills.uts', name: 'BAIT_COUNT' },
  { file: 'draw-skills.uts', name: 'CYCLE_REFILL' }
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
