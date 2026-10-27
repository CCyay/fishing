#!/usr/bin/env node
// 2026-10-22 · f(N) 选型台：**先看养堆实际能养到多大，再谈给多少分**
//
// 用户定的判据（原话）：
//
//   「**要基于一方能匹配就打，一方养堆下最多能养到多大。这个数据来看，
//     否则即使你积分算很高但你没机会拿到也是白费**」
//
// 所以这个脚本的次序是固定的：**①先出「养到多大」的分布，②才评 f(N)**。
// 反过来（先设计曲线再看够不够得着）正是用户要避免的那个错法。
//
// ---- 为什么离线重算是精确的，不是近似 ----
//
// 对任何**单调递增**的 f：`argmax f(N) = argmax N`，于是
//   · 贪心挑牌（`ai.js` 比的是 caught）一张都不会变；
//   · `HOLD_MIN` 的门槛是对 N 的门槛，同样不变。
// **两套打法在 f 下的出牌完全不动** → Σ count(N)×f(N) 就是真分，不是估算。
//
// ⚠ 三条边界，别越过去：
//   1. **只对单调递增的 f 成立。** 非单调（「收 4 张反而扣分」）会让贪心
//      改挑别的牌，这份直方图当场失效，必须重跑模拟。
//   2. 它答的是「**这两套**打法谁强」，不是「新均衡长什么样」。
//      f 装上之后可能冒出第三种更优打法（比如「只在手里已有配对时才忍」），
//      那个这儿算不出来。
//   3. 溢出桶（N≥10）按**下沿 10** 计。对照全局只有 56 次，可忽略；
//      养堆档会变多，所以下面会把它单独打出来让你自己判。
//
// 用法：
//   node tools/md-sim/fn.js            # 20000 局
//   node tools/md-sim/fn.js -n 5000    # 快跑
'use strict'
const { spawn } = require('child_process')
const path = require('path')

const argv = process.argv.slice(2)
let N = 20000
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-n') N = parseInt(argv[i + 1], 10)
}
const SIM = path.join(__dirname, 'sim.js')
const B = 10 // 跟 rules.js 的 CATCH_BINS 对齐；不一致下面会报

// ---- 要跑的几格 ----
// 对照必须**跟这一批一起跑**（CLAUDE.md：两个数不一样时先查是不是同一版代码）
//
// ⚠ **`base` 字段 = 这一档的对照是谁。** 前五档的对照都是 `ctl`（都贪心），
//   而后两档不是 —— 用户后来提的是「**加个规则禁止收 2 张**」，那是规则不是
//   打法，双方都受约束。于是：
//
//     both3   双方都禁收 2 张 = **新基线**（分差该≈0，那是它的自检）
//     foe34   新基线之上，只有「你」等到 4 → **对照是 both3，不是 ctl**
//
//   拿 foe34 去减 ctl 等于把「规则变了」和「我改打法了」两件事加在一起。
const ARMS = [
  { tag: 'ctl', name: '对照（都贪心）', env: {} },
  { tag: 'm3', name: 'HOLD_MIN=3', env: { HOLD_MIN: '3' } },
  { tag: 'm4', name: 'HOLD_MIN=4', env: { HOLD_MIN: '4' } },
  { tag: 'm5', name: 'HOLD_MIN=5', env: { HOLD_MIN: '5' } },
  { tag: 'j4', name: 'JACK_HOLD=4', env: { JACK_HOLD: '4' } },
  { tag: 'both3', name: '禁收2张(双方)', env: { HOLD_MIN: '3', HOLD_BOTH: '1' } },
  { tag: 'foe34', name: '禁收2·你等4', env: { HOLD_MIN: '4', HOLD_FOE: '3' }, base: 'both3' }
]

