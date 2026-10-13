// 摸打钓鱼 · 对局规则（离线重实现）
//
// 这是 pages/examples/blackjack/ap-fishing.uvue 里那套规则的 node 版本。
// 存在的理由：技能强度要靠跑几万局才定得下来，而 .uvue 跑不起来
// （它是 UTS + Vue 组件，带 ref 和 setTimeout）。
//
// ---- 它是**副本**，所以忠实度是它的全部价值 ----
//
// 每个函数都标了它对应源码里的哪个函数。改游戏规则的时候这边要跟着改 ——
// 跑 `node fingerprint.js` 会告诉你源码里哪几个函数动过了（见 README）。
//
// 没有 npm 依赖（项目的 package.json 里 dependencies 是空的），
// 所以不能 import .uts，只能重写一遍。这是明知的代价。
//
// ---- 这个文件是**接力**改出来的 ----
//
// 动手之前先读 **README 的「同步状态」那一节**：它记着搬到源码的哪个版本、
// 逐项核对过哪些、以及**哪几处差异是故意的**（硬壳、收牌特效、停人等人选…）。
// 不读那一节的话，很容易把有意的简化当成 bug 去「修」，
// 或者把已经搬好的那一段再搬一遍。

// ---------- 牌 ----------

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RANK_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const JACK = 'J'
const RED = ['♥', '♦']
// 零点牌、无点数牌的牌面（照 draw-save 的 ZERO_RANK / BLANK_RANK）。
// valueOfRank 认不出这两个，都回 0；区别在 cardVals：无点数牌是空列表
const ZERO_RANK = '0'
const BLANK_RANK = '-'

// 点数槽能指定的点数：A–10、Q、K。J 不给指定（它本身就通吃）
const SKILL_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K']

const HAND_SIZE = 4
const TIDE_LOOK = 2
const PICK_LOOK = 5

const GUARD_NONE = 0
const GUARD_ME = 1
const GUARD_FOE = 2

// ---------- 叠放：一张牌可以垫在别的牌下面、或者盖在它上面 ----------
//
// 下标照源码的 STACK_*（`ap-fishing.uvue`）。三种各是一件技能的落点：
//   WARD   凝水垫的盾   —— 宿主被收走时它**代替宿主**走，保护少一层
//   BOOST  抬水垫的加点 —— 点数早写进 pileVals 了，这张只是「那几点的来由」
//   BURIED 净水盖的 / 合流吃的 —— 躺在底下攒分，整叠被收走时跟着走
//
// 三种的共同点：**不占堆上的位置**，所以不参与匹配；
// 那一叠被收走的时候跟着走，于是那几分归收走的人
const STACK_WARD = 0
const STACK_BOOST = 1
const STACK_BURIED = 2

// 两方用下标表示：0 = 你，1 = 庄家。
// 源码里是 byFoe 布尔，所以 ME/FOE 和 !byFoe/byFoe 一一对应
const ME = 0
const FOE = 1

// ---------- 技能 ----------
//
// 下标必须和 draw-skills.uts 的 SK_* 完全一致 —— 存档和关卡表存的是下标

// 下标照 draw-skills.uts 的表序。源码那边改成了「key 查下标」
//（SK_HOOK = skillIndexOf('hook')），这边仍然写死 —— 它是个副本，
// 对不上的时候 fingerprint.js 会报「技能表变了」
const SK = {
  HOOK: 0, TIDE: 1, PEEK: 2,
  SWAP: 3, SUITED: 4, LANTERN: 5, FREEZE: 6, LOWTIDE: 7, FLOOD: 8,
  PICK: 9, SUITIFY: 10, SINK: 11, AGAIN: 12,
  // 第二批十一件（照钓鱼的贴纸、排竿的道具移植）
  DEEP: 13, PEAK: 14, HUE: 15, CAST: 16, PRESS: 17, UNHOOK: 18,
  SWAPCARD: 19, NARROW: 20, CREEL: 21, TWIN: 22, SUITFIND: 23,
  // 第三批五件：**抹点数那一族**（压底路线）
  VOID: 24, DUMP: 25, SPILL: 26, ODD: 27, HUEVOID: 28,
  // 第四批三件：**主动控堆**那条新轴
  EBB: 29, MEASURE: 30,
  // 吃水：先在模拟器里量形状，后来进了游戏代码（`draw-skills.uts` 表尾）。
  // 下标 31 两边一致
  DRAFT: 31,
  // 软点（追加 1 点，归深的镜像）、死水（废对手两张手牌）
  SOFT: 32, DEAD: 33,
  // 野火：无点数；获取下一张【野火】；收走堆上带火的，给剩下的和它自己点火
  // 沸水：在场时，落堆的牌都带 1 层火
  //
  // 【燎原】**删了**（2026-10-13）：它的效果（火向左右蔓延）并进了
  //【燃烧】关键词 —— 做成技能不行，**在场效果的强度上限由「它那张牌
  // 活多久」决定**，而堆的换手是 3.3 回合（燎原 X = −1.24）。
  // 删掉它让下面七个下标各减 1（抬水 39→38 一路到探潮 45→44）
  CALM: 34, CLEAN: 35,
  // 【沸水】**删了**（2026-10-13，跟燎原同一轮同一个理由）：
  // 它在场时落堆的牌都带火，而**蔓延并进关键词之后那成了「提前一手」** ——
  // 新落的牌在堆顶、紧挨火线，蔓延一手就覆盖到了，所以那一手的差值是零。
  // 实测四个格子**逐位相同**，X = 0.00，是**可证的零**（不是「量不出来」）。
  //
  // > 关键词吃掉的不只是燎原（跟蔓延重复），还有沸水（蔓延的加速版）——
  // > 而当蔓延本来就快到够用时，加速等于不存在。
  //
  // 删掉它让下面十一个下标各减 1（抬水 38→37 一路到霜降 48→47）
  WILD: 36,
  RAISE: 37, MERGE: 38, DREDGE: 39,
  // 伏流：第四条匹配线（点数 / 花色 / 累加不超 21 / **顺子**）。
  // 它凑顺子时当通配，所以**幅度跟槽标签的大小无关** ——
  // 全表几乎唯一一件这样的。追加在表尾，所以上面的下标一个没动
  FLOW: 40,
  // 涉水：顺子的**步长**放宽到 2（相邻差 1 或 2 都算）。
  // 它是「11 那个洞」的第二条出路 —— 伏流当通配**填**洞，这件**跨**洞
  //（10-12-13 合法，不需要通配）。代价是上端仍偏弱：含 13 的三张链
  // 只有一条，而含 7 的有十几条
  WADE: 41,
  // 探潮（**原型，只在模拟器里，没进游戏**）：从牌库一张张翻到堆上，
  // 翻到跟堆上点数重复的就停、把它洗回牌库；然后按严格连续的顺子收（只收组成顺子的牌）
  PROBE: 43,
  // 对流：打出后**双方各再出 1 张**，而且**对方先出**。
  //
  // 它跟连竿的区别是整件技能的要点：连竿只有自己多打一张（自己送钩点），
  // 这件是「我、对方、我」—— **我的第二张面对对方刚打完的堆**。
  // 那等于人为制造一次「后打」的机会，而后打正是后手优势的来源。
  //
  // 而且双方各消耗一张，所以局面缩短是**对称**的 —— 它可能绕开
  // 连竿撞到的那个天花板（见 AGAIN_SMART 那段）
  CROSS: 42,
  // ---------- 【结冰】那一族：四件 ----------
  //
  // 机制（游戏那边已经实现，见 `draw-levels.uvue` 的 TERMS）：
  //   **堆上**带结冰的牌被收走时**不走也不计分**，而是去掉标签 ——
  //     它照旧能当匹配的那一张（结冰碰的是**收牌**，不是匹配判定）；
  //   **手里**带结冰的牌打出去时，**这一手收牌无视结冰**（钥匙）；
  //   不可叠加；**遇到【燃烧】两个一起消失**。
  //
  // 所以同一个标签在两个位置意思相反：堆上 = 障碍，手里 = 钥匙，
  // 而钥匙穿过去之后落堆又变成障碍。
  //
  // 四件的分工：
  //   结凌   一次铺全场（面）
  //   藏凌   给手里剩下的牌贴冰（**只造钥匙，不铺障碍**）
  //   寒色   在场时你打出的**同颜色**牌自带冰（持续造钥匙）
  //   霜降   在场时落堆的牌都贴冰（持续铺障碍）
  //
  // **全表的 X 都是手算的，一件没量过** —— 这四件就是为了量它们才搬的。
  // 特别要盯 `base` 那六个基线数：堆上常年有冰会让收牌普遍变难，
  // 而「每人每局约 24 分」是全表 X 的共同口径，它一漂别的全要重算
  FROST: 44, HIDE: 45, COLDHUE: 46, FROSTFALL: 47
}

// 【伏流】的顺子最短几张（含它自己）。2 张就是磁钩那条「差 1 也算匹配」
const STRAIGHT_MIN = 3

// ---------- 【伏流】要不要「无点数」这条代价 ----------
//
// 1 = 无点数（顺子是它唯一的钓牌方式，回报是谁也按点数钓不走它）。
// 0（**默认，也是定下来的实现**）= 保留点数，凑不成顺子就退回普通点数匹配。
//
// ---- 量过了：**无点数那条代价它撑不起** ----
//
// 2026-10-12，`vs flow flow` 20000 局，四格（× FLOW_SPAN）：
//
//   VOID  SPAN   后手    溢价
//   1     0      +1.84   +0.15    ← 最初的实现
//   1     1      +2.45   +0.18
//   0     0      +2.72   +0.15
//   0     1      **+3.41**  +0.18 ← **定这一档**
//
// 只有两样都给才落进 3~5 档。两个加强几乎可加（0.88 + 0.61 ≈ 1.49，
// 实测 1.57），没有强烈交互。
//
// 旋钮留着（它还能量「加回代价要配多强的效果」这类问题），
// 但**默认跟游戏代码一致** —— 副本的默认值要是和源码不同，
// 跑出来的数就不是游戏里那件技能的数
const FLOW_VOID = process.env.FLOW_VOID === '1'

// ---------- 【伏流】收「那几张」还是「覆盖的整段」 ----------
//
// 0 = 只收顺子那几张（散收，照收色 / 撒网）。
// 1（**默认，也是定下来的实现**）= 收**顺子覆盖的整段**：
//   从顺子里最深那张到最浅那张，中间的一律带走。
//
// 收整段是**有设计依据的**，不只是为了补强度：伏流的顺子**位置任意**，
// 散收**没用上**摸打那条核心特色 —— 「收牌收的是一段连续的牌，
// 所以堆的顺序本身就是资源」。收整段一下接上那条特色。
//
// 它的风险在同一处：顺子的牌可能散在堆两头，那「整段」就是**整堆**。
// 堆常年 3~5 张厚，所以那个风险是真的 —— 而量出来的 +0.61
// 说明它没失控（真要通吃，这个数会是两三分）
// 2026-10-12 定：伏流、涉水都**只收组成顺子的牌**，不收夹在中间的（FLOW_SPAN=1 才是收整段）
const FLOW_SPAN = process.env.FLOW_SPAN === '1'

// ---------- 【涉水】的顺子要不要**含它自己** ----------
//
// 1（默认，当前实现）= 顺子必须含打出那张的点数。
// 0 = 顺子只看**堆上**那几张，它自己只是触发器（照旧收 [链最深, 堆顶]，
//     所以它自己还是会跟着被收走）。
//
// 为什么值得量：诊断表指出涉水的瓶颈是**凑成率 11%**（伏流 51%），
// 而唯一的原因是「它得用自己的牌面点数刚好接上」。
// 去掉这条约束就直接对准那个瓶颈 —— 剩下的条件是「堆上有 3 张成链」。
//
// 代价是**决策换了一种**：
//   含自己 → 决策是「打哪张」（哪张的点数接得上）；
//   不含自己 → 决策是**时机**（看堆上快成链了才打它）。
// 后者照 13.11【涨落】那条「一件技能第一次有了时机」，是个合法的决策 ——
// 但它和伏流的「用自己当通配主动凑」就**正交**了，那反而是好事
// **默认 0 = 「可以不参与」,那是定稿档**(+2.01)。
// 1 切回「必须参与」那一档(+1.01) —— 它只用来复查那个对照。
//
// 这个默认值**反过错一次**:定稿时改了 `desc` 和注释,却忘了把旋钮的默认
// 从 `!== '0'`(默认 true = own)翻过来。于是 `all` 表里涉水报的是 +1.03
// 而不是 +2.01 —— **那张表把它当成旧档量了**。
// 教训:旋钮的默认值就是「游戏里那件技能的样子」,改定稿必须一起翻
const WADE_SELF = process.env.WADE_SELF === '1'

// ---------- 【野火】走过的那几档，连数一起留着 ----------
//
// 旋钮都删了（`WILD_KEEP`、燃料池 `fuelPool`）—— **留着没人读的旋钮
// 会被当成在生效的设定**，这一季在【涉水】身上栽过一次：
// 定稿改了而默认值没翻，`all` 整张表拿旧档的数定了新档的价。
//
// 数留下来，因为它们是「同一件技能换五种代价」的一组对照：
//
//   原效果（贴火 + 收火，无点数）                 X = **−0.50**
//   ＋连锁（从牌库取一张还能触发它的牌）           X = **+0.46**
//   ＋「没取到就保留点数、只贴火」                  X = **+1.12**
//   ＋【燃烧】自带无点数（锁住，已废 —— 破定稿第 2 条） X = **+3.28**
//   ＋自动蔓延（定稿）                            ← 现在量的是这一档
//
// 贯穿这五档的那个数是**七倍缺口**：贴火 2.11 张/次，收成只有 0.30。
// 前三档都在**降低代价**（止血），只有后两档去动收成那一头 ——
// 而那才是空间所在（0.30 → 2.11）。
//
// 连锁为什么撤：它压的是触发间隔（26 回合 → 1~2），而自动蔓延
// 把那个活接走了，还顺手解掉了「成本跟槽宽挂钩」那个非单调。

// ---------- 【野火】点几张：**1（默认）= 只点它自己** ----------
//
// 1 = 自带【燃烧】（只给它落下的那一格点火）。0 = 点整堆。
//
// **默认是 1,因为那就是野火现在的效果** ——
//
// > **自带【燃烧】；获取下一张【野火】。**
//
// 关键词拿到收割权之后它不收牌了，所以这一句就是全部：点自己 + 续链。
//
//   WILD_SEED=0 node sim.js vs wild wild -n 20000   # 点整堆那一档对照
const WILD_SEED = process.env.WILD_SEED !== '0'

// ---------- 【野火】要不要**获取下一张【野火】**（连锁） ----------
//
// 1（默认）= 带连锁。0 = 只有「自带【燃烧】」一句。
//
// ---- 去掉它预期好三样，所以值得单独量 ----
//
//   **幅度**：带连锁 X = +5.30（略超目标档 +3~+5）。连锁把一次普通出牌
//     （期望 0.94 张）换成一次闭合（扫 1.93 张），净 +1 张 ——
//     所以去掉它该掉 1 分上下，正好落进档里；
//   **说明长度**：缩成一句「自带【燃烧】」，零条件零代价；
//   **宽槽**：燃料池跟槽宽走，而那是量过的爆点
//     （旧设计上 `A` +2.56 / `♥` +7.88 / `3456` **+16.78**）。
//     没有池子就没有那条曲线。
//
//   WILD_CHAIN=0 node sim.js vs wild wild -n 20000
const WILD_CHAIN = process.env.WILD_CHAIN !== '0'

// ---------- 【野火】发动要堆上至少几张（含它自己） ----------
//
// 1（默认）= 无条件。2 = 「场上的牌大于 1 时才点燃自己并续链」。
//
// ---- 它跟 BURN_MIN 挡的**不是同一件事**，这点要分清 ----
//
//   BURN_MIN  挡的是**闭合**（扫堆要堆上够厚）；
//   WILD_NEED 挡的是**点火**（薄堆上压根不点）。
//
// 后者更狠：不点火就**连锁也不续**，所以它同时掐住火种和次数两条。
//
// ---- 两个档位对应「场上的牌」的两种读法 ----
//
//   2 = 落堆**后**的堆 ≥2 → 只挡「落在空堆上」那一种；
//   3 = 落堆**前**的堆 ≥2 → 挡掉**现在的主路径**。
//
// 主路径是量出来的：诊断报「每次扫 1.93 张」，所以它是
//「野火落在 1 张的堆上 → 变 2 张 → 蔓延点着那张 → 2 张闭合」。
// 档位 2 放过这条路，档位 3 才挡得住
const WILD_NEED = process.env.WILD_NEED ? parseInt(process.env.WILD_NEED, 10) : 1

// ---------- 条件**管不管连锁**（两个候选写法的分别） ----------
//
//   1（默认）= 管。「当场上的牌大于 1 时，**点燃自己、获取下一张**」
//              —— 薄堆上这一手什么也不发生，链也断。
//   0        = 不管。「**获取下一张**；当场上的牌大于 1 时，点燃自己」
//              —— 链照续，只是不点火。
//
// 差别实在：档 0 把**次数**那一半保下来了（连锁抬的就是次数），
// 所以它只掐火种、不掐频率。预期档 0 明显强于档 1
const WILD_NEED_CHAIN = process.env.WILD_NEED_CHAIN !== '0'

// ---------- 【燃烧】闭合扫堆的最小张数 ----------
//
// 堆上不够这么多张就不触发闭合。**1 = 定稿口径**（自带火的牌打在空堆上
// 当场收走自己，那是这一族的兜底）。
//
// ---- 它是这条规则的**唯一幅度旋钮**，而且是量出来才知道的 ----
//
// 门槛 1 跑出来 X = **+5.08**（超目标档 +3~+5），而收益**不来自赛跑**：
//
//   每次扫 **1.95 张** —— 闭合发生在薄堆上（基线堆厚 3.1）
//   闭合/局 **2.73** ≈ 野火的触发/局 2.56 —— 几乎每次点火都当场闭合
//
// 实际跑的循环是「扫完堆空 → 下一张自带火的牌落在近乎空的堆上 →
// 当场闭合、收走自己」。那条兜底**每一手都在响**，而一张保底收 1~2 的牌
// 比一次普通出牌的期望（34% × 2.76 = 0.94 张）还好。
//
// 门槛抬高之后兜底就不再每手响，闭合必须真的铺满一个有厚度的堆 ——
// 那时候「火的前沿 +2 / 堆 +1」那场赛跑和奇偶才成为收益来源。
// 先例：【吃水】「堆上不够 2 张就不收」。
//
//   for m in 1 2 3 4; do BURN_MIN=$m WILD_SEED=1 node sim.js vs wild wild -n 20000; done
const BURN_MIN = process.env.BURN_MIN ? parseInt(process.env.BURN_MIN, 10) : 1

// ---------- 【燎原】删了，连它的重做候选【焦壳】一起 ----------
//
// 燎原（在场时火每回合向左右各蔓延一格，不收牌）X = **−1.24**，全表倒数第二。
// 焦壳（在场时带燃烧的牌无点数）协同只有 **+0.08**。
//
// 两件的死因是**同一个**，而那条规律值得记住：
//
// > **在场效果的强度上限由「它那张牌活多久」决定** ——
// > 而堆的换手是 3.3 回合。
//
// 燎原要铺好几个回合才铺得开，焦壳保留点数（为了不撞「绕过争夺」）
// 所以对手一钓锁就解。两件都没来得及生效。
//
// **想要一个稳定生效的全局规则，就得放进关键词，不能挂在一张牌上。**
// 于是蔓延并进了【燃烧】（见 spreadFire），而这两个技能条目都删了

// ---------- 「带燃烧的牌无点数/置 0」：试过，**已废弃** ----------
//
// 旋钮删了（原先是 `BURN_VOID`）。数留着，因为它是整条线上**最高**的一档：
//
//   野火 +0.50 → **+3.28**（标准槽），`♥` +8.70、`3456` +16.33，
//   而且宽槽那个非单调一起消失。
//
// 它为什么还是废了：跟【燃烧】定稿第 2 条**直接冲突** ——
//
//   **燃烧不改变牌的任何其他状态**（点数、花色、在场效果）。
//
// 那一条不是洁癖，它是这一族的**对位解**：带火的牌保留点数，
// 所以对手能**在火烧过来之前把它钓走**。锁住就没有那场抢时间了。
//
// 七倍缺口（贴火 2.11 / 收成 0.30）改由**自动蔓延 + 连锁**补，
// 落在 +2.56（见 spreadFire 和 wildfireFor）。
//
// > 这是这一季少见的一次「**量出来更高的那档反而不要**」——
// > 因为高的那一档买走了互动。

// ---------- 【伏流】能不能**从手里补牌**凑顺子 ----------
//
// 0（默认，当前实现）= 只能用堆上的牌。
// 1 = 顺子缺的那几个点数，**可以从手里拿牌补上**（堆上至少占 1 张）。
//
// ---- 它对准的是这条线的根本瓶颈：薄堆 ----
//
// 诊断表量出来伏流的凑成率只有 51%、涉水 11~25%，而根子是
// 「堆常年 3~5 张厚」（文档第 137 行那条警告）。手牌一补，候选就从
// 「堆上 3~5 张」变成「堆上 3~5 张 + 手里 4 张」—— 直接绕开它。
//
// ---- 它跟【压注】族是同一个结构，所以那节的坑要一起防 ----
//
// 设计文档 15.2 的核心发现：`refill` 每回合末补满，所以**「花一张手牌」
// 不是真代价** —— 它换来多摸一张新牌。于是这个机制的强弱全看一件事：
//
//   FLOW_HAND_SCORE=1（默认）：补进来的牌**算分**（它们是顺子的一部分）。
//   FLOW_HAND_SCORE=0：补进来的牌**离场但不算分**（照凝水 / 净水「丢弃」
//     那个先例：牌出场，谁也收不到）。
//
// 「堆上至少 1 张」那条是闸：不然纯用手牌就能凑顺子，跟堆就脱钩了 ——
// 那样它不再是一件「读堆」的技能。
//
// ---- **FLOW_HAND 是张数上限，不是开关** ----
//
// 第一次量这个机制时只试了「不限张数」那一档（能补几张就补几张），
// 量出溢价 **+3.9**（洪水那个坑）就把整个机制否了。**那是个疏漏** ——
// 溢价来自「消耗手牌 → 牌库消耗快 → 局面短 → 削后手的优势」，
// 而那是个**跟消耗量成比例**的效应，所以**限制张数应该直接压住它**。
//
//   for n in 0 1 2 3; do FLOW_HAND=$n node sim.js vs flow flow -n 20000; done
//
// 要同时看**溢价**和**凑成率**：前者是这个机制的风险、后者是它的收益。
// 那一档的溢价压到 +1 以内而凑成率明显上去，这个机制才算救回来了
const FLOW_HAND = process.env.FLOW_HAND
  ? parseInt(process.env.FLOW_HAND, 10) : 0
// ---------- 补进来的那几张**去哪** ----------
//
// 'score'（默认）—— 算分，它们是顺子的一部分
// 'gone'  —— 离场但不算分（照凝水 / 净水「丢弃」那条先例）
// 'deck'  —— **洗回牌库**
//
// ---- 'deck' 那一档是冲着一条规律去的 ----
//
// 量下来 'score' 和 'gone' 的溢价都是 +4 左右，而诊断表显示伏流的
// **行为在两侧完全对称**（凑成率 71.8% / 68.9%、收成 4.15 / 4.21）。
// 那是洪水那场的复现，而两个案例的共同点不是「消耗牌库」
//（N=1 只耗 1.2 张/局就炸了，N=3 一样），是：
//
//   **它们都让你「收走原本不在堆上的牌」。**
//
// 后手本来钓得更勤（9.7 次 vs 8.1），所以它多收的牌本来大概率也是它的
// —— 边际收益低；先手多收的是后手的。**场内的牌中立，场外进来的牌偏先手。**
//
// 'deck' 把补进来的牌**还回公共牌库**，于是它参与了判定但没被任何人收走
// —— 正好跳出那条规律。代价照旧真实：手牌少一张，而且那张牌回到牌库后
// 对手可能摸到
const FLOW_HAND_FATE = process.env.FLOW_HAND_FATE || 'score'
const FLOW_HAND_SCORE = FLOW_HAND_FATE === 'score'

// ---------- 顺子这条线的**设计空间**：两个有效维度 ----------
//
// 四个维度里有两个被数据筛掉了：
//   **hand（手牌补）否决** —— 它确实解决薄堆（凑成率 51% → 71.5%），
//     可溢价从 +0.19 炸到 +3.9（洪水那个坑：消耗手牌 → 牌库快 → 局面短
//     → 削后手的优势）。用那么大的不对称换 20% 凑成率，不值。
//   **pileMin 自动失效** —— 没有手牌补，顺子的牌只能来自堆上 + 它自己，
//     所以 `onPile >= 1` 恒成立，那个旋钮没有可调空间。
//
// 剩下 self（3 档）× step（2 档）= **6 格**，那就是这条线的全部空间。
// 这两个旋钮用来扫它：
//
//   for s in wild own none; do for p in 1 2; do
//     CHAIN_SELF=$s CHAIN_STEP=$p node sim.js vs flow flow -n 20000
//   done; done
// ---------- 打出后额外从牌库翻几张到堆上，再判顺子 ----------
//
// 0（默认）= 不翻。1 = 翻一张（照 floodFor 的做法：不带技能、走 landVals）。
//
// ---- 这一档是用来**检验那条判据**的 ----
//
// 判据（设计文档检查表）：**那张牌有没有进过堆、对手有没有机会碰它。**
//   进了争夺 → 归属没变，只是时序 → 空（连竿 +0.13、对流 +0.36）
//   绕过争夺 → 归属被单方面定了 → 强且偏先手（洪水 +5.22、手牌补 +5.67）
//
// 翻上来那张**进了堆，可凑成顺子时又被立刻收走** —— 对手连一个回合的
// 机会都没有。所以按判据它属于「绕过争夺」那一组，**预测溢价 ≈ 4**。
//
// 那也正好是洪水的形状（翻牌 → 撞上就收 → 没撞上才留堆上），
// 而洪水量出来是 +4.27。
//
//   for f in 0 1; do CHAIN_FLIP=$f CHAIN_SELF=none node sim.js vs flow flow -n 8000; done
const CHAIN_FLIP = process.env.CHAIN_FLIP
  ? parseInt(process.env.CHAIN_FLIP, 10) : 0

