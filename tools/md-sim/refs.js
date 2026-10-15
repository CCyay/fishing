'use strict'

// ============================================================
//  技能引用完整性检查（2026-10-15）
// ============================================================
//
// **删一件技能之后跑它。** 它回答一个问题：
//
//   > 还有哪儿在引用已经不存在的技能？
//
// ---- 为什么需要它 ----
//
// 删技能做了四轮，**每一轮都漏一个地方，而且四次漏的不是同一个地方**：
//
//   沉底   漏了 `rules.js` 的 SKILLS —— 整整一轮没人发现，
//          它在游戏里买得到，却既不参与定价也不参与平衡复核
//   洪水   漏了庄家角色的槽（漫江拉网人静默少一件技能）
//          和 `campaign.js` 的 PLAYER_POOL（玩家配装随机少一件 → 通关率虚低）
//   霜降   漏了 `check.js` 的四组测试用例 ——
//          **用例静默变空装（kitOf 查不到就塞 −1），而它照旧报「全过」**
//   封色 / 分水 / 同花   漏在**别人的 desc 里**（玩家照着去找，找不到以为是 bug）
//
// 共同点：**删除是「从一张表里拿掉一行」，而引用散在七八处。**
// 墓碑注释治不了 —— 注释给人看，而漏掉的恰恰是没人想到要去看的地方。
//
// ---- 它跟 fingerprint.js 的分工 ----
//
//   `fingerprint.js`  **源码动过了没** —— 哈希比对，防模拟器副本漂移
//   `refs.js`（这个） **引用还完整吗** —— 名单比对，防删除漏清
//
// 两个都是「扫源码的正则工具」，但关注点不同，所以分开：
// 删技能后立刻跑 refs，不用等 fingerprint 那一屏漂移。
//
//   node refs.js            ← 查一遍，有问题退出码 1
//   node refs.js --verbose  ← 连「对的」也列出来
//
// ---- 它查什么（七处，四处栽过） ----
//
//   1. `rules.js` 的 SKILLS   —— 跟源码的 DRAW_SKILLS 逐 key 比对〔沉底栽过〕
//   2. `rules.js` 的 SK       —— skAt('key') 引用的 key 是否还在
//   3. 庄家角色的槽            —— DRAW_FOE_ROLES / DRAW_FOE_POOL〔洪水栽过〕
//   4. `campaign.js` 的池子    —— PLAYER_POOL〔洪水栽过〕
//   5. `check.js` 的测试用例   —— kitOf(...) 里的 key〔霜降栽过〕
//   6. **所有 desc 里的技能中文名**〔封色 / 分水 / 同花栽过〕
//   7. `SK_*` 导出 vs DEAD_SKILLS —— 死常量有没有登记在案
//
// 第 6 条是最隐蔽的一类，也是这个脚本最值钱的地方：
// 它靠源码里那张 `DEAD_SKILLS`（机器可读的已删名单）才查得了。

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const GAME = path.join('pages', 'examples', 'blackjack')
const SIM = path.join('tools', 'md-sim')

const VERBOSE = process.argv.indexOf('--verbose') >= 0

const cache = {}
function read(rel) {
  if (!cache[rel]) cache[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  return cache[rel]
}

// 收集到的问题。每条 { where, what, hint }
const bad = []
const notes = []

function fail(where, what, hint) {
  bad.push({ where: where, what: what, hint: hint })
}

// ---------- 读源码的三张表 ----------
//
// **注释里的 `key: 'x'` 会被一起抓到**，所以先把注释剥掉 ——
// 墓碑里常常原样抄着被删那行（比如沉底的墓碑里就有）。
// 不剥的话删掉的技能会「还活着」，整个检查就反了
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

// 抓某一张表里的 `key: 'x', name: '中文'`。
//
// **必须按表分段抓，不能整文件扫** —— 第一版就栽在这儿，栽了两次：
//
//   `DEAD_SKILLS` 用的是同一个写法，于是 16 件已删技能被算成「还活着」，
//     整个检查反了过来（它开始报「模拟器缺沸水」）；
//   三张表混成一个集合之后，拿去跟模拟器的 `SKILLS` 比对会报
//     9 件常驻技「缺失」—— 可它们在模拟器那边是 `SP`，不在 `SKILLS` 里。
//
// 教训：**同一个数据写法出现在四张表里，所以「扫到就算」一定错。**
function tableOf(text, name) {
  // **两种写法都要认**：源码（`.uts`）是 `export const X`，
  // 而模拟器（`rules.js`）是裸 `const X`（它靠 module.exports 导出）。
  // 第一版只认 export，于是模拟器那三张表全报「找不到」—— 而那条
  // 「找不到就跳过」的提示让检查**静默失效**，比报错更坏
  let at = text.indexOf('export const ' + name)
  if (at < 0) at = text.indexOf('const ' + name)
  if (at < 0) return null
  // 表以 `\n]` 结尾（数组字面量顶格收口）
  const end = text.indexOf('\n]', at)
  const seg = text.slice(at, end < 0 ? text.length : end)
  const map = {}
  const re = /key:\s*'([a-z0-9]+)',\s*name:\s*'([^']+)'/g
  let m
  while ((m = re.exec(seg)) !== null) map[m[1]] = m[2]
  return map
}

