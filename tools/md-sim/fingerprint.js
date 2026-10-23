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
    // 〔`measureFor`（量水）2026-10-16 撤了 —— 实现删了，留着每次报一条
    //   MISSING。照 SUIT_CAPACITY / DECK_PLAY 那两次的办法：**技能一删，
    //   监视名单跟着删**，噪音多了就没人看警报了〕
    //
    // 2026-10-16 补了两个「唯一出口」函数 —— 它们不挂在任何技能上，
    // 所以改了没人会想起来（跟 spreadFire 同一个理由）：
    //   **startCatch / startSweep** —— 收牌特效的两个入口，而
    //     `startSweep` 还带着「演完从哪儿接着走」那个续走参数。
    //     整堆类技能（一色）全靠它，续走点传错的后果是**后面的技能静默丢掉**；
    //   **endPlay** —— 一手牌的唯一收尾（交回合、补牌、判终局都在它后面）
    // 〔2026-10-20 补 `skillsOf`：**「这张牌响哪几件技能」的唯一出口**。
    //   它原先只是 `triggersOf` 的一层薄包装（死水那道闸），所以没盯 ——
    //   而【串钩】上架之后它里头多了一条真规则（命中任一点数槽 → 全响）。
    //   模拟器那边对应的是 `skillsOf` + `addRankLink`，两边分叉了没人会发现〕
    names: ['catchStart', 'canCatch', 'playFor', 'resolveMatch', 'removePileAt',
      'skillsOf',
      'afterPlay', 'afterPlayHead', 'afterPlayTail', 'valuesOf',
      'landVals', 'cardVals', 'anyEquals', 'guardedAgainst', 'finishCatch',
      'pushPile', 'unshiftPile', 'suitifyFor', 'suitLeads', 'pileValsAt',
      'pileSuitAt', 'pileRed', 'takeAt', 'blockedAt', 'rawVals',
      'startCatch', 'startSweep', 'endPlay']
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
    // 〔2026-10-16 补了 `addFrostAt`：它是**贴冰唯一的入口**，
    //   「冰火相消」和「不可叠加」两条规则都只写在它里头 ——
    //   `frostOnLand` 变了会报，可绕过它直接改 `addFrostAt` 原先报不出来。
    //   同一天霜降删了，`frostOnLand` 的第二条来路跟着没了〕
    // 〔2026-10-19 补了三个，都是那次「打出那张自己贴【通配】」改动暴露的：
    //   **addWild** —— 贴通配**唯一的入口**（照 `addFrostAt` 那条理由）。
    //     「不叠加」和「标签跟着牌走」两条都只写在它里头，
    //     而这次改动之后它还是「关键词 → 技能」那条新规则的落点；
    //   **wadeFor / brimFor** —— 顺子那三件里原先只盯了 `straightFor`，
    //     可三件共用一套判定、**各自贴自己的标签**，漏盯两件等于
    //     「同一条规则改了一处、另两处静默留在旧规则上」。
    //     这次正是三处一起改的〕
    names: ['burnStep', 'spreadFire', 'wildfireFor', 'pickBurnAt', 'pileBurnAt',
      'frostAt', 'frostOnLand', 'addFrostAt', 'coldHueOn', 'iceMeltsFire',
      'isWildAt', 'addWild', 'bestChainAt', 'markChain',
      'straightFor', 'wadeFor', 'brimFor',
      'straightCount', 'wadeCount']
  },
  {
    file: 'ap-fishing.uvue',
    group: '技能结算',
    // 〔2026-10-16 从这一组撤了五个 —— 实现全删了，留着只报 MISSING：
    //   `ebbFor`（退潮）/ `ebbTideFor`（干塘）/ `floodFor`（洪水）/
    //   `dumpFor`（掏手）/ `spillFor`（掏库）。
    //   同一天补了两个还活着的叠放函数：**takeStack / cleanAt0** ——
    //   「掀掉一格底下压着的几张」和「某张牌不再是当前牌、在场效果当场失效」
    //   各只有一个出口，而叠放那一族的 bug 全出在这两件事上〕
    // 〔2026-10-16 补了推牌那一族三个（【引潮】/【推牌】当天落地）：
    //   **surgeFor** —— 「从牌库往堆上搬牌」**唯一的入口**，而那一类
    //     改了没人会想起来（跟 spreadFire 同一个理由）。它身上压着四条
    //     判据：传空 skills、撞上置 0、按层推、不走飞牌特效；
    //   **doSurge / surgeLayers** —— 贴标签和读层数。层数是用「同一张牌
    //     在表里出现几次」记的，所以这两个一动，角标和推牌数会一起错〕
    names: ['lowTideFor', 'dropPile', 'dropVals', 'anyLive',
      'hueFor', 'castFor', 'harvestIndices', 'harvestCount',
      'peekFor', 'doPickDeck', 'sinkTops',
      'topCards', 'shuffleBack', 'doFreeze', 'expireHeld', 'heldOn', 'isFrozen',
      'inPile', 'foeOpen', 'foeKnows', 'takeStack', 'cleanAt0',
      'surgeFor', 'doSurge', 'surgeLayers',
      // 【薪潮】贴标签那一步（2026-10-16）。跟 `doSurge` 同级 ——
      // 它是**盲选那条路**唯一的落点，而盲选跟看着挑的区别
      //（走 `fuelPending` 而不是 `takeSkill`）全靠它和调用处那一支撑着。
      // 改错了的表现是**对方手牌被翻开**，而那会静默改掉这件技能的性质
      'doFuel']
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
  },
  {
    file: 'draw-skills.uts',
    group: '阶梯计分',
    // 〔2026-10-23 加〕这三个是 `rules.js:8054` 那三个的手写副本。
    // 盯函数体而不只是 `SCORE_BANDS` 的值，是因为**档位算法本身也会分叉** ——
    // `(n-2)/2` 写成 `(n-1)/2` 的话档值一个字没变，而整套数据全错。
    //
    // ⚠ 唯一有意的差异：模拟器的 `scoreOf` 多一条 `SCORE_BANDS === null → return n`
    //   （env 退回 R3 用的），源码没有 env 所以没有那条。**两边的函数体本来就不同**，
    //   这一组盯的是「源码这边自己别漂」，不是「两边逐字相同」
    names: ['scoreWith', 'scoreOf', 'bandOf']
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
  // 〔`DEEP_EXTRA` 2026-10-23 撤了（深钩删了）—— 同上那条办法。
  //   ⚠ `baseline.json` 里还留着 `"ap-fishing.uvue:DEEP_EXTRA": "1"` 和
  //   skills 串里的 `deephook` / `deepline`，**那是对的**：基线是上一次
  //   拍的快照，它就该反映当时的样子。下一次 `--save` 时自然消失〕
  // 〔DUMP_COUNT / SPILL_COUNT / EBB_COUNT 撤掉了（掏手 / 掏库 / 退潮
  //   三件技能 2026-10-14 删了）—— 照 SUIT_CAPACITY 那次的办法撤，
  //   留着只会每次报一条 MISSING〕
  // SUIT_CAPACITY 删了（花色槽砍成了一个特殊技能槽），所以这儿也撤掉 ——
  // 留着只会每次都报一条 MISSING，而噪音多了就没人看警报了
  // ---- 阶梯计分（R4，2026-10-23 搬进源码）----
  //
  // **跟 `HAND_SIZE` 同级，不是平衡旋钮**：这三个数一改，
  // 整套 X / D / 定价 / 闯关数据**全废** —— 不是「这一件要重定价」，
  // 是全表重量（档值非线性，没法按比例缩）。
  //
  // **模拟器那边是 `rules.js` 的 `SCORE_BANDS` 默认值 `'1,4,12'`，两个必须一样** ——
  // 同 `SURGE_PUSH` ↔ `SURGE_N`、`TAIL_PLAYS` ↔ `TAIL` 那两对的理由。
  // ⚠ 而这一对有个**额外的不对称**：模拟器那边读 env（`SCORE_BANDS=off` 退回 R3），
  //   源码没有 env。所以这一行只盯得住「默认值一样」，盯不住「有人跑 A/B 时搞混」
  { file: 'draw-skills.uts', name: 'SCORE_BANDS' },
  { file: 'draw-skills.uts', name: 'RANK_CAPACITY' },
  { file: 'draw-skills.uts', name: 'BAIT_COUNT' },
  { file: 'draw-skills.uts', name: 'CYCLE_REFILL' },
  // ---- 推牌那两个（2026-10-16）----
  //
  // **`SURGE_PUSH` 跟 `HAND_SIZE` 同级**：它不是平衡旋钮，是结构性的 ——
  // 每层偶数才让「任何叠加都不翻牌库奇偶」成立。改成奇数会把终局那道缝
  // 重新打开（约 0.8 分，见设计文档『终局那两手』），而**整套推牌类的
  // 数据同时作废**。
  //
  // **模拟器那边是 `rules.js` 的 `SURGE_N`，两个数必须一样** ——
  // 这一个动了那一个没跟上的话，`sim.js` 量的就不是游戏里那个机制了
  //（跟 `TAIL_PLAYS` ↔ `TAIL` 同一个理由）。
  { file: 'draw-skills.uts', name: 'SURGE_PUSH' },
  // 引潮贴几层 = 它的强度旋钮（2 层 → X +2.27）。它跟 SURGE_PUSH 不同级：
  // 这个可以调，调了只是这一件重定价
  { file: 'draw-skills.uts', name: 'SURGE_LAYERS' },
  // 逆涌（开河工）一次推牌几层。同 SURGE_LAYERS —— 技能自己的强度旋钮，
  // 2 层是量出来的甜点（效率 1 层 0.197 / 2 层 0.260 / 3 层 0.259）。
  // **模拟器那边是 rules.js 的 JSURGE_LAYERS，两个数必须一样**
  { file: 'draw-skills.uts', name: 'JSURGE_LAYERS' },
  // 薪潮给对方几张手牌贴推牌。**钉死 1，而 N=2 量出来 +4.73 超档** ——
  // 所以改它等于让这件技能出档，而不只是重定价。
  // 模拟器那边是 rules.js 的 FUEL_TAG
  { file: 'draw-skills.uts', name: 'FUEL_TAG' },
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
  if (m) {
    return m[1]
  }
  // ---- `number[]` 那一类〔2026-10-23 加，现在只有 `SCORE_BANDS`〕----
  //
  // 整个字面量当指纹，**空白一律压掉** —— 不然换行或者多一个空格
  // 就报成漂移，而那种噪音多了警报就没人看了（照上面 SUIT_CAPACITY 那条的理由）。
  // 只认一层方括号里没有 `]` 的内容，够用而且不会误吞后面的代码
  const a = new RegExp('const\\s+' + name + '\\s*:\\s*number\\[\\]\\s*=\\s*\\[([^\\]]*)\\]').exec(text)
  if (a) {
    return '[' + a[1].replace(/\s+/g, '') + ']'
  }
  return null
}