// ---------- 翻上来那几张**要不要留在堆上** ----------
//
// 0（默认）= 照常，凑成顺子就跟着被收走。量出来溢价 **+4.04** ——
//   判据预测的就是这个（它进了堆，却在对手有机会碰之前就被收走）。
// 1 = **只提供点数候选，不进收成**。它留在堆上进入争夺，
//   对手下回合钓得走 —— 于是**不再绕过争夺**。
//
// 这是对判据的**反向检验**：同一个机制，只改「那张牌的归属」这一件事。
// 预测溢价掉回 ±0.5，强度降到 +1.5 上下（它的作用变成纯粹的
// 「把薄堆垫厚一点」，而代价是给对手多放了一张钩点）。
//
//   CHAIN_FLIP=1 CHAIN_FLIP_KEEP=1 CHAIN_SELF=none node sim.js vs flow flow -n 8000
const CHAIN_FLIP_KEEP = process.env.CHAIN_FLIP_KEEP === '1'
const CHAIN_SELF = process.env.CHAIN_SELF || 'wild'
const CHAIN_STEP = process.env.CHAIN_STEP
  ? parseInt(process.env.CHAIN_STEP, 10) : 1
// 【伏流】当前定稿：通配 + 严格连续。扫描时由上面两个旋钮覆盖
const FLOW_OPT = {
  self: CHAIN_SELF, step: CHAIN_STEP, pileMin: 1, hand: FLOW_HAND
}
// 【涉水】当前定稿：不参与（只是触发器）+ 差 2 跨洞。
// 「不参与」那一档是量出来的 —— 用自己的点数只有 +1.01（凑成率 11%），
// 不参与是 +2.01（25%），而且它顺带让幅度跟槽标签彻底无关
// WADE_HAND：最多几张手牌参与顺子（跟 FLOW_HAND 同一个口径），默认 0
const WADE_HAND = process.env.WADE_HAND ? parseInt(process.env.WADE_HAND, 10) : 0
const WADE_OPT = { self: WADE_SELF ? 'own' : 'none', step: 2, pileMin: 1, hand: WADE_HAND }

// ---- 叠放那五件：**搬完了**（2026-10-10）----
//
//   34 CALM   凝水  —— 垫在堆上一张底下当盾（可叠多层，一层扛一次）
//   35 CLEAN  净水  —— 盖在堆上一张上面代替它，被盖那张不再生效
//   39 RAISE  抬水  —— 垫在底下给那张加点数，随即判一次匹配
//   40 MERGE  合流  —— 落堆后把紧挨着的那张叠到自己下面，**追加**它的点数
//   41 DREDGE 抄底  —— 无点数；收走堆上所有被叠放的牌（宿主留着）
//
// 五件共用一整套**叠放模型**（`G.stacked` / `STACK_WARD` / `takeAt` /
// `wardLayers`）—— 牌不再只是「在堆上第几格」，还能垫在别的牌下面、
// 盖在上面。那是一次结构改动，不是五个独立效果，所以它拖了一阵才搬。
//
// ---- 搬法：叠放**没有**变成第七条平行数组 ----
//
// 那是当初估这件事「牵动所有收牌路」的前提，而它是错的 ——
// 叠着的牌**压根不在堆上**，所以 pushPile / removePileAt / 那六条数组
// 一概不用管它。`G.stacked` 是独立的一张表，按**牌对象**认宿主
//（不按下标 —— 堆是 splice 出来的，下标每收一次牌就错）。
//
// 真正要改的只有一处：**收牌之前得先问「这一格底下垫着东西吗」**。
// 为此两条收牌路（区间 `collect`、散收 `harvestPile`）汇到了同一个
// `harvestAt`，它逐格走 `takeAt` —— 那就是源码四条路共用 takeAt 的同一个理由。
//
// ---- 这一轮定下来的五条，照源码硬抄会错 ----
//
//   合流是「**优先**」—— 在钓牌判定**之前**结算（落点在 playFor 尾部，
//     跟染水、燎原同一段）。排到 afterPlay 里去的话它追加的点数这一手
//     就白给了，而那是这件技能的全部。
//   合流追加走 `valuesOf` **那一条**，不是 pileVals —— 判定读的是前者
//     （`catchStart` 里那个 mine）。为此有 `G.mergeCard` / `G.mergeGain`。
//   合流**移掉一个堆位** —— 量水（数张数）和吃水（从堆顶累加）都受影响。
//   抄底排在**技能里的第一件**（量水之后、挂效果那一族之前）：
//     先掀再收，同一手后面的撒网 / 见底才吃得到「宿主裸了」这个好处。
//   抄底掀走抬水垫的那张，它加的点数**不退** —— 照净水那条
//     「清标签不清结果」。退回去就得问「退完撞上谁、要不要再判一次匹配」，
//     那是连锁判定。
//
// ---- 一处**有意的不对等**：三件要挑牌的技能 ----
//
// 凝水 / 净水 / 抬水在源码里要**玩家点堆上一张**，模拟器没有交互，
// 所以两侧都走 `pilePick` 的启发式 —— 跟冻结、换水、择饵一个待遇。
// 于是这三件量出来的是「**启发式打得多好**」，不是「天花板有多高」。
// 抬水那一支算得准（整堆是明的），凝水 / 净水是粗启发式，**读数时记着这条**。
//
// 野火那一支「凝水的保护挡掉点火」也补上了（见 wildfireFor）。
// 删掉的三件：护饵（guard）、钩顶（top）、搅水（stir）。
// 删它们的时候这边的下标全前移了三位 —— 那正是源码改成 key 认身份
// 要避免的事，而模拟器是副本，它只要跟着对齐就行

// 掏手、掏库各掏几张。2 是按手牌 4 张定的 —— 掏一半
const DUMP_COUNT = 2
const SPILL_COUNT = 2
// 退潮：**牌堆顶**几张各减它的牌面点数（照 draw-skills 的 EBB_COUNT）。
// 原先是 2 张、范围是「它自己连左侧两张」
const EBB_COUNT = 3
// 见底：整堆压几点（照 ap-fishing 的 LOW_TIDE_STEP）
const LOW_TIDE_STEP = 1

// 和 DRAW_SKILLS 对齐。name 只用来打印报表。
//
// 原先每行还有 kind（KIND_ANY / KIND_RANK）和 maxLevel —— 两样都删了：
// 源码的 DrawSkill 去掉了 kind（花色槽砍了之后「这件能不能放花色槽」
// 不再是个问题），等级整套也没了。留着它们会让 sim.js 按一个
// 游戏里不存在的模型构配装
const SKILLS = [
  { key: 'hook', name: '磁钩' },
  { key: 'tide', name: '观潮' },
  { key: 'peek', name: '窥视' },
  { key: 'swap', name: '换水' },
  { key: 'suited', name: '顺色' },
  { key: 'lantern', name: '照水' },
  { key: 'freeze', name: '冻结' },
  { key: 'lowtide', name: '见底' },
  { key: 'flood', name: '洪水' },
  { key: 'pick', name: '择饵' },
  { key: 'suitify', name: '一色' },
  { key: 'sink', name: '沉底' },
  { key: 'again', name: '连竿' },
  { key: 'deep', name: '归深' },
  { key: 'peak', name: '齐顶' },
  { key: 'hue', name: '收色' },
  { key: 'cast', name: '撒网' },
  { key: 'press', name: '压舱' },
  { key: 'unhook', name: '摘钩' },
  { key: 'swapcard', name: '对换' },
  { key: 'narrow', name: '窄口' },
  { key: 'creel', name: '满篓' },
  { key: 'twin', name: '同号' },
  { key: 'suitfind', name: '同花' },
  { key: 'void', name: '压邻' },
  { key: 'dump', name: '掏手' },
  { key: 'spill', name: '掏库' },
  { key: 'odd', name: '分水' },
  { key: 'huevoid', name: '封色' },
  { key: 'ebb', name: '退潮' },
  { key: 'measure', name: '量水' },
  // 吃水先在这儿量形状，量完落地进了游戏代码。两边下标一致
  { key: 'draft', name: '吃水' },
  { key: 'soft', name: '软点' },
  { key: 'dead', name: '死水' },
  // ↓ 叠放那五件（凝水 / 净水 / 抬水 / 合流 / 抄底）**搬完了**，
  // 见 SK 表下面那段。其中前三件要挑牌，所以量出来的是「启发式打得多好」
  { key: 'calm', name: '凝水' },
  { key: 'clean', name: '净水' },
  { key: 'wild', name: '野火' },
  // ---- 【燎原】和【沸水】都删了（2026-10-13），同一个理由 ----
  //
  // 蔓延并进【燃烧】关键词之后：
  //   燎原跟蔓延是**同一个效果**（X = −1.24）；
  //   沸水是蔓延的**加速版**（「落堆就带火」vs「下一手带火」）——
  //     而蔓延本来就快到够用，所以加速等于不存在。实测四格**逐位相同**，
  //     X = 0.00，**可证的零**。
  //
  // 两次删除各让后面的下标往前挪一格，SK 表那边一起改了
  //（燎原那次：抬水 39→38 一路到探潮 45→44；
  //   沸水这次：抬水 38→37 一路到霜降 48→47）。
  // 存档存的是 key 字符串，查不到就当空槽，所以老档安全
  { key: 'raise', name: '抬水' },
  { key: 'merge', name: '合流' },
  { key: 'dredge', name: '抄底' },
  { key: 'flow', name: '伏流' },
  { key: 'wade', name: '涉水' },
  { key: 'cross', name: '对流' },
  { key: 'probe', name: '探潮' },
  // 结冰那一族四件。**下标跟 SK 表对齐**（FROST 44 一路到 FROSTFALL 47）——
  // 这张表的位置就是下标，错一个后面全错
  { key: 'frost', name: '结凌' },
  { key: 'hide', name: '藏凌' },
  { key: 'coldhue', name: '寒色' },
  { key: 'frostfall', name: '霜降' }
]

// ---------- 吃水的两个可调旋钮 ----------
//
// 规则：打出后从堆顶往下累加，把总和不超过 DRAFT_CAP 的那几张
// 连它自己一起收走。
//
// **它自己一定算进收成** —— 那不是旋钮，是引擎的形状：resolveMatch
// 把这张牌先拿下来、对剩下的堆判、命中就放回堆顶再收 [at, 顶]，
// 所以它必然在那一段里（跟别的技能一个待遇）。
//
// 三个旋钮：
//   DRAFT_CAP        —— 上限。21 是 blackjack 的锚，但 15 / 18 也量一下
//   DRAFT_COSTS_SELF —— 它自己的点数**吃不吃预算**
//   DRAFT_MIN        —— **堆上至少吃到几张**才算成功（0 = 不设这条闸）
//
// COSTS_SELF 是这件技能**唯一的决策**：吃预算的话，打小牌预算大收得多、
// 打大牌可能一张都收不着（爆）。关掉它，收多少就只由堆决定、
// 你打什么都一样 —— 那就不是一件技能，是一个每回合自动领的红包。
// 所以它**默认开**，关掉那一档只是量出「决策值多少分」。
//
// ---- DRAFT_MIN：**不能只吃 1 张** ----
//
// 「至少吃到 2 张」说的是**堆上那几张**。算自己的话最少永远是 2
//（自己 + 堆上那一张），那就不成闸了。
//
// 立这条的理由跟**收色 / 撒网**那条「只有它自己就什么都不收」一样：
// 不然它就是「稳赚 2 分、零风险」—— 而 21 点里本来也没有
// 「只摸一张就站」这回事。
//
// 手算它把成功率从 ~91% 压到 ~53%、分差从 ~6 压到 ~3.6 分/局
//（正好落进设计文档那个 3~5 的目标），而且**打小牌和打大牌的差距
// 从 1.8 倍拉到 5 倍**（A 成功率 88%、K 只有 17%）——
// 那个反向决策一下变硬了。这几个数要靠模拟器证
//
// 三个旋钮都能用环境变量盖掉，这样扫一遍是一行 shell、不用改文件：
//   for c in 15 18 21; do DRAFT_CAP=$c node sim.js one draft -n 20000; done
//   DRAFT_COSTS_SELF=0 node sim.js one draft -n 20000
//   DRAFT_MIN=0 node sim.js one draft -n 20000     # 不设闸那一档，量它值多少
//
// **环境变量只给模拟器用** —— 游戏代码里这几个会是写死的常量。
// 量完定下哪一档，再落地成常量
const DRAFT_CAP = process.env.DRAFT_CAP
  ? parseInt(process.env.DRAFT_CAP, 10) : 21
const DRAFT_COSTS_SELF = process.env.DRAFT_COSTS_SELF !== '0'
const DRAFT_MIN = process.env.DRAFT_MIN
  ? parseInt(process.env.DRAFT_MIN, 10) : 2

// ---------- 洪水的翻牌上限：**最多翻几张** ----------
//
// 0 = 不设上限（原来的行为：翻到撞上点数、或者牌库见底为止）。
//
// ---- 为什么要这个旋钮 ----
//
// 2026-10-10 量出来洪水**先手 +7.35 / 后手 +3.08**（`vs flood flood`），
// 先手溢价 +4.27 是全表最大的一件（别的件是 −0.01 ~ +0.82），
// 而设计目标是单件 +3~5。
//
// 根子在它那条「堆越空收得越多」的轴上 —— 设计注释早写了「空堆上是
// 一次爆发」，可紧接着说「而『现在堆多厚』是你排牌时就看得见的」，
// 把它当成了玩家的决策。**漏掉的是：先手第一手堆必然是空的。**
// 那不是决策，是白给的时机。
//
// ---- 为什么是「上限」而不是「固定翻 N 张」 ----
//
// 固定翻 N 张会让它退化成【掏库】的变体（掏库 = 从牌库顶掏 2 张扔堆上），
// 而「**你按下去不知道会发生多少**」是设计注释里给洪水标的身份。
// 上限只砍掉**尾巴**：厚堆照旧翻一两张就收（一点没变），
// 空堆的爆发还在、只是不再无限长。那条轴保住了，决策也保住了。
//
// ---- 量完了：**上限这条路治不了不对称，别再试** ----
//
//   N       后手     先手     先手−后手
//   0(不限) +3.08    +7.35    +4.27
//   3       −0.89    +3.59    +4.49
//   4       +0.50    +4.30    **+3.80**
//   5       +1.21    +5.56    +4.35
//   6       +2.04    +6.19    +4.14
//   8       +2.85    +7.06    +4.21
//
// **溢价在所有 N 下都是 +3.8 ~ +4.5，几乎不动。** 上限是整体削弱：
// N=4 能把先手压进 +3~5 档，可溢价还剩 +3.80，而后手从 +3.08 掉到 +0.50
//（N=3 直接变负）。那是治先手的病、伤后手的身。
//
// 旋钮留着（0 = 不限 = 现在的行为），因为它仍然是个**有用的工具旋钮** ——
// 以后要量「翻牌数」这条轴的任何问题都用它。但它**不是洪水的解**
const FLOOD_CAP = process.env.FLOOD_CAP
  ? parseInt(process.env.FLOOD_CAP, 10) : 0

// ---------- 洪水的发动闸：**堆上至少几张才能打** ----
//
// 0 = 不设闸（现在的行为）。
//
// ---- 这个旋钮对准的是上面那条上限治不了的病根 ----
//
// 空堆上打**任何**牌都钓不到（匹配要求堆上有牌）。所以先手第一手的
// **机会成本是 0** —— 本来必然白打一张。而洪水是全表唯一能在空堆上
// 收牌的技能，于是它把那一手从「收 0 张」变成「收 4 张左右」。
//
// 后手第二手堆上已经有牌，本来就能钓 2.75 张，洪水只把它提到 4 ——
// 增量小得多。**所以先手的优势不是「能翻更多」，是「独占了一个
// 机会成本为 0 的时机」。** 上限对两边同等砍尾巴，比例当然不变。
//
// 闸设在**发动条件**上才对得准：堆上不够 FLOOD_MIN 张就不发动
//（那一手洪水白打 —— 跟翻空牌库同一个下场）。
//
// 扫一遍：
//   for m in 0 1 2 3; do FLOOD_MIN=$m node sim.js vs flood flood -n 20000; done
//
// **环境变量只给模拟器用** —— 定下哪一档再落地成游戏代码里的常量
const FLOOD_MIN = process.env.FLOOD_MIN
  ? parseInt(process.env.FLOOD_MIN, 10) : 0

// ---------- 随机数：种子化 ----------
//
// 源码用 Math.random，这边用 mulberry32。理由是**可复现**：
// 同一个种子跑出同一批牌，调完一个数值再跑一遍，差异全来自那个数值
// 而不是来自运气。设计文档 8.9 想要的「种子」也是这个东西

function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng, n) {
  return Math.floor(rng() * n)
}

function pickOne(rng, list) {
  return list[randInt(rng, list.length)]
}

// ---------- 牌与牌组 ----------

// 照 draw-save 的 valueOfRankText：A–K 查表，熔合出来的 '17' 直接读数，零点 / 无点数是 0
function valueOfRank(rank) {
  const at = RANKS.indexOf(rank)
  if (at >= 0) return RANK_VALUES[at]
  const v = parseInt(rank, 10)
  return isNaN(v) ? 0 : v
}

function isRedSuit(suit) {
  return RED.indexOf(suit) >= 0
}

// 这两门花色对出牌那一方算不算同色（照源码的 sameSuit）。
//
// 【两色】（夜钓客带的）把 ♠♣ 并成一门、♦♥ 并成一门。
// 口径跟源码一样只覆盖「匹配类」三处（顺色、收色 + harvestCount、同花），
// 封色（suitSealed）照旧按单门花色算 —— 放大一个禁止类效果等于封掉半副牌
function sameSuit(G, a, b, side) {
  if (a === b) return true
  if (!hasSpecial(G, side, SP.TWOCOLOR)) return false
  return isRedSuit(a) === isRedSuit(b)
}

function makeCard(suit, rank, extra) {
  return { suit: suit, rank: rank, value: valueOfRank(rank), extra: extra || [] }
}

// 标准 52 张（照 draw-save.uts 的 standardDeck：按点数外层、花色内层）
function standardDeck() {
  const out = []
  for (let r = 0; r < RANKS.length; r++) {
    for (let s = 0; s < SUITS.length; s++) {
      out.push(makeCard(SUITS[s], RANKS[r], []))
    }
  }
  return out
}