// ---- 候选 f(N) ----
// 一律**单调递增**（上面那条前提）。`线性` 是现行规则，当对照
const FNS = [
  { key: '线性 N', f: (n) => n, cur: true },
  { key: '平方 N²', f: (n) => n * n },
  { key: '三角 N(N+1)/2', f: (n) => (n * (n + 1)) / 2 },
  { key: '坎 N≥4 加 2', f: (n) => (n <= 3 ? n : n + 2) },
  { key: '坎 N≥4 加 3', f: (n) => (n <= 3 ? n : n + 3) },
  { key: '坎 N≥4 翻倍', f: (n) => (n <= 3 ? n : 2 * n) },
  { key: '平方封顶 N≤6', f: (n) => (n <= 6 ? n * n : 36 + 6 * (n - 6)) },
  // ---- 压低档：不抬 N≥4，**压 N≤3** ----
  //
  // 上面七条全都靠「往上加」，于是每人每局分从 21.8 涨到 24~72，
  // 而那个膨胀是**否决项** —— 全表 62 件的 X 和定价锚 `25 + X × 21`
  // 都要跟着重订。这三条换一头做：f(2) 从 2 压到 1，让总分自己回落。
  //
  // 要看的是 ③ 那行末尾的「×现行」—— **贴近 1.00× 才算绕开了那笔账**。
  // 比值照样给够：f(4)/f(2) = 4 / 5 / 6，而三那一节解出的打平点是 ≈4.0。
  //
  // 不封顶是**有意的**：一那张表说 N≥7 每局只有 0.03~0.04 次，
  // 封不封顶差不出数来（「平方封顶 N≤6」跟「平方 N²」几乎逐位相同
  // 就是实证），而不封顶能保住严格单调 —— 前提那条要的就是这个
  { key: '压低 1/2/4/5/6…', f: (n) => (n <= 3 ? n - 1 : n) },
  { key: '压低 1/2/5/6/7…', f: (n) => (n <= 3 ? n - 1 : n + 1) },
  { key: '压低 1/2/6/8/10…', f: (n) => (n <= 3 ? n - 1 : 2 * (n - 1)) },
  // ---- 手续费档 f(N) = a·N − c：**一条直线，不分段** ----
  //
  // 上面那十条全是分段的（「N≤3 怎样、N≥4 怎样」），而玩家要背两条规则。
  // 这一族只有一句话：「**每收一次先扣 c 分**」，而它同样能拉开比值 ——
  // 比值是 (2·4−c)/(2·2−c)，c=3 时就是 5.0，跟「坎 N≥4 翻倍」一个量级。
  //
  // 而且它有一条上面两族没有的性质：**c/a 定决策，a 定盘子大小** ——
  // 两个参数正交。所以「比值给够」和「总分不膨胀」可以分开调，
  // 不像分段族那样一拧比值总分就跟着涨。
  //
  // ⚠ 它会让「收 1 张」变成负分（2×1−3 = −1）。`CATCH_BINS` 的下标就是
  //   张数，N=1 那一格**结构上存在**（rules.js:7928），只是现在的表从 2 起印。
  //   真要上这一档，得先确认 N=1 的收牌在这个玩法里出不出得来。
  { key: '手续费 2N−3', f: (n) => 2 * n - 3 },
  { key: '手续费 3N−5', f: (n) => 3 * n - 5 },
  // ---- 用户提的 f(2)=0 ----
  //
  // ⚠ 我一度说这一档「离线算不了，`argmax f(N) = argmax N` 当场不成立」——
  //   **那是错的。** f(2)=0 < f(3)=3 < f(4)=4 … 仍然**严格递增**，
  //   而贪心比的是 `caught`、`bestCaught` 初值 0（ai.js:505），
  //   所以「收 0 张」压根不进 argmax 的比较集 —— 出牌一张不变，直方图照旧有效。
  //
  //   真正离线算不了的是用户的后半句「**禁止**收 2 张」：那是合法着法变了，
  //   只能真跑（`both3` / `foe34` 两档）。两者差别不小 ——
  //   f(2)=0 下「收 2 张」还是会发生（AI 照收，只是白收），
  //   而禁收之下它次数为 0。这两格的直方图会分叉，对照着看。
  { key: 'f(2)=0 其余线性', f: (n) => (n <= 2 ? 0 : n) },
  { key: 'f(2)=0 坎N≥4加2', f: (n) => (n <= 2 ? 0 : n <= 3 ? n : n + 2) },
  // ---- 加速尾：**N≥4 之后每多一张涨「一个倍数」，不是涨「一个常数」** ----
  //
  // ⚠ **上面那十四条，N≥4 之后的增量全是常数。** 「坎 N≥4 翻倍」是
  //   8/10/12/14（斜率恒 2）、「压低 1/2/6/8/10」是 6/8/10/12（同样恒 2）、
  //   「手续费 2N−3」是 5/7/9/11。整张表**没有一条是加速的**。
  //
  //   用户的原话是「**收牌每多 1 张积分要涨非常多**，互相赌对方什么时候收。
  //   只要成功 1 次不是你收好几次 2/3 能追上的」—— 那要的是**乘法尾巴**，
  //   而我上一轮推荐的那条给的是加法尾巴。两者不是程度之差。
  //
  //   「整条 N 的 p 次方」解不出，但**它的死因不适用于这里** ——
  //   那条死在「同时把 N=3 也抬了，而 N=3 是贪心的主场」（见二那一节）。
  //   下面这几条 N≤3 一律压成 N−1（1/2），加速只发生在 N≥4。
  { key: '压低+平方 1/2/9/16/25…', f: (n) => (n <= 3 ? n - 1 : (n - 1) * (n - 1)) },
  { key: '压低+1.5倍 1/2/6/9/13.5…', f: (n) => (n <= 3 ? n - 1 : 6 * Math.pow(1.5, n - 4)) },
  { key: '压低+倍增 1/2/6/12/24…', f: (n) => (n <= 3 ? n - 1 : 6 * Math.pow(2, n - 4)) },
  { key: '压低+三倍 1/2/6/18/54…', f: (n) => (n <= 3 ? n - 1 : 6 * Math.pow(3, n - 4)) }
]