// 源码那三张表，分开拿
function gameTables() {
  const text = stripComments(read(path.join(GAME, 'draw-skills.uts')))
  const out = {
    skills: tableOf(text, 'DRAW_SKILLS'),
    specials: tableOf(text, 'SPECIAL_SKILLS'),
    roles: tableOf(text, 'DRAW_ROLES')
  }
  Object.keys(out).forEach(function (k) {
    if (out[k] === null) {
      fail('draw-skills.uts', '找不到 ' + k + ' 那张表', '表改名了？这个脚本按表名分段抓')
      out[k] = {}
    }
  })
  return out
}

// DEAD_SKILLS 那张表：key → { name, gone, why }
function deadSkills() {
  const text = read(path.join(GAME, 'draw-skills.uts'))
  // 只取 DEAD_SKILLS 那一段 —— 它的写法跟活表一样，整文件扫会混进去
  const at = text.indexOf('export const DEAD_SKILLS')
  if (at < 0) {
    fail('draw-skills.uts', '找不到 DEAD_SKILLS 那张表',
      '删技能的最后一步是往那张表加一行。表没了的话这个脚本的第 6、7 项全失效')
    return {}
  }
  const end = text.indexOf('\n]', at)
  const seg = text.slice(at, end < 0 ? text.length : end)
  const map = {}
  const re = /key:\s*'([a-z0-9]+)',\s*name:\s*'([^']+)',\s*gone:\s*'([^']*)'/g
  let m
  while ((m = re.exec(seg)) !== null) {
    map[m[1]] = { name: m[2], gone: m[3] }
  }
  return map
}

const GAME_T = gameTables()
// 「活着」= 三张表的并集。第 3~7 项用它（那几处引用不分表）
const LIVE = {}
;['skills', 'specials', 'roles'].forEach(function (t) {
  Object.keys(GAME_T[t]).forEach(function (k) { LIVE[k] = GAME_T[t][k] })
})
const DEAD = deadSkills()

// ---------- 模拟器专属的候选技能 ----------
//
// **这几件是有意只存在于模拟器里的**：先在 `rules.js` 里量形状、
// 量合格了才搬进游戏（【吃水】就是这么进来的）。所以「源码里没有」
// 对它们不是错误。
//
// **但不能静默跳过** —— 哪天其中一件被判废而没人清，它会一直躺在全表里。
// 所以脚本正面把它们列出来（见输出末尾），只是不算错。
//
// 名单要跟设计文档『全表复核』那一节的「模拟器里还有几个没实现的候选」对上
const SIM_ONLY = {
  probe: '探潮',
  order: '顺流',
  cross: '对流',
  surge: '引潮 / 倒灌'
}

// ---------- 1 / 2：模拟器的三张表和 SK 常量 ----------
//
// **三张表要分别比对** —— 源码的 DRAW_SKILLS ↔ 模拟器的 SKILLS、
// SPECIAL_SKILLS ↔ SP、DRAW_ROLES ↔ DRAW_ROLES。混成一个集合比会误报
// 9 件常驻技「缺失」（它们在模拟器那边不在 SKILLS 里）
function checkSim() {
  const text = stripComments(read(path.join(SIM, 'rules.js')))
  const pairs = [
    { game: 'skills', sim: 'SKILLS', label: '点数技能' },
    { game: 'specials', sim: 'SP_LIST', label: '常驻特殊技' },
    { game: 'roles', sim: 'DRAW_ROLES', label: '角色' }
  ]
  const simSeen = {}
  pairs.forEach(function (p) {
    const simTable = tableOf(text, p.sim)
    if (simTable === null) {
      // SP 在模拟器那边是个对象常量（SP.CREEL = 'creel'）而不是数组表，
      // 所以 SP_LIST 查不到是正常的 —— 那一对改用 SP 的值来比
      if (p.sim === 'SP_LIST') {
        const sp = {}
        // **不能带 `^` 锚点** —— SP 把好几个键挤在一行
        //（`CREEL: 'creel', NARROW: 'narrow', CLEAR: 'clear', …`），
        // 带锚点的话一行只抓到第一个，于是报 8 件「缺失」
        const re = /\b([A-Z0-9_]+):\s*'([a-z0-9]+)'/g
        let m
        const at = text.indexOf('const SP =')
        const seg = at < 0 ? '' : text.slice(at, text.indexOf('\n}', at))
        while ((m = re.exec(seg)) !== null) sp[m[2]] = true
        Object.keys(sp).forEach(function (k) { simSeen[k] = true })
        Object.keys(GAME_T.specials).forEach(function (k) {
          if (!sp[k]) {
            fail('md-sim/rules.js', 'SP 里缺 `' + k + '`（'
              + GAME_T.specials[k] + '，常驻技）',
              '源码有、模拟器没有 —— 那件常驻技**永远不会出现在 `roles` 表里**')
          }
        })
        return
      }
      notes.push('模拟器里找不到 ' + p.sim + ' —— 改名了？这一对跳过')
      return
    }
    Object.keys(simTable).forEach(function (k) { simSeen[k] = true })
    // 模拟器有、源码没有
    Object.keys(simTable).forEach(function (k) {
      if (GAME_T[p.game][k]) return
      if (SIM_ONLY[k]) return
      const d = DEAD[k]
      fail('md-sim/rules.js', p.sim + ' 里还有 `' + k + '`'
        + (d ? '（' + d.name + '，' + d.gone + ' 删的）' : ''),
        '源码的' + p.label + '表里没有它了。删掉这一行 —— '
        + '留着的后果是**全表会量一件游戏里不存在的技能**')
    })
    // 源码有、模拟器没有
    Object.keys(GAME_T[p.game]).forEach(function (k) {
      if (!simTable[k]) {
        fail('md-sim/rules.js', p.sim + ' 里缺 `' + k + '`（'
          + GAME_T[p.game][k] + '）',
          '源码有、模拟器没有 —— 那件的 X / D **永远不会出现在报表里**')
      }
    })
  })

  // skAt('key')：SK 常量引用的 key
  const re2 = /skAt\('([a-z0-9]+)'\)/g
  let m
  while ((m = re2.exec(text)) !== null) {
    if (!LIVE[m[1]] && !DEAD[m[1]] && !SIM_ONLY[m[1]]) {
      fail('md-sim/rules.js', '`skAt(\'' + m[1] + '\')` 查的 key 哪张表里都没有',
        '拼错了，或者那件技能删了却没登记进 DEAD_SKILLS')
    }
  }
}

// ---------- 3：庄家角色的槽 ----------
//
// `{ skill: SK_HUE, count: 1, suit: true }` —— 抓 SK_* 那个名字，
// 再反查它对应的 key（SK_HUE → 'hue'）
function checkFoeRoles() {
  const skills = read(path.join(GAME, 'draw-skills.uts'))
  // SK_X → 'x'
  const byConst = {}
  const re0 = /export const (SK_[A-Z0-9_]+)\s*:\s*number\s*=\s*skillIndexOf\('([a-z0-9]+)'\)/g
  let m
  while ((m = re0.exec(skills)) !== null) byConst[m[1]] = m[2]

  const text = stripComments(read(path.join(GAME, 'draw-levels.uts')))
  const re = /skill:\s*(SK_[A-Z0-9_]+)/g
  while ((m = re.exec(text)) !== null) {
    const key = byConst[m[1]]
    if (!key) {
      fail('draw-levels.uts', '槽里用了 `' + m[1] + '`，但 draw-skills 里没有这个导出',
        '常量名拼错了')
      continue
    }
    if (!LIVE[key]) {
      const d = DEAD[key]
      fail('draw-levels.uts', '庄家角色的槽里还装着 `' + m[1] + '`'
        + (d ? '（' + d.name + '，' + d.gone + ' 删的）' : ''),
        '**那张卡会静默少一件技能** —— skill 变成 −1 就是空槽。'
        + '要么给它换一件，要么把那个槽删掉（顺手改 desc 和覆盖面）')
    }
  }
}

// ---------- 4：campaign.js 的玩家池 ----------
function checkPool() {
  const text = read(path.join(SIM, 'campaign.js'))
  const at = text.indexOf('const PLAYER_POOL')
  if (at < 0) {
    notes.push('campaign.js 里找不到 PLAYER_POOL —— 改名了？这一项跳过')
    return
  }
  const end = text.indexOf(']', at)
  const seg = text.slice(at, end < 0 ? text.length : end)
  const re = /'([a-z0-9]+)'/g
  let m
  while ((m = re.exec(seg)) !== null) {
    if (!LIVE[m[1]]) {
      const d = DEAD[m[1]]
      fail('md-sim/campaign.js', 'PLAYER_POOL 里还有 `' + m[1] + '`'
        + (d ? '（' + d.name + '）' : ''),
        '**后果是静默的**：playerKit 查不到就往槽里塞 −1，'
        + '于是玩家配装随机少一件，而通关率跟着虚低')
    }
  }
}

// ---------- 5：check.js 的测试用例 ----------
function checkCases() {
  const text = stripComments(read(path.join(SIM, 'check.js')))
  // kitOf('lock', ['a', 'b'])
  const re = /kitOf\([^,]+,\s*\[([^\]]*)\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    const inner = m[1]
    const re2 = /'([a-z0-9]+)'/g
    let k
    while ((k = re2.exec(inner)) !== null) {
      if (!LIVE[k[1]] && !SIM_ONLY[k[1]]) {
        const d = DEAD[k[1]]
        fail('md-sim/check.js', '测试用例里还装着 `' + k[1] + '`'
          + (d ? '（' + d.name + '）' : ''),
          '**用例会静默变空装**（kitOf 查不到就塞 −1）→ 那一组退化成基线的重复，'
          + '**而它照旧报「全过」**')
      }
    }
  }
  // FROST_CASES / BURN_CASES 那种「该见到冰/火的组名」用的是**用例 key**
  // 不是技能 key，所以不查 —— 查了会误报
}

// ---------- 6：所有 desc 里提到已删技能的中文名 ----------
//
// **这是最隐蔽的一类**，也是这个脚本最值钱的地方。
// 玩家读到「配得上分水、撒网那条路」会去商店找分水，找不到就以为是 bug。
// 中文没有词边界，所以**短技能名会误伤更长的普通词**。第一版就撞了两种：
//
//   「同花」 ⊂ 「同花**色**」—— 三条 desc 误报（顺色 / 一色 / 收色都在说花色）
//   「沉底」 既是技能名又是动词（「另一张沉底」= 沉到牌库底）
//
// 所以分两档报：**确定**（名字后面不跟中文字）和**可能**（跟着中文字，
// 多半是更长的词）。不直接过滤掉「可能」那一档 —— 漏报比误报更贵，
// 而误报只要标清楚就不伤信任
// 有几个技能名**本身就是这个玩法的普通词**，提到它们不一定是在指技能：
//
//   「沉底」 动词 —— 「另一张沉底」（沉到牌库底）、「落堆底」
//   「退潮」 名词 —— 潮水退了
//   「合流」 动词
//
// 这类一律报成「可能误报」。**不直接过滤掉** —— 词表里那句
// 「带『优先』的先走（沉底、合流是这一类）」是真的在指技能，漏了就白查
const ALSO_WORDS = {
  sink: '也是动词（牌沉到牌库底）',
  ebb: '也是名词（潮水退了）',
  merge: '也是动词'
}

function looksLikeWord(body, name, at, key) {
  if (ALSO_WORDS[key]) return false
  const after = body[at + name.length]
  if (!after) return true
  // 后面紧跟中文 → 多半是更长的词（同花色、沉底牌……）
  return !/[一-龥]/.test(after)
}

function checkDescs() {
  const files = [
    path.join(GAME, 'draw-skills.uts'),
    path.join(GAME, 'draw-levels.uts'),
    path.join(GAME, 'draw-terms.uts')
  ]
  const deadNames = Object.keys(DEAD).map(function (k) {
    return { key: k, name: DEAD[k].name }
  })
  files.forEach(function (rel) {
    const text = read(rel)
    // 只看 desc 字段的内容 —— 注释里提已删技能是**正当的**（墓碑就在注释里）
    const re = /desc:\s*'([^']*)'/g
    let m
    while ((m = re.exec(text)) !== null) {
      const body = m[1]
      deadNames.forEach(function (d) {
        const at = body.indexOf(d.name)
        if (at < 0) return
        const quote = body.slice(0, 48) + (body.length > 48 ? '…' : '')
        if (looksLikeWord(body, d.name, at, d.key)) {
          fail(path.basename(rel), '有一条 desc 提到了已删技能「' + d.name + '」',
            '原文：' + quote + ' —— **玩家照着去找，找不到就以为是 bug**')
        } else {
          notes.push('〔自己判断〕' + path.basename(rel) + ' 有一条 desc 提到「'
            + d.name + '」'
            + (ALSO_WORDS[d.key] ? '（' + ALSO_WORDS[d.key] + '）' : '，但后面跟着中文字')
            + ' —— 原文：' + quote)
        }
      })
    }
  })
}