// Fisher-Yates（照 buildPlainDeck）
function shuffle(rng, list) {
  const out = list.slice(0)
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

// ---------- 特殊技能与角色 ----------
//
// ---- 为什么特殊技能用 key、点数技能用下标 ----
//
// 上面的 SK 是下标表（HOOK: 0、TIDE: 1…），必须和 draw-skills.uts 的表序
// 一字不差 —— triggersOf 返回的是下标数组，而 fingerprint.js 守着那个顺序。
//
// 特殊技能这边是**后搬过来的**，所以直接用 key 认身份（照源码的
// specialIndexOf）。好处是删一件不会错位 —— 而那正是源码当初把技能
// 从数字编号改成 key 的理由。两边不一致是有意的：下标那张表改起来
// 代价太大（每一处 has(skills, SK.X) 都要动），新加的这张没有包袱

const SP = {
  CREEL: 'creel', NARROW: 'narrow', CLEAR: 'clear', DEEPHOOK: 'deephook',
  // 【稳钩】删了（2026-10-13，连带「护饵」那一类效果）。key 留着是因为
  // firmGuardFor 还在，而它现在没有角色带 → 永远不触发。下次清理时
  // 连 FIRM_GUARD / firmGuardFor / pileGuard 那条数组一起删
  FIRMHOOK: 'firmhook', REVERSE: 'reverse', LIVEWATER: 'livewater',
  BAIT: 'bait', TWOCOLOR: 'twocolor', CYCLE: 'cycle', TENS: 'tens',
  // 填塘：堆被清空时从牌库顶补 1 张置 0 的牌。**全表第一件反清场的** ——
  // 它抹掉的是「收光整堆之后对手白打一手」那 +0.94
  FILLPOND: 'fillpond'
}

// 各自那个数（照 SPECIAL_SKILLS 表里挑定的值）
const CLEAR_OPEN = 2      // 清水：对方几张手牌明着
const DEEP_EXTRA = 1      // 深钩：钓到时额外收堆底几张
const FIRM_GUARD = 4      // 稳钩：每局前几张落堆自带护
const LIVE_OPEN = 2       // 活水：牌库顶几张明着
const BAIT_COUNT = 3      // 囤饵：开局塞几张
const CYCLE_REFILL = 6    // 涨落：补牌时补到几张（比 HAND_SIZE 多 2）
// 【死水】废对手几张手牌（照 draw-skills 的 DEAD_COUNT）
const DEAD_COUNT = 2

// 哪几件特殊技能在模拟器里**跑不出效果**，以及为什么。
// 报表里标出来 —— 不标的话那几行会是 0 分差，看着像实现错了。
//
// 【稳钩】不在这儿：它的效果实现了（firmGuardFor），但**没有角色带它**
//（磐石删了），所以它压根不会出现在 roles 那张表里
const SP_NOTE = {
  livewater: 'AI 不读情报（README 第 1 条），所以恒为 0',
  clear: '同上 —— 看得见对方手牌，但 AI 的挑牌不读这个'
}

// 角色表，照 DRAW_ROLES。desc 不搬（报表不用）。
//
// **顺序照源码**，因为 ROLE_UNLOCK 那张平行数组按下标对齐 ——
// 虽然模拟器不管解锁，但跑报表时「第几个角色」要对得上
const DRAW_ROLES = [
  { key: 'basket', name: '背篓渔夫', special: SP.CREEL, slots: ['6 7', '8 9'] },
  { key: 'flood', name: '潮汐观测员', special: SP.LIVEWATER, slots: ['2 4', '6 8'] },
  { key: 'lock', name: '江口闸官', special: SP.NARROW, slots: ['A', '2', '3', '4'] },
  { key: 'upstream', name: '逆流船夫', special: SP.REVERSE, slots: ['5 6 7', '4'] },
  { key: 'mirror', name: '镜湖占卜师', special: SP.CLEAR, slots: ['♥', '3 4'] },
  { key: 'deepline', name: '深海钓手', special: SP.DEEPHOOK, slots: ['♣', 'K'] },
  { key: 'pond', name: '鱼塘老板', special: SP.BAIT, slots: ['7', '3 5', 'K'] },
  { key: 'night', name: '夜钓客', special: SP.TWOCOLOR, slots: ['A', '5', '9'] },
  { key: 'tidal', name: '候潮渔翁', special: SP.CYCLE, slots: ['3 4 5 6', 'K'] },
  { key: 'reckon', name: '赌船荷官', special: SP.TENS, slots: ['10', 'A', '7'] },
  // 填河工：四个**散号**小槽（间距 3~4，磁钩一条链都连不上 ——
  // 照夜钓客那条手法故意堵死点数链）。跟江口闸官是同槽数、反方向的一对
  { key: 'filler', name: '填河工', special: SP.FILLPOND, slots: ['A', '5', '8', 'Q'] }
]
// 角色 key 'flood'（潮汐观测员）和技能 key 'flood'（洪水）撞字 —— 源码里也是这样，
// 两张表独立查，不会串。【稳钩】没有角色带（磐石删了），所以它的效果
// 在这儿实现了但跑不到；【听浪】连着【记谱】一起删了

function roleIndexOf(key) {
  for (let i = 0; i < DRAW_ROLES.length; i++) {
    if (DRAW_ROLES[i].key === key) return i
  }
  return -1
}

// 这一方带的是不是这件特殊技能（照 hasSpecial）
function hasSpecial(G, side, sp) {
  const r = G.roles[side]
  if (r < 0 || r >= DRAW_ROLES.length) return false
  return DRAW_ROLES[r].special === sp
}

// ---------- 配装 ----------
//
// 照 draw-skills.uts：suitOwner 和 SUITS 对齐、rankOwner 和 SKILL_RANKS 对齐，
// -1 是空着。
//
// ---- 这一层整个重做过 ----
//
// 原先是 putSuit / putRank / suitSizeOf / rankSizeOf / partnerSuit +
// 一个 levels 数组，模型是「一件技能升到几级、因此占几格」。
// 源码那边**花色槽砍了、等级整套删了**，现在是「角色卡的槽上印死标签，
// 技能插进去就管那几个标签」。所以那五个函数和 levels 全删了 ——
// 留着它们只会让 sim.js 按一个游戏里不存在的模型构配装（README 第 7 条）

function emptyLoadout() {
  return {
    suitOwner: [-1, -1, -1, -1],
    rankOwner: SKILL_RANKS.map(function () { return -1 })
  }
}

// 一个槽上印着哪几样，空格分隔（照 slotLabels）
function slotLabels(slot) {
  return slot.split(' ').filter(function (s) { return s !== '' })
}

// 槽上印的是花色吗（照 isSuitSlot）
function isSuitSlot(label) {
  return SUITS.indexOf(label) >= 0
}

// 一个槽盖住多少张牌：花色 13、点数 4（照 slotCover）
function slotCover(slot) {
  const labels = slotLabels(slot)
  let n = 0
  for (let i = 0; i < labels.length; i++) {
    n += isSuitSlot(labels[i]) ? 13 : 4
  }
  return n
}

// 这个角色一共盖住多少张（照 roleCover）。
// 它是比较角色强弱时唯一可比的那个数 —— 但有一个已知反例【夜钓客】，
// 见源码 rollRoleKit 上面那段
function roleCover(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return 0
  const slots = DRAW_ROLES[role].slots
  let n = 0
  for (let i = 0; i < slots.length; i++) {
    n += slotCover(slots[i])
  }
  return n
}

function roleSlotCount(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return 0
  return DRAW_ROLES[role].slots.length
}

// 角色 + 每个槽嵌了什么 → loadout（照 kitFromRole / kitFromSlots）。
// slotSkills[i] 是第 i 个槽里那件技能的下标，-1 = 空槽。
//
// **一个槽可能印着好几样**（'2 3'、'5 6 7'），那就每一样都落一格 ——
// 嵌进那个槽的技能因此同时管那几个点数
function kitFromRole(role, slotSkills) {
  const lo = emptyLoadout()
  if (role < 0 || role >= DRAW_ROLES.length) return lo
  const slots = DRAW_ROLES[role].slots
  for (let i = 0; i < slots.length && i < slotSkills.length; i++) {
    const skill = slotSkills[i]
    if (skill < 0) continue
    const labels = slotLabels(slots[i])
    for (let j = 0; j < labels.length; j++) {
      if (isSuitSlot(labels[j])) {
        lo.suitOwner[SUITS.indexOf(labels[j])] = skill
      } else {
        const at = SKILL_RANKS.indexOf(labels[j])
        if (at >= 0) lo.rankOwner[at] = skill
      }
    }
  }
  return lo
}

// 【囤饵】往牌库塞哪个点数：这个角色**第一个数字槽**上的第一个标签
//（照 baitRankOf）。跳过花色槽 —— 「插入 4 张 ♥」没有意义
function baitRankOf(role) {
  if (role < 0 || role >= DRAW_ROLES.length) return ''
  const slots = DRAW_ROLES[role].slots
  for (let i = 0; i < slots.length; i++) {
    const labels = slotLabels(slots[i])
    for (let j = 0; j < labels.length; j++) {
      if (!isSuitSlot(labels[j])) return labels[j]
    }
  }
  return ''
}

// 打这张牌会触发哪几个技能（照 triggersOf）。最多两个：花色槽一个、点数槽一个
function triggersOf(lo, card) {
  const out = []
  // J 只有通吃，不触发任何技能（照 draw-skills 的 triggersOf）
  if (card.rank === JACK) return out
  const s = SUITS.indexOf(card.suit)
  if (s >= 0 && lo.suitOwner[s] >= 0) {
    out.push(lo.suitOwner[s])
  }
  const r = SKILL_RANKS.indexOf(card.rank)
  if (r >= 0 && lo.rankOwner[r] >= 0 && out.indexOf(lo.rankOwner[r]) < 0) {
    out.push(lo.rankOwner[r])
  }
  return out
}

function has(list, skill) {
  return list.indexOf(skill) >= 0
}

// ---------- 【死水】废掉的那几张牌 ----------
//
// 存**牌对象的引用**（那几张会在手牌 / 堆 / 牌库之间流转，对象身份不变）。
// 一局一清 —— 它是「本局」效果，而牌组每局重建但对象是同一批。
//
// 为什么不走 held：held 那一族的解除条件是「效果牌离场」，而死水**不可解**
//（废牌打出去就清掉了，所以不需要解法 —— 规格见 draw-skills 那条）

function isDead(G, card) {
  return G.dead.indexOf(card) >= 0
}

// ---- 这儿曾经有个 `isBlank`（「点数失效但技能照旧触发」的标记）----
//
// 删了。留一句记着：真要那种语义，**不能用 rank='-' 实现** ——
// 那会连 rank 一起改掉，于是那张牌再也触发不了它原本那个点数槽。
// 死水的 `G.dead` 也不行（它同时掐掉技能触发）。全表现在没有这种语义

// 打出这张牌会触发哪几件技能（照源码 ap-fishing 的 skillsOf）。
//
// **死水废掉的牌一件都不触发** —— 这是「废牌」的一半，
// 另一半是点数算 0（在 valuesOf 里）。
// 只写 valuesOf 那一半不够：triggersOf 读的是 suit 和 rank，跟点数无关，
// 所以一张被置 0 的 7 照旧会触发 7 槽上那件技能。
//
// 分两层是照源码的结构：triggersOf 在 draw-skills.uts（纯函数、只看配装），
// skillsOf 在 ap-fishing.uvue（查死牌再调它）
function skillsOf(G, side, card) {
  if (isDead(G, card)) return []
  return triggersOf(G.loadouts[side], card)
}

// 废掉对方第 index 张手牌。side = 发动方。
//
// 两条排除（跟 deadPool 一致，两条路都得过这道闸）：
//   **J 不能挑** —— J 的通吃认 rank 不看点数，所以废牌还得显式禁通吃；
//     而一旦能禁，看得见手牌的一方就会专挑 J（占全部钓牌的 22%，
//     废一张约值 5 分）—— 单这一下就超标；
//   **已经废过的不再挑** —— 不然两张会挑中同一张
function doDead(G, side, index) {
  const other = side === ME ? FOE : ME
  const theirs = G.hands[other]
  if (index < 0 || index >= theirs.length) return
  const card = theirs[index]
  if (card.rank === JACK || isDead(G, card)) return
  G.dead.push(card)
}

// 挑得动的那几张的下标（side = 发动方，挑的是对面的手牌）
function deadPool(G, side) {
  const other = side === ME ? FOE : ME
  const theirs = G.hands[other]
  const out = []
  for (let i = 0; i < theirs.length; i++) {
    if (theirs[i].rank === JACK || isDead(G, theirs[i])) continue
    out.push(i)
  }
  return out
}

// 一个角色 + 一件技能：把那件技能嵌进**指定的**那个槽，其余槽空着。
//
// 这是量单件技能的标准装法 —— 槽是角色印死的，所以「这件技能管哪几张牌」
// 由 (角色, 槽号) 唯一确定，不像从前那样要摇位置。
// 槽号越界就返回空配装（那样跑出来一定是 0 分差，看报表能发现）
function kitWithOne(role, slotAt, skill) {
  const n = roleSlotCount(role)
  const picks = []
  for (let i = 0; i < n; i++) {
    picks.push(i === slotAt ? skill : -1)
  }
  return kitFromRole(role, picks)
}

// 这个技能在这套配装里管着哪几张标签，写成「♥ 5 7」（照 coverageText）
function coverageOf(lo, skill) {
  const out = []
  for (let i = 0; i < lo.suitOwner.length; i++) {
    if (lo.suitOwner[i] === skill) out.push(SUITS[i])
  }
  for (let i = 0; i < lo.rankOwner.length; i++) {
    if (lo.rankOwner[i] === skill) out.push(SKILL_RANKS[i])
  }
  return out.join(' ')
}

// ---------- 对局状态 ----------

function newGame(opts) {
  const rng = opts.rng
  const deck = shuffle(rng, opts.deck || standardDeck())
  const G = {
    rng: rng,
    deck: deck,
    // 两方的手牌、以及「这张被对方看见了吗」
    hands: [[], []],
    seen: [[], []],
    pile: [],
    // 堆上每张的：谁打的、被谁护着、现在算哪几个点数、现在算什么花色、
    // 带着几层【燃烧】。**六条并行数组**，少一条就错位（见 pushPile）
    pileByFoe: [],
    pileGuard: [],
    pileVals: [],
    pileSuit: [],
    pileBurn: [],
    // 已经被钓走的点数（庄家记牌要用）
    gone: [],
    score: [0, 0],
    // 挂在牌上的效果：{ source, skill, target, side }
    held: [],
    // ---- 叠放：{ host, card, kind } —— **存牌对象引用，不存下标** ----
    //
    // 存下标会在每次收牌后全错位（堆是 splice 出来的），而 host 认牌对象
    // 就不用管堆怎么动。源码那边同理。
    //
    // 它**不是第七条平行数组** —— 叠放的牌压根不在堆上，所以 pushPile /
    // collect / removePileAt 那几条不用管它。要管的只有收牌：
    // 收走一格之前得先问「它底下垫着东西吗」（见 takeAt）
    stacked: [],
    // ---- 【合流】这一手吃到的那几个点数 ----
    //
    // 它追加的点数要落到两个地方，而两个地方读的东西不一样：
    //   堆上「现在算几点」—— pileVals，mergeFor 直接改；
    //   这一手的**钓牌判定** —— valuesOf，走牌自己的点数，**不读 pileVals**。
    // 所以留这一对让 valuesOf 看得见。mergeCard 是身份闸：
    // AI 挑牌时 catchStart 一回合要跑十几次（那是落堆前的预估），
    // 不认牌的话别的牌会白捡上一手的点数。照源码的 mergeCard / mergeGain
    mergeCard: null,
    mergeGain: [],
    // 连竿的两个标记（照源码的 againPending / againUsed）：
    //   pending —— 刚打那张触发了连竿，还没兑现；
    //   used    —— 这个回合已经加打过一次，加打的那张不再给加打
    againPending: false,
    againUsed: false,
    // ---- 【对流】的状态机：「我、对方、我」那三步 ----
    //
    //   0 = 没在走这条路
    //   1 = 刚打完对流那张，**等对方插一张**
    //   2 = 对方插完了，**等发动方再打一张**
    // forceBy 记发动方 —— 第 2 步要交回给它，而那时 passTurn 的 side 是对方
    //
    // 一回合只发动一次（forceUsed），理由跟连竿的 againUsed 一样：
    // 不封的话两件撞在一张牌上能把半副牌一口气打完
    forceStep: 0,
    forceBy: -1,
    forceUsed: false,
    // ---- 【结冰】那一族的两个状态 ----
    //
    // **frostHand** —— 手里带着冰的那几张（对象引用）。
    //   为什么不挂进 held：`expireHeld` 按「source 还在不在堆上」过滤，
    //   挂进去的手牌冰**会在下一次收牌后被立刻清掉**。而那条闸是所有
    //   在场效果共用的，为一个机制放宽它的语义，以后别的效果会跟着漏。
    //
    // **iceBlind** —— 这一手的收牌无视结冰（钥匙生效中）。
    //   回合级：playFor 开头按「打出的那张手里带不带冰」重设，
    //   harvestAt 收完立刻清（不然走水 / 过闸那类**对手侧**的收牌会蹭上）
    frostHand: [],
    iceBlind: false,
    // 【死水】废掉的那几张牌（对象引用）。一局一清 —— G 每局新建，所以自动
    dead: [],
    // 【野火】那个「这一手取到燃料了吗」的状态位**删了**（2026-10-13）——
    // 连锁撤掉了（蔓延接走了压间隔那个活），而无点数回到无条件，
    // 所以 valuesOf 不再需要认牌。留着一个没人读的状态位比删掉更误导
    loadouts: [opts.mine, opts.foe],
    // 两方的角色（DRAW_ROLES 下标，-1 = 不带角色）。那件常驻特殊技能
    // 靠它现查 —— 见 hasSpecial。
    //
    // 原先这儿是个 twocolor: [bool, bool] 的权宜之计（当时只接了一件
    // 特殊技能，为那一个布尔搬整套角色卡不值）。现在整套搬过来了
    roles: [
      opts.myRole === undefined ? -1 : opts.myRole,
      opts.foeRole === undefined ? -1 : opts.foeRole
    ],
    // 这一方会不会记牌（关卡表的 smart）
    smart: [opts.mineSmart !== false, opts.foeSmart !== false],
    // 统计。plays 兼作【稳钩】的计数（照源码 myPlayed / foePlayed）
    stat: {
      plays: [0, 0], catches: [0, 0], caught: [0, 0],
      jackCatches: [0, 0], skillCatch: [0, 0], turns: 0,
      // ---- 【洪水】的诊断口（2026-10-10 加的）----
      //
      // 加它的理由值得写下来：洪水的先手溢价 +4.27 是全表最大的，
      // 而**连着两个机制诊断都猜错了**（翻牌上限、发动闸，两张扫描表
      // 见 FLOOD_CAP / FLOOD_MIN 那两段）。猜第三次不如把内部状态量出来。
      //
      // 要回答的是「先手的洪水到底在什么局面下发动、收多少」：
      //   fires   —— 发动几次
      //   pileSum —— 发动时堆上共几张（÷fires = 平均堆厚，**含它自己**）
      //   flipSum —— 共翻上去几张
      //   gotSum  —— 共收走几张
      //   thin    —— 其中「堆上只有它自己」那种（= 空堆开局）发动几次
      //
      // 后三个是**第四轮**定位加的：前三轮（翻牌上限、发动闸、局面长度）
      // 全被数据否掉了，而否证把范围收窄到了「收走的那几张**本来属于谁**」：
      //   gotFresh  —— 这次洪水**刚从牌库翻上来**的（本来不属于任何人）
      //   gotOwn    —— 堆上原有、而且是**自己**打出的饵（= 自己抢自己）
      //   gotTheirs —— 堆上原有、**对方**打出的饵（= 真的抢到了对手的）
      // 三个加起来等于 gotSum
      flood: {
        fires: [0, 0], pileSum: [0, 0], flipSum: [0, 0],
        gotSum: [0, 0], thin: [0, 0],
        gotFresh: [0, 0], gotOwn: [0, 0], gotTheirs: [0, 0]
      },
      // ---- 顺子那两件的诊断口（2026-10-12 加的）----
      //
      // 涉水量出来 +1.01（目标 3~5），而「收整段」只补了 0.20、
      // 「取收得更多的」一分没补。**两个加强都打偏了**，说明瓶颈
      // 既不在收多少、也不在选错 —— 剩下的候选是发动率，或者
      // 「收的那几张本来也是自己能钓到的」（洪水那场查出来的那个机制）。
      //
      // 两件一起记才有对比:伏流 +3.49 达标、涉水 +1.01 不达标,
      // 而它们只差「怎么凑」—— 差在哪一列,这张表会直接说出来。
      //
      //   fires —— 打出带它的牌几次
      //   hits  —— 其中凑成顺子几次（fires − hits = 凑不成的）
      //   lenSum —— 凑成的那几次，顺子一共几张（÷hits = 平均链长）
      //   gotSum —— 实际收走几张（÷hits = 每次收成）
      straight: {
        fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0]
      },
      wade: {
        fires: [0, 0], hits: [0, 0], lenSum: [0, 0], gotSum: [0, 0]
      },
      // ---- 【野火】的诊断口（2026-10-13 加的）----
      //
      // 要查的是一个**非单调**：燃料池越宽，分数先降后升 ——
      //   `A`（4 张池）    X = +0.50
      //   `♥`（12 张池）   X = **−2.93**
      //   `3456`（16 张池）X = −0.52
      //
      // 而 12 张那一档的失败形状跟 16 张那一档**不一样**：
      //   `♥`    和（双方总收牌）几乎没动，我 −1.56 / 对手 +1.66 → **纯转移**
      //   `3456` 和 +0.71、堆上剩 −0.71 → 扫堆真的在干活，只是我没分到
      //
      // 已经证伪的解释：「♥ 横跨全部点数所以作废了好牌」——
      // 纯点数相等匹配下**没有好牌坏牌**（四张一类、完全对称），
      // 而且只装一件时别的技能（量水要小点数、吃水要大点数、退潮按牌面减）
      // 都不在场。所以不再猜，改成量。
      //
      //   fires  —— 打出带野火的牌几次（= 触发率，跟池子宽度挂钩）
      //   took   —— 其中成功获取到燃料几次（fires − took = 池子空了的次数）
      //   blank  —— 因此变成无点数的牌几张（= 自残的量）
      //   burnSum —— 累计贴了几张火（跟堆的厚度挂钩）
      //   reapSum —— 扫堆实际收走几张（= 真正的收成）
      //   reapOwn / reapTheirs —— 收走的里面几张是自己的饵、几张是对手的
      //     （照 flood 那三列的先例：「收到的是不是本来也归我」是
      //      洪水那场查出来的那个机制，这儿要先排除它）
      wild: {
        fires: [0, 0], took: [0, 0], blank: [0, 0], burnSum: [0, 0],
        reapSum: [0, 0], reapOwn: [0, 0], reapTheirs: [0, 0],
        // ---- 【燃烧】闭合扫堆的两个数（2026-10-13 加）----
        //
        //   sweeps   —— 闭合了几次（= 这条规则发动的频率）
        //   sweepSum —— 累计扫走几张（÷sweeps = 每次扫多厚的堆）
        //
        // 要回答的那个问题是**对称性**：双方抢同一个池子，
        // 两边的 sweeps 差不多就说明它washed out、净值趋零。
        // 那是这条规则唯一的真未知
        sweeps: [0, 0], sweepSum: [0, 0]
      }
    },
    rankTotal: {},
    over: false
  }
  // ---- 【囤饵】：开局往牌库塞牌，**必须排在 rankTotal 之前** ----
  //
  // 照源码 baitFor 的位置（在 buildRankTotals 之前）。排在后面的话
  // 庄家的记牌（outsideCount 读 rankTotal）会漏掉塞进去的那几张 ——
  // 那等于给对手一份错账，而不是给自己一个优势
  baitFor(G, ME)
  baitFor(G, FOE)
  // 每个点数一共几张（照 buildRankTotals）—— 改造过的牌组不是恒定的 4 张
  for (let i = 0; i < G.deck.length; i++) {
    G.rankTotal[G.deck[i].rank] = (G.rankTotal[G.deck[i].rank] || 0) + 1
  }
  // 开局各发满 HAND_SIZE，庄家先发、交替（照 newGame 末尾那个循环）
  for (let i = 0; i < HAND_SIZE; i++) {
    drawFor(G, FOE)
    drawFor(G, ME)
  }
  return G
}

// 【囤饵】：往牌库塞 BAIT_COUNT 张「这一方第一个数字槽那个点数」的牌，再洗。
//
// 花色随便挑一门（源码那边也是循环着取），因为这件技能卖的是点数 ——
// 塞进去的牌花色是什么不影响它要解决的事（那个槽的触发率）
function baitFor(G, side) {
  if (!hasSpecial(G, side, SP.BAIT)) return
  const rank = baitRankOf(G.roles[side])
  if (rank === '') return
  const add = []
  for (let i = 0; i < BAIT_COUNT; i++) {
    add.push(makeCard(SUITS[i % SUITS.length], rank, []))
  }
  G.deck = shuffle(G.rng, G.deck.concat(add))
}

// 从牌库顶摸一张。**数组末尾是牌库顶**（照 drawFor 的 pop）
function drawFor(G, side) {
  if (G.deck.length === 0) return null
  const card = G.deck.pop()
  G.hands[side].push(card)
  G.seen[side].push(false)
  return card
}

function takeFromHand(G, side, index) {
  const card = G.hands[side][index]
  G.hands[side].splice(index, 1)
  G.seen[side].splice(index, 1)
  return card
}

// 新进场的牌带几层火。
//
// 【沸水】删了（在场时落堆的牌都带 1 层），所以现在**恒为 0** ——
// 新落的牌一律不带火，要等蔓延烧过来（下一手）。
//
// **函数留着**，而且这不是手松了：它是那四条进场路的**单一入口**
//（正常打出、洪水翻上来、掏手 / 掏库扔上去），而「新牌带不带火」
// 是这一族最可能再次被设计的那个旋钮。
// 留着它，下一件要动这个的技能只改一处；删了就得重新把四条路找一遍
function burnOnLand(G) {
  return 0
}

// 场上挂着这件技能的效果吗（不分哪一方）。
// heldOn 要指定 side，而沸水、压邻那几件是「谁挂的都一样管」
function heldAny(G, skill) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === skill && inPile(G, G.held[i].source)) return true
  }
  return false
}

// ---------- 叠放那一族的六个小工具（照源码同名函数） ----------
//
// 全部按**牌对象**认身份，不按下标 —— 堆每收一次牌下标就变，
// 而叠放的关系不该跟着变

// 第 i 张底下垫着几层**盾** —— 它还能扛几次
function wardLayers(G, i) {
  if (i < 0 || i >= G.pile.length) return 0
  const card = G.pile[i]
  let n = 0
  for (let k = 0; k < G.stacked.length; k++) {
    if (G.stacked[k].kind === STACK_WARD && G.stacked[k].host === card) n++
  }
  return n
}

function wardAt(G, i) {
  return wardUnder(G, i) >= 0
}

// 垫在第 i 张底下那个盾在 G.stacked 里的下标，-1 = 没有。
//
// 返回下标而不是 bool，因为收牌那一下要把它**取出来**（它代替宿主被收走）。
// 叠了多层就**每次取一个** —— 取哪个无所谓，它们都只是一张盾
function wardUnder(G, i) {
  if (i < 0 || i >= G.pile.length) return -1
  const card = G.pile[i]
  for (let k = 0; k < G.stacked.length; k++) {
    if (G.stacked[k].kind === STACK_WARD && G.stacked[k].host === card) return k
  }
  return -1
}

// 第 i 张底下压着几张**不算盾的**（抬水垫的 / 净水埋的 / 合流吃的）。
// 它回答「收走这一叠值几分」—— 盾不算，因为盾不是收成，它是「还得再收一次」
function underCount(G, i) {
  if (i < 0 || i >= G.pile.length) return 0
  const card = G.pile[i]
  let n = 0
  for (let k = 0; k < G.stacked.length; k++) {
    if (G.stacked[k].host === card && G.stacked[k].kind !== STACK_WARD) n++
  }
  return n
}

// 把第 i 张那一叠底下的牌**全取出来**（收整叠时用）。
// 顺带从 G.stacked 里摘掉 —— 返回的那几张要算分、要进 G.gone
function takeStack(G, i) {
  if (i < 0 || i >= G.pile.length) return []
  const card = G.pile[i]
  const out = []
  const keep = []
  for (let k = 0; k < G.stacked.length; k++) {
    if (G.stacked[k].host === card) out.push(G.stacked[k].card)
    else keep.push(G.stacked[k])
  }
  if (out.length > 0) G.stacked = keep
  return out
}

// 摘掉 G.stacked 里第 at 条，返回那张牌（保护被消耗时用）
function pullStacked(G, at) {
  if (at < 0 || at >= G.stacked.length) return null
  const card = G.stacked[at].card
  G.stacked = G.stacked.filter(function (x, k) { return k !== at })
  return card
}

// 宿主离场了的，整叠跟着清 —— 不然那几张永远留在 G.stacked 里。
// 跟 expireHeld 一个道理，所以每次收完牌一起调
function expireStacked(G) {
  G.stacked = G.stacked.filter(function (s) { return inPile(G, s.host) })
}

// 按**牌**清掉它名下的在场效果（照源码 cleanAt0）。
//
// 净水盖住一张、合流吃掉一张之后要清被埋那张的效果，而那时它
// 已经不在堆里了，按下标找不着。返回清掉几条
function cleanAt0(G, card) {
  const before = G.held.length
  G.held = G.held.filter(function (h) { return h.source !== card })
  return before - G.held.length
}

// ---------- 收走第 i 格之前，先过一遍叠放（照源码 takeAt） ----------
//
// **两条收牌路全走它**（collect 走区间、harvestPile 走散收）——
// 这段逻辑写两遍必有一遍写错，而写错的表现是「牌没了但分没加」
// 或者反过来，都是静默的。
//
// 它干两件事，返回**这一格实际收走几张**：
//
//   带保护 → 取走垫着的一张盾（代替宿主），返回 1。
//     **宿主留下** —— 所以调用处要先问 wardAt 再决定留不留，
//     不能看返回值（返回 1 的两种情况不一样）。
//   没保护 → 宿主 + 底下压着的全收，返回 1 + 那几张。
//
// gone 是出参：离场那几张的 rank 往里推（庄家记牌的依据）。
// **算分和记牌口径一致** —— 推进 gone 的张数就是返回的张数
// ---------- 【结冰】：挂在 held 里（堆上）+ 一个引用表（手里）----------
//
// 两个位置意思相反，见 SK 表里那段。下面六个函数照源码搬：
// frostAt / frostOn / clearFrostAt / addFrostAt / iceMeltsFire / frostOnLand
function frostAt(G, i) {
  if (i < 0 || i >= G.pile.length) return false
  return frostOn(G, G.pile[i])
}

function frostOn(G, card) {
  for (let k = 0; k < G.held.length; k++) {
    if (G.held[k].skill === SK.FROST && G.held[k].source === card) return true
  }
  return false
}

function clearFrostAt(G, i) {
  if (i < 0 || i >= G.pile.length) return false
  const card = G.pile[i]
  const before = G.held.length
  G.held = G.held.filter(function (h) {
    return !(h.skill === SK.FROST && h.source === card)
  })
  return G.held.length !== before
}