// draw-skills.uts 里所有 `key: 'x', name:` 的顺序。
//
// 它一次抓三张**活**表（DRAW_SKILLS、SPECIAL_SKILLS、DRAW_ROLES），
// 因为三张都是这个写法 —— 而那正好是我们要的：模拟器的 SK 是按 key 查的，
// 可表序一变 `all` 的报表顺序就全变；特殊技能和角色的增删也该报出来，
// 好去核对 rules.js 那边的 SP / DRAW_ROLES。
//
// ---- ⚠ 必须跳过 `DEAD_SKILLS`（2026-10-16 修）----
//
// 那张表（已删技能的机器可读名单，`refs.js` 的依据）**用的是同一个写法**，
// 于是它那 16 件被当成「还活着」抓进来 —— 这一项当场报了一次假警报：
// 「技能表变了」，而多出来的正是 boil / spread / spill / dump / … 那一串。
//
// **这是同一个坑的第二次**：`refs.js` 第一版也栽在这儿（而且更糟 ——
// 它把已删技能算成活的，整个检查反了过来）。
//
// 教训是一样的：**同一个数据写法现在出现在四张表里，所以「扫到就算」
// 一定错。** 以后再加这种「key + name」的表，先想一遍谁在扫它。
//
// ---- ⚠ 这个数**不是「几件技能」**（2026-10-16 第三次栽在同一个坑上）----
//
// `--save` 原先印「56 件技能」，而 56 是**三张表的条目数之和**：
//   `DRAW_SKILLS` 34（真正装得进槽的）+ `SPECIAL_SKILLS` 11 + `DRAW_ROLES` 11。
//
// 顺带解释一个对不上的数：`refs.js` 同时印「活着 54 件」—— 它扫的是同样
// 三张表，但它的 `LIVE` 是**字典**（`LIVE[k] = …`），所以重复的 key 塌掉了。
// **差的那 2 个是 `creel` 和 `narrow`**：满篓 / 窄口各自既是一件技能、
// 又是一件常驻特殊技，两张表里都有。56 − 2 = 54，两边都没错，只是口径不同。
//
// 前两次栽在**扫错了表**（把 `DEAD_SKILLS` 当活的），这次栽在**标签**上 ——
// 抓三张表是故意的，可印出来说「件技能」。
// 所以下面分开数、分开印：**这个脚本里凡是跨表汇总的数，标签必须写明口径。**
function skillKeys() {
  const text = read('draw-skills.uts')
  // **挖掉 DEAD_SKILLS 那一段，不是切掉它往后的全部** ——
  // 它在文件中间（`DRAW_SKILLS` 之后、`SPECIAL_SKILLS` 之前），
  // 一刀切会把后两张活表一起丢掉（那会报一串假的「少了 11 件」）。
  // 这一下差点就写错了，而**两种写法的区别只看输出看不出来**
  // —— 错的那版会报「技能表变了」，跟修之前的假警报长得一样
  let live = text
  const at = text.indexOf('export const DEAD_SKILLS')
  if (at >= 0) {
    const end = text.indexOf('\n]', at)
    live = text.slice(0, at) + (end < 0 ? '' : text.slice(end))
  }
  const out = []
  const re = /key:\s*'([a-z0-9]+)',\s*name:/g
  let m
  while ((m = re.exec(live)) !== null) {
    out.push(m[1])
  }
  return out
}