// ---- 可解的 f 族（④ 的「打平点」在这几族里二分）----
//
// 放在模块作用域而不是 `main()` 里面，是为了让 `duel.js` 复用同一份定义 ——
// 那边要在**收益矩阵**上解同样的参数。**不许在那边再写一遍**。
const FAMS_ALL = [
  { key: 'N≥4 每张加 b', mk: (x) => (n) => (n <= 3 ? n : n + x), unit: 'b', lo: 0, hi: 200 },
  { key: 'N≥4 整体乘 m', mk: (x) => (n) => (n <= 3 ? n : x * n), unit: 'm', lo: 1, hi: 200 },
  { key: '整条 N 的 p 次方', mk: (x) => (n) => Math.pow(n, x), unit: 'p', lo: 1, hi: 12 },
  // 压低档的打平点。跟上面两族比，要同时看**膨胀那一列** ——
  // 这一族的卖点就是把它压回 1.00× 附近，压不回来就没必要用它
  { key: '压低 N−1、N≥4 乘 m', mk: (x) => (n) => (n <= 3 ? n - 1 : x * (n - 1)), unit: 'm', lo: 1, hi: 200 },
  // 手续费族：**只解 c**（a 固定 2）。a 只缩放盘子、不动决策，
  // 所以打平点里它是自由量 —— 解出 c 之后再用 a 把总分推回 1.00×。
  // hi 停在 3.9 是因为 c=4 时 f(2)=0，严格单调当场破（前提那条）
  { key: '手续费 2N−c', mk: (x) => (n) => 2 * n - x, unit: 'c', lo: 0, hi: 3.9 },
  // 加速族：**解的是「每多一张要乘几」**，不是「每多一张要加几」。
  // f(3)=2 固定，f(4)=2r、f(5)=2r²…… r=1 退化成平的（f≡2），
  // 所以 lo=1 是「完全不加速」那一端，解出来的 r 就是用户那句
  //「涨非常多」的**非常多到底是多少倍**
  { key: '压低 N−1、N≥4 每张乘 r', mk: (x) => (n) => (n <= 3 ? n - 1 : 2 * Math.pow(x, n - 3)), unit: 'r', lo: 1, hi: 10 }
]

// J 要不要跟着加权，是**独立的一个设计开关** ——
// J 恒收整堆、不挑点数，给它加权等于白送；但不给又会让「J 吃大堆」变相贬值
const JMODES = [
  { key: 'J同加权', jf: null },
  { key: 'J按张数', jf: (n) => n }
]