// 贴冰的**唯一入口**。两道闸都在这儿：
//   碰上【燃烧】→ 两个一起消失（清火、不贴冰）；
//   **不可叠加** → 已经带冰就什么也不做
function addFrostAt(G, i, side) {
  if (i < 0 || i >= G.pile.length) return false
  if (pileBurnAt(G, i) > 0) {
    G.pileBurn[i] = 0
    return false
  }
  if (frostAt(G, i)) return false
  G.held.push({ source: G.pile[i], skill: SK.FROST, target: null, side: side })
  return true
}

// 冰火相消的另一个方向：贴火之前问一句。
// 有冰 → 清掉冰、返回 true，调用处就**不贴火**
function iceMeltsFire(G, i) {
  if (!frostAt(G, i)) return false
  clearFrostAt(G, i)
  return true
}

// 这一手打出的牌**自带结冰**吗（这一族的共同签名）。
// 打出时它在手里就带着 → 豁免；落堆后变成障碍
function selfFrost(lo) {
  return has(lo, SK.FROST) || has(lo, SK.HIDE)
    || has(lo, SK.COLDHUE) || has(lo, SK.FROSTFALL)
}

function frostOnHand(G, card) {
  for (let k = 0; k < G.frostHand.length; k++) {
    if (G.frostHand[k] === card) return true
  }
  return false
}

function addFrostHand(G, card) {
  if (frostOnHand(G, card)) return
  G.frostHand.push(card)
}

// 落堆那一下：**钥匙变成障碍**。两条来路都汇到这儿
//（手里带着的、以及场上有【霜降】），所以 pushPile / unshiftPile 各加一行
function frostOnLand(G, card, side, at) {
  const hand = frostOnHand(G, card)
  if (hand) {
    G.frostHand = G.frostHand.filter(function (c) { return c !== card })
  }
  if (hand || heldAny(G, SK.FROSTFALL)) addFrostAt(G, at, side)
}

// 【寒色】：它在场时，**同一方**打出的同**颜色**牌也自带冰。
// 比牌面颜色（手里那张还没进堆），而寒色自己那张在堆上所以读 pileSuitAt
function coldHueOn(G, card, side) {
  for (let k = 0; k < G.held.length; k++) {
    if (G.held[k].skill !== SK.COLDHUE || G.held[k].side !== side) continue
    const at = pileIndexOf(G, G.held[k].source)
    if (at >= 0 && isRedSuit(pileSuitAt(G, at)) === isRedSuit(card.suit)) return true
  }
  return false
}

// 这一格**留在堆上**吗（被结冰或者保护挡住了）。
// 口径必须跟 takeAt 一致（连豁免一起），不然会「takeAt 收走了但调用处
// 以为它留下」那种错位
function blockedAt(G, i) {
  if (!G.iceBlind && frostAt(G, i)) return true
  return wardAt(G, i)
}

function takeAt(G, i, gone) {
  // ---- 【结冰】排在保护之前 ----
  //
  // 它不消耗任何东西、也不计分，所以先结算免费的那一层
  //（一张牌同时带冰和盾时，玩家只看见「冰挡了一次」）。
  // **返回 0**：没牌离场所以没分 —— 这是结冰跟保护唯一但要紧的区别
  if (!G.iceBlind && frostAt(G, i)) {
    clearFrostAt(G, i)
    return 0
  }
  const ward = wardUnder(G, i)
  if (ward >= 0) {
    const shield = pullStacked(G, ward)
    if (shield) gone.push(shield.rank)
    return 1
  }
  gone.push(G.pile[i].rank)
  let n = 1
  const under = takeStack(G, i)
  for (let k = 0; k < under.length; k++) {
    gone.push(under[k].rank)
    n++
  }
  return n
}

// 堆是**六条并行数组**，少一条就错位：
//   pile / pileByFoe / pileGuard / pileVals / pileSuit / pileBurn
// 改这儿必须同时改 unshiftPile、collect、removePileAt、harvestPile、newGame
//
// 叠放（G.stacked）**不在这六条里** —— 叠着的牌不占堆位，见它的声明处
function pushPile(G, card, side, guard, vals) {
  G.pile.push(card)
  G.pileByFoe.push(side === FOE)
  G.pileGuard.push(guard)
  G.pileVals.push(vals)
  // 落堆时花色就是牌面那个；染水之后才会不一样
  G.pileSuit.push(card.suit)
  G.pileBurn.push(burnOnLand(G))
  frostOnLand(G, card, side, G.pile.length - 1)
}

// 沉底：插到堆底（照 unshiftPile）
function unshiftPile(G, card, side, guard, vals) {
  G.pile.unshift(card)
  G.pileByFoe.unshift(side === FOE)
  G.pileGuard.unshift(guard)
  G.pileVals.unshift(vals)
  G.pileSuit.unshift(card.suit)
  G.pileBurn.unshift(burnOnLand(G))
  frostOnLand(G, card, side, 0)
}

// 堆上第 i 张**存着**的点数 —— 不走任何在场效果。
//
// **收牌时重建那六条数组必须用这个**，不能用 pileValsAt：
// 后者带着「焦壳在场时带火的牌无点数」那一支，而重建会把它的结果
// **写死进 pileVals** —— 于是焦壳离场之后那几张牌还是无点数，不还原。
// 在场效果的定义是「它在场时才算」，写死就破了那条
function rawVals(G, i) {
  return i < G.pileVals.length ? G.pileVals[i] : cardVals(G.pile[i])
}

// 堆上第 i 张**现在算哪几个点数** —— 带在场效果。匹配判定走这个
function pileValsAt(G, i) {
  // 【燃烧】**不碰点数** —— 定稿第 2 条。
  //
  // 这儿曾经有两支试验档，都撤了：「关键词自带置 0」（有效，野火
  // +0.50 → +3.28，但它撤掉了这一族的对位解）和【焦壳】那件技能
  //（协同只有 +0.08，因为它自己那张牌活不久）。
  //
  // 所以它现在跟 rawVals 完全一样 —— **两个名字留着是有意的**：
  // 将来再有「在场期间改堆上点数」的效果时，那几处写回 pileVals 的地方
  // 必须读 rawVals，不然在场效果会被写死。那个坑是焦壳踩出来的
  return rawVals(G, i)
}

// 堆上第 i 张带着几层火（0 = 没有）
function pileBurnAt(G, i) {
  return i < G.pileBurn.length ? G.pileBurn[i] : 0
}

function pileSuitAt(G, i) {
  return i < G.pileSuit.length ? G.pileSuit[i] : G.pile[i].suit
}

function pileRed(G, i) {
  return isRedSuit(pileSuitAt(G, i))
}

// 这张牌**印着**的那几个点数：牌面那个 + 点数卡贴上来的（照 cardVals）
function cardVals(card) {
  // 无点数牌（'-'）一个点数都没有；零点牌（'0'）照常走，点数就是 0
  if (card.rank === BLANK_RANK) return []
  const out = [card.value]
  for (let i = 0; i < card.extra.length; i++) {
    if (out.indexOf(card.extra[i]) < 0) {
      out.push(card.extra[i])
    }
  }
  return out
}

// 打出这张算哪几个点数（照 valuesOf）：
// 顺色拿整个点数换一次按花色钓，洪水拿点数换一串翻牌 —— 两件都是「点数整个不算」
// 收色也在「拿点数换一次按花色的清扫」这一类里，所以跟顺色、洪水一起。
// G 是为了齐顶 —— 它要读堆才算得出「最大的那个点数」
function valuesOf(G, card, skills) {
  // 【死水】废掉的牌算 **0 点**。判在最前面，盖掉下面所有分支 ——
  // 「废了」就是废了，不该还受别的技能摆布。
  //
  // 0 点而不是无点数：0 点还在点数这条轴上（见底压得动、撒网按偶数收得走），
  // 无点数就彻底出局、反而**更安全** —— 废牌不该附赠保护
  if (isDead(G, card)) {
    return [0]
  }
  // 抹点数那一族里的四件也在这儿（压邻、掏手、掏库、封色）——
  // 它们的说明第一句就是「它自己没有点数」。
  // 【分水】不在：它是全族唯一保留自己点数的，那是它能被钓走、
  // 因此敢封那么大面积的前提
  // 【野火】**在这一族**，而且对它是硬性的 —— 见下面它那一行。
  // 全表的收牌类技能都靠这一条挡（收一片的代价是这张不钓）
  if (has(skills, SK.SUITED) || has(skills, SK.FLOOD) || has(skills, SK.HUE)
    || has(skills, SK.VOID) || has(skills, SK.DUMP)
    || has(skills, SK.SPILL) || has(skills, SK.HUEVOID)
    // ---- 【野火】**退出这一族**（2026-10-13 最终）----
    //
    // 它在这一族里进出过四次（无条件无点数 → 条件性 → 置 0 → 不改 → 无点数），
    // 而四次来回的根都是同一个问题：**它要不要为「收一片」付钱。**
    //
    // 【燃烧】拿到收割权（全堆带火 → 关键词收走整堆）之后，答案变了：
    // **它不收牌了**，所以「收一片的代价是这张不钓」压根不适用。
    //
    // 顺带双吃也不用管：扫走整堆时它自己也在里面，被收走了，
    // 于是 resolveMatch 找不到它（见 burnStep 那段）。
    //
    // 它现在就一句话、零代价条款：**打出后给堆上的牌贴上【燃烧】。**
    // （【燎原】原先在这一族，技能删了）
    // 抄底的无点数是**兜底**不是代价：棋盘上没叠放时它什么也收不到，
    // 那就至少是一张钓不走的安全饵（没这道兜底它就是「单买是废的」）
    || has(skills, SK.DREDGE)
    // ---- 【伏流】：无点数是代价，**也是护身符** ----
    //
    // 它凑顺子时能当任意点数，可那**只在 straightFor 那一条路径上**成立。
    // 这一层是双向的（你怎么钓别人、别人怎么钓你），在这儿给它点数
    // 它就成了一张「谁都接得上」的超级靶子 ——
    // 而那个坑是量过的：合流就是这么从预期正分掉到 −1.00 的。
    //
    // **注意这儿关掉的只是「无点数」那条代价，不是通配。** 通配走的是
    // straightFor 那条独立路径，跟这一层无关 —— FLOW_VOID=0 的时候
    // 它照旧能凑顺子，只是凑不成时退回普通点数匹配（见那个旋钮）
    || (FLOW_VOID && has(skills, SK.FLOW))) {
    return []
  }
  // 无点数牌谁也给不了它点数（齐顶、归深、退潮、见底都改不动它）
  if (card.rank === BLANK_RANK) return []
  // 退潮和见底：它们自己也归 0（在自己造的那阵退潮里），盖掉点数卡贴的那几个。
  // 0 点谁也钓不上 —— 这一手是用来施工的
  if (has(skills, SK.EBB) || has(skills, SK.LOWTIDE)) {
    return [0]
  }
  // 齐顶：算堆上**同颜色**牌里最大的那个点数，覆盖掉牌面和点数卡。
  // 堆上没有同颜色的牌就按自己的点数算（照 ap-fishing 的 valuesOf）
  if (has(skills, SK.PEAK)) {
    const red = isRedSuit(card.suit)
    let top = 0
    let found = false
    for (let i = 0; i < G.pile.length; i++) {
      if (isRedSuit(pileSuitAt(G, i)) !== red) continue
      const vals = pileValsAt(G, i)
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] > top) { top = vals[k]; found = true }
      }
    }
    return found ? [top] : cardVals(card)
  }
  const out = cardVals(card)
  // 归深：**追加** 11 这个候选。11 是 J 的数，而 J 从不落堆 ——
  // 所以那是一个只有归深牌够得到的私有钓点
  if (has(skills, SK.DEEP) && out.indexOf(11) < 0) {
    out.push(11)
  }
  // 软点：追加 1。跟归深是镜像（1 和 11 是 21 点里 A 的软硬一对）。
  // 两件都是**追加不覆盖**，所以从不削弱自己
  if (has(skills, SK.SOFT) && out.indexOf(1) < 0) {
    out.push(1)
  }
  // ---- 【合流】：**追加**它吃掉那张的点数 ----
  //
  // 跟上面两件一个模式，只是追加的数不是写死的 ——
  // 是这一手吃到的那张算几点（见 mergeFor / G.mergeGain）。
  //
  // **追加而不是相加**：7 吃掉 9 之后它同时算 7 和 9，不是 16。
  // 相加的话 7+9 过了 13、整副牌没人够得着它，那是一道自带的闸；
  // 追加没有那道闸，它只会多一条路。
  //
  // 这一支**非有不可**：catchStart 判匹配读的是 valuesOf，不读 pileVals。
  // 只改 pileVals 的话这张牌堆上写着「同时算 7 和 9」，判定那一下却只拿 7
  if (has(skills, SK.MERGE) && G.mergeCard !== null && card === G.mergeCard) {
    for (let k = 0; k < G.mergeGain.length; k++) {
      if (out.indexOf(G.mergeGain[k]) < 0) out.push(G.mergeGain[k])
    }
  }
  return out
}

// ---------- 场上挂着的「抹点数」效果（照 landVals） ----------
//
// valuesOf 回答「**这张牌自己**算几点」—— 只看它身上的技能。
// 可抹点数那一族里有三件是**在场效果**（压邻、封色、分水）：堆上挂着一张，
// 就把后面落下来的牌抹掉，跟打出的是谁、带什么技能无关。
//
// 所以凡是「牌落到堆上」的路都走 landVals，**判定那条路走 valuesOf** ——
// 源码里 catchStart 用的是 valuesOf（见那边第 853 行）。
// 分水因此不阻止钓牌，它只是让「没钓到的牌」变成死牌
function landVals(G, card, skills, sink) {
  const own = valuesOf(G, card, skills)
  if (own.length === 0) {
    return own
  }
  // 压邻：抹掉紧挨着它右边（= 落在它上面）那一张。
  // 沉底落在堆底，左边没东西，一概不受影响
  if (!sink && topCarriesVoid(G)) {
    return []
  }
  // 封色：跟场上那张封色牌**现在的花色**同色就没点数（染水能把整堆染成一色）
  if (suitSealed(G, card.suit)) {
    return []
  }
  // 分水：牌面点数的奇偶跟场上那张分水牌不同，就落成 0 点
  if (parityBlocked(G, card.value)) {
    return [0]
  }
  return own
}

function pileIndexOf(G, card) {
  for (let i = 0; i < G.pile.length; i++) {
    if (G.pile[i] === card) return i
  }
  return -1
}

// 堆顶那张带着【压邻】吗（而且还挂着）
function topCarriesVoid(G) {
  if (G.pile.length === 0) return false
  const top = G.pile[G.pile.length - 1]
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === SK.VOID && G.held[i].source === top) return true
  }
  return false
}

function suitSealed(G, suit) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill !== SK.HUEVOID) continue
    const at = pileIndexOf(G, G.held[i].source)
    if (at >= 0 && pileSuitAt(G, at) === suit) return true
  }
  return false
}

function parityBlocked(G, value) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill !== SK.ODD) continue
    if (!inPile(G, G.held[i].source)) continue
    if (G.held[i].source.value % 2 !== value % 2) return true
  }
  return false
}

// mine 里有没有哪个数 +gap 等于 theirs 里的某个数（照 anyEquals）。
// **0 点和 0 点不算相等** —— 两张都见了底的牌不该还能互相钓
function anyEquals(mine, theirs, gap) {
  for (let a = 0; a < mine.length; a++) {
    if (gap === 0 && mine[a] === 0) continue
    for (let b = 0; b < theirs.length; b++) {
      if (theirs[b] === mine[a] + gap) return true
    }
  }
  return false
}

// 堆里这张对出牌那一方来说是不是被护着（照 guardedAgainst）：
// 对方护的才挡，自己护的不挡自己
function guardedAgainst(G, i, side) {
  const g = G.pileGuard[i]
  if (g === GUARD_NONE) return false
  return side === FOE ? g === GUARD_ME : g === GUARD_FOE
}

// ---------- 钓牌判定（照 catchStart） ----------
//
// 返回从堆里第几张开始收，-1 表示钓不到。
// sink（沉底）把搜索方向整个反过来：普通从堆底往上找（命中最深那张），
// 沉底从堆顶往下找（命中最高那张）—— 两条都是「尽量多收」，只是镜像
function catchStart(G, card, side, skills, sink) {
  const size = G.pile.length
  if (card.rank === JACK) {
    if (size === 0) return -1
    return sink ? size - 1 : 0
  }
  const hook = has(skills, SK.HOOK)
  const suited = has(skills, SK.SUITED)
  const mine = valuesOf(G, card, skills)
  // 量水：点数正好等于牌堆张数 → 整堆。判在遍历之前（它收得最多）。
  // 被护着的牌挡得住它 —— 绕过一张就不叫整堆了
  // 这一支只剩**估算**用（AI 挑牌、逆流选落点 —— 都在落堆之前，堆里还没有这张，
  // 所以 +1 把它自己算上）。真正的量水在 measureFor，resolveMatch 匹配时会把它剔掉
  if (has(skills, SK.MEASURE) && anyEquals(mine, [size + 1], 0)) {
    let blocked = false
    for (let i = 0; i < size; i++) {
      if (guardedAgainst(G, i, side)) { blocked = true; break }
    }
    if (!blocked) return sink ? size - 1 : 0
  }
  // 普通那三条线：从堆底往上找（命中最深 = 收最多）
  let best = -1
  for (let n = 0; n < size; n++) {
    const i = sink ? size - 1 - n : n
    if (guardedAgainst(G, i, side)) continue
    const theirs = pileValsAt(G, i)
    // 花色比的是 pileSuitAt（染水改过的算改后的）
    if (suited && sameSuit(G, pileSuitAt(G, i), card.suit, side)) { best = i; break }
    if (anyEquals(mine, theirs, 0)) { best = i; break }
    // 磁钩：对得上比它大 1 的点数。J 不吃这条
    if (hook && G.pile[i].rank !== JACK && anyEquals(mine, theirs, 1)) { best = i; break }
  }
  // 吃水：**第四条并列的线**。从堆顶往下累加，总和不超过 CAP 的那一段。
  //
  // 它和上面三条取**收得更多**的那个 —— 下标越小收得越多（收 [i, 顶]），
  // 所以取 min。沉底那边方向是镜像的，吃水跟它冲突（你这张落堆底，
  // 而它从堆顶往下数），所以沉底时不判吃水
  if (has(skills, SK.DRAFT) && !sink) {
    const reach = draftReach(G, card, side, mine)
    if (reach >= 0 && (best < 0 || reach < best)) best = reach
  }
  // 这儿原先有一支【钩顶】（都对不上就钓紧贴着你这张的那一张，
  // 沉底时镜像到堆底）。那件技能删了
  return best
}

// 吃水够得着的最深那张的下标，-1 = 一张都收不着（爆了）。
//
// 预算 = CAP − 这张自己的点数（多值牌取**最小**的那个 —— 预算留最大，
// 照「任一个点数对得上就算匹配」那条规则往对玩家有利的方向读）。
//
// 往下走的时候：
//   **0 点**的牌加 0、不断链 —— 它是免费垫片，让你跨过去拿更深的；
//   **无点数**的牌**断链** —— 它不在点数轴上，所以顺色 / 封色 / 压邻
//     是吃水的天然反制；
//   多值牌取**最小**的那个值（同理：尽量塞得下）；
//   一超预算就停（后面只会更大 —— 除了 0 点那种不增的，所以是「停」不是「跳过」）
//
// 最后一道闸：**堆上够不到 DRAFT_MIN 张就算没成**（见那个常量上面那段）
function draftReach(G, card, side, mine) {
  const size = G.pile.length
  if (size === 0) return -1
  let budget = DRAFT_CAP
  if (DRAFT_COSTS_SELF) {
    let own = 99
    for (let k = 0; k < mine.length; k++) if (mine[k] < own) own = mine[k]
    // 它自己没有点数（顺色之类把它抹了）：那它不占预算
    if (own === 99) own = 0
    budget -= own
  }
  if (budget < 0) return -1
  let sum = 0
  let deepest = -1
  let got = 0
  for (let i = size - 1; i >= 0; i--) {
    if (guardedAgainst(G, i, side)) break
    const vals = pileValsAt(G, i)
    // 无点数：断链
    if (vals.length === 0) break
    let v = 99
    for (let k = 0; k < vals.length; k++) if (vals[k] < v) v = vals[k]
    if (sum + v > budget) break
    sum += v
    deepest = i
    got++
  }
  // 只够吃 1 张（或者一张都够不到）就当没成 —— 稳赚 2 分零风险那条路得堵上
  if (got < DRAFT_MIN) return -1
  return deepest
}

function canCatch(G, card, side) {
  const skills = skillsOf(G, side, card)
  return catchStart(G, card, side, skills, has(skills, SK.SINK)) >= 0
}

// ---------- 挂在牌上的效果（照 inPile / expireHeld / heldOn / isFrozen） ----------

function inPile(G, card) {
  return G.pile.indexOf(card) >= 0
}

// 效果牌已经离场的，清掉。每次收完牌调一次
function expireHeld(G) {
  G.held = G.held.filter(function (h) { return inPile(G, h.source) })
}

function heldOn(G, skill, side) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === skill && G.held[i].side === side) return true
  }
  return false
}

function isFrozen(G, card) {
  for (let i = 0; i < G.held.length; i++) {
    if (G.held[i].skill === SK.FREEZE && G.held[i].target === card) return true
  }
  return false
}

// 对方手里第 index 张，side 这一方看得见吗（照 foeOpen / foeKnows）。
// 照水是总开关：它亮着的时候连期间新补的牌也明着
function opponentOpen(G, side, index) {
  const other = side === ME ? FOE : ME
  if (heldOn(G, SK.LANTERN, side)) return true
  // 【清水】：对方前 CLEAR_OPEN 张一直明着。
  // 认的是**位置**而不是具体哪张 —— 对方打掉一张之后后面的往前挪，
  // 于是明着的始终是最前面那两个位置。源码那边也是这样（foeOpen 比下标）
  if (hasSpecial(G, side, SP.CLEAR) && index < CLEAR_OPEN) return true
  return index < G.seen[other].length && G.seen[other][index]
}

// 【逆流】这一手要不要往堆底落（照源码的 wantSink）。
//
// 游戏里玩家是按开关自己选的，模拟里两侧都走庄家那套算法：
// **哪头收得多就往哪头落，钓不到就不落堆底**。
//
// 最后那条是关键 —— 空钩沉底是最危险的下饵（那张躺在堆底，
// 谁匹配到它就通吃整堆）。少了这条，逆流会跑成一件负分技能
function wantReverse(G, side, card, skills) {
  if (!hasSpecial(G, side, SP.REVERSE)) return false
  const normal = catchStart(G, card, side, skills, false)
  const sunk = catchStart(G, card, side, skills, true)
  const nGain = normal >= 0 ? G.pile.length - normal + 1 : 0
  const sGain = sunk >= 0 ? sunk + 2 : 0
  return sGain > nGain
}

/// 【稳钩】：这一方每局**前 FIRM_GUARD 张**打出的牌，没钓到、落下时自带护，
// 对方钓不走。返回写进 pileGuard 的那个值（GUARD_ME / GUARD_FOE / GUARD_NONE）。
//
// 数的是「打出过几张」（照源码 myPlayed / foePlayed，在 playFor 开头 +1），
// 所以钓到牌的那几张也占名额 —— 跟源码一样
function firmGuardFor(G, side) {
  if (!hasSpecial(G, side, SP.FIRMHOOK)) return GUARD_NONE
  if (G.stat.plays[side] > FIRM_GUARD) return GUARD_NONE
  return side === ME ? GUARD_ME : GUARD_FOE
}