// ---------- 7：SK_* 导出 vs DEAD_SKILLS ----------
//
// 死常量**可以留**（.uvue 里还有引用，一起删会编不过），
// 但必须**登记在案** —— 不然下一个人分不清「这是还没清的死代码」
// 还是「这件技能我没见过」
function checkDeadConsts() {
  const text = read(path.join(GAME, 'draw-skills.uts'))
  const re = /export const (SK_[A-Z0-9_]+)\s*:\s*number\s*=\s*skillIndexOf\('([a-z0-9]+)'\)/g
  const dead = []
  let m
  while ((m = re.exec(text)) !== null) {
    const key = m[2]
    if (LIVE[key]) continue
    if (!DEAD[key]) {
      fail('draw-skills.uts', '`' + m[1] + '` 指向的 `' + key + '` 已经不在表里，'
        + '**而 DEAD_SKILLS 里也没登记**',
        '往 DEAD_SKILLS 加一行（key / name / gone / why）。'
        + '那张表是 refs.js 第 6 项的依据 —— 不登记的话它的中文名就扫不出来')
    } else {
      dead.push(m[1] + ' → ' + key + '（' + DEAD[key].name + '）')
    }
  }
  if (dead.length > 0) {
    notes.push('死常量 ' + dead.length + ' 个，都登记在案（.uvue 还有引用，'
      + '所以留着是对的；攒够一批再一起清死代码）：')
    if (VERBOSE) dead.forEach(function (d) { notes.push('    ' + d) })
  }
}