// ⚠ **翻默认值的钉子，别删。** 2026-10-23 一天里四个 AI 旋钮
//   （`HOLD_ONCE` / `HOLD_EV` / `HOLD_BOTH` / `JACK_HOLD`）从「关」翻成了「开」，
//   而这个脚本**整个是按翻之前的默认写的** —— `ARMS` 的头一档
//   `ctl` 写着「对照（都贪心）」而 `env: {}`，不钉的话它会变成
//   「两侧都按 EV 忍 + 都守 3 张闸」，而**那不是对照，是另一个打法**，
//   于是后面每一档减 `ctl` 全错，且静默。
//
//   `.sh` 那十一个当天钉过了，这个漏了 —— 因为那次是
//   `sh -n tools/md-sim/run-*.sh` 扫的，**而它是 `.js`，不叫 `run-*`**。
//   〔同一个洞还盖着 `band.js`：它复用下面这个 `run()`，所以钉在这儿它也好了〕
//
// ⚠ **2026-10-27 又翻了三个**（`STEAL_ON` / `SCORE_BANDS` / `HOLD_MIX`），
//   而这三个只补了一个钉子，另两个是**有意不钉的**，理由各不一样：
//
//   `HOLD_MIX`   **钉**。`band.js` 的 `hme`/`hbo` 两档标着「只有你忍 / 双方都忍」，
//                那两个名字指的是**按 EV 硬阈值忍**（这个脚本整个是在那之前写的）。
//                不钉的话它们静默变成「按概率掷骰忍」，而输出长得一模一样 ——
//                跟 2026-10-23 那次 `HOLD_ONCE: ''` 的坑是同一个形状。
//                〔`ctl`（双方贪心）本来就安全：`HOLD_ONCE='0'` 让
//                  `worthHolding` 在总门就 return false，压根不掷骰〕
//   `STEAL_ON`   **不钉**。钉了会连外面 shell 传进来的 `STEAL_ON=1` 一起盖掉
//                （`ENV_PIN` 排在 `process.env` **之后**，是它覆盖环境不是反过来），
//                于是「想开抢牌却开不了，而且不报错」。
//                它的标签有 `band.js` 第一行的 `ruleTag()` 兜着。
//   `SCORE_BANDS` **不钉**。`band.js` 每一档自己在 `arm.env` 里写死
//                （`arm.env` 排在 `ENV_PIN` 之后，照旧覆盖），钉了也没用。
//                ⚠ 但 `duel.js` **不写它**，所以 `duel.js` 现在跑的是张=分
//                而不是 R4 —— 它是分档期的搜索工具，这次改动之后那张
//                5×5 矩阵要重跑才作数。
const ENV_PIN = {
  HOLD_ONCE: '0', HOLD_EV: '0', HOLD_BOTH: '0', JACK_HOLD: '0',
  HOLD_MIX: 'off'
}

// `n` 不传就用本脚本的 N。**`band.js` 复用这一个** ——
// 再写一份 spawn 迟早会在「环境变量怎么叠」上分叉
function run(arm, n) {
  return new Promise((res, rej) => {
    // ⚠ `ENV_PIN` 在 `arm.env` **之前** —— 各档自己写的 `HOLD_MIN` /
    //   `HOLD_BOTH` / `JACK_HOLD` 照旧覆盖它，语义一个字没变
    const env = Object.assign({}, process.env, ENV_PIN, arm.env, { DUMP_HIST: arm.tag })
    const p = spawn(process.execPath, [SIM, 'base', '-n', '' + (n || N)], { env })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('error', rej)
    p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(arm.tag + ' 退出码 ' + code))))
  })
}