// ---------- 打出一张（照 playFor → afterPlay → resolveMatch） ----------
//
// 顺序是「**先结算这张牌的技能，再拿它去匹配**」：
//   1. 落堆（沉底的落堆底），落的那一刻受场上抹点数效果管（landVals）；
//   2. 「优先」的【染水】最先发动（它自己已经在堆上了）；
//   3. afterPlay 那一串技能 —— 量水、收色、撒网、见底可能连它一起收走；
//   4. resolveMatch：它还在堆上的话拿下来、对剩下的堆判匹配、再放回去。
//
// 源码里收牌要演特效（startSweep / startCatch 定时器），这边直接结算
function playFor(G, side, index, ai) {
  const card = takeFromHand(G, side, index)
  const skills = skillsOf(G, side, card)
  G.stat.plays[side]++
  // 「往堆底落」有两条来路：点数槽的【沉底】（强制）和角色的【逆流】（可选）。
  // 源码那边还有第三条（闯关庄家的【偏流】），模拟器不跑闯关关卡规矩。
  // 逆流是在落堆**之前**估的（照 wantSink），那时堆里还没有这张
  const sink = has(skills, SK.SINK) || wantReverse(G, side, card, skills)
  // 【合流】上一手吃到的点数清掉 —— 它只在那一手的判定里算
  //（堆上那张的点数早写进 pileVals 了，是持久的）
  G.mergeCard = null
  G.mergeGain = []
  // ---- 结冰那一族：自带冰的先进手冰表，豁免再从表里读 ----
  //
  // 两步分开是有意的：「自带【结冰】」= **打出时它在手里就带着** →
  // 塞进 frostHand；而豁免**只认一件事**：这张牌手里带不带冰。
  // 于是四件技能的豁免走同一条、不用各自特判，而【藏凌】贴给别的手牌的冰
  // 走的也是这一条（那几张下几手打出去时同样豁免）。
  //
  // **每手都重设** iceBlind：没钓中的那一手不走 harvestAt，
  // 只靠这儿重设才不会把豁免漏到下一手
  if (selfFrost(skills)) addFrostHand(G, card)
  // 【寒色】在场时，同一方打出的同颜色牌也自带冰。
  // 判在落堆前 —— 自带的意思是「打出时就带着」，而豁免读的正是那个状态
  if (coldHueOn(G, card, side)) addFrostHand(G, card)
  G.iceBlind = frostOnHand(G, card)
  const worth = landVals(G, card, skills, sink)
  // ---------- 【叠放】那三件：这张**不进堆**，叠到别的牌上 ----------
  //
  // 它们的代价不是「无点数」也不是「置 0」，是**这张牌不占堆上的位置** ——
  // 它垫在别人下面或者盖在别人上面，所以收走那一叠的时候它跟着走
  // → **它那一分归收走的人**。
  //
  // 所以这是**押注**：你赌自己是那个收走这一叠的人。
  // 押错了就是亲手给对手加分 —— 全表第一件「对手的选择决定我的收益」。
  //
  // 三件撞在同一张牌上时按 CALM > CLEAN > RAISE 取一件，**不叠加** ——
  // 一张牌只叠得到一个地方，而三件各要一次挑牌
  const stacking = has(skills, SK.CALM) || has(skills, SK.CLEAN)
    || has(skills, SK.RAISE)
  if (stacking) {
    const which = has(skills, SK.CALM) ? SK.CALM
      : (has(skills, SK.CLEAN) ? SK.CLEAN : SK.RAISE)
    // 抬水要加几点：**牌面点数**（card.value），不读 valuesOf ——
    // 它叠上去之后不是当前牌，没有「它算几点」这回事；
    // 而牌面那个数写在牌上、谁都数得出来（跟退潮一个口径）
    const step = card.value
    // 堆是空的、或者启发式挑不出目标：那张牌**白放了** ——
    // 代价在发动那一刻就付了（照源码「没挑」那条，和开包「放弃」一个道理）
    const at = G.pile.length === 0 ? -1 : pilePick(G, which, side, step)
    if (at >= 0) doPilePick(G, which, at, side, step, card)
    afterPlay(G, side, skills, card, ai)
    // ---- 这条路**照样走 resolveMatch**（照源码 afterPlayTail 末尾那一行）----
    //
    // 三件的结果并不一样，而差别是那个函数**自己判出来的**，不用在这儿分支：
    //   凝水 / 抬水 —— 牌垫在别人下面，不在 pile 里 → pileIndexOf 返回 -1，
    //     直接交回合（源码那句「不进堆就没有匹配可言，所以不用另加闸」）；
    //   净水 —— 盖上去那张**进了 pile**（它换掉了那一格），所以它是当前牌，
    //     照常匹配。注意那也意味着匹配不中时它会被挪到堆顶 / 堆底
    //     （resolveMatch 一律先摘下来再放回去）—— 源码就是这个行为
    // 叠放那三件也要走燃烧那一步 —— 它是「一张牌打完了」的通路之一，
    // 漏在这儿的话凝水 / 净水 / 抬水 那几手就不蔓延、不闭合
    burnStep(G, side)
    resolveMatch(G, side, card, skills, sink)
    endPlay(G, side)
    return
  }
  // ---------- 【结凌】：给**全场**贴结冰 ----------
  //
  // **贴在落堆之前**，所以这一下的「全场」不含它自己 —— 它自己那张冰是
  //「自带」来的（进了手冰表，落堆时由 frostOnLand 贴上），
  // 两条路分开走、不会贴两次（addFrostAt 不可叠加）。
  //
  // 为什么是全场而不是堆顶几张：它收的是「匹配那张 → 堆顶」，
  // 所以堆顶那几张正是它自己要收走的 —— 只给堆顶的话它钓中时
  // 把刚铺的冰全带走了，铺设效果归零。全场之后堆底那部分它收不到
  if (has(skills, SK.FROST)) {
    for (let i = 0; i < G.pile.length; i++) addFrostAt(G, i, side)
  }
  if (sink) {
    unshiftPile(G, card, side, GUARD_NONE, worth)
  } else {
    pushPile(G, card, side, GUARD_NONE, worth)
  }
  // 【燎原】原先在这儿自带 1 层火（点在它落下的那一格，所以「火从哪头
  // 烧起」是它的决策）。技能删了 —— 蔓延并进【燃烧】关键词之后它是白牌。
  //
  // 现在**唯一的火种是野火**（它给剩下的牌和自己点火），
  // **现在唯一的火种就是野火**（它给剩下的牌和自己点火）——
  // 沸水也删了，所以 burnOnLand 恒为 0，新落的牌要等蔓延烧过来
  // ---- 【合流】〔优先〕：它落堆之后，把紧挨着它那张叠到自己下面 ----
  //
  // 排在这一段的**最后**：染水和燎原讲的是「它落下来那一瞬间带着什么」
  //（花色、火），合流讲的是「它落稳了之后再动一下」。
  //
  // 排在钓牌判定**之前**是硬性的，两条都要紧：
  //   它多一个点数 —— 判定读 valuesOf，排在后面这个点数就白给了；
  //   它移掉一个堆位 —— 量水数张数、吃水从堆顶累加，两件都在判定里读堆
  if (has(skills, SK.MERGE)) {
    mergeFor(G, side, card)
  }
  afterPlay(G, side, skills, card, ai)
  // 【燃烧】：蔓延 + 若全堆带火则收走整堆。**必须排在匹配前面** ——
  // 见 burnStep 那段（扫走整堆时刚打那张也在里面，于是双吃那道闸是免费的）
  burnStep(G, side)
  resolveMatch(G, side, card, skills, sink)
  endPlay(G, side)
}

// 一张牌打完了再交回合（照源码 endPlay）。
//
// **【燃烧】那一步不在这儿了**（2026-10-13）—— 它挪到了 resolveMatch **之前**，
// 见 burnStep 那段的「为什么必须排在匹配前面」
function endPlay(G, side) {
  fillPond(G, side)
  passTurn(G, side)
}

// ---------- 【燃烧】那一步：蔓延 → 若全堆带火则收走整堆 ----------
//
// 结算顺序（定稿 2026-10-13）：
//
//   落堆 → 场上效果 → 卡牌效果 → **燃烧（这儿）** → 匹配
//
// ---- 为什么必须排在匹配**前面** ----
//
// 这是「一张牌收两次」那道闸的**全部**实现，而且它不用写任何额外判断：
// 扫走整堆的时候**刚打那张也在整堆里面**，它被收走了，
// 于是后面 resolveMatch 找不到它（那个函数本来就有「不在堆上就没得匹配」
// 那条早退）。排在匹配后面的话才需要额外的闸。
//
// 顺带它让点火类技能**不必再付「无点数」**：它们不收牌（收牌权归关键词），
// 所以「收一片的代价是这张不钓」压根不适用。野火身上来回改了三次的
// 那个代价条款，因此整个不需要了。
//
// ---- 闭合的节奏是**可数的**，这是这条规则最值钱的性质 ----
//
// 火有**两条前沿**，而堆只在顶上长：
//
//   每打一张牌：火两头各推 1 格（+2），堆加 1 张没烧着的（+1）→ 净 +1 格
//
// 所以单个火种种下去之后大约 **(堆的张数 − 1) 手**闭合。而手数交替，于是：
//
// > **种火时堆上（含你这张）是奇数张 → 池子归你。**
//
// 那是个**玩家数得出来**的数（堆是横着摆的明牌，张数界面上就有）——
// 于是「什么时候种」成了一个算得出的决定。
// 这条线真正的资源不是火，是**奇偶**；而「一回合多出一张牌」是翻奇偶的手段。
//
// ---- 三个口径 ----
//
//   **堆 1 张就触发** —— 所以自带燃烧的牌打在空堆上会**当场收走自己**。
//     那是这一族的**兜底**：最差也收 1 张，而对比项是负的
//     （留在堆上就是饵，对手可能钓走）。照抄底那条「无点数是兜底不是代价」。
//   **扫走的归当前出牌方** —— 不记归属，所以不需要第七条并行数组。
//   **堆空不触发** —— 空堆「全带火」是真空真，得显式挡掉。
//
// ---- 对位解三个，全是现成的 ----
//
//   **保护**（凝水）—— wardAt 那一格**永远点不着**，所以堆上只要有一张
//     带保护的牌，「全堆带火」就永远不成立。**一张牌锁死整条线。**
//   **结冰** —— 冰火相消，挡一手，代价是那片冰没了。
//   **钓走带火的牌** —— 火不改点数（关键词只有蔓延一条），所以照样钓得走
function burnStep(G, side) {
  spreadFire(G)
  const size = G.pile.length
  // 堆空不触发（空堆「全带火」是真空真，得显式挡）。
  // BURN_MIN 是这条规则的唯一幅度旋钮 —— 1 是定稿口径，见它那段
  if (size < BURN_MIN || size === 0) return
  for (let i = 0; i < size; i++) {
    if (pileBurnAt(G, i) === 0) return
  }
  // 全堆带火 —— 整堆归出牌方
  const all = []
  for (let i = 0; i < size; i++) all.push(i)
  const wd = G.stat.wild
  wd.sweeps[side]++
  wd.sweepSum[side] += size
  harvestPile(G, side, wantedOf(G, all))
}

// ---------- 【填塘】：堆被清空时，从牌库顶补一张 0 点牌 ----------
//
// **判在 endPlay 而不是各条收牌路里** —— 清空堆有七八条来路
//（J 通吃、顺色、量水、一色、见底、撒网、收色、洪水…），
// 在每条后面各判一次必漏一条。endPlay 是「一张牌打完了」的唯一出口。
//
// `置 0` 是硬性的：**0 点牌谁都匹配不上**（`[0]` 对 `[N]` 只有 N=0 才相等，
// 而「0 对 0 不算相等」是定死的）。所以它**只填堆位、不改匹配面** ——
// 对手清空之后照样白打一手，被削掉的只是「空堆」那一份。
// 正常打出的话补上去的牌有点数 → 对手可能匹配到它 → 这件技能变成在帮他。
//
// side 是刚打牌的那一方（把堆收光的那个），补上去那张算他的饵
//（照庄家【淤滩】那条先例）
function fillPond(G, side) {
  if (G.pile.length > 0 || G.deck.length === 0) return
  if (!hasSpecial(G, side, SP.FILLPOND)
    && !hasSpecial(G, side === FOE ? ME : FOE, SP.FILLPOND)) return
  const card = G.deck.pop()
  // vals 直接传 [0]，**不走 landVals** —— 它不是「打出」，
  // 所以压邻 / 封色 / 分水那几件不该改它
  pushPile(G, card, side, GUARD_NONE, [0])
}

// 技能都结算完了，拿这张牌去匹配（照 resolveMatch）。
//
// 已经被技能收走了（量水 / 收色 / 撒网 / 见底）就没得匹配。
// 还在堆上的话：先拿下来，对**剩下的堆**判匹配，再放回去 ——
// 普通的放回堆顶、沉底的放回堆底（洪水之类可能往它上面又垫了牌，
// 放回去之后那几张也在「匹配那张 → 堆顶」这一段里）。
// 它身上的点数照技能结算完的样子带回去
function resolveMatch(G, side, card, cardSkills, sink) {
  const at0 = pileIndexOf(G, card)
  if (at0 < 0) return
  const vals = pileValsAt(G, at0)
  // 火和花色原样带回去（照源码 resolveMatch 的 burn / suit）：放回去走 pushPile，
  // 那边按「刚落下」重算火，不带的话【燎原】自带的那层火就丢了
  const burn = pileBurnAt(G, at0)
  const suit = pileSuitAt(G, at0)
  removePileAt(G, at0)
  // 量水是技能，已经在 afterPlay 里结算过了 —— 匹配这一步不再算它
  const skills = cardSkills.filter(function (s) { return s !== SK.MEASURE })
  // J 落在空堆上：没有可通吃的，就只勾走它自己（记 1 分）
  if (card.rank === JACK && G.pile.length === 0) {
    pushPile(G, card, side, GUARD_NONE, vals)
    keepMarks(G, G.pile.length - 1, burn, suit)
    finishCatch(G, side, 0, 1, card, skills)
    return
  }
  const at = catchStart(G, card, side, skills, sink)
  if (at < 0) {
    // 没钓到：落下。【稳钩】的头几张在这时候护上
    const guard = firmGuardFor(G, side)
    if (sink) {
      unshiftPile(G, card, side, guard, vals)
      keepMarks(G, 0, burn, suit)
    } else {
      pushPile(G, card, side, guard, vals)
      keepMarks(G, G.pile.length - 1, burn, suit)
    }
    return
  }
  // 钓到了。收走的那一段往哪边算，由落点决定：
  //   普通 —— 落堆顶，收「匹配那张 → 堆顶」；
  //   沉底 —— 落堆底，收「堆底 → 匹配那张」（插在 0，原来的 at 往后挪一格）
  if (sink) {
    unshiftPile(G, card, side, GUARD_NONE, vals)
    keepMarks(G, 0, burn, suit)
    finishCatch(G, side, 0, at + 2, card, skills)
  } else {
    pushPile(G, card, side, GUARD_NONE, vals)
    keepMarks(G, G.pile.length - 1, burn, suit)
    finishCatch(G, side, at, G.pile.length - at, card, skills)
  }
}

// 放回去之后把拿下来之前的火和花色写回去（照源码 keepMarks）
function keepMarks(G, at, burn, suit) {
  if (at < 0 || at >= G.pile.length) return
  G.pileBurn[at] = burn
  G.pileSuit[at] = suit
}

// 钓到之后：收那一段、【深钩】再捞堆底、记统计（照 finishCatch）
function finishCatch(G, side, from, count, card, skills) {
  // **记的是 collect 返回的实收，不是 count** —— 叠放之后两个数不再相等
  // （被埋的牌跟着走所以可能更多，带盾的宿主留下所以可能更少）
  const got = collect(G, side, from, count)
  // 【深钩】：在上面那一段收完之后才收，所以数的是**剩下的**堆 ——
  // 刚才那一钩可能已经把堆底拿走了，那就少收或者收不着
  let extra = 0
  if (hasSpecial(G, side, SP.DEEPHOOK)) {
    const n = Math.min(DEEP_EXTRA, G.pile.length)
    if (n > 0) extra = collect(G, side, 0, n)
  }
  G.stat.catches[side]++
  G.stat.caught[side] += got + extra
  if (card.rank === JACK) {
    G.stat.jackCatches[side]++
  } else if (has(skills, SK.HOOK) || has(skills, SK.SUITED)) {
    // 这一钓是靠技能才成立的吗 —— 粗略记一笔，报表里看技能到底在不在起作用
    G.stat.skillCatch[side]++
  }
}

// ---------- 收牌的**唯一核心**：收走 wanted[i] 为真的那几格 ----------
//
// 两条收牌路都汇到这儿 —— `collect` 把区间翻成 wanted 再调它，
// `harvestPile`（散收）直接调。源码那边是四条路共用 `takeAt`，
// 这边路少两条（没有特效接力），但共用这一条的理由一样：
// **叠放的账只能有一个地方算**。
//
// 返回**实际收走几张**，而那可能不等于 wanted 里真值的个数：
//   多 —— 被叠放的牌跟着宿主走（净水埋的、合流吃的、抬水垫的）；
//   少 —— 带盾的宿主留在堆上，只有盾离场。
//
// 所以调用处**不能再拿 count 当收成** —— 那是这次搬叠放模型改动面最大的
// 一处（finishCatch、floodFor 的统计都跟着改了）
function harvestAt(G, side, wanted) {
  const keep = { cards: [], byFoe: [], guard: [], vals: [], suit: [], burn: [] }
  let taken = 0
  for (let i = 0; i < G.pile.length; i++) {
    if (wanted[i]) {
      // **先问再 takeAt** —— takeAt 会把盾摘掉、把冰化掉，问晚了就判不出来了。
      // blockedAt 同时管结冰和保护（口径必须跟 takeAt 一致）
      const warded = blockedAt(G, i)
      taken += takeAt(G, i, G.gone)
      // 挡住了这一下：那一格**留在堆上**，原样保留
      if (!warded) continue
    }
    keep.cards.push(G.pile[i]); keep.byFoe.push(G.pileByFoe[i])
    // **rawVals 不是 pileValsAt** —— 见 rawVals 那段：
    // 在场效果不能被写死进 pileVals
    keep.guard.push(G.pileGuard[i]); keep.vals.push(rawVals(G, i))
    keep.suit.push(pileSuitAt(G, i)); keep.burn.push(pileBurnAt(G, i))
  }
  G.pile = keep.cards; G.pileByFoe = keep.byFoe; G.pileGuard = keep.guard
  G.pileVals = keep.vals; G.pileSuit = keep.suit; G.pileBurn = keep.burn
  // 【结凌】那一族的豁免到这儿就结束 —— 这一手的收牌走完了。
  // 不清的话后面**对手侧**的收牌会蹭上它（源码那边是走水 / 过闸，
  // 这边是任何一条在同一个 play 里接着跑的 harvestAt）
  G.iceBlind = false
  expireHeld(G)
  expireStacked(G)
  G.score[side] += taken
  return taken
}

// 把 [from, from+count) 这一段收走记分。返回**实际**收走几张（见 harvestAt）
function collect(G, side, from, count) {
  const wanted = []
  for (let i = 0; i < G.pile.length; i++) {
    wanted.push(i >= from && i < from + count)
  }
  return harvestAt(G, side, wanted)
}

// 按下标从堆上拿掉一张，**不记分**（照 removePileAt）
function removePileAt(G, at) {
  G.pile.splice(at, 1)
  G.pileByFoe.splice(at, 1)
  G.pileGuard.splice(at, 1)
  G.pileVals.splice(at, 1)
  G.pileSuit.splice(at, 1)
  G.pileBurn.splice(at, 1)
}

// 一色（照 suitifyFor）：堆上**它的花色是张数最多的之一**（含它自己，打平也算；
// 堆上至少还有 1 张别的牌）→ 整堆收走。不是就什么也不做（2026-10-12 起不再染色）
function suitifyFor(G, side, card) {
  if (pileIndexOf(G, card) < 0) return
  if (G.pile.length > 1 && suitLeads(G, side, card, false)) {
    harvestPile(G, side, G.pile.map(function () { return true }))
  }
}

// 堆上它的花色是不是张数最多的那门（打平也算 —— 没有哪门比它多就行）。
// extra = 它还没落堆（AI 估算用），把它自己补算一张
const ALL_SUITS = ['♠', '♥', '♦', '♣']
function suitLeads(G, side, card, extra) {
  let mine = extra ? 1 : 0
  for (let i = 0; i < G.pile.length; i++) {
    if (sameSuit(G, pileSuitAt(G, i), card.suit, side)) mine++
  }
  for (let k = 0; k < ALL_SUITS.length; k++) {
    const s = ALL_SUITS[k]
    if (sameSuit(G, s, card.suit, side)) continue
    let n = 0
    for (let i = 0; i < G.pile.length; i++) {
      if (sameSuit(G, pileSuitAt(G, i), s, side)) n++
    }
    if (n > mine) return false
  }
  return true
}

// ==================== 叠放那五件 ====================
//
// 搬运说明：源码那边凝水 / 净水 / 抬水要**玩家点堆上一张**（弹提示条等点），
// 模拟器没有交互，所以**两侧都走启发式**（pilePick）——
// 跟冻结、换水、择饵那几件一个待遇（见 afterPlay 文件头那段）。
//
// 合流和抄底零 UI，两边逻辑一样

// 抬水加点：每个点数各加 by，去重（照源码 raiseVals）。
// 无点数的原样返回 —— 规则：无点数不受「增减点数」影响
function raiseVals(was, by) {
  if (was.length === 0) return was
  const now = []
  for (let k = 0; k < was.length; k++) {
    const v = was[k] + by
    if (now.indexOf(v) < 0) now.push(v)
  }
  return now
}

// 被抬那张现在撞得上谁。返回下标，-1 = 撞不上。
//
// 挑**离它最远**的那个 —— 收走的是两者之间那一段，所以越远收得越多。
// 源码那边还跳过「硬壳」护着的，模拟器不跑闯关关卡规矩（没有 shelled）
function raiseMatch(G, i, side) {
  const mine = pileValsAt(G, i)
  let best = -1
  let far = -1
  for (let k = 0; k < G.pile.length; k++) {
    if (k === i || guardedAgainst(G, k, side)) continue
    if (!anyEquals(mine, pileValsAt(G, k), 0)) continue
    const d = k > i ? k - i : i - k
    if (d > far) { far = d; best = k }
  }
  return best
}

// ---------- 挑堆上哪一张来叠（照源码 foePilePick） ----------
//
// 返回下标，-1 = 不挑（那张牌就白放了 —— 代价在发动那一刻就付了）
function pilePick(G, which, side, step) {
  // ---- 抬水**算得准**，所以它不猜 ----
  //
  // 试遍每一张：加上 step 之后撞得上谁、那一段有多长，挑最长的。
  // 整堆是明的，所以这跟玩家能做的判断一模一样 —— 没有「AI 作弊」的问题。
  //
  // 撞不上任何东西就不挑：抬水的**封堵**那一侧要算「对手下一手打什么」，
  // 超出这套启发式的能力（照 ai.js 里那条「读得到的信息才用」）
  if (which === SK.RAISE) {
    let pick = -1
    let most = 0
    for (let i = 0; i < G.pile.length; i++) {
      const was = pileValsAt(G, i)
      if (was.length === 0) continue
      // 试着抬一下看撞得上谁 —— 不改真数据，只算
      const probe = raiseVals(was, step)
      let far = -1
      for (let k = 0; k < G.pile.length; k++) {
        if (k === i || guardedAgainst(G, k, side)) continue
        if (!anyEquals(probe, pileValsAt(G, k), 0)) continue
        const d = k > i ? k - i : i - k
        if (d > far) far = d
      }
      if (far >= 0 && far + 1 > most) { most = far + 1; pick = i }
    }
    return pick
  }
  // 凝水 / 净水：挑**身上效果最多**的那一张。
  // 凝水找自己的效果（保护它），净水找对方的（埋掉它）
  let best = -1
  let bestCount = 0
  for (let i = 0; i < G.pile.length; i++) {
    let n = 0
    for (let k = 0; k < G.held.length; k++) {
      const want = which === SK.CALM ? side : (side === ME ? FOE : ME)
      if (G.held[k].source === G.pile[i] && G.held[k].side === want) n++
    }
    if (n > bestCount) { bestCount = n; best = i }
  }
  if (best >= 0) return best
  // 对方身上一条效果都没有：净水不挑
  if (which === SK.CLEAN) return -1
  // 凝水兜底：自己最深那张（下标最小的那张自己的牌）
  for (let i = 0; i < G.pile.length; i++) {
    if (G.pileByFoe[i] === (side === FOE)) return i
  }
  return -1
}

// ---------- 真正落效果的那一下（照源码 doPilePick） ----------
//
// card 是**要叠上去那张** —— 三条叠放都要把它放进 G.stacked。
// 只有抬水会收牌
function doPilePick(G, which, i, side, step, card) {
  // ---- 凝水：垫在它下面当盾 ----
  //
  // 宿主获得保护。被收走那一下**垫着这张代替它走**、保护少一层 ——
  // 于是「积分 = 收走的张数」精确成立（真有一张牌离场了）。
  //
  // 保护**能叠多层**，一层扛一次。那不是额外加的规则，是叠放模型自带的：
  // 每层都是一张实体牌，收走一层就离场一张、算一分
  if (which === SK.CALM) {
    G.stacked.push({ host: G.pile[i], card: card, kind: STACK_WARD })
    return
  }
  // ---- 净水：盖在它上面代替它 ----
  //
  // 盖住就等于埋掉 —— 被盖那张不再是「当前牌」，所以它身上的在场效果
  // 一概不生效（照水不照、封色不封、分水不分）。
  //
  // 「已变的点数不还原」自动成立：pileVals[i] 换成**盖上去那张**的点数，
  // 底下那张的点数跟它一起埋了，没有「还原」这回事。
  //
  // 换掉六条平行数组里的四条（pile / pileVals / pileSuit / pileByFoe）——
  // pileGuard 和 pileBurn 留着，护饵和燃烧挂在那个**位置**上，不挂在牌上
  if (which === SK.CLEAN) {
    const buried = G.pile[i]
    G.stacked.push({ host: card, card: buried, kind: STACK_BURIED })
    G.pile[i] = card
    G.pileVals[i] = landVals(G, card, [], false)
    G.pileSuit[i] = card.suit
    G.pileByFoe[i] = side === FOE
    // 被埋那张身上的在场效果**当场失效** —— 它不再是当前牌
    cleanAt0(G, buried)
    // ---- 被盖那张底下原本压着的东西**跟着它一起没** ----
    //
    // 它不在堆上了，所以以它为宿主的那几条叠放由 expireStacked 清掉
    // （下一次收牌时）—— 不算分、不进 G.gone。
    //
    // 对**盾**来说那是对的：保护是贴给那一张牌的，那张牌不再是当前牌了，
    // 保护就没有对象（合流吃掉有盾的邻居同理）。源码行为一样
    return
  }
  // ---- 抬水：加点数，然后那一张判一次匹配 ----
  //
  // step 是**被丢弃那张的牌面点数**（不是 valuesOf —— 它已经不在场上了，
  // 而牌面那个数写在牌上、谁都数得出来，跟退潮一个口径）
  const was = pileValsAt(G, i)
  if (was.length === 0) {
    // 无点数的牌不在点数轴上，加它没有意义（规则：无点数不受增减影响）。
    // 那张牌白丢了 —— pilePick 已经跳过了无点数的，所以这儿只是兜底
    return
  }
  G.pileVals[i] = raiseVals(was, step)
  // **垫在它下面** —— 加的那几点是「底下压着一张牌」的后果，
  // 而不是一个凭空的加值。收走那一叠时这张跟着走（多算一分）
  G.stacked.push({ host: G.pile[i], card: card, kind: STACK_BOOST })
  // 点数变了 → 那一张判一次匹配。撞不上就只是点数留在那儿。
  //
  // 它触发的匹配**不算技能触发**：被抬那张身上的技能不响（比如它带着顺色，
  // 不会改按花色匹配）。它不是「打出」，只是点数变了
  const at = raiseMatch(G, i, side)
  if (at < 0) return
  // 收走「被抬那张 ↔ 匹配那张」，两端都含
  const lo = at < i ? at : i
  const hi = at < i ? i : at
  const wanted = []
  for (let k = 0; k < G.pile.length; k++) wanted.push(k >= lo && k <= hi)
  harvestPile(G, side, wanted)
}