// ---------- 8：组合技的依赖 ----------
//
// **这一项是补上一个盲区，而那个盲区当场害我改错了一次。**
//
// 组合技（两件技能撞在同一张牌上合成第三种效果）**没有 key、不在任何表里** ——
// 它只存在于 `.uvue` 里的一个条件式：
//
//   if (hasTrigger(skills, SK_EBB) && hasTrigger(skills, SK_LOWTIDE)) → 干塘
//
// 所以**删掉它的任一组成件，它就静默死掉**（`hasTrigger(skills, -1)` 永不匹配），
// 而前七项一个都查不出来：它没名字可比、没表可对。
//
// 实际发生过的：退潮 2026-10-14 删 → 干塘跟着死 → 可词表里四处还在拿
// 「见底、退潮、干塘」举例。而我修那四处时，**把退潮换成了干塘** ——
// 用一个死的替换另一个死的，因为我不知道干塘也死了。
//
// 扫法：找 `hasTrigger(skills, SK_A) && hasTrigger(skills, SK_B)` 这个模式，
// 两边的技能都得活着
function checkCombos() {
  const skills = read(path.join(GAME, 'draw-skills.uts'))
  const byConst = {}
  const re0 = /export const (SK_[A-Z0-9_]+)\s*:\s*number\s*=\s*skillIndexOf\('([a-z0-9]+)'\)/g
  let m
  while ((m = re0.exec(skills)) !== null) byConst[m[1]] = m[2]

  const text = stripComments(read(path.join(GAME, 'ap-fishing.uvue')))
  const re = /hasTrigger\(skills,\s*(SK_[A-Z0-9_]+)\)\s*&&\s*hasTrigger\(skills,\s*(SK_[A-Z0-9_]+)\)/g
  let found = 0
  // 活的和死的要**分开数** —— 第一版只数总数，于是末尾那句恒是
  // 「组成件都在」，跟上面刚报的错自相矛盾。
  // **一个会说假话的检查比没有检查更坏**，所以这儿单独记
  let broken = 0
  while ((m = re.exec(text)) !== null) {
    found++
    const a = byConst[m[1]]
    const b = byConst[m[2]]
    const deadSide = []
    if (a && !LIVE[a]) deadSide.push(m[1] + '（' + (DEAD[a] ? DEAD[a].name : a) + '）')
    if (b && !LIVE[b]) deadSide.push(m[2] + '（' + (DEAD[b] ? DEAD[b].name : b) + '）')
    if (deadSide.length > 0) {
      broken++
      fail('ap-fishing.uvue', '组合技 `' + m[1] + ' × ' + m[2] + '` 的组成件已删：'
        + deadSide.join('、'),
        '**这个组合技已经永远不会触发了**（hasTrigger(−1) 永不匹配），而它'
        + '没有 key、不在任何表里，所以别的检查都查不出来。'
        + '要么补一个替代的组成件，要么把这段连同所有提到它的 desc / 词表一起清掉')
    }
  }
  if (found === 0) {
    notes.push('没扫到组合技（`hasTrigger(A) && hasTrigger(B)` 那个模式）'
      + ' —— 要么一件都没有了，要么写法变了，第 8 项失效')
  } else if (broken === 0) {
    notes.push('组合技 ' + found + ' 处，组成件都在')
  } else {
    notes.push('组合技 ' + found + ' 处，其中 ' + broken + ' 处的组成件已删（见上）')
  }
}

