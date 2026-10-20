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
// 〔`surge`（引潮 / 推牌）2026-10-16 **搬进游戏了**，所以从这张表里撤掉 ——
//   它现在两边都有。留着的后果是第 1 项会把它当「模拟器专属」放过，
//   于是源码那边要是哪天删了它，这个检查**不会报**〕
const SIM_ONLY = {
  probe: '探潮',
  order: '顺流',
  cross: '对流',
  // 〔【分饵】（`gift`）2026-10-16 **当天就搬进游戏了**，所以从这张表撤掉 ——
  //   它现在两边都有（X 2.93 / 价 85，看 6 张）。
  //   留着的后果是第 1 项会把它当「模拟器专属」放过，于是源码那边
  //   哪天删了它这个检查**不会报**。
  //
  //   它留下一条判据，比技能本身值钱：**「给对手资源」要先算它替代了什么** ——
  //   手牌 4 张是下限、refill 只补到下限，所以塞给对手一张废牌
  //   等于剥夺他一次摸牌。实测给对手那一张让它强了 **+0.62**。
  //
  //   〔【漫流】（`brim`）2026-10-16 **也搬进游戏了**（X 3.00 / 价 90）。
  //     它的数换过一次：第一轮用 `CHAIN_FLIP`（不置 0）量到 4.18，
  //     而定稿走【推牌】关键词 —— 那个词条自带「撞点数置 0」，
  //     而置 0 的牌不能参与顺子。重量 **3.00**，差 1.18。
  //     判据：**用现成关键词之前读它的词条全文**〕
  // ---- 【迎潮】那件原型 + 它的载体角色〔2026-10-16〕----
  //
  // **有意只存在于模拟器**：先量形状，量完再决定搬不搬进游戏 ——
  // 而这一件**量完判废了**，所以不搬：常驻 X **+2.55**（全表第 4 高）
  // 却只兑现 34%。它的触发（「对方一次收走 ≥3 张」）贴着「对方打得好」，
  // 所以你配装越强它越不响 —— 自动反滚雪球，不适合做成角色卡。
  //
  // 留着是因为它是那条判据的**证据**（「对方触发」的条件越贴近
  //「对方打得好」，兑现率越低），而那条判据选出了【逆涌】的触发条件。
  //
  // 〔同族的【逆涌】2026-10-16 **搬进游戏了**（开河工），
  //   所以 `jsurge` / `surgeman` 从这张表里撤了 —— 它们现在两边都有〕
  rise: '迎潮（判废的原型）',
  risewatch: '迎潮人（载体角色）',
  // 【凌涌】（2026-10-16）：推 1 层，**推上来的牌都带【结冰】**。
  //
  // 它是「自己推牌」那半边的第三条绕法 —— 判据一说自己推牌是负的
  //（掏牌库给对手铺钩点），而这条是**让铺给他的钩点不给分**：
  // 他匹配进来 → 冰吸掉那一下 → 冰也没了 → 轮到我面对厚堆。
  // **冰是对称的，可时序不是**（障碍在他回合、收成在我回合）。
  //
  // ⚠ 跟草案【砾潮】（推上来一律算 0 点）**撞型，二选一** ——
  // 砾潮拒绝匹配，这件让匹配白费
  icesurge: '凌涌（原型）',
  // ---------- 2026-10-19 · 用户那六条提案的原型，五件 ----------
  //
  // 第 3 条（置 0 + 21 匹配）不在这儿 —— 它不用写代码，精确等于现成旋钮
  // `DRAFT_COSTS_SELF=0 DRAFT_MIN=3`。
  //
  // 前两件走【21 匹配】那条线（`hasDraftLine`），所以**它们跟【吃水】
  // 是同一族** —— 量完要判的不只是「够不够 2.7~4.5」，还有
  // 「加上它之后吃水还活不活得下去」（照水 / 清水那个 8 倍先例）
  lowdraft: '低吃（原型 · 整堆含自己 −1 + 21 匹配）',
  huedraft: '浊吃（原型 · 异色置 0 + 21 匹配）',
  // ---------- 2026-10-19 · 又两件（用户那两条，要评价）----------
  //
  // 跟上面两件差一处，而那一处是全部：低吃减**固定 1**，这两件减的是
  // **此牌点数** —— 于是幅度跟**槽上印的那个点数**成正比，而那是
  // 检查表里一条极少触发的项（「幅度跟槽标签那个数的大小有关吗」）。
  //
  // 量完的结论都在台账那一节，两件都**不建议上架**：
  //   择吃  87.5% 的发动在白打造料，而料活不到自己下一次发动（13 手间隔）
  //   压吃  诊断显示它 99.7~100% 是「吃光整堆」、预算用掉 0~18.6%
  //         —— **21 匹配退化成摆设，这条线唯一的决策被它自己架空了**
  altdraft: '择吃（原型 · 有 0 点牌则 21 匹配，否则整堆减此牌点数）',
  pushdraft: '压吃（原型 · 其他牌减此牌点数，减出 0 点牌则 21 匹配）',
  // 【削水】= 见底，而 N 变成旋钮（LOW_TIDE_STEP）—— 用户问 N 取多少合适。
  // **不含 21 匹配**，所以这条曲线量的是「散收 0 点牌」这个形状自己值多少
  lowcut: '削水（原型 · 置 0；堆上所有牌 −N；收走 0 点牌。= 见底的 N 参数化）',
  // 〔【沉潮】（`sinktag`）2026-10-19 **搬进游戏了**（价 80、N=2、M=3），
  //   所以从这张表撤掉 —— 它现在两边都有。
  //   留着的后果跟 `surge` / `gift` / `brim` 那三次一样：第 1 项会把它
  //   当「模拟器专属」放过，于是**源码那边哪天删了它，这个检查不会报**。
  //
  //   它留下的判据比技能本身值钱：**造料的成本要由对手付，一分别自己掏**
  //  （「双方各贴 N 张」那一档单带 2.54 → 0.67，协同涨到 +0.52 也补不回来）〕
  // 这件**故意不自带顺子匹配** —— 用户：「主要跟其他顺子匹配技能搭配
  // 使用的，本身应该不强」。所以它的立项读数是 `pair`，不是单件 X
  stow: '拢水（原型 · 通配 + 收纳一层保护）',
  icewild: '凌流（原型 · 自带结冰 + 通配 + 顺子匹配）',
  drag: '坠水（原型 · 垫下面减点数 + 随即判匹配）',
  // 结冰族 2026-10-20 那一轮的对照件（封凌 / 隔凌就是从这批里挑出来的）
  icelock: '锁冰',
  icedraw: '冰钓',
  icecolor: '冰色',
  icekey: '凝钥',
  lockback: '锁冰收',
  thaw: '化冰',
  thawdraw: '融冰',
  icedraft: '冰吃水',
  // 冰通配原 key 是 icewild，跟远端的【凌流】撞了，改成 frostwild
  frostwild: '冰通配（去冰改通配 + 顺子匹配）'
}