// ---------- 【合流】：把紧挨着它那张叠到自己下面 ----------
//
// 「紧挨着它那张」只有一个候选，所以**零 UI**：
//   普通落堆顶（at = 末尾）→ 它左边那张（at − 1）；
//   沉底落堆底（at = 0）  → 它右边那张（at + 1）。
//
// 三件连带的事：
//   邻居**连它底下压着的那几张一起**跟过来（它们本来就在它下面），
//     而那里头的**盾过来之后不再是盾** —— 保护是贴给那一张牌的，
//     那张牌离场了保护就没有对象（反过来等于让合流顺手偷一层保护）；
//   邻居身上的**在场效果当场失效**（它不再是当前牌，照净水的先例）；
//   邻居从它那一格**离场** —— 不是被收走，没人得分。
//     全表没有别的东西能「不收走就移掉一个堆位」，而那对量水（数张数）
//     和吃水（累加链）都是实打实的影响
function mergeFor(G, side, card) {
  const at = pileIndexOf(G, card)
  // 按说走不到：调用点紧跟在 pushPile / unshiftPile 后面，牌一定在堆上
  if (at < 0) return
  // 紧挨着它那张：它在堆底就看右边，否则看左边
  const nb = at === 0 ? 1 : at - 1
  if (nb < 0 || nb >= G.pile.length) return
  const eaten = G.pile[nb]
  // 拿副本：pileValsAt 返回的是 pileVals 里那一条的**引用**
  const gained = pileValsAt(G, nb).slice(0)
  // 邻居底下压着的那几张跟过来，一律当被埋的牌
  const under = takeStack(G, nb)
  G.stacked.push({ host: card, card: eaten, kind: STACK_BURIED })
  for (let k = 0; k < under.length; k++) {
    G.stacked.push({ host: card, card: under[k], kind: STACK_BURIED })
  }
  // 它身上的在场效果当场失效 —— 它不再是当前牌
  cleanAt0(G, eaten)
  // 把邻居那一格从堆上摘掉（六条平行数组一起），**不记分**
  removePileAt(G, nb)
  // 自己追加邻居的点数。下标可能因为摘掉邻居挪过了，所以重新找
  const mine = pileIndexOf(G, card)
  if (mine < 0) return
  const now = pileValsAt(G, mine).slice(0)
  // ---- 三道闸，都是跟别处的口径对齐，不是新立的规矩 ----
  //
  // 自己**无点数**（顺色 / 收色换掉了整个点数，或者被封色 / 压邻抹过）：
  //   那说的是「这张牌的点数这件事本身不算了」，所以追加也进不来 ——
  //   照顺色作废点数卡那条先例。不加这道，一张顺色牌打合流
  //   就把无点数吃回了点数，而无点数是那几件换钓牌通道付的代价。
  // **死水**废掉的牌：valuesOf 第一行就 return [0] 盖掉所有分支（含追加那支），
  //   这儿不挡的话 pileVals 会写成「0 和 9」而判定只认 0 —— 两张嘴。
  // **邻居**无点数：没有点数可吃，但堆位照样少一个、收走时照样算一张。
  //
  // 三种情况邻居都照吃（已经叠到底下了），只是点数不记
  if (now.length === 0 || isDead(G, card) || gained.length === 0) return
  for (let k = 0; k < gained.length; k++) {
    if (now.indexOf(gained[k]) < 0) now.push(gained[k])
  }
  G.pileVals[mine] = now
  // 钓牌判定读的是 valuesOf，**不读 pileVals** —— 所以吃到的点数
  // 还要单独交给它一份（见 G.mergeGain 的声明处）
  G.mergeCard = card
  G.mergeGain = gained
}

// ---------- 【抄底】：掀走堆上所有被叠放的牌 ----------
//
// 不管宿主 —— 压在底下的全掀出来，宿主留在堆上。
// 所以它是**保护的硬解**：盾就是被叠放的牌，一次全掀掉，宿主当场裸着。
//
// **对双方都生效**，那是有意的：它会把自己垫的盾、埋的牌一起收走，
// 所以得算「掀掉赚几分 vs 拆掉自己几个锅」。
// 改成「只收对方的」就没有决策了，只是个按钮。
//
// ---- 掀走抬水垫的那张，它加的点数**不退** ----
//
// 照净水那条「清标签不清结果」—— 抬水的加点早写进 pileVals 了，
// 而抄底收的是**牌**，不是账。退回去就得问「退完撞上谁、要不要再判一次
// 匹配」，那是连锁判定。
//
// 不走 harvestAt：被叠放的牌**不在堆上**，而那个函数是按堆的下标走的。
// 直接结算 + 记分，跟收色散收一个路子
function dredgeFor(G, side) {
  if (G.stacked.length === 0) return
  let got = 0
  for (let i = 0; i < G.stacked.length; i++) {
    G.gone.push(G.stacked[i].card.rank)
    got++
  }
  G.stacked = []
  G.score[side] += got
  G.stat.catches[side]++
  G.stat.caught[side] += got
}

// ---------- 打出之后的技能（照 afterPlay / afterPlayHead / afterPlayTail） ----------
//
// 顺序严格照源码：
//   量水 → 窥视 → 照水 → 压邻 / 封色 / 分水 → 掏手 → 掏库 → 窄口 → 满篓
//   → 干塘 或 见底 → 退潮 → 洪水 → 收色 → 撒网 → 对换 / 摘钩 / 压舱
//   → 冻结 → 换水 → 择饵 → 同花 → 同号 → 观潮
// 源码里收牌要演特效，拆成了 head / tail 两段靠定时器接力；这边直接顺着跑。
// 玩家那几件要停下来等人选（freezePending 等），模拟里两侧都走 AI 的启发式。
//
// 这时候打出那张**已经在堆上**，所以挂效果的那几件（inPile）一般都挂得上 ——
// 除非量水先把它收走了。挂上之后它要是在匹配那一步钓到牌，效果跟着失效
function afterPlay(G, side, skills, played, ai) {
  // 连竿只在这儿**记个账**，兑现在 passTurn 最前面
  if (has(skills, SK.AGAIN) && !G.againUsed) {
    G.againPending = true
  }
  // 对流同理 —— 记账，兑现在 passTurn 里那个三步状态机
  if (has(skills, SK.CROSS) && !G.forceUsed && G.forceStep === 0) {
    G.forceStep = 1
    G.forceBy = side
    G.forceUsed = true
  }
  // 一色：它的花色最多（之一）就整堆收走。跟量水一样排最前面
  if (has(skills, SK.SUITIFY)) {
    suitifyFor(G, side, played)
  }
  // 量水排在所有技能的最前面：它收整堆，排在后面的话前面那些技能改过的堆就白改了
  if (has(skills, SK.MEASURE)) {
    measureFor(G, side, skills, played)
  }
  if (has(skills, SK.PEEK)) {
    peekFor(G, side)
  }
  // ---------- 【抄底】：掀走堆上所有被叠放的牌 ----------
  //
  // 排在**技能里的第一件**（量水之后、挂效果那一族之前），而那个位置
  // 是这件技能的半条设计：
  //
  //   它掀掉的是保护，而保护在 takeAt 里才兑现（盾代替宿主被收走）。
  //   所以先掀再收 → **这一手后面的收牌当场吃到好处**：同一张牌上
  //   再带个撒网 / 见底，那几个原本有盾的宿主现在裸着，收得走了。
  //   排在后面的话盾早被那几件消耗完了，抄底只能掀个空
  if (has(skills, SK.DREDGE)) {
    dredgeFor(G, side)
  }
  if (has(skills, SK.LANTERN) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.LANTERN, target: null, side: side })
  }
  // ---- 抹点数那一族的三件在场效果 ----
  //
  // 压邻、封色、分水都挂在刚打出那张上，解除条件照旧是「那张被钓走」。
  // 前两件自己无点数（valuesOf 里就返回空），所以极难破；
  // 分水保留点数，对手拿同点数的来就能钩掉它
  if (has(skills, SK.VOID) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.VOID, target: null, side: side })
  }
  if (has(skills, SK.HUEVOID) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.HUEVOID, target: null, side: side })
  }
  if (has(skills, SK.ODD) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.ODD, target: null, side: side })
  }
  // 【沸水】原先在这儿挂在场效果（落堆的牌都带火）。技能删了。
  //
  // ---- 【霜降】：沸水的冰版，连代价都照抄（有点数 → 对手钓得走它）----
  //
  // **它值得单独量一遍**：它是照沸水的形状设计的，而沸水死于
  //「蔓延把它的活接走了」。冰那一族**没有自动蔓延**，所以霜降
  // 大概不会跟着死 —— 但那是推断，不是实测
  //
  // 它**自己也自带结冰**（走 selfFrost → 手冰表 → frostOnLand），
  // 那只让它晚一轮离场，不是免疫 —— 「钓走它就解除」那条解照旧成立
  if (has(skills, SK.FROSTFALL) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.FROSTFALL, target: null, side: side })
  }
  // 【寒色】：持续造钥匙，只给**同一方**的同颜色牌（见 coldHueOn）——
  // 这三件在场效果里唯一不对双方生效的
  if (has(skills, SK.COLDHUE) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.COLDHUE, target: null, side: side })
  }
  // ---- 【藏凌】：把手里剩下的牌都变成钥匙 ----
  //
  // 它**不铺障碍**，所以不碰堆 —— 贴的是手冰表。
  // 排在 afterPlay 而不是 playFor：它贴的是「打出这张之后手里剩下的」，
  // 所以得等那张牌已经离手。
  //
  // **钥匙必须有限** —— 它一次只贴手里那几张，补牌补上来的新牌不带冰。
  // 持续无限那一版（在场时你打出的牌都自带冰）手算 +6，整族当场失衡
  if (has(skills, SK.HIDE)) {
    const mine = G.hands[side]
    for (let i = 0; i < mine.length; i++) addFrostHand(G, mine[i])
  }
  // 掏手、掏库：往堆上倒垃圾
  if (has(skills, SK.DUMP)) {
    dumpFor(G, side)
  }
  if (has(skills, SK.SPILL)) {
    spillFor(G, side)
  }
  // 窄口（削对方手牌上限）、满篓（抬自己的），都挂在刚打那张上
  if (has(skills, SK.NARROW) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.NARROW, target: null, side: side })
  }
  if (has(skills, SK.CREEL) && inPile(G, played)) {
    G.held.push({ source: played, skill: SK.CREEL, target: null, side: side })
  }
  // 组合技【干塘】：退潮 × 见底撞在同一张牌上时不分别结算 ——
  // 整堆各减这张的牌面点数，收走归零的
  const combo = has(skills, SK.EBB) && has(skills, SK.LOWTIDE)
  if (combo) {
    ebbTideFor(G, side, played)
  } else if (has(skills, SK.LOWTIDE)) {
    lowTideFor(G, side)
  }
  if (!combo && has(skills, SK.EBB)) {
    ebbFor(G, played)
  }
  if (has(skills, SK.FLOOD)) {
    floodFor(G, side)
  }
  // 收色、撒网：散着收一批
  if (has(skills, SK.HUE)) {
    hueFor(G, side, played)
  }
  if (has(skills, SK.CAST)) {
    castFor(G, side, played)
  }
  // 伏流：跟收色、撒网同组（都是「换一条判定线」的收牌技能），
  // 排在野火前面 —— 照野火那条理由：收牌的先收完，点火的最后来
  if (has(skills, SK.FLOW)) {
    straightFor(G, side, played)
  }
  // 涉水：同组，步长放宽到 2
  if (has(skills, SK.WADE)) {
    wadeFor(G, side, played)
  }
  // 探潮（原型）：跟伏流、涉水同组
  if (has(skills, SK.PROBE)) {
    probeFor(G, side, played)
  }
  // 野火：排在收色、撒网**后面** —— 它们先把该收的收掉，
  // 野火再给剩下的点火。反过来野火刚点着的会被收色当场端走
  if (has(skills, SK.WILD)) {
    // 带上 played：连锁要知道「同点数」是哪个点数（见 wildfireFor 开头）
    wildfireFor(G, side, played)
  }
  // 动对方手牌那几件，排在冻结**前面**（照「贵的赢」，见源码 afterPlayTail 那段）。
  //
  // 死水：废 DEAD_COUNT 张。一张一张挑，**每挑一次重算池子** ——
  // 上一张废掉之后它就不在池子里了，不然两张会挑中同一个
  if (has(skills, SK.DEAD)) {
    for (let n = 0; n < DEAD_COUNT; n++) {
      const at = ai.deadPick(G, side)
      if (at < 0) break
      doDead(G, side, at)
    }
  }
  if (has(skills, SK.SWAPCARD) || has(skills, SK.UNHOOK) || has(skills, SK.PRESS)) {
    const which = has(skills, SK.SWAPCARD) ? SK.SWAPCARD
      : (has(skills, SK.UNHOOK) ? SK.UNHOOK : SK.PRESS)
    const other = side === ME ? FOE : ME
    if (G.hands[other].length > 0) {
      doTakeFrom(G, side, which, ai.takePick(G, side), ai)
    }
  }
  if (has(skills, SK.FREEZE) && inPile(G, played)) {
    const other = side === ME ? FOE : ME
    if (G.hands[other].length > 0) {
      const at = ai.freezePick(G, side)
      if (at >= 0) {
        G.held.push({
          source: played, skill: SK.FREEZE, target: G.hands[other][at], side: side
        })
      }
    }
  }
  // 换水排在观潮前面（源码里一个回合只停一次人）
  if (has(skills, SK.SWAP) && G.hands[side].length > 0) {
    const at = ai.swapPick(G, side)
    if (at >= 0) {
      shuffleBack(G, takeFromHand(G, side, at))
    }
  }
  if (has(skills, SK.PICK) && G.deck.length > 1) {
    const tops = topCards(G, PICK_LOOK)
    doPickDeck(G, ai.pickDeck(G, tops), tops.length)
  }
  // 同花：翻牌库顶拿第一张同花色的，翻过的洗回去。不停人
  if (has(skills, SK.SUITFIND) && G.deck.length > 0) {
    suitFindFor(G, side, played)
  }
  // 同号：牌库里同点数的那几张挑一张
  if (has(skills, SK.TWIN)) {
    const pool = twinPool(G, played)
    if (pool.length > 0) {
      pullFromDeck(G, side, pool[ai.twinPick(G, side, pool)])
    }
  }
  // 择饵赢过观潮：两件撞在同一张牌上时只走择饵（源码对两侧都加了这道闸）
  if (has(skills, SK.TIDE) && !has(skills, SK.PICK) && G.deck.length > 1) {
    const tops = topCards(G, TIDE_LOOK)
    sinkMarked(G, ai.tideSink(G, tops))
  }
}

// 量水：点数正好等于**堆上张数（含它自己）** → 整堆连它一起收走（照 measureFor）。
// 护着的牌是网里的洞：堆上只要有一张钓不走的，这一网就撒不下去
function measureFor(G, side, skills, played) {
  const at = pileIndexOf(G, played)
  if (at < 0) return
  const size = G.pile.length
  if (!anyEquals(valuesOf(G, played, skills), [size], 0)) return
  for (let i = 0; i < size; i++) {
    if (i !== at && guardedAgainst(G, i, side)) return
  }
  G.stat.catches[side]++
  G.stat.caught[side] += size
  collect(G, side, 0, size)
}

// 观潮：顶上那几张里标了的沉底、没标的留在顶上，两头都保持原来的先后（照 sinkMarked）。
// marks 跟 topCards 对齐，第 0 个是最顶上那张
function sinkMarked(G, marks) {
  const taken = []
  for (let i = 0; i < marks.length && G.deck.length > 0; i++) taken.push(G.deck.pop())
  const bottom = []
  for (let i = taken.length - 1; i >= 0; i--) if (marks[i]) bottom.push(taken[i])
  G.deck = bottom.concat(G.deck)
  for (let i = taken.length - 1; i >= 0; i--) if (!marks[i]) G.deck.push(taken[i])
}

// 牌库顶往下数 n 张（照 topCards）。第 0 个是最顶上那张
function topCards(G, n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const at = G.deck.length - 1 - i
    if (at < 0) break
    out.push(G.deck[at])
  }
  return out
}

// 顶上 n 张一起沉到底，**顺序原样搬**（照 sinkTops）
function sinkTops(G, n) {
  const moved = []
  for (let i = 0; i < n && G.deck.length > 0; i++) {
    moved.push(G.deck.pop())
  }
  moved.reverse()
  G.deck = moved.concat(G.deck)
}

// 择饵落地：顶上那几张里留第 keep 张，其余沉底（照 doPickDeck）
function doPickDeck(G, keep, size) {
  const tops = topCards(G, PICK_LOOK)
  if (tops.length === 0) return
  const at = keep < 0 || keep >= tops.length ? 0 : keep
  const card = tops[at]
  sinkTops(G, tops.length)
  G.deck.push(card)
}

// 把一张牌塞回牌库并**真洗进去**（照 shuffleBack）
// 【探潮】原型。严格连续、这张可以不参与、只收组成顺子的牌（跟伏流、涉水同一套 chainHarvest）
const PROBE_OPT = { self: 'none', step: 1, pileMin: 1, hand: 0 }
function probeFor(G, side, card) {
  const at0 = pileIndexOf(G, card)
  if (at0 < 0) return
  const seen = {}
  for (let i = 0; i < G.pile.length; i++) {
    const vals = pileValsAt(G, i)
    for (let k = 0; k < vals.length; k++) seen[vals[k]] = true
  }
  let flipped = 0
  while (G.deck.length > 0) {
    const c = G.deck.pop()
    const vals = landVals(G, c, [], false)
    let dup = false
    for (let k = 0; k < vals.length; k++) if (seen[vals[k]]) dup = true
    if (dup) { shuffleBack(G, c); break }
    pushPile(G, c, side, GUARD_NONE, vals)
    for (let k = 0; k < vals.length; k++) seen[vals[k]] = true
    flipped++
  }
  G.stat.probe = G.stat.probe || { fires: [0, 0], flipped: [0, 0], hits: [0, 0], got: [0, 0] }
  const st = G.stat.probe
  st.fires[side]++
  st.flipped[side] += flipped
  const at = pileIndexOf(G, card)
  if (at < 0) return
  const before = G.score[side]
  const best = chainHarvest(G, side, at, PROBE_OPT, false)
  if (best === null) return
  st.hits[side]++
  st.got[side] += G.score[side] - before
}

function shuffleBack(G, card) {
  G.deck.push(card)
  G.deck = shuffle(G.rng, G.deck)
}

// 窥视：翻开对方一张还没被看过的手牌（照 peekFor）
function peekFor(G, side) {
  const other = side === ME ? FOE : ME
  const hidden = []
  for (let i = 0; i < G.seen[other].length; i++) {
    if (!G.seen[other][i]) hidden.push(i)
  }
  if (hidden.length === 0) return
  G.seen[other][pickOne(G.rng, hidden)] = true
}

// ---------- 掏手 / 掏库：往堆上倒垃圾（照 dumpFor / spillFor） ----------
//
// 两件掏出来的牌点数**写死 0，不走 landVals** —— 它们本来就是当垃圾用的，
// 场上的抹点数效果再抹一遍只会把 0 抹成空，而那恰好破了
// 「0 点见底扫得走」那条设计（无点数见底跳过）

// 掏手：从对方手里随机掏 DUMP_COUNT 张
function dumpFor(G, side) {
  const other = side === ME ? FOE : ME
  for (let n = 0; n < DUMP_COUNT; n++) {
    if (G.hands[other].length === 0) break
    const card = takeFromHand(G, other, randInt(G.rng, G.hands[other].length))
    pushPile(G, card, other, GUARD_NONE, [0])
  }
}

// 掏库：从牌库顶掏 SPILL_COUNT 张。**烧牌库** —— 双方共用一个，
// 烧掉的谁也摸不到，所以这一局提前收场
function spillFor(G, side) {
  for (let n = 0; n < SPILL_COUNT; n++) {
    if (G.deck.length === 0) break
    const card = G.deck.pop()
    pushPile(G, card, side, GUARD_NONE, [0])
  }
}

/// ---------- 减点数那一族（照 dropVals / anyLive / dropPile） ----------

// 每个点数各减 by，减到 0 为止、去重。**空列表原样返回** ——
// 没有点数的牌不在点数这条轴上，减点数的一概跳过它
function dropVals(was, by) {
  if (was.length === 0) return was
  const now = []
  for (let k = 0; k < was.length; k++) {
    const v = Math.max(0, was[k] - by)
    if (now.indexOf(v) < 0) now.push(v)
  }
  return now
}

// 还剩一个非零点数吗。贴过点数卡的牌因此更难被压到底
function anyLive(vals) {
  for (let k = 0; k < vals.length; k++) {
    if (vals[k] !== 0) return true
  }
  return false
}

// 整堆各减 step，**当场写回**，返回减完一个非零点数都不剩的那几张的下标
function dropPile(G, step) {
  const taken = []
  for (let i = 0; i < G.pile.length; i++) {
    // **rawVals 不是 pileValsAt** —— 同退潮那行：这里写 pileVals，
    // 读带在场效果的那个会把效果写死
    const now = dropVals(rawVals(G, i), step)
    G.pileVals[i] = now
    if (now.length > 0 && !anyLive(now)) taken.push(i)
  }
  return taken
}

// 把下标列表变成 harvestPile 要的 wanted 数组
function wantedOf(G, list) {
  const wanted = []
  for (let i = 0; i < G.pile.length; i++) wanted.push(list.indexOf(i) >= 0)
  return wanted
}

// 见底：整堆点数往下压 LOW_TIDE_STEP，收走压到 0 的（照 lowTideFor）。
// 它自己是 0 点（valuesOf），而且就在堆上，所以**连自己一起收走** —— 保底 +1
function lowTideFor(G, side) {
  if (G.pile.length === 0) return
  const taken = dropPile(G, LOW_TIDE_STEP)
  if (taken.length > 0) harvestPile(G, side, wantedOf(G, taken))
}

// 组合技【干塘】：退潮 × 见底。整堆各减这张的**牌面点数**，收走归零的（照 ebbTideFor）
function ebbTideFor(G, side, card) {
  const step = card.value
  if (step <= 0 || G.pile.length === 0) return
  const taken = dropPile(G, step)
  if (taken.length > 0) harvestPile(G, side, wantedOf(G, taken))
}

// 退潮：**牌堆顶** EBB_COUNT 张各减这张的牌面点数。**不收牌**（照 ebbFor）。
// 读牌面点数，不读 valuesOf（那是 0，减 0 等于没减）。
//
// 范围原先是「它自己连左侧两张」，所以它必须留在堆上、位置还得够深
//（沉底会把它废掉）。改成堆顶之后**不再依赖它在哪** ——
// 沉底落堆底、或者被前面的技能收走都照样退。
// dropVals 对空列表原样返回，所以没有点数的牌自动跳过
function ebbFor(G, card) {
  const step = card.value
  if (step <= 0 || G.pile.length === 0) return
  const from = Math.max(0, G.pile.length - EBB_COUNT)
  for (let i = from; i < G.pile.length; i++) {
    // **rawVals 不是 pileValsAt**：这一行**写** pileVals，
    // 从带在场效果的那个读就会把效果写死（焦壳在场时 → 空点数永久化）。
    // 退潮改的是「存着的点数」，所以读也该读存着的
    G.pileVals[i] = dropVals(rawVals(G, i), step)
  }
}