// ---------- 跑 ----------
function main() {
  console.log('技能引用完整性检查 · 活着 ' + Object.keys(LIVE).length + ' 件'
    + ' / 已删登记 ' + Object.keys(DEAD).length + ' 件\n')

  checkSim()
  checkFoeRoles()
  checkPool()
  checkCases()
  checkDescs()
  checkDeadConsts()
  checkCombos()

  const simOnly = Object.keys(SIM_ONLY)
  if (simOnly.length > 0) {
    notes.push('模拟器专属候选 ' + simOnly.length + ' 件（源码里没有是**有意的** ——'
      + '先量形状再搬进游戏）：' + simOnly.map(function (k) {
        return k + '（' + SIM_ONLY[k] + '）'
      }).join('、'))
  }

  if (bad.length === 0) {
    console.log('✓ 八项全过 —— 没有任何地方引用已删的技能。')
    notes.forEach(function (n) { console.log('  · ' + n) })
    console.log('\n  查的八处：rules.js 的三张表 / SK · 庄家角色的槽 ·'
      + ' campaign 的池子 · check 的用例 · 所有 desc · SK_* 的登记 · 组合技的依赖')
    return 0
  }

  console.log('⚠ ' + bad.length + ' 处引用了已删的技能：\n')
  const byWhere = {}
  bad.forEach(function (b) {
    if (!byWhere[b.where]) byWhere[b.where] = []
    byWhere[b.where].push(b)
  })
  Object.keys(byWhere).forEach(function (w) {
    console.log('  【' + w + '】')
    byWhere[w].forEach(function (b) {
      console.log('    ✗ ' + b.what)
      console.log('      ' + b.hint)
    })
    console.log('')
  })
  notes.forEach(function (n) { console.log('  · ' + n) })
  return 1
}

process.exit(main())