// 〔【薪潮】（`fuel`）2026-10-16 **搬进游戏了**，所以从上面那张表里撤掉。
//
//   它走过两版，而**第一版被数据否了**：v1 把【燃烧】贴在对手手里，
//   X 只有 +1.72（而我估 +8~9，差 5 倍且方向相反）—— 病因是火在手里
//   什么也不做、落堆那一下站在**他的**回合，于是堆薄时他当场燃尽。
//   v2 把火挪到自己打出那张上，同一条规则从自伤变成主要收益：**+3.50**。
//
//   顺带量出两条判据，都比这件技能本身值钱：
//     **盲选跟看着挑差 0.02**（诊断逐位相同）→「翻开对方手牌」在这件上值 0；
//     而 N=1→2 涨 1.23 → 贴得多是真有用。合起来：**对「迟早都会兑现」的
//     标签，挑哪张只改兑现时机，而时机不值钱**〕

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
// 还是「这件技能我没见过」。
//
// ---- 2026-10-16：这个数从 13 掉到 2，而剩下这两个性质不一样 ----
//
// 那一轮把十二件已删技能的实现全清了（约 600 行），导出跟着删。
// 剩下 `SK_SINK`（沉底）和 `SK_AGAIN`（连竿）**不是积压**，是**机制比技能
// 活得久**：sink 那条路还有【逆流】【偏流】【寒流】三个住户，
// `againPending` 那套还有庄家规矩【再钩】在用。
//
// 所以这一项的 note 对这两个**不该再催「攒够一批清掉」** ——
// 清它们要先把机制和技能拆开（给机制起自己的名字），那是独立一笔。
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
    // 名单只在 `-v` 下列（13 个一屏太长）。所以这句**不能用冒号收尾** ——
    // 非 verbose 时冒号后面空着，看着像拼串漏了东西
    notes.push('死常量 ' + dead.length + ' 个，都登记在案（.uvue 还有引用，'
      + '所以留着是对的。剩下的是「机制比技能活得久」那一类 —— '
      + '要清得先把机制和技能拆开，见本项注释）'
      + (VERBOSE ? '：' : '。加 -v 看名单'))
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
    // **「扫到 0 个」在这一项上是已知的正确结果，不是失效**〔2026-10-16 改〕。
    //
    // 原先这条写「要么一件都没有了，要么写法变了，第 8 项失效」——
    // 两种情况混在一句里，而实际是第一种，**而且是查得清的**：
    // 干塘（退潮 × 见底）是全表唯一一个组合技，退潮 2026-10-14 删了，
    // 它跟着死，那段代码也清了。所以现在确实一件都没有。
    //
    // 分清这两件事要紧 —— 这个脚本的警报一旦掺进「可能只是失效」这种
    // 模棱两可的话，就会变成每次都刷、而没人去看的噪音
    //（项目里栽过：fingerprint 的 MISSING 噪音、check.js 的空装用例）
    notes.push('组合技 0 处 —— **这是对的**：干塘（退潮 × 见底）是全表唯一一个，'
      + '退潮 2026-10-14 删了它就跟着死了。'
      + '这一项要等有人再加组合技才重新有意义')
  } else if (broken === 0) {
    notes.push('组合技 ' + found + ' 处，组成件都在')
  } else {
    notes.push('组合技 ' + found + ' 处，其中 ' + broken + ' 处的组成件已删（见上）')
  }
}

