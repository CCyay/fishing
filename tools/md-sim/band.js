#!/usr/bin/env node
// 2026-10-22 · 阶梯计分：**解出「互相赌」的档值区间**
//
// ---- 它回答的是哪一句 ----
//
// 用户的原话：「我要的不是这样，而是风险越大收货越大。所以收牌每多 1 张
// 积分要涨非常多，**互相赌对方什么时候收**。只要成功 1 次不是你收好几次
// 2/3 能追上的。」以及验收线：「**等到对局 AI 开始考虑是忍 1 手还是现在就收，
// 这个改动才是合格的**。」
//
// 「互相赌」在博弈论里有确切形状：**没有纯策略均衡**。
// 用户的事实 3（「对局中最多也就忍 1 手，忍 2 手几乎不可能」）
// 把打法空间砍成两个：{贪心, 忍1手}。于是这是个 2×2 对称博弈：
//
//                对手贪心      对手忍
//     我贪心       u1           u3
//     我忍         u2           u4
//
//   · 贪心是纯策略均衡  ⟺  u1 ≥ u2
//   · 忍  是纯策略均衡  ⟺  u4 ≥ u3
//   · **两条都不成立 = 没有纯策略均衡 = 互相赌**（斗鸡博弈那个形状）
//
// 所以要的是同时满足：
//
//     g1 = u2 − u1 > 0   忍能打赢「大家都贪心」
//     g2 = u3 − u4 > 0   对手忍的时候，贪心抢堆更赚
//
// ---- 为什么三跑就够，不用扫档值 ----
//
// `run-band.sh` 第一跑的实测：`2,3,5` / `2,4,8` / `1,3,8` 三组的
// N 分布表**逐位相同**（128893 / 108897 / 29254 / …），忍的次数都是
// 4.50 手/局、升档都是 24.5%。`2,6,12,24` 因为多一档才不同。
//
// 原因在 `rules.js` 的 `scoreOf` 那段注释里（打法只认**分档结构**，
// 不认档值）。于是：**一个结构真跑三格拿直方图，之后任意档值都是线性重算**，
// 精确不是近似。u1..u4 全是档值向量 v 的线性函数 → g1、g2 也是 →
// 「哪些 v 能同时让两者为正」是一个线性可行域，解得出来。
//
// ⚠ 三条边界：
//   1. **打法空间只有两个**。真装上去之后可能冒出第三种（比如
//      「只在手里已有对子时才忍」），那个这儿算不出来。用户的事实 3
//      是这个简化的依据，不是我自己砍的。
//   2. 每换一个**分档结构**（档数不同）就得重跑三格。换档值不用。
//   3. J 一律**同加权**（用户定的）。J 恒收整堆、不挑点数，
//      给它单独一套权重是另一个设计开关，不在这一轮里。
//
// 用法：
//   node tools/md-sim/band.js              # 3 档结构、20000 局
//   node tools/md-sim/band.js -k 4         # 4 档结构
//   node tools/md-sim/band.js -k 3 -n 5000 # 快跑
//   node tools/md-sim/band.js -m 1         # 硬上限：忍只忍到 4/5 档为止
//   node tools/md-sim/band.js -p 25        # 期望值：按 25% 成功率折完再比
//
// ⚠ `-m` / `-p` 改的是**打法**，所以它们跟 `-k` 一样要重跑三格 ——
//   不能拿不带的直方图去重算带的结果。「档值可以离线重算」只对**档值**成立。
//
// ⚠⚠ 而 `-p` 还破掉了另一条：**它让打法反过来依赖档值**。
//   `scoreOf(n+2)·p > scoreOf(n)` 里有档值，于是不同档值下直方图不再相同 ——
//   `-p` 这一跑的直方图**只对占位档值 1,2,3 成立**，下面 ②③⑥ 那几节的
//   离线重算在 `-p` 下**全部失效**。`-p` 要看的只有 ① 那张表，
//   而且得对每一组真档值各跑一次（`SCORE_BANDS` 直接传给 sim.js）。
'use strict'
const R = require('./rules.js')
const F = require('./fn.js')

const argv = process.argv.slice(2)
let N = 20000
let K = 3
let M = -1
let P = 100
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-n') N = parseInt(argv[i + 1], 10)
  if (argv[i] === '-k') K = parseInt(argv[i + 1], 10)
  if (argv[i] === '-m') M = parseInt(argv[i + 1], 10)
  if (argv[i] === '-p') P = parseInt(argv[i + 1], 10)
}
const B = F.B
const f2 = F.f2
const pad = F.pad
const padR = F.padR