// `#HIST <tag> <side> <kind> b0 b1 ...` → data[tag][side][kind] = [...]
function parse(out, tag, into) {
  let got = 0
  for (const ln of out.split(/\r?\n/)) {
    const m = ln.match(/^#HIST\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/)
    if (!m || m[1] !== tag) continue
    const nums = m[4].trim().split(/\s+/).map(Number)
    if (nums.length !== B + 1) {
      throw new Error(tag + ' 的桶数是 ' + (nums.length - 1) + '，不是 ' + B
        + ' —— `rules.js` 的 CATCH_BINS 改过了，`fn.js` 的 B 要跟着改')
    }
    into[m[2]] = into[m[2]] || {}
    into[m[2]][m[3]] = nums
    got++
  }
  if (got !== 4) throw new Error(tag + ' 只抓到 ' + got + ' 条 #HIST，该是 4 条')
}

function f2(x) { return (Math.round(x * 100) / 100).toFixed(2) }
function pad(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s }
// 中文按两格宽算，不然表头对不齐
function padR(s, w) {
  s = '' + s
  let vis = 0
  for (const ch of s) vis += (ch.charCodeAt(0) > 255 ? 2 : 1)
  while (vis < w) { s += ' '; vis++ }
  return s
}

// 一侧在某个 f 下的每局得分。
// `n` 是局数：不传就用本脚本的 N；`duel.js` 复用这个函数时要传它自己的
function score(h, f, jf, n) {
  let t = 0
  for (let b = 2; b <= B; b++) {
    const j = h.J[b]
    const nj = h.all[b] - j
    t += nj * f(b) + j * (jf ? jf(b) : f(b))
  }
  return t / (n || N)
}

async function main() {
  console.log('局数 ' + N + ' · base 口径（双方空槽、自由切牌）'
    + '· 前五档旋钮只给「你」那一侧开，后两档是双边规则')
  console.log('〔对照跟这一批一起跑 —— 不引旧数〕')
  const outs = await Promise.all(ARMS.map(run))
  const D = {}
  ARMS.forEach((a, i) => { D[a.tag] = {}; parse(outs[i], a.tag, D[a.tag]) })

  // ======== ① 养堆实际养到了多大 ========
  console.log('')
  console.log('################ ① 养堆实际养到了多大（**先看这个**） ################')
  console.log('〔用户的判据：「即使你积分算很高但你没机会拿到也是白费」。')
  console.log('  所以 f(N) 只能加在**这张表里真有次数**的那几格上。')
  console.log('  下面是「你」那一侧**非 J** 的每局收牌次数，按 N 分格〕')
  console.log('')
  let head = '   ' + padR('档', 16)
  for (let b = 2; b <= 8; b++) head += pad('N=' + b, 8)
  head += pad('N≥9', 8) + pad('合计次数', 12) + pad('平均N', 8)
  console.log(head)
  console.log('  ' + '-'.repeat(88))
  for (const a of ARMS) {
    const h = D[a.tag].me
    let ln = '   ' + padR(a.name, 16)
    let tot = 0; let card = 0; let tail = 0
    for (let b = 2; b <= B; b++) {
      const nj = (h.all[b] - h.J[b]) / N
      tot += nj; card += nj * b
      if (b <= 8) ln += pad(f2(nj), 8); else tail += nj
    }
    ln += pad(f2(tail), 8) + pad(f2(tot), 12) + pad(f2(card / tot), 8)
    console.log(ln)
  }
  console.log('')
  console.log('  〔同一张表，J 那一侧（J 不挑点数、恒收整堆，f(N) 不该照它设计）〕')
  for (const a of ARMS) {
    const h = D[a.tag].me
    let ln = '   ' + padR(a.name, 16)
    let tot = 0; let card = 0; let tail = 0
    for (let b = 2; b <= B; b++) {
      const j = h.J[b] / N
      tot += j; card += j * b
      if (b <= 8) ln += pad(f2(j), 8); else tail += j
    }
    ln += pad(f2(tail), 8) + pad(f2(tot), 12) + pad(f2(card / tot), 8)
    console.log(ln)
  }
  // ---- N≤1 那两格出不出得来 ----
  //
  // 上面两张表都从 b=2 起印，理由是「普通匹配的最小收成是 2」（ai.js 那段注释）。
  // 而 `CATCH_BINS` 的下标**就是张数**（`rules.js` 的 `noteCatch`：
  // `bin = got < CATCH_BINS ? got : CATCH_BINS`。〔2026-10-24 那儿从
  // `finishCatch` 里抽成了四条收牌路共用的一个口，原先那个局部变量
  // 叫 `tookN`，已经没了 —— 这行原本指的就是它〕），
  // 0 和 1 那两格**结构上存在**。「手续费」族会让 N=1 变成负分（2×1−3 = −1），
  // 所以上那一族之前必须先知道这两格是真空着还是没人看。
  // **这就是它的「它做了几次」诊断口**（CLAUDE.md 第四节）。
  console.log('')
  for (const a of ARMS) {
    for (const s of ['me', 'foe']) {
      // ⚠ **这儿打原始计数，不打「次/局」。** 第一版打的是次/局，
      //   而这几格都在 0.005 以下 → 四舍五入全成 `0.00`，
      //   警告语写着「不是空的」后面跟着两个 0.00，等于没说。
      //   低频诊断口的分母不能是局数（CLAUDE.md 第四节「它做了几次」）
      const c0 = D[a.tag][s].all[0]
      const c1 = D[a.tag][s].all[1]
      if (c0 + c1 > 0) {
        console.log('  ⚠ ' + a.name + ' / ' + s + ' 的 N≤1 不是空的：'
          + c0 + ' 次(N=0) + ' + c1 + ' 次(N=1)，共 ' + N + ' 局'
          + ' —— 「手续费」族在那儿是负分（2×1−3 = −1），别直接上')
      }
    }
  }

  // 溢出桶有多少 —— 它按下沿 10 计，占比大了下面的分就偏低
  console.log('')
  for (const a of ARMS) {
    const o = (D[a.tag].me.all[B] + D[a.tag].foe.all[B]) / N
    if (o > 0.02) {
      console.log('  ⚠ ' + a.name + ' 的溢出桶（N≥10）两侧合计 ' + f2(o)
        + ' 次/局 —— 它按下沿 10 计，所以下面的分**偏低**')
    }
  }

  // ======== ② 候选 f(N) 长什么样 ========
  console.log('')
  console.log('################ ② 候选 f(N) ################')
  let h2 = '   ' + padR('名字', 18)
  for (let b = 2; b <= B; b++) h2 += pad((b === B ? '≥' : '') + b, 7)
  console.log(h2)
  console.log('  ' + '-'.repeat(82))
  for (const c of FNS) {
    let ln = '   ' + padR(c.key + (c.cur ? ' ←现行' : ''), 18)
    for (let b = 2; b <= B; b++) ln += pad(c.f(b), 7)
    console.log(ln)
  }

  // ======== ③ 养堆翻正了没有 ========
  console.log('')
  console.log('################ ③ 每个 f 下，养堆翻正了没有 ################')
  console.log('〔「分差」= 你 − 庄家。对照那一行该在 0 附近（两边打法一样），')
  console.log('  **而养堆那几行要 > 对照才算 f 救活了养堆**。')
  console.log('  「每人每局分」是膨胀倍数的分母 —— 现行 21.8，差太远就得重订价〕')
  for (const jm of JMODES) {
    console.log('')
    console.log('  ---- ' + jm.key + ' ----')
    let h3 = '     ' + padR('f(N)', 18)
    for (const a of ARMS) h3 += pad(a.name.replace('（都贪心）', ''), 13)
    console.log(h3)
    console.log('    ' + '-'.repeat(82))
    for (const c of FNS) {
      let ln = '     ' + padR(c.key, 18)
      let per = 0
      for (const a of ARMS) {
        const me = score(D[a.tag].me, c.f, jm.jf)
        const foe = score(D[a.tag].foe, c.f, jm.jf)
        if (a.tag === 'ctl') per = (me + foe) / 2
        ln += pad(f2(me - foe), 13)
      }
      console.log(ln + '    〔每人每局 ' + f2(per) + ' 分，'
        + f2(per / 21.8) + '×现行〕')
    }
  }
  console.log('')
  console.log('  读法：某一行里**养堆那几格 > 对照那一格**，就是这条 f 把养堆变成了真决策。')
  console.log('  全都 < 对照 = 这条 f 不够凶，贪心照样最优。')
  console.log('  ⚠ 最后两格是另一套对照：「禁收2张(双方)」是**规则改了**之后的新基线')
  console.log('    （它的分差该≈0 —— 双方同规则，不≈0 就是哪儿不对称了），')
  console.log('    而「禁收2·你等4」要跟**它**比，不是跟「对照（都贪心）」比。')

  // ======== ④ 解出「要给够」是多少 ========
  //
  // 用户定的判据（原话）：
  //
  //   「**贪心要有贪心的好处，我等 4 张虽然难，但一旦成功积分要给够。
  //     比如等 N 手才能成功 1 次，那么这 1 次奖励的积分就要比对方
  //     成功 2 匹配 N 次多**」
  //
  // 这句话是个**一维方程**，不用猜：在一族 f 里找那个让
  // 「养堆的分差 == 贪心的分差」的参数，就是「刚好给够」的那一点。
  // 比它大 = 养堆划算，小 = 白等。
  //
  // 为什么能解：③ 那一节已经证了打法在单调 f 下冻结，所以
  // 分差是参数的**连续单调函数**，二分就行（不用重跑模拟）。
  console.log('')
  console.log('################ ④ 「给够」是多少 —— 解出来，不猜 ################')
  console.log('〔判据：养堆的分差 > 贪心的分差。下面是**刚好打平**的那个参数，')
  console.log('  比它大才算给够。「膨胀」是每人每局分 ÷ 现行 21.8 ——')
  console.log('  要得太高就等于整张技能表重订价，那是另一笔账〕')
  const FAMS = FAMS_ALL
  for (const jm of JMODES) {
    console.log('')
    console.log('  ---- ' + jm.key + ' ----')
    let h4 = '     ' + padR('族', 20) + padR('档', 14)
      + pad('打平点', 9) + pad('膨胀', 8) + pad('f(4)/f(2)', 11)
      + pad('f(5)/f(2)', 11) + pad('他:你 收牌次数比', 20)
    console.log(h4)
    console.log('    ' + '-'.repeat(96))
    for (const fam of FAMS) {
      for (const a of ARMS) {
        if (a.tag === 'ctl') continue
        // both3 是**对称**的（双方同规则），分差恒≈0，解它没有意义 ——
        // 它在这儿的身份是 foe34 的对照，不是一个待解的档
        if (a.tag === 'both3') continue
        // g(x) = 这一档的分差 − **它自己那个对照**的分差。单调递增，二分找零点
        const ctlTag = a.base || 'ctl'
        const g = (x) => {
          const f = fam.mk(x)
          const d = (t) => score(D[t].me, f, jm.jf) - score(D[t].foe, f, jm.jf)
          return d(a.tag) - d(ctlTag)
        }
        let ln = '     ' + padR(fam.key, 20)
          + padR(a.name.replace('（都贪心）', '') + (a.base ? '*' : ''), 14)
        if (g(fam.hi) <= 0) {
          console.log(ln + pad('解不出', 9)
            + '    〔' + fam.unit + ' 到 ' + fam.hi + ' 都翻不正 —— 这一族救不了这一档〕')
          continue
        }
        let lo = fam.lo; let hi = fam.hi
        if (g(lo) > 0) { lo = fam.lo } // 现行就已经翻正（不该发生，照旧打印）
        for (let it = 0; it < 80; it++) {
          const mid = (lo + hi) / 2
          if (g(mid) > 0) hi = mid; else lo = mid
        }
        const x = (lo + hi) / 2
        const f = fam.mk(x)
        const per = (score(D.ctl.me, f, jm.jf) + score(D.ctl.foe, f, jm.jf)) / 2
        // 「他成功几次 = 你成功一次」—— 用户那句话里的 N
        const cnt = (t, s) => {
          let c = 0
          for (let b = 2; b <= B; b++) c += D[t][s].all[b]
          return c / N
        }
        console.log(ln + pad(f2(x), 9) + pad(f2(per / 21.8) + '×', 8)
          + pad(f2(f(4) / f(2)), 11) + pad(f2(f(5) / f(2)), 11)
          + pad(f2(cnt(a.tag, 'foe') / cnt(a.tag, 'me')) + ' : 1', 20))
      }
    }
  }
  console.log('')
  console.log('  **最后两列是用户那句判据的直读**：「他:你 收牌次数比」就是')
  console.log('  「你等几手他成功几次」，而 f(4)/f(2) 是「你这一次值他几次」。')
  console.log('  两者**不必相等** —— 你忍的那些手也在涨堆，对手收的那几次')
  console.log('  里有一部分是你喂的，所以真正要补的缺口比次数比更大。')
  console.log('')
  console.log('  带 `*` 的那一行对照是「禁收2张(双方)」那个**新基线**，不是「都贪心」。')
  console.log('  它答的是：**规则已经禁掉 2 张之后，「再等到 4」还要不要额外加权**。')
  console.log('  打平点 ≈ 现行值（手续费族 c≈0 / 加法族 b≈0）= 不用加 —— ')
  console.log('  那就是「**禁收 2 张**」这条路最好的结果：线性积分一个字不动。')
}

// `duel.js` 复用这份候选表和打分函数。**不许在那边再写一份 f 的定义** ——
// 「复制一份逻辑，两份必然分叉」（rules.js 里反复写的那条）
// `ENV_PIN` 导出来是给 `duel.js` 用的 —— 它自己 spawn（要按格传
// `HOLD_MIN`/`HOLD_FOE`），走不了上面的 `run()`。**别在那边抄一份**
module.exports = { FNS, FAMS_ALL, JMODES, B, ENV_PIN, score, parse, run, f2, pad, padR }

if (require.main === module) {
  main().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
}