// 洪水：从牌库一张张往堆上翻，直到撞上点数（照 floodFor）。
// 判撞在落堆之前，翻上去的牌不带技能，翻空了就是白打。
// 打出那张这时候还在堆上，所以它也可能被这一下收走
function floodFor(G, side) {
  // ---- 发动闸：堆上不够 FLOOD_MIN 张就不发动 ----
  //
  // 它自己**还没进堆**（洪水在 afterPlay 里结算，而打出那张在 playFor
  // 里就落堆了）—— 所以这儿数的堆**包含它自己**。
  // 「堆上至少 2 张」= 除了它自己还得有 1 张。
  //
  // 这一条掐的是「先手第一手空堆」那个机会成本为 0 的时机（见旋钮那段）
  if (FLOOD_MIN > 0 && G.pile.length < FLOOD_MIN) return
  // 诊断口：发动时堆上几张（含它自己）。「只有它自己」= 空堆开局那一手
  const fd = G.stat.flood
  const pileWas = G.pile.length
  fd.fires[side]++
  fd.pileSum[side] += pileWas
  if (pileWas <= 1) fd.thin[side]++
  let hitAt = -1
  let flipped = 0
  // FLOOD_CAP 是**最多翻几张**（0 = 不限）。翻满了还没撞上就停手，
  // 那几张留在堆上 —— 跟「翻空了牌库」同一个下场（白打一张，还给对手堆了钩点）
  while (G.deck.length > 0 && (FLOOD_CAP === 0 || flipped < FLOOD_CAP)) {
    const card = G.deck.pop()
    const at = catchStart(G, card, side, [], false)
    // 翻上去的牌不带技能，但场上的抹点数效果照样管它
    pushPile(G, card, side, GUARD_NONE, landVals(G, card, [], false))
    flipped++
    if (at >= 0) { hitAt = at; break }
  }
  fd.flipSum[side] += flipped
  if (flipped === 0 || hitAt < 0) return
  // ---- 收走那一段里，每张**本来属于谁** ----
  //
  // 必须在 collect **之前**数（它会重建整个堆）。
  // 刚翻上来的那几张在堆的末尾，所以下标 >= top − flipped 的是新牌
  const top = G.pile.length
  const freshFrom = top - flipped
  for (let i = hitAt; i < top; i++) {
    if (i >= freshFrom) fd.gotFresh[side]++
    else if (G.pileByFoe[i] === (side === FOE)) fd.gotOwn[side]++
    else fd.gotTheirs[side]++
  }
  // 实收照 collect 的返回值算（叠放之后它不等于区间长度，见 harvestAt）
  const got = collect(G, side, hitAt, G.pile.length - hitAt)
  fd.gotSum[side] += got
  G.stat.catches[side]++
  G.stat.caught[side] += got
}

// ---------- 收色 / 撒网（照 harvestIndices、hueFor、castFor） ----------

// 散收：wanted[i] 为真的那几格一起收走，再记一笔统计。
// 收牌本身整个交给 harvestAt（叠放的账在那儿算，见它那段注释）
function harvestPile(G, side, wanted) {
  const taken = harvestAt(G, side, wanted)
  if (taken > 0) {
    G.stat.catches[side]++
    G.stat.caught[side] += taken
  }
  return taken
}

// 收色：堆上同花色的一起收走（比的是 pileSuitAt —— 染水改过的算改后的）。
// **只有它自己的时候什么也不收**，不然它就是稳赚 1 分、零风险
function hueFor(G, side, card) {
  const wanted = []
  let hits = 0
  for (let i = 0; i < G.pile.length; i++) {
    const hit = sameSuit(G, pileSuitAt(G, i), card.suit, side)
    if (hit) hits++
    wanted.push(hit)
  }
  if (hits <= 1) return
  harvestPile(G, side, wanted)
}

// 同奇偶吗：任一个点数跟 odd 同奇偶就算（0 算偶数，一个点数都没有的不算）
function sameParity(vals, odd) {
  for (let k = 0; k < vals.length; k++) {
    if ((vals[k] % 2 === 1) === odd) return true
  }
  return false
}

// 撒网：从它自己起**往左连续**比奇偶，同奇偶就收，遇到不同的就停。
// 它不在堆上了（被前面的技能收走）就从堆顶起算。
// 自己的奇偶按**牌面点数**算，堆上那些按现在的点数算
function castFor(G, side, card) {
  const odd = card.value % 2 === 1
  const wanted = G.pile.map(function () { return false })
  const at = pileIndexOf(G, card)
  const from = at >= 0 ? at : G.pile.length - 1
  let hits = 0
  for (let i = from; i >= 0; i--) {
    if (!sameParity(pileValsAt(G, i), odd)) break
    wanted[i] = true
    hits++
  }
  if (hits <= 1) return
  harvestPile(G, side, wanted)
}

// ---------- 【伏流】：它当通配，凑最长的顺子（照 straightFor） ----------
//
// 第四条匹配线（点数 / 花色 / 累加不超 21 / **顺子**）。
// 设计论证在 `draw-skills.uts` 那条，这儿只记实现上的三件事。
//
// ---- 一、「当任意点数」**只在这条路径上**成立 ----
//
// 它在 valuesOf 里是**无点数**那一族，所以别人压根按点数钓不到它。
// 绝不能把通配写进 valuesOf / cardVals —— 那两层是**双向**的，
// 写进去它就成了「谁都接得上」的超级靶子。合流就是这么翻的（−1.00）。
//
// ---- 二、枚举「区间」，不是从它自己往外长 ----
//
// 顺子 = 一段连续点数 [a,b]，其中**恰好一个点数由它填**，
// 其余每个点数都得有堆上的牌顶上。从它自己往两边长那种写法**漏情形** ——
// 它填的可能是中间的缺口（堆上 5、7，它当 6），不只是接在外侧。
//
// ---- 三、点数范围**读堆**，不写死 1..13 ----
//
// 「点数往上不设限」是真的（抬水能抬到 14、20），所以上界取堆上最大 + 1；
// 下界取 0（见底能压到 0，而 0 跟 1 算差 1，所以 0-A-2 合法）。
//
// ---- 四、用**数组**不用 Map（跟源码一致）----
//
// 下标就是点数、值是堆上那一格（−1 = 堆上没有这个点数）。
// 源码那边一处 Map 都没有（UTS 的支持不确定），这边照着来 ——
// **副本的形状跟源码一致才好核对**。
//
// skipAt 传它自己那一格（它是通配、不占点数格）；AI 预估时堆里还没有它，
// 传 −1。无点数的牌和护着的牌一概跳过
function deepestByVal(G, skipAt, side) {
  // 先求堆上最大点数 —— 数组开多大得先知道
  let top = 0
  for (let i = 0; i < G.pile.length; i++) {
    if (i === skipAt || guardedAgainst(G, i, side)) continue
    const vals = pileValsAt(G, i)
    for (let k = 0; k < vals.length; k++) {
      if (vals[k] > top) top = vals[k]
    }
  }
  // 长度 top + 2：下标 0..top+1，**最后那格留给「它接在最大那张外侧」**
  const deepest = []
  for (let v = 0; v <= top + 1; v++) deepest.push(-1)
  for (let i = 0; i < G.pile.length; i++) {
    if (i === skipAt || guardedAgainst(G, i, side)) continue
    const vals = pileValsAt(G, i)
    for (let k = 0; k < vals.length; k++) {
      const v = vals[k]
      // 取**最深**那张（下标最小）—— 跟 catchStart「从 i = 0 往上找」一个口径
      if (v >= 0 && v < deepest.length && deepest[v] < 0) deepest[v] = i
    }
  }
  return deepest
}

// ---- `bestStraight` / `bestGapped` / `bestWithHand` 三个函数**合并了** ----
//
// 它们本来是「通配 + 严格连续」「自己的点数 + 差 2」「通配 + 严格 + 手牌补」
// 三套分叉的实现，而那四个维度**之间会互相影响**（手牌补解决了薄堆却引爆了
// 先手溢价）。分开调只能一次看一个维度，看不见交互 ——
// 所以统一成了下面那个可配置的 `bestChain`。
//
// 判据（先比张数、张数相同取最深）和「步长 2 等于区间里不能连续缺两个」
// 这两条推导都搬进 bestChain 的注释里了

function wadeFor(G, side, card) {
  const wd = G.stat.wade
  wd.fires[side]++
  const at0 = pileIndexOf(G, card)
  if (at0 < 0) return
  const best = chainHarvest(G, side, at0, WADE_OPT, FLOW_SPAN)
  if (best === null) return
  wd.hits[side]++
  wd.lenSum[side] += best.count
  wd.gotSum[side] += best.got
}

// 【涉水】能凑出几张（AI 挑牌的预估）。
//
// 它收**整段**，所以估的是位置范围（跟 straightCount 一个口径）：
// 它自己还没落堆、落下去在堆顶，所以上端取 G.pile.length。
// 跟 wadeFor 走同一个 bestChain，两处口径不会飘
function wadeCount(G, side, card) {
  const best = bestChain(G, side, -1, cardVals(card), WADE_OPT)
  if (best === null) return 0
  // 它收整段，所以估的是位置范围（它自己还没落堆，落下去在堆顶）
  let lo = G.pile.length
  for (let v = best.from; v <= best.to; v++) {
    if (best.deepest[v] >= 0 && best.deepest[v] < lo) lo = best.deepest[v]
  }
  return G.pile.length - lo + 1
}

// ---- 被否的一版：**「取收得更多的那个」** ----
//
// 顺子在 afterPlay 里判、普通匹配在 resolveMatch 里判，所以顺子一凑成
// 就收走、普通匹配**压根没机会比**。看着像个实现缺陷，而且【吃水】那条
// 先例说得明白：几条匹配线取收得更多的那个。
//
// 写过一版（`normalGain`：算普通匹配能收几张，顺子不如它就不发动）。
// **量出来是 +0.00** —— 伏流 +3.47 → +3.49、涉水 +1.01 → +1.01，
// 两件都在标准误（0.12）之内。
//
// 原因想明白了：两者收的形状一样（都是「从某张到堆顶」），而**顺子那条
// 本来就更深** —— 链有 3 个以上点数，摸到深牌的机会比「单一个同点数」高得多。
// 所以「顺子不如普通匹配」几乎不发生，那段比较是**没有收益的复杂度**。
//
// **删了。** 现在是「顺子凑成就走顺子，凑不成退回普通匹配」——
// 游戏代码（ap-fishing）从一开始就是这样，所以两边也因此一致。
// 要加回来之前先看这一段：吃水那条先例在这儿不适用，因为吃水和点数线
// 的收成形状不同（它从堆顶往下累加），而顺子和点数线的形状相同。

// 手里每个点数对应哪一张（下标），−1 = 手里没有这个点数。
// 长度跟 deepest 对齐，这样两张表能并排查
//
// 【伏流】的「从手里补牌」那一档用它（FLOW_HAND）。
// **J 不算** —— 它没有点数这条轴（只通吃），所以补不进顺子
function handByVal(G, side, len) {
  const out = []
  for (let v = 0; v < len; v++) out.push(-1)
  const hand = G.hands[side]
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === JACK) continue
    const vals = cardVals(hand[i])
    for (let k = 0; k < vals.length; k++) {
      const v = vals[k]
      if (v >= 0 && v < len && out[v] < 0) out[v] = i
    }
  }
  return out
}

// ==================== 顺子：一个可配置的判定 ====================
//
// 四个维度（2026-10-12 定的），每个都有设计后果：
//
//   self    打出那张怎么参与
//             'wild' —— 它当**通配**，填任何一个缺口（伏流那条路：填洞）
//             'own'  —— 它用**自己的牌面点数**，必须接得上（涉水那条路）
//             'none' —— 它**不参与**，只是触发器（顺子全由堆上 / 手里的牌组成）
//             'show' —— **展示手里一张，它算那张的点数**。牌留在手里 ——
//                       代价是**信息**（暴露一张手牌），不是资源。
//                       灵活度天然落在 wild 和 own 之间：通配能当 13 个点数，
//                       这档只能当手里那几个，own 只能当自己那一个
//   step    相邻两张最大差 1（严格连续）还是 2（能跳一个空位，跨洞）
//   pileMin 顺子里**堆上**的牌至少几张 —— 防止纯手牌凑成，那样跟堆就脱钩了
//   hand    最多从手里补几张（0 = 不许补）
//
// ---- 为什么要统一成一个函数 ----
//
// 这四个维度之前是三套分叉的实现（bestStraight / bestGapped / bestWithHand）
// 加四个布尔旋钮，而**它们之间会互相影响** —— 比如「手牌补」解决了薄堆
// 却引爆了先手溢价（+0.19 → +3.9，洪水那个坑）。
// 分开调只能一次看一个维度，看不见交互。统一之后能一次扫完整张表。
//
// 返回 null（凑不出来）或 { from, to, count, lo, handAt }：
// 区间两端、顺子几张、最深那张在堆上第几格、手里补的那几张的下标
const HIGH_ACE = 14

function bestChain(G, side, at0, mine, opt) {
  // 'wild' / 'show' 那两档它不占固定的点数格，所以堆上那张表要跳过它自己
  const free = opt.self === 'wild' || opt.self === 'show'
  // Q-K-A：K 后面再接一格 14 = 同一张 A（照 ap-fishing 的 withHighAce）
  const raw = deepestByVal(G, free ? at0 : -1, side)
  const deepest = []
  for (let v = 0; v <= HIGH_ACE; v++) deepest.push(v < raw.length ? raw[v] : -1)
  deepest[HIGH_ACE] = raw.length > 1 ? raw[1] : -1
  const hand = opt.hand > 0 ? handByVal(G, side, deepest.length) : null
  // 'show' 那一档：它能当的点数**限于手里有的那几个**（展示那张，牌不消耗）。
  // 打出的那张已经离手了（playFor 开头 takeFromHand），所以这张表天然不含它
  const show = opt.self === 'show' ? handByVal(G, side, deepest.length) : null
  let best = null
  const top = deepest.length - 1
  for (let a = 0; a <= top; a++) {
    for (let b = a + STRAIGHT_MIN - 1; b <= top; b++) {
      // 同一张 A 不能在一条顺子里当两次
      if (a <= 1 && b >= HIGH_ACE) continue
      let onPile = 0
      let wild = 0
      let gap = 0
      let lo = -1
      let hasMine = false
      let ok = true
      const handAt = []
      for (let v = a; v <= b; v++) {
        if (deepest[v] >= 0) {
          onPile++
          gap = 0
          if (lo < 0 || deepest[v] < lo) lo = deepest[v]
          if (mine.indexOf(v) >= 0) hasMine = true
        } else if (hand && hand[v] >= 0 && handAt.length < opt.hand) {
          handAt.push(hand[v])
          gap = 0
        } else if (opt.self === 'wild' && wild === 0) {
          wild = 1
          gap = 0
        } else if (show && show[v] >= 0 && wild === 0) {
          // 展示手里那张点数是 v 的牌 → 它这一手算 v 点。
          // **牌不摘** —— 展示完还在手里，所以这儿不往 handAt 里推
          wild = 1
          gap = 0
        } else {
          // 空位。step=1 一个都不许；step=2 最多一个连着
          gap++
          if (gap >= opt.step) { ok = false; break }
        }
      }
      if (!ok) continue
      // 堆上至少几张 —— 那道防「纯手牌凑」的闸
      if (onPile < opt.pileMin) continue
      // 'own' 那一档：顺子必须含它自己的点数
      if (opt.self === 'own' && !hasMine) continue
      // **数的是张数不是区间长度** —— step=2 时区间里有空位
      const count = onPile + handAt.length + wild
      if (count < STRAIGHT_MIN) continue
      // 判据照旧：先比张数，张数相同取最深（见 bestStraight 那段）
      if (best === null || count > best.count
        || (count === best.count && lo >= 0 && lo < best.lo)) {
        best = {
          from: a, to: b, count: count, lo: lo,
          handAt: handAt, deepest: deepest
        }
      }
    }
  }
  return best
}

// ---------- 凑成就收：顺子那两件共用的结算 ----------
//
// span 为真时收**整段**（链最深那张到最浅那张，中间一律带走），
// 否则只收链上那几张。
//
// 手里补的那几张**离场**：算不算分看 FLOW_HAND_SCORE。算分那一档是
// 「手牌直接变分」的通道；不算分那一档照凝水 / 净水「丢弃」那个先例
//（牌出场，谁也收不到）。两档的溢价都是 +3.9，所以这个机制整个否了 ——
// 旋钮留着是为了以后能重量
//
// 返回 null（凑不出来）或 { count, got }：顺子几张、实际收走几张
// exclude：这几格**只提供点数候选、不进收成**（CHAIN_FLIP_KEEP 那一档用）。
// 它在最后应用 —— 收整段那一步会把中间的一律标上，所以得等它做完再排除
function chainHarvest(G, side, at0, opt, span, exclude) {
  const best = bestChain(G, side, at0, pileValsAt(G, at0), opt)
  if (best === null) return null
  const deepest = best.deepest
  // 打出那张只有当通配（伏流）时才一定收走；涉水那张没参与顺子就留在堆上
  const selfIn = opt.self === 'wild' || opt.self === 'show'
  const wanted = G.pile.map(function (c, i) { return selfIn && i === at0 })
  let lo = at0
  let hi = at0
  for (let v = best.from; v <= best.to; v++) {
    if (deepest[v] < 0) continue
    const at = deepest[v]
    wanted[at] = true
    if (at < lo) lo = at
    if (at > hi) hi = at
  }
  if (span) {
    for (let i = lo; i <= hi; i++) wanted[i] = true
  }
  // 排除那几格 —— **放在收整段之后**，不然会被它重新标上
  if (exclude) {
    for (let k = 0; k < exclude.length; k++) {
      if (exclude[k] !== at0) wanted[exclude[k]] = false
    }
  }
  let got = 0
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i]) got++
  }
  // 手里补的那几张：**倒着摘**（下标从大到小），不然 splice 一次后面全错位
  if (best.handAt.length > 0) {
    const take = best.handAt.slice(0).sort(function (x, y) { return y - x })
    for (let k = 0; k < take.length; k++) {
      const c = G.hands[side][take[k]]
      takeFromHand(G, side, take[k])
      if (!c) continue
      if (FLOW_HAND_FATE === 'deck') {
        // **洗回牌库** —— 它参与了判定但没被任何人收走，
        // 所以不进 G.gone（它还在牌库里，庄家记牌照旧数得到它）
        shuffleBack(G, c)
        continue
      }
      // 牌确实离场了，所以照收牌的口径进 G.gone（庄家记牌要知道）
      G.gone.push(c.rank)
      if (FLOW_HAND_SCORE) {
        G.score[side]++
        got++
      }
    }
  }
  harvestPile(G, side, wanted)
  return { count: best.count, got: got }
}

function straightFor(G, side, card) {
  const st = G.stat.straight
  st.fires[side]++
  // 额外翻牌那一档：先把牌翻到堆上，再判顺子（见 CHAIN_FLIP）。
  // 照 floodFor 的做法 —— 翻上来的牌不带技能，但场上的抹点数效果照样管它
  const flipped = []
  for (let f = 0; f < CHAIN_FLIP && G.deck.length > 0; f++) {
    const c = G.deck.pop()
    pushPile(G, c, side, GUARD_NONE, landVals(G, c, [], false))
    flipped.push(G.pile.length - 1)
  }
  const at0 = pileIndexOf(G, card)
  // 它得还在堆上 —— 被前面的技能收走了就没得凑
  if (at0 < 0) return
  const best = chainHarvest(G, side, at0, FLOW_OPT, FLOW_SPAN,
    CHAIN_FLIP_KEEP ? flipped : null)
  if (best === null) return
  st.hits[side]++
  st.lenSum[side] += best.count
  st.gotSum[side] += best.got
}

// 【伏流】能凑出几张（AI 挑牌的预估，照 straightCount）。
//
// **跟 straightFor 走同一对函数**，所以两处口径不会飘。
// 差别只有一处：skipAt 传 −1 —— 这儿是**落堆之前**估的，堆里还没有它。
//
// 漏了这个预估的后果不是「AI 打得笨一点」，是**这件技能在它手里整件作废**
//（catchStart 对第四条匹配线一概返回 −1）
function straightCount(G, side, card) {
  // **落堆之前**估的，所以 at0 传 −1（堆里还没有它）、点数用 cardVals。
  // 走同一个 bestChain，所以跟结算那边口径一致
  const best = bestChain(G, side, -1, cardVals(card), FLOW_OPT)
  if (best === null) return 0
  const deepest = best.deepest
  const span = [best.from, best.to]
  if (span[0] < 0) return 0
  if (!FLOW_SPAN) return span[1] - span[0] + 1
  // 收整段那一档要估**位置**范围，不是顺子长度。
  // 它自己还没落堆 —— 落下去在堆顶，所以上端取 G.pile.length
  //（沉底那条路会落堆底，这儿不管，照 castFor 那个同样的近似）
  let lo = G.pile.length
  for (let v = span[0]; v <= span[1]; v++) {
    if (deepest[v] >= 0 && deepest[v] < lo) lo = deepest[v]
  }
  return G.pile.length - lo + 1
}

// ---------- 【野火】：给堆上的牌点火。就这一句 ----------
//
// 【燃烧】拿到收割权之后（全堆带火 → 关键词收走整堆），野火身上三样东西
// 全部不需要了：
//
//   **不收牌** —— 收割权归关键词；
//   **不无点数** —— 那个代价是为「收一片」付的，而它不收了。
//     （它在无点数族里进出过**四次**，四次来回的根都是这一个问题。）
//   **不要连锁**（获取下一张【野火】）—— 连锁是为了压「它得回来收」的
//     触发间隔，而它现在不用回来。
//
// 双吃也不用管：扫走整堆时它自己也在里面、被收走了，
// 于是 resolveMatch 找不到它（见 burnStep 那段）。
//
// ---- 幅度旋钮：点几张（WILD_SEED）----
//
//   0（默认）= 点**整堆**（连它自己）→ 全堆带火当场成立 → **当场闭合**
//   1        = 只点**它自己**（火种）→ 要等蔓延铺开才闭合
//
// 两档的差别不是强弱，是**结构** —— 门槛那一轮量出来「等几手闭合」
// 是个坏区间（门槛 ≥3 时对手闭合得比我多：我付钱攒了个公共池子，
// 那是压底那条规律第二次应验）。
//
// ---- 两条点火的阻挡，形状不同 ----
//
//   **保护**（凝水）—— 挡掉点火，而且**盾跟着离场**（照保护的通用代价：
//     垫着的牌代替宿主被收走，不管收它的是什么）。带保护的牌既不着火、
//     也不被收走，所以堆上有一张就让「全堆带火」永远不成立 ——
//     **一张牌锁死整条线**。那是这条规则最漂亮的现成对位解。
//   **结冰** —— 冰火相消，两个都没了。挡一手，代价是那片冰。
//
// 盾的 rank 要进 G.gone（庄家记牌的依据），而且算点火那一方的分 ——
// 它确实拿走了那几张牌。消耗排在循环**之后**：wardUnder 读的是堆的下标
function wildfireFor(G, side, card) {
  // ---------- 连锁：**获取下一张【野火】** ----------
  //
  // 它的理由**换了**。原先是「压触发间隔」—— 那时野火得回来收火，
  // 而火的留存只有 3.3 回合、间隔 26 回合，差八倍。
  //
  // 现在它不用回来收了（关键词收），所以连锁抬的是**火种的数量**：
  // 每条链多一个火种 = 多一条蔓延前沿 = 闭合来得更快。
  // 火有两条前沿、而堆只在顶上长，所以**多一个火种就多 +2 格/手**的推进。
  //
  // 代价是现成的：池子跟槽宽走（窄槽取到率量过 46.6%），而且
  // **取回来那张也是一张要打出去的牌** —— 它占掉你 26 次出牌里的一次
  const wd = G.stat.wild
  wd.fires[side]++
  const size = G.pile.length
  // ---- 发动门槛（WILD_NEED）：堆上不够这么多张就不点火 ----
  //
  // WILD_NEED_CHAIN 决定这个条件**管不管连锁** —— 那是两个候选写法的分别：
  //   管   = 「当场上的牌大于 1 时，点燃自己、获取下一张」（链也断）
  //   不管 = 「获取下一张；当场上的牌大于 1 时，点燃自己」（链照续）
  const canFire = size >= WILD_NEED
  if (WILD_CHAIN && (canFire || !WILD_NEED_CHAIN)) {
    const pool = fuelPool(G, side)
    if (pool.length > 0 && pullFromDeck(G, side, pool[0])) wd.took[side]++
  }
  if (size === 0 || !canFire) return
  // ---- WILD_SEED=1（默认）：**只点它自己** ----
  if (WILD_SEED) {
    const at = pileIndexOf(G, card)
    if (at >= 0 && !wardAt(G, at) && !iceMeltsFire(G, at)) {
      G.pileBurn[at] = 1
      wd.burnSum[side]++
    }
    return
  }
  // ---- 点整堆那一档（WILD_SEED=0），**只点火、不收牌** ----
  //
  // 「收走带火的」那一半**整个删了** —— 收割权归关键词（见 burnStep）。
  // 留着就是一张牌收两次，而且那两次收的还是同一批牌
  const wardHit = []
  for (let i = 0; i < size; i++) {
    // 保护：挡掉点火，而且盾跟着离场（见抬头那段）
    if (wardAt(G, i)) {
      wardHit.push(i)
      continue
    }
    if (pileBurnAt(G, i) > 0) continue
    // 结冰：冰火相消，两个都没了（跟保护那一支的区别是**互毁**）
    if (iceMeltsFire(G, i)) continue
    G.pileBurn[i] = 1
    wd.burnSum[side]++
  }
  let shields = 0
  for (let k = 0; k < wardHit.length; k++) {
    const at = wardUnder(G, wardHit[k])
    if (at < 0) continue
    const shield = pullStacked(G, at)
    if (shield) {
      G.gone.push(shield.rank)
      shields++
    }
  }
  if (shields > 0) G.score[side] += shields
}

// ---------- 压舱 / 摘钩 / 对换（照 doTakeFrom、doGiveBack） ----------

function giveTo(G, side, card, seen) {
  G.hands[side].push(card)
  G.seen[side].push(seen === true)
}