// 这个结构的「占位档值」：严格递增就行，**跑出来的直方图跟它的具体值无关**
// （上面那段的全部要点）。1,2,3… 最省事
const DUMMY = []
for (let k = 0; k < K; k++) DUMMY.push(k + 1)

// `-m` 只挂在「忍」的那两格上 —— `ctl` 是双方贪心，压根不调 `worthHolding`
//
// ⚠ 不带 `-m` 时**显式清成空串**，不是「不设」。`fn.js` 的 `run` 是
//   `Object.assign({}, process.env, arm.env, …)` —— 外面 shell 里要是
//   残留着一个 `HOLD_BAND_MAX`，「不设」会把它原样继承进来，
//   于是 A/B 两跑悄悄变成同一跑。空串在 ai.js 那边是 falsy → 回到 −1。
const HM = { HOLD_BAND_MAX: M >= 0 ? '' + M : '', HOLD_P: '' + P }
const ARMS = [
  { tag: 'ctl', name: '双方贪心', env: Object.assign({ SCORE_BANDS: DUMMY.join(','), HOLD_ONCE: '' }, HM) },
  { tag: 'hme', name: '只有你忍', env: Object.assign({ SCORE_BANDS: DUMMY.join(','), HOLD_ONCE: '1', HOLD_BOTH: '' }, HM) },
  { tag: 'hbo', name: '双方都忍', env: Object.assign({ SCORE_BANDS: DUMMY.join(','), HOLD_ONCE: '1', HOLD_BOTH: '1' }, HM) }
]

// 把一侧的直方图折成**档权重** w[k] = 这一档每局发生几次。
//
// ⚠ 档的归属**不自己算** —— 拿单位基向量喂 `rules.js` 的 `scoreWith`，
//   让它自己告诉我这个 N 落在哪一档。照着写一份 `Math.floor((n-2)/2)`
//   就是墓碑上那条「复制一份逻辑，两份必然分叉」。
//
// N≤1 单独拎出来当常数项：`scoreWith` 对它**不进档、照张数返回**
// （那是【保护】的垫牌，见 rules.js 那段），所以它不该进任何一档的权重。
function weights(h) {
  const w = []
  for (let k = 0; k < K; k++) w.push(0)
  let konst = 0
  for (let b = 0; b <= B; b++) {
    const c = h.all[b]
    if (c === 0) continue
    if (b <= 1) { konst += R.scoreWith(DUMMY, b) * c; continue }
    for (let k = 0; k < K; k++) {
      const e = []
      for (let j = 0; j < K; j++) e.push(j === k ? 1 : 0)
      w[k] += R.scoreWith(e, b) * c
    }
  }
  for (let k = 0; k < K; k++) w[k] /= N
  return { w: w, k: konst / N }
}
function dot(a, v) {
  let t = a.k
  for (let k = 0; k < K; k++) t += a.w[k] * v[k]
  return t
}
function addHalf(a, b) {
  const w = []
  for (let k = 0; k < K; k++) w.push((a.w[k] + b.w[k]) / 2)
  return { w: w, k: (a.k + b.k) / 2 }
}
function sub(a, b) {
  const w = []
  for (let k = 0; k < K; k++) w.push(a.w[k] - b.w[k])
  return { w: w, k: a.k - b.k }
}