// 按表分别数，只为把 `--save` 那句话印准（见 skillKeys 上面那段）。
//
// **三个数各自都要报**，不只报总和：删一件技能和删一张角色卡都会让总和
// −1，而要核对的东西完全不同（前者改 rules.js 的 SK / SKILLS，
// 后者改 DRAW_ROLES 和庄家的挂关名单）
function tableCounts() {
  const text = read('draw-skills.uts')
  const marks = [
    { name: 'DRAW_SKILLS', label: '技能' },
    { name: 'SPECIAL_SKILLS', label: '常驻特殊技' },
    { name: 'DRAW_ROLES', label: '角色卡' }
  ]
  // 每张表的起点，外加 DEAD_SKILLS —— 它夹在中间，是**边界**不是内容
  const bounds = []
  for (let i = 0; i < marks.length; i++) {
    const at = text.indexOf('export const ' + marks[i].name)
    bounds.push({ at: at, label: marks[i].label })
  }
  const deadAt = text.indexOf('export const DEAD_SKILLS')
  if (deadAt >= 0) bounds.push({ at: deadAt, label: null })
  bounds.sort(function (a, b) { return a.at - b.at })
  const out = []
  for (let i = 0; i < bounds.length; i++) {
    if (bounds[i].at < 0 || bounds[i].label === null) continue
    const end = i + 1 < bounds.length ? bounds[i + 1].at : text.length
    const seg = text.slice(bounds[i].at, end)
    const hit = seg.match(/key:\s*'[a-z0-9]+',\s*name:/g)
    out.push(bounds[i].label + ' ' + (hit ? hit.length : 0) + ' 件')
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
    // 条目总数后面**必须跟着分表的数** —— 「56 件技能」那句话骗过人一次
    //（真正装得进槽的只有 34 件，另 22 个是特殊技和角色卡）
    console.log('已存基准：' + n + ' 个函数、' + Object.keys(now.consts).length
      + ' 个常量、' + now.skills.split(',').length + ' 个表项（'
      + tableCounts().join(' + ') + '）')
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
    console.log('  【三张表变了】（技能 / 常驻特殊技 / 角色卡，按文件顺序串起来）')
    console.log('    基准：' + base.skills)
    console.log('    现在：' + now.skills)
    console.log('    现在的分表：' + tableCounts().join(' + '))
    // **按变的是哪一张分别说** —— 原先一律写「rules.js 的 SK 常量和 SKILLS
    // 表要跟着改」，而那只对第一张表成立。角色卡变了要改的是另外两处，
    // 照那句话去改会白忙一趟（而且会以为自己核过了）
    console.log('    改哪儿看变的是哪一张：')
    console.log('      技能       → rules.js 的 SK 常量和 SKILLS 表（下标必须一一对应）')
    console.log('      常驻特殊技 → rules.js 的 SP 和 SPECIALS')
    console.log('      角色卡     → rules.js 的 DRAW_ROLES，以及庄家挂哪一关'
      + '（draw-levels.uts）\n')
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