function doTakeFrom(G, side, skill, index, ai) {
  const other = side === ME ? FOE : ME
  if (index < 0 || index >= G.hands[other].length) return
  const card = takeFromHand(G, other, index)
  if (skill === SK.PRESS) {
    shuffleBack(G, card)
    return
  }
  // 摘钩、对换都把牌拿到自己手上（可能超过上限 —— refill 只负责「补到」）。
  // 从对方手里拿的牌，对方当然知道它是什么
  giveTo(G, side, card, true)
  if (skill !== SK.SWAPCARD) return
  // 对换：再挑一张自己的还他
  const back = ai.swapPick(G, side)
  if (back >= 0 && G.hands[side].length > 0) {
    const give = takeFromHand(G, side, back)
    giveTo(G, other, give, true)
  }
}

// ---------- 同号 / 同花（照 twinPool、pullFromDeck、suitFindFor） ----------

function twinPool(G, card) {
  const out = []
  for (let i = G.deck.length - 1; i >= 0; i--) {
    if (G.deck[i].rank === card.rank) out.push(G.deck[i])
  }
  return out
}

// ---------- 【野火】连锁的燃料池：**能再触发野火的牌** ----------
//
// 不是「同点数」—— 那只是真条件的一个特例。连锁要的是
//「这张打出去会不会**又带野火**」，而槽可以挂多个标签（几个点数、
// 甚至整个花色），所以那两件事不等价。直接问 `skillsOf`，
// 池子就自动跟着槽走：单点数槽 4 张、多点数槽 8~16、花色槽 12。
//
// 两条闸是白送的，因为 `skillsOf` 本来就带：
//   **J 不进池** —— `triggersOf` 对 J 直接返回空（J 只有通吃）；
//   **死水废掉的不进池** —— `skillsOf` 第一行就 return []。
// 两条都对：那种牌打出去不触发野火，取回来就断链。
//
// 牌库从后往前扫（`pop` 那头是牌库顶），所以 `pool[0]` 是最靠顶的那张。
// 取完会洗（见 pullFromDeck），所以「第一张」只在取的那一瞬成立
function fuelPool(G, side) {
  const out = []
  for (let i = G.deck.length - 1; i >= 0; i--) {
    if (has(skillsOf(G, side, G.deck[i]), SK.WILD)) out.push(G.deck[i])
  }
  return out
}

// 【获取下一张】的取牌动作。**取完洗牌库**（词条里写明的）。
//
// 洗这一下是**有意的限制**，不是整洁癖：
//   不洗的话「从顶往下第一张」是确定的，于是观潮 / 择饵 / 活水
//   一看牌库顶就能把整条连锁**排好**（野火一局要取好几张）——
//   那不是给信息类技能一个兑现口子，那是把随机性整段删掉。
//   洗了之后它退回「一张随机的符合牌」，而代价仍然在。
//
// 副作用要记住：**它会毁掉你自己攒的情报**。
// 刚用观潮看完牌库顶再打一张野火，那两张就白看了 ——
// 于是「信息类 + 检索类」变成一个要排序的组合，而不是无脑叠加。
//
// ---- 这个函数**同号也走**，所以洗牌连带改了同号 ----
//
// 那是对的方向：检索类三件现在口径一致了（同花本来就洗回牌库）。
// 「搜过牌库就洗」是通行规矩，而原先同号是**悄悄抽走、顺序不动**。
//
// **但同号得重量** —— 它现价 50 是按「不洗」那一档的 X=+1.31 定的。
// 预计变化很小（同号挑的是花色、不是位置，洗牌只影响之后的摸牌），
// 可「预计很小」这一季已经被打脸好几次了，所以还是量
function pullFromDeck(G, side, card) {
  let at = -1
  for (let i = 0; i < G.deck.length; i++) {
    if (G.deck[i] === card) { at = i; break }
  }
  if (at < 0) return false
  G.deck.splice(at, 1)
  giveTo(G, side, card, false)
  G.deck = shuffle(G.rng, G.deck)
  return true
}

// 同花：翻牌库顶拿第一张同花色的，翻过的其余**洗回牌库**
function suitFindFor(G, side, card) {
  const flipped = []
  let got = null
  while (G.deck.length > 0) {
    const one = G.deck.pop()
    // 认牌面花色 —— 牌库里的牌还没落堆，染水碰不到它们
    if (sameSuit(G, one.suit, card.suit, side)) { got = one; break }
    flipped.push(one)
  }
  if (flipped.length > 0) {
    G.deck = shuffle(G.rng, G.deck.concat(flipped))
  }
  if (got !== null) {
    giveTo(G, side, got, false)
  }
}

// ---------- 这张打出去，会让【燃烧】闭合吗？能的话扫走几张 ----------
//
// 估的是 burnStep 那一步：牌落堆（**不带火** —— burnOnLand 恒为 0，
// 除非它自带）→ 蔓延 → 全堆带火就收走整堆。
//
// 所以这儿必须**照 spreadFire 的算法重算一遍**（读旧写新、只点没烧着的、
// 保护和冰那两格点不着）。算法抄一遍而不是复用，是因为真函数会改状态 ——
// 而这儿是 AI 的预估，不能动盘面。
//
// **两处要跟真实现对齐，错一处 AI 就会打错牌：**
//   落在哪一格（沉底 → 堆底，否则堆顶）—— 蔓延是位置敏感的；
//   它自带不自带火（野火那一档 WILD_SEED，以及将来的「自带燃烧」类）
function burnSweepCount(G, card, skills, side) {
  const size = G.pile.length
  // 空堆：落下去就 1 张。自带火的话当场闭合收走自己（兜底那条），
  // 但门槛 > 1 时那条兜底不响
  const sink = has(skills, SK.SINK)
  // 野火**自带燃烧** —— 它落下那一格带火。点整堆那一档（WILD_SEED=0）
  // 整堆都带，两档对这儿都是「它自己带火」，所以不分支。
  //
  // **但要读 WILD_NEED**：发动门槛看的是**落完**的张数（size + 1）——
  // 不读的话 AI 会以为落在空堆上也点火，而规则不点，于是它据此打错牌。
  // 那种「AI 和规则两张嘴」的 bug 是静默的（门槛那条也是同一个理由）
  const selfBurn = has(skills, SK.WILD) && (size + 1) >= WILD_NEED
  if (size === 0) return (selfBurn && BURN_MIN <= 1) ? 1 : 0
  // 旧的火况 + 新落那张（插在堆顶或堆底）
  const burn = []
  for (let i = 0; i < size; i++) burn.push(pileBurnAt(G, i) > 0 ? 1 : 0)
  const blocked = []
  // **frostAt 而不是 iceMeltsFire** —— 后者会把冰清掉（相消），
  // 而这儿是预估，不能动盘面
  for (let i = 0; i < size; i++) blocked.push(wardAt(G, i) || frostAt(G, i))
  if (sink) {
    burn.unshift(selfBurn ? 1 : 0)
    blocked.unshift(false)
  } else {
    burn.push(selfBurn ? 1 : 0)
    blocked.push(false)
  }
  const n = burn.length
  // **门槛要跟 burnStep 读同一个数** —— 不然 AI 会以为这一手能闭合、
  // 据此打出一张牌，而规则不发动。那种「AI 和规则两张嘴」的 bug 是静默的
  if (n < BURN_MIN) return 0
  // 点整堆那一档：它一落堆整堆都带火 → 闭合必成（除了保护 / 冰那几格）
  if (!WILD_SEED && selfBurn) {
    for (let i = 0; i < n; i++) {
      if (!blocked[i]) burn[i] = 1
    }
    for (let i = 0; i < n; i++) {
      if (burn[i] === 0) return 0
    }
    return n
  }
  // 蔓延一次：读旧写新，只点没烧着的，保护 / 冰那几格点不着
  const next = burn.slice(0)
  for (let i = 0; i < n; i++) {
    if (burn[i] === 0) continue
    if (i > 0 && next[i - 1] === 0 && !blocked[i - 1]) next[i - 1] = 1
    if (i < n - 1 && next[i + 1] === 0 && !blocked[i + 1]) next[i + 1] = 1
  }
  for (let i = 0; i < n; i++) {
    if (next[i] === 0) return 0
  }
  return n
}

// 这张打出去，收色 / 撒网能扫走几张（含它自己）。两件都没带就是 0。
// AI 挑牌要用（照源码的 harvestCount）。估在落堆之前，堆里还没有这张：
// 撒网从堆顶往左连续数，收色数同花色的
function harvestCount(G, card, skills, side) {
  // ---------- 【燃烧】闭合扫堆：AI **必须**在这儿估 ----------
  //
  // 不加这一项的话这条规则会量出接近 0 —— 而那是**启发式的愚蠢，
  // 不是机制的价值**。这一季栽过一次：窥视 / 照水量出 −0.19，
  // 查出来是 `wants` 列表在给无效技能倒扣分。
  //
  // 收色、撒网当初也是靠在这儿补一次估才没被 AI 当普通饵打出去
  //（见下面那条注释），这儿照同一个先例。
  //
  // 它排在最前面是因为**闭合会收走整堆**，比任何单项都多 ——
  // 底下那几支（伏流、涉水、染水）都是 return，排后面就被它们挡住了
  const sweep = burnSweepCount(G, card, skills, side)
  if (sweep > 0) return sweep
  const hue = has(skills, SK.HUE)
  const cast = has(skills, SK.CAST)
  // 【伏流】也要在这儿估 —— 它是第四条匹配线，catchStart 对它一概返回 −1，
  // 漏了的后果是这件技能在 AI 手里**整件作废**（见 straightCount）
  if (has(skills, SK.FLOW)) return straightCount(G, side, card)
  // 涉水同理 —— 第四条匹配线，catchStart 看不见它
  if (has(skills, SK.WADE)) return wadeCount(G, side, card)
  // 染水：堆上已经全是它的花色 → 整堆 + 它自己
  if (has(skills, SK.SUITIFY) && G.pile.length > 0 && suitLeads(G, side, card, true)) return G.pile.length + 1
  if (!hue && !cast) return 0
  const size = G.pile.length
  const odd = card.value % 2 === 1
  const marked = []
  for (let i = 0; i < size; i++) marked.push(false)
  if (hue) {
    for (let i = 0; i < size; i++) {
      if (sameSuit(G, pileSuitAt(G, i), card.suit, side)) marked[i] = true
    }
  }
  if (cast) {
    for (let i = size - 1; i >= 0; i--) {
      if (!sameParity(pileValsAt(G, i), odd)) break
      marked[i] = true
    }
  }
  let n = 0
  for (let i = 0; i < size; i++) {
    if (marked[i]) n++
  }
  return n > 0 ? n + 1 : 0
}

// ---------- 回合流转 ----------

// 这一方这回合补到几张（照 handLimit）：满篓 +1、对方的窄口 −1，最少 1 张。
//
// **四条来路，两件技能各有两个版本** —— 点数槽那件是挂在牌上的
//（heldOn，打出覆盖面里的牌才生效、那张被钓走就失效），
// 角色那件是常驻的（hasSpecial，整局都在）。
// 两个版本**叠加**：带满篓的角色又在槽里插了满篓，上限就是 6
function handLimit(G, side) {
  const other = side === ME ? FOE : ME
  let want = HAND_SIZE
  if (heldOn(G, SK.CREEL, side)) want = want + 1
  if (hasSpecial(G, side, SP.CREEL)) want = want + 1
  if (heldOn(G, SK.NARROW, other)) want = want - 1
  if (hasSpecial(G, other, SP.NARROW)) want = want - 1
  // 【涨落】换掉底数（6 而不是 4），所以放在最后 —— 上面那几件照旧叠加，
  // 带涨落又挂着满篓就是峰值 7 张。**什么时候补**在 refill 里判
  if (hasSpecial(G, side, SP.CYCLE)) want = want + (CYCLE_REFILL - HAND_SIZE)
  return want < 1 ? 1 : want
}

// 把这一方手牌补足到上限（照 refill）。
//
// 【涨落】拦住「什么时候补」：只有一张牌都打不出的时候才补 ——
// 于是手牌从恒 4 张变成 6 → 0 → 补满 6 的周期。
// 用 playableCount 而不是 length：剩一张但被冻住也算「打不出」。
//
// 源码那边还有一条【枯水】走同一个闸（庄家规矩，削玩家），
// 模拟器不跑闯关规矩，所以这儿只有涨落
function refill(G, side) {
  if (hasSpecial(G, side, SP.CYCLE) && playableCount(G, side) > 0) {
    return
  }
  const want = handLimit(G, side)
  while (G.hands[side].length < want) {
    if (drawFor(G, side) === null) break
  }
}

// 一方回合结束：对方之前护着的饵到这里失效（照 expireGuards）
function expireGuards(G, side) {
  const drop = side === FOE ? GUARD_ME : GUARD_FOE
  for (let i = 0; i < G.pileGuard.length; i++) {
    if (G.pileGuard[i] === drop) G.pileGuard[i] = GUARD_NONE
  }
}

// 这一方还有牌打得出去吗（被冻住的不算）
function playableCount(G, side) {
  let n = 0
  for (let i = 0; i < G.hands[side].length; i++) {
    if (!isFrozen(G, G.hands[side][i])) n++
  }
  return n
}

// 再没有能做的事了就结束（照 checkOver）。
//
// 判的是「打得出牌吗」而不是「手里有牌吗」—— 原先那条漏了一个死锁：
// 牌库空 + 你 0 张 + 庄家最后一张被【冻结】锁着 = 双方永远轮流跳过，
// 而冻结要「效果牌被钓走」才解，谁都打不出牌它就永远解不了。
//
// **这个 bug 是这个模拟器找出来的**：跑 29 件技能时第一局就撞上了
// （牌库 0、你 0 张、庄家 1 张被冻、堆 3 张、分 32:16，交替跳过 400 回合）。
// 对局页那边一起修了，而且顺带发现 foeTurn 没防 foePickCard 返回 -1
function checkOver(G) {
  if (G.deck.length > 0) return false
  if (playableCount(G, ME) > 0 || playableCount(G, FOE) > 0) return false
  G.over = true
  return true
}

// **补牌在回合末**（照 passTurn）：补完才算得准「是不是都空了」。
//
// ---- 连竿在这儿截住交接 ----
//
// 三条闸照源码：加打那张不再给加打（againUsed）、手里没牌就不给、
// **补牌和护饵过期都压到真交接那一刻**（加打那张是同一个回合里的，
// 中间补牌手牌数就不对了，护饵也会提前失效）
// ---------- 【连竿】要不要加打：**「可」是可选的** ----------
//
// 1（默认）= 手里有能钓到的牌才加打，否则**放弃**。
// 0 = 只要手里有牌就**强制**加打 —— 旧实现，留着做对比。
//
// ---- 默认值 2026-10-13 反过来了 ----
//
// 原先默认 0（强制），而 `desc` 写的是「打出后**可**再打 1 张」——
// 说明承诺了「可」，实现却是强制，两边的 passTurn 都没有闸
//（玩家侧连「跳过」的按钮都没有）。后果是量出来的：
//
//   中立强度 **−0.45**（后手 −2.60 / 先手 +1.71）——
//   **这件技能在当前实现下对谁都不划算。**
//
// 机制：最优的那张刚打完，加打的大概率钓不到 → 落堆 → 给对手多一个钩点。
// 而「等下一回合、手牌补满、堆也变了再打」对**后手**格外值钱
//（它的优势本来就是「我后打，堆上有对手刚放的牌」），
// 所以强制加打拆的是后手自己的优势 —— 那就是 +4.31 溢价的来源。
//
//   for a in 0 1; do AGAIN_SMART=$a node sim.js vs again again -n 8000; done
const AGAIN_SMART = process.env.AGAIN_SMART === '1'

// 这一方手里还有值得打的牌吗（加打前问一次）。
// J 总是值得（通吃）；别的看能不能钓到，或者能不能靠技能收一片
function wantAgain(G, side) {
  if (!AGAIN_SMART) return true
  const hand = G.hands[side]
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    if (isFrozen(G, card)) continue
    if (card.rank === JACK) return true
    const skills = skillsOf(G, side, card)
    if (catchStart(G, card, side, skills, false) >= 0) return true
    if (harvestCount(G, card, skills, side) > 0) return true
  }
  return false
}

function passTurn(G, side) {
  if (G.againPending && !G.againUsed) {
    G.againPending = false
    G.againUsed = true
    if (G.hands[side].length > 0 && wantAgain(G, side)) {
      // 不交回合、不补牌、不过期护饵 —— 同一方再打一张
      G.turn = side
      return
    }
  }
  // ---- 【对流】：「我、对方、我」那三步 ----
  //
  // 两步都**不补牌、不过期护饵**（照连竿那条 return 的先例）——
  // 这三张是同一个回合里的，中间补牌手牌数就不对了。
  //
  // 对方插的那一张**照常走整条 playFor**（它能钓到就钓到，技能照样触发）
  // —— 那是这件技能的代价：你给了对手一次额外的出牌机会
  if (G.forceStep === 1 && G.hands[side === FOE ? ME : FOE].length > 0) {
    G.forceStep = 2
    G.turn = side === FOE ? ME : FOE
    return
  }
  if (G.forceStep === 2 && G.forceBy >= 0 && G.hands[G.forceBy].length > 0) {
    const back = G.forceBy
    G.forceStep = 0
    G.forceBy = -1
    G.turn = back
    return
  }
  // 对方或自己没牌了，这条路走不完 —— 清掉，照常交回合
  G.forceStep = 0
  G.forceBy = -1
  G.forceUsed = false
  G.againPending = false
  G.againUsed = false
  expireGuards(G, side)
  // 【燎原】原先在这儿蔓延（回合末一次），改成每打一张牌一次，挪到了 endPlay
  refill(G, side)
  checkOver(G)
  G.turn = side === FOE ? ME : FOE
}

// ---------- 【燃烧】自动蔓延：**关键词自带**（定稿 2026-10-13）----------
//
// 每打出一张牌（双方的都算），堆上的火向左右各蔓延一格。
// **只点没烧着的、不收牌** —— 收牌只由技能主动贴火造成（见 wildfireFor）。
//
// ---- 它治的是什么 ----
//
// 诊断量出来：野火**贴火 2.11 张/次，收成只有 0.30** —— 七倍缺口。
// 成因是火的留存 ≈ 牌在堆上的留存（3.3 回合），而堆只有 3 张厚、换手极快：
// **烧上去的火还没等到下一次收就被人钓走了。**
//
// 试过的另一条路是**锁住**（带火的牌置 0，见文件头那段）——
// 有效（+0.50 → +3.28）但撤掉了这一族的对位解，跟定稿第 2 条冲突。
//
// 蔓延换了个方向补同一个缺口：不保住**那几张**，而是**让火自己长回来**。
// 堆薄（3 张）、一手覆盖 +2 格 —— 所以火一两手就铺满整堆，
// 下次野火打出时该烧的早就烧着了。**间隔不再是瓶颈。**
//
// 连带两个好处：
//   野火的**连锁可以撤掉**（它当初就是为了压间隔）→ 没有燃料池 →
//     成本不再跟槽宽挂钩 → 那个非单调从根上没了；
//   **不需要记归属、也不需要「刚点着的火这一轮不传」** ——
//     蔓延不收牌，所以既不会引爆、也不存在「这一下收的牌归谁」。
//
// ---- 两条实现上的硬要求 ----
//
// **只点 `=== 0` 的格子** —— 碰到已经带火的什么也不做。
//
// 规格上这不是一条规则，是**「加上标签」对已有标签的牌本来就是空操作**
//（这也是【燃烧】能收成一条的原因：那三条「它不做什么」全是多余的）。
// 但实现上必须显式判，不然相邻的火会互相引爆、每手整片自己烧掉。
//
// **读旧数组、写新数组** —— 边读边写会级联：第 0 格点着第 1 格，
// 循环走到第 1 格又去点第 2 格，一手烧穿整堆。
//
// 扩散是线性的（一维堆，一个火源每手覆盖 +2），所以限幅内生 ——
// 而堆本身只有 3 张，于是真正的限幅是堆的厚度
function spreadFire(G) {
  const size = G.pile.length
  if (size === 0) return
  const next = G.pileBurn.slice(0)
  for (let i = 0; i < size; i++) {
    // 读旧值，所以这一轮刚点着的不会接着往下传
    if (pileBurnAt(G, i) === 0) continue
    // ---- 【结冰】挡一次蔓延，而且两个一起消失 ----
    //
    // 爬到带冰的格子：冰化了、火也没爬过去。所以一片冰能钉住火线一拍，
    // 代价是那一格的冰没了。
    //
    // **这儿必须判** —— 不然冰只挡野火不挡蔓延，而那种
    //「只对一半火源有效」的规则玩家记不住，而且是静默的
    if (i > 0 && next[i - 1] === 0 && !iceMeltsFire(G, i - 1)) next[i - 1] = 1
    if (i < size - 1 && next[i + 1] === 0 && !iceMeltsFire(G, i + 1)) next[i + 1] = 1
  }
  G.pileBurn = next
}

// 跑完一整局。庄家先手（照 newGame 末尾的 startFoeTurn）
function playGame(opts, ai) {
  const G = newGame(opts)
  G.turn = FOE
  // 不变量自检的钩子（check.js 用）。不传就是 null → 每次迭代一次 falsy
  // 判断，零开销。
  //
  // **故意只挂在这儿**：规则函数（takeAt / pushPile / harvestAt…）
  // 一个字都不动 —— 自检要验的就是那几个函数，往里面加代码就成了
  // 「改了被测对象再去测它」
  G.onStep = opts.onStep || null
  // 防死循环的闸：一局最多这么多回合。
  // 正常一局 52 次出牌上下（牌数守恒决定的），翻倍够宽松了 ——
  // 真撞上就是规则实现出了环
  const TURN_CAP = 400
  // 撞闸之后得看得见是怎么卡住的，所以留一圈轨迹（最近 24 次迭代）。
  // 环形缓冲，一局正常跑完它就扔了 —— 不影响性能
  const trail = []
  let guard = TURN_CAP
  while (!G.over && guard-- > 0) {
    // 验**上一手**留下的状态。挂在开头而不是结尾 —— 下面两条 continue
    // 会把结尾的检查跳过去
    if (G.onStep) G.onStep(G)
    const side = G.turn
    G.stat.turns++
    trail.push(side === ME ? 'me' : 'foe')
    trail.push(G.hands[ME].length + '/' + G.hands[FOE].length)
    trail.push('d' + G.deck.length + 'p' + G.pile.length)
    if (trail.length > 72) {
      trail.splice(0, trail.length - 72)
    }
    if (G.hands[side].length === 0) {
      // 手里没牌：这回合什么也做不了（照 startMyTurn / foeTurn 那道岔）
      passTurn(G, side)
      continue
    }
    const index = ai.pickCard(G, side)
    if (index < 0) {
      // 全被冻住了，打不出牌
      passTurn(G, side)
      continue
    }
    playFor(G, side, index, ai)
  }
  // 最后一手留下的状态 —— 循环已经退出，开头那次检查看不到它
  if (G.onStep) G.onStep(G)
  if (guard <= 0) {
    // 把状态摊出来 —— 「有环」这句话本身没法拿去查，得知道卡在哪
    const steps = []
    for (let i = 0; i + 2 < trail.length; i += 3) {
      steps.push(trail[i] + ' 手' + trail[i + 1] + ' ' + trail[i + 2])
    }
    throw new Error('一局没能在 ' + TURN_CAP + ' 回合内结束 —— 规则实现里有环。\n'
      + '  卡住时：牌库 ' + G.deck.length
      + '、手牌 你' + G.hands[ME].length + ' 庄' + G.hands[FOE].length
      + '、堆 ' + G.pile.length
      + '、分 ' + G.score[ME] + ':' + G.score[FOE]
      + '、该谁 ' + (G.turn === ME ? '你' : '庄家')
      + '、挂着的效果 ' + G.held.length
      // 叠放的张数也报出来 —— 「堆不涨但牌在减」那种环只有看它才看得出
      + '、叠放 ' + G.stacked.length
      + '、连竿 pending=' + G.againPending + ' used=' + G.againUsed + '\n'
      + '  最近 ' + steps.length + ' 次迭代（谁 / 双方手牌 / 牌库+堆）：\n    '
      + steps.join('\n    '))
  }
  return G
}

module.exports = {
  SUITS, RANKS, RANK_VALUES, SKILL_RANKS, JACK, ZERO_RANK, BLANK_RANK, HAND_SIZE,
  GUARD_NONE, GUARD_ME, GUARD_FOE, ME, FOE, SK, SKILLS,
  // 特殊技能与角色（KIND_ANY / KIND_RANK 删了 —— 源码的 DrawSkill 没有 kind 了）
  SP, SP_NOTE, DRAW_ROLES, roleIndexOf, hasSpecial,
  CLEAR_OPEN, DEEP_EXTRA, FIRM_GUARD, LIVE_OPEN, BAIT_COUNT, CYCLE_REFILL,
  makeRng, randInt, pickOne, isRedSuit, sameSuit, makeCard, standardDeck, shuffle,
  // 配装：旧的那五个（putSuit / putRank / suitSizeOf / rankSizeOf / partnerSuit）
  // 连 levels 一起删了，换成角色模型
  emptyLoadout, slotLabels, isSuitSlot, slotCover, roleCover, roleSlotCount,
  kitFromRole, kitWithOne, coverageOf, baitRankOf,
  triggersOf, skillsOf, isDead, deadPool, DEAD_COUNT,
  has, cardVals, valuesOf, anyEquals, canCatch, catchStart,
  isFrozen, heldOn, opponentOpen, inPile, topCards, handLimit, harvestCount,
  // 【伏流】的代价旋钮 —— ai.js 的「安全饵」判断要读它
  //（FLOW_VOID=0 时它有点数，就不再是钓不走的安全饵了）
  FLOW_VOID,
  newGame, playFor, playGame, valueOfRank
}