// ---------- 跑 ----------
// ---------- 第九项：**表自身的结构**（2026-10-16 加） ----------
//
// 上面八项查的都是「引用还完整吗」。这一项查的是**表自己有没有被删坏** ——
// 而那是删技能栽的第五种方式，前八项一个都抓不到：
//
// > 删【霜降】时把它的字段（key / name / unlock / first / desc）删了，
// > **却留下了开头那个 `{`**。于是 `DRAW_SKILLS` 里多出一个**空对象项**：
// > 技能图鉴多一行「null 金币」，而 `matches()` 里 `one.name.toLowerCase()`
// > 当场抛 —— **整个查询功能跟着废掉**。
//
// 判据极简：**数「项的开头」和「必填字段」的出现次数，对不上就报。**
// 那次是 35 对 34，差的那一个就是它。比读注释快，而且不会漏。
//
// 为什么不解析 AST：这几张表是 `.uts`（带类型注解），而这个脚本的全部价值
// 就在于**零依赖**（README 那条：`node` 直接跑）。数两个数够用了
const TABLE_SHAPE = [
  { file: 'draw-skills.uts', table: 'DRAW_SKILLS', need: 'unlock:' },
  { file: 'draw-skills.uts', table: 'DEAD_SKILLS', need: 'gone:' }
]

function checkShape() {
  TABLE_SHAPE.forEach(function (one) {
    // **不剥注释**：要数的是真实行里的 `{`，而注释里的花括号剥掉才不干扰。
    // 所以先剥注释，再在剩下的正文里数
    const text = stripComments(read(path.join(GAME, one.file)))
    let at = text.indexOf('export const ' + one.table)
    if (at < 0) at = text.indexOf('const ' + one.table)
    if (at < 0) {
      fail(one.file, '找不到 ' + one.table + ' 那张表', '表改名了？第九项按表名分段')
      return
    }
    const end = text.indexOf('\n]', at)
    const seg = text.slice(at, end < 0 ? text.length : end)
    // 项的开头：行首两个空格加 `{`（三张表都是这个缩进）
    const opens = (seg.match(/\n  \{/g) || []).length
    const needs = (seg.match(new RegExp(one.need.replace(':', ':'), 'g')) || []).length
    if (opens !== needs) {
      fail(one.file, one.table + ' 有 ' + opens + ' 项，但 `' + one.need + '` 只出现 '
        + needs + ' 次',
        '差 ' + Math.abs(opens - needs) + ' 个 —— 多半是删表项时留下了孤立的 `{`'
        + '（删霜降那次就是，后果是技能图鉴多一行「null 金币」+ 查询整个废掉）')
    }
  })
}

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
  checkShape()

  const simOnly = Object.keys(SIM_ONLY)
  if (simOnly.length > 0) {
    notes.push('模拟器专属候选 ' + simOnly.length + ' 件（源码里没有是**有意的** ——'
      + '先量形状再搬进游戏）：' + simOnly.map(function (k) {
        return k + '（' + SIM_ONLY[k] + '）'
      }).join('、'))
  }

  if (bad.length === 0) {
    console.log('✓ 九项全过 —— 没有任何地方引用已删的技能，表自身也没被删坏。')
    notes.forEach(function (n) { console.log('  · ' + n) })
    console.log('\n  查的九处：rules.js 的三张表 / SK · 庄家角色的槽 ·'
      + ' campaign 的池子 · check 的用例 · 所有 desc · SK_* 的登记 · 组合技的依赖'
      + ' · **表自身的结构**（项数 vs 必填字段）')
    return 0
  }

  // 「引用」那个说法对第九项不准（它查的是表结构），所以抬头改成中性的
  console.log('⚠ ' + bad.length + ' 处有问题：\n')
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