async function main() {
  console.log('分档结构：' + K + ' 档（N=2/3 第一档，之后每两张一档，'
    + 'N≥' + (2 * K) + ' 全归最后一档）· ' + N + ' 局 · base 口径 · J 同加权')
  console.log('占位档值 ' + DUMMY.join(',') + ' —— **直方图跟它的值无关**，'
    + '只跟档数有关（rules.js 的 scoreOf 那段）')
  console.log('忍的打法：' + (M >= 0
    ? '**HOLD_BAND_MAX=' + M + '** —— 只在「忍完落进第 ' + (M + 1)
      + ' 档（N=' + (2 + 2 * M) + '/' + (3 + 2 * M) + '）」时才忍，不往更后面的档追'
    : '默认（升得了档就忍，一路追到最后一档）')
    + (P !== 100 ? ' · **HOLD_P=' + P + '**（按 ' + P + '% 成功率折完再比）' : ''))
  if (P !== 100) {
    console.log('')
    console.log('⚠⚠ **`-p` 下只有 ① 那张表作数。** 折扣判据里带档值，')
    console.log('   于是「打法只认分档结构、不认档值」那条前提破了 ——')
    console.log('   下面 ②③⑥ 全是拿占位档值 ' + DUMMY.join(',') + ' 的直方图算的，')
    console.log('   换成真档值打法就变了，那几节的数**不能用**。')
    console.log('   真档值下的结论请直接跑 sim.js（run-band3.sh 的 C 段）。')
  }

  const outs = await Promise.all(ARMS.map((a) => F.run(a, N)))
  const D = {}
  ARMS.forEach((a, i) => { D[a.tag] = {}; F.parse(outs[i], a.tag, D[a.tag]) })

  // ---- 溢出桶在这儿是**精确**的，不像 fn.js 那样要打折 ----
  //
  // `fn.js` 的注释写着「溢出桶（N≥10）按下沿 10 计」，因为那边 f(N) 逐 N 不同。
  // 这边不一样：bandOf(10) = 4，而任何 N>10 的档 ≥4，K≤5 时**一起被钳到最后一档**
  // —— 跟 N=10 同档，所以折算没有误差。K≥6 才会有。
  if (K >= 6) {
    const o = (D.ctl.me.all[B] + D.ctl.foe.all[B]) / N
    console.log('  ⚠ K=' + K + ' ≥ 6：溢出桶（N≥10，两侧合计 ' + f2(o)
      + ' 次/局）按 N=10 归档，而真实的 N>10 本该归更后面的档 —— 这几档的权重偏小')
  }

  // ---- 自检：打法真的跟档值无关吗 ----
  //
  // 上面整套推导压在这一条上，所以**它要能坏得了**（台账那条教训）。
  // 查法：`ctl` 那一格两侧的直方图该跟**纯贪心基线**逐位相同 ——
  // 占位档值是 1,2,3，跟 2,4,8 完全不同，分布却该一个数都不差。
  // 这儿只能自比（没跑无旋钮的基线），所以退一步查对称性：
  // 双方同打法时两侧的收牌次数该在噪声内。
  const sym = (t) => {
    let a = 0; let b = 0
    for (let i = 2; i <= B; i++) { a += D[t].me.all[i]; b += D[t].foe.all[i] }
    return [a / N, b / N]
  }
  for (const t of ['ctl', 'hbo']) {
    const [a, b] = sym(t)
    if (Math.abs(a - b) > 0.05) {
      console.log('  ⚠ ' + t + ' 两侧收牌次数差 ' + f2(a - b)
        + ' 次/局 —— 这一格双方同打法，不该差这么多')
    }
  }

  const W = {}
  for (const a of ARMS) {
    W[a.tag] = { me: weights(D[a.tag].me), foe: weights(D[a.tag].foe) }
  }
  // u1 = 双方贪心时我的分（两侧平均，对称格）
  // u2 = 我忍、对手贪心时**我的**分
  // u3 = 我贪心、对手忍时**我的**分 —— 就是 hme 那一格的**对手侧**
  // u4 = 双方都忍时我的分（两侧平均）
  const U1 = addHalf(W.ctl.me, W.ctl.foe)
  const U2 = W.hme.me
  const U3 = W.hme.foe
  const U4 = addHalf(W.hbo.me, W.hbo.foe)
  const G1 = sub(U2, U1)   // 要 > 0
  const G2 = sub(U3, U4)   // 要 > 0

  console.log('')
  console.log('######## ① 档权重：每一档每局发生几次 ########')
  console.log('〔这是全部的原始材料 —— u1..u4 都是「这一行 · 档值向量」〕')
  let h = '   ' + padR('这一格', 22)
  for (let k = 0; k < K; k++) {
    const lo = 2 + 2 * k
    h += pad(k === K - 1 ? 'N≥' + lo : 'N=' + lo + '/' + (lo + 1), 11)
  }
  h += pad('N≤1常数', 11)
  console.log(h)
  console.log('  ' + '-'.repeat(24 + 11 * (K + 1)))
  const rows = [
    ['u1 双方贪心（对称）', U1], ['u2 我忍·对手贪心', U2],
    ['u3 我贪心·对手忍', U3], ['u4 双方都忍（对称）', U4]
  ]
  for (const [nm, a] of rows) {
    let ln = '   ' + padR(nm, 22)
    for (let k = 0; k < K; k++) ln += pad(f2(a.w[k]), 11)
    console.log(ln + pad(f2(a.k), 11))
  }
  console.log('  ' + '-'.repeat(24 + 11 * (K + 1)))
  for (const [nm, a] of [['g1 = u2 − u1  要 > 0', G1], ['g2 = u3 − u4  要 > 0', G2]]) {
    let ln = '   ' + padR(nm, 22)
    for (let k = 0; k < K; k++) ln += pad(f2(a.w[k]), 11)
    console.log(ln + pad(f2(a.k), 11))
  }
  console.log('')
  console.log('  读 g1 那一行：**负的那几档是忍要付的代价，正的那几档是忍换来的东西**。')
  console.log('  要让 g1 翻正，正系数那几档的档值就得大到压过负系数那几档。')

  // ---- ①之二 用户那条断言的判决位 ----
  //
  // 用户说：「**无论 6/7 档给的多高**，天平永远不会倒向『永远该忍』，
  // 因为在 4/5 档双方都会收了，双方都不会把 6/7 档给对方」。
  //
  // 翻成这张表上的一个数：**g1 在最后一档的系数**。它是 0 的话，
  // 最后一档的档值进不了 g1 → 给多高都不动天平 → 用户是对的，
  // 那一档是**自由参数**（纯画饼，可以随便给高）。
  // 它不是 0 的话，c 抬高就会把 g1 推过 0，「永远该忍」会真的出现。
  const tail = G1.w[K - 1]
  console.log('')
  console.log('  ★ 判决位：**g1 在最后一档（N≥' + (2 * K) + '）的系数 = '
    + f2(tail) + '**')
  if (Math.abs(tail) < 0.01) {
    console.log('    ≈ 0 → 最后一档的档值**进不了天平**，给多高都不改判定。')
    console.log('    于是它是自由参数：可以随便给高当「基本拿不到的大奖」。')
  } else {
    // 其余档都按 1 算时，c 取多少会让 g1 过 0
    const rest = []
    for (let k = 0; k < K; k++) rest.push(k === K - 1 ? 0 : 1)
    const cFlip = -dot(G1, rest) / tail
    console.log('    ≠ 0 → 最后一档的档值**会动天平**：c 每涨 1，g1 就动 '
      + f2(tail) + '。')
    // c 得 > 其余档（不然「最后一档比前面还便宜」，不是设计里的东西）
    if (cFlip > 1) {
      console.log('    其余档都按 1 算的话，c ≈ ' + f2(cFlip)
        + ' 处 g1 翻号 —— 那一档不是自由参数。')
    } else {
      console.log('    不过翻号点算出来是 c ≈ ' + f2(cFlip)
        + '（≤ 1，落在「最后一档比前面还便宜」那一侧）——')
      console.log('    所以在合法的档值里它**推不动符号**，只改大小不改判定。')
    }
  }

  // ---- ② 现成候选 ----
  console.log('')
  console.log('######## ② 几组档值下的判定 ########')
  const CANDS = []
  const push = (v) => { if (v.length === K) CANDS.push(v) }
  push([2, 3, 5]); push([2, 4, 8]); push([1, 3, 8]); push([1, 4, 12])
  push([1, 6, 20]); push([1, 10, 40]); push([1, 20, 100])
  push([2, 6, 12, 24]); push([1, 4, 12, 36]); push([1, 10, 40, 100])
  let h2 = '   ' + padR('档值', 20) + pad('u1', 9) + pad('u2', 9)
    + pad('u3', 9) + pad('u4', 9) + pad('g1', 9) + pad('g2', 9) + '  判定'
  console.log(h2)
  console.log('  ' + '-'.repeat(96))
  for (const v of CANDS) {
    const g1 = dot(G1, v)
    const g2 = dot(G2, v)
    const verdict = g1 > 0 && g2 > 0 ? '**互相赌**（没有纯策略均衡）'
      : (g1 <= 0 && g2 > 0 ? '贪心是唯一最优解'
        : (g1 > 0 && g2 <= 0 ? '忍是唯一最优解（变成「到 4 再配」）'
          : '两个纯均衡（协调博弈，看谁先动）'))
    console.log('   ' + padR(v.join(','), 20)
      + pad(f2(dot(U1, v)), 9) + pad(f2(dot(U2, v)), 9)
      + pad(f2(dot(U3, v)), 9) + pad(f2(dot(U4, v)), 9)
      + pad(f2(g1), 9) + pad(f2(g2), 9) + '  ' + verdict)
  }

  // ---- ③ 解出倍率族的赌区 ----
  //
  // 用户那句「收牌每多 1 张积分要涨非常多」对应的就是**倍率**：
  // v = (1, r, r², …)。r=1 是全平（收多少都一样），r 越大尾巴越凶。
  // g1、g2 都是 v 的线性函数，而 v 是 r 的多项式 → 两者都是 r 的多项式，
  // 扫一遍就能把「两者同时为正」的那段 r 圈出来。
  console.log('')
  console.log('######## ③ 倍率族 v = (1, r, r², …)：赌区在哪一段 ########')
  console.log('〔用户的「每多 1 张涨非常多」= 这个 r。r=1 是收多少都一样〕')
  console.log('')
  console.log('   ' + padR('r', 8) + pad('档值', 24) + pad('g1', 10)
    + pad('g2', 10) + pad('每人每局', 11) + '  判定')
  console.log('  ' + '-'.repeat(86))
  const SCAN = 200
  const RLO = 1; const RHI = 41
  const vAt = (r) => { const v = []; for (let k = 0; k < K; k++) v.push(Math.pow(r, k)); return v }
  let lo = null; let hi = null; let holes = 0; let wasIn = false
  for (let t = 0; t <= SCAN; t++) {
    const r = RLO + (RHI - RLO) * t / SCAN
    const v = vAt(r)
    const inZone = dot(G1, v) > 0 && dot(G2, v) > 0
    if (inZone) {
      if (lo === null) lo = r
      hi = r
      if (!wasIn && lo !== r) holes++
    }
    wasIn = inZone
  }
  // 打几个代表点（含边界附近），别把 200 行全倒出来
  const marks = [1, 2, 3, 4, 5, 6, 8, 10, 14, 20, 28, 40]
  for (const r of marks) {
    const v = vAt(r)
    const g1 = dot(G1, v); const g2 = dot(G2, v)
    const per = dot(U1, v)
    console.log('   ' + padR(f2(r), 8)
      + pad(v.map((x) => f2(x)).join(','), 24)
      + pad(f2(g1), 10) + pad(f2(g2), 10)
      + pad(f2(per) + '（' + f2(per / 21.8) + '×）', 11)
      + '  ' + (g1 > 0 && g2 > 0 ? '**赌区**' : (g1 > 0 ? 'g1正g2负' : (g2 > 0 ? 'g1负g2正' : '两负'))))
  }
  console.log('')
  if (lo === null) {
    console.log('  **r 从 ' + RLO + ' 扫到 ' + RHI + '，赌区是空的。**')
    console.log('  意思是：倍率再凶也造不出「互相赌」—— 在当前规则下，')
    console.log('  {贪心, 忍1手} 这两个打法里永远有一个是唯一最优解。')
    console.log('  那就不是档值定得不对，是**忍 1 手这个动作本身换不回东西**，')
    console.log('  得去改规则层（比如忍的时候堆长多涨几张、或者让匹配机会留得住）。')
  } else {
    console.log('  **赌区：r ∈ [' + f2(lo) + ', ' + f2(hi) + ']**'
      + (hi >= RHI ? '（右端撞到扫描上限 ' + RHI + '，真实区间可能更宽）' : ''))
    if (holes > 0) console.log('  ⚠ 这一段里有 ' + holes + ' 处断点 —— 不是连续区间，上面那几个代表点要逐个看')
  }
  // ======== ④ 赌区到底是「这一族里没有」还是「压根不存在」 ========
  //
  // ③ 扫的是倍率族。扫不到只说明**这一族**里没有 —— 而那是个弱结论，
  // 下一轮换个族（平方、手续费、手搓一组数）还得再扫一遍。
  //
  // 真问题是：{v : v 每一档都 > 0，g1·v > 0，g2·v > 0} 这个集合空不空。
  // 两个都是线性不等式，所以这是**可以精确判定的**，不用扫：
  //
  //   它空  ⟺  存在 λ ≥ 0（不全为 0）使得 λ₁·g1 + λ₂·g2 **每一档都 ≤ 0**
  //
  // （Gordan 那一类的择一定理。直观说法：找得到一个非负的配比，
  //   把两行加起来之后全是负的，那两者就不可能同时为正。）
  //
  // 归一化 λ₂=1、记 t=λ₁，每一档给 t 一个区间，交一下就知道。
  // λ₂=0 那个退化情形单独查（= g1 本身每一档都 ≤ 0）。
  console.log('')
  console.log('######## ④ 赌区是「这一族里没有」还是「压根不存在」 ########')
  console.log('〔③ 只扫了倍率族。这一节判的是**所有正档值**，精确不是扫描〕')
  let tlo = 0; let thi = Infinity; let dead = ''
  for (let k = 0; k < K && dead === ''; k++) {
    const a = G1.w[k]; const b = G2.w[k]
    if (a > 0) { thi = Math.min(thi, -b / a) } else if (a < 0) { tlo = Math.max(tlo, -b / a) } else if (b > 0) { dead = '第 ' + (k + 1) + ' 档 g1=0 而 g2>0' }
  }
  let allNeg = true
  for (let k = 0; k < K; k++) if (G1.w[k] > 0) allNeg = false
  const cert = dead === '' && tlo <= thi
  if (allNeg) {
    console.log('  **赌区不存在**（退化情形：g1 每一档都 ≤ 0 —— 忍在任何正档值下都打不赢贪心）')
  } else if (cert) {
    const t = (isFinite(thi) ? (tlo + thi) / 2 : tlo + 1)
    let ln = '  证据：取 λ = ' + f2(t) + ' · g1 + g2，逐档是  '
    for (let k = 0; k < K; k++) ln += f2(t * G1.w[k] + G2.w[k]) + '  '
    console.log(ln + '—— **全 ≤ 0**')
    console.log('  所以对任何每一档都为正的档值 v：' + f2(t) + '·(g1·v) + (g2·v) ≤ 0，')
    console.log('  两者**不可能同时为正**。')
    console.log('')
    console.log('  **结论：赌区不是没扫到，是不存在。** 换哪一族 f 都一样，')
    console.log('  手搓一组数也一样 —— 这是 ① 那两行系数的形状决定的，不是参数没调对。')
    console.log('  （可用的 λ 区间是 [' + f2(tlo) + ', '
      + (isFinite(thi) ? f2(thi) : '∞') + ']；区间非空就是判定成立）')
  } else {
    console.log('  找不到那样的 λ' + (dead ? '（' + dead + '）' : '')
      + ' —— **赌区存在**，③ 没扫到只说明倍率族不是对的族。')
    console.log('  下面网格搜一个见证解（a 固定 1，扫 b 和 c 的比例）：')
    let found = 0
    for (let bi = 1; bi <= 120 && found < 6; bi++) {
      for (let ci = bi; ci <= 4000 && found < 6; ci = Math.ceil(ci * 1.15)) {
        const v = [1, bi, ci]
        while (v.length < K) v.push(v[v.length - 1] * 2)
        if (v.length > K) v.length = K
        if (dot(G1, v) > 0 && dot(G2, v) > 0) {
          console.log('    v = ' + v.join(',') + '   g1=' + f2(dot(G1, v))
            + '  g2=' + f2(dot(G2, v)) + '  每人每局 ' + f2(dot(U1, v)))
          found++
        }
      }
    }
    if (found === 0) console.log('    （网格没搜到 —— 区域可能很窄，得换搜法）')
  }

  // ======== ⑤ 为什么 —— 频率依赖的方向 ========
  //
  // ④ 判的是「有没有」，这一节说的是「**为什么**」，而后者才决定下一步往哪走。
  //
  //   忍在「对手贪心」时的收益 = g1
  //   忍在「对手也忍」时的收益 = u4 − u3 = **−g2**
  //
  // 两者一比就是频率依赖的方向：
  //   −g2 > g1  → 别人越忍，忍越划算 → **正反馈 → 协调博弈**（两个纯均衡）
  //   −g2 < g1  → 别人越忍，忍越亏   → **负反馈 → 斗鸡博弈**（没有纯均衡 = 互相赌）
  //
  // 用户要的是后者。而 h = −(g1+g2) 的符号就是这件事。
  const H = []
  for (let k = 0; k < K; k++) H.push(-(G1.w[k] + G2.w[k]))
  console.log('')
  console.log('######## ⑤ 为什么 —— 别人越忍，忍是更划算还是更亏 ########')
  let lnh = '   h = (−g2) − g1  逐档：  '
  for (let k = 0; k < K; k++) lnh += f2(H[k]) + '  '
  console.log(lnh)
  console.log('   〔h·v > 0 = 别人越忍、忍越划算 = **正反馈 = 协调博弈**（两个纯均衡，不是赌）')
  console.log('     h·v < 0 = 别人越忍、忍越亏   = **负反馈 = 斗鸡博弈**（这才是「互相赌」）〕')
  console.log('')
  for (const v of CANDS) {
    const hv = (function () { let t = 0; for (let k = 0; k < K; k++) t += H[k] * v[k]; return t })()
    console.log('   ' + padR(v.join(','), 20) + 'h·v = ' + pad(f2(hv), 9)
      + '  ' + (hv > 0 ? '正反馈（协调）' : '负反馈（斗鸡）'))
  }
  console.log('')
  console.log('  要把它翻成负反馈，得让「**双方都忍的时候，忍的那个更吃亏**」 ——')
  console.log('  而现在是反的：双方都忍时堆长得更肥，两个人一起受益。')
  console.log('  这是规则层的事，档值拧不动它。')

  // ======== ⑥ 打平线：2/3 档定 1，6/7 档给 c，那 4/5 档该给几 ========
  //
  // 用户的原话：「简单增加 4/5 档的积分不就行吗」「6/7 档积分也加，加更多
  // 但基本无法拿到」「所以只要考虑要拿 2/3 档还是冒一点风险拿 4/5 档」。
  //
  // 那要的不是「没有纯策略均衡」（④ 判死的是那个），而是**两边打平** ——
  // g1 = 0。打平之下「一律忍」和「一律不忍」一样亏，于是哪一手该忍
  // 就只能看牌面，这才是「考虑是忍 1 手还是现在就收」。
  //
  // g1 是线性的 → 打平是**一条线**，不是一个点：c 给得越高，b 就得越低。
  // 所以这儿不给一个「推荐值」，给整条线让用户挑。
  if (K === 3) {
    console.log('')
    console.log('######## ⑥ 打平线：2/3档 = 1 时，4/5档 和 6/7档 的搭配 ########')
    console.log('〔g1 = 0 = 「一律忍」和「一律不忍」打平。这一行上的每一组都成立〕')
    console.log('')
    console.log('   ' + padR('6/7+档 c', 12) + pad('4/5档 b', 11)
      + pad('倍率 b:a', 11) + pad('每人每局', 11) + pad('×现行', 9)
      + pad('等比放大到 21.8 分', 22))
    console.log('  ' + '-'.repeat(78))
    for (const c of [4, 6, 8, 10, 12, 16, 20, 30, 50]) {
      const b = (-G1.w[0] - G1.w[2] * c) / G1.w[1]
      if (b <= 1) {
        console.log('   ' + padR('' + c, 12) + pad(f2(b), 11)
          + '   —— b ≤ 1 了（4/5 档给得比 2/3 档还少），这个 c 太高')
        continue
      }
      const v = [1, b, c]
      const per = dot(U1, v)
      // 等比放大**不改任何决策**（g1、g2 同比例缩放，符号不动），
      // 所以「总分回到 21.8」是免费的 —— 不用重订技能表，乘一下就行
      const s = 21.8 / per
      console.log('   ' + padR('' + c, 12) + pad(f2(b), 11)
        + pad(f2(b) + ' : 1', 11) + pad(f2(per), 11) + pad(f2(per / 21.8) + '×', 9)
        + pad([1, b, c].map((x) => f2(x * s)).join(' / '), 22))
    }
    console.log('')
    console.log('  **最后一列是免费的**：等比放大所有档值不改任何决策')
    console.log('  （g1、g2 同比例缩放，符号不动），所以总分能调回现行 21.8，')
    console.log('  全表 62 件技能的 X 和定价锚**一个都不用重订**。')
    console.log('')
    console.log('  ⚠ 打平只说明「一律忍」和「一律不忍」两套**死板打法**平手。')
    console.log('    真正证明「有决策」的是另一件事：**一套看牌面的条件打法能同时赢过这两套**。')
    console.log('    那个要真跑（HOLD_LEAD 之类），不是这儿算得出来的。')
  }

  console.log('')
  console.log('  ⚠ 「每人每局」那一列是**膨胀倍数**（÷ 现行 21.8）。')
  console.log('    差太远的话全表 62 件技能的 X 和定价锚都要重订 ——')
  console.log('    按用户的事实 5「技能适应规则」，那是下游的工作量，不是否决项，')
  console.log('    但它是个要报出来的成本，不该等到定稿才发现。')
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
