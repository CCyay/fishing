#!/usr/bin/env node
// 2026-10-22 · 收益矩阵：**「互相赌对方什么时候收」到底成不成立**
//
// ---- 为什么要这个脚本：`fn.js` 的量法有一个结构性缺陷 ----
//
// 用户的原话：「**你这样处理还是没有解决决策问题，只是把「能配就配」换成了
// 「到 4 再配」。永远有最优解法。我要的不是这样，而是风险越大收获越大，
// 互相赌对方什么时候收。**」
//
// 这个批评指的是 `fn.js` 的**量法**，不是它的数。两处：
//
//   1. 它只比四条**固定阈值**策略（贪心 / 等3 / 等4 / 等5）。
//      任何有限集合都有最大值 —— 「永远有最优解法」是量法造出来的，
//      不是游戏的性质。
//   2. **对手永远是贪心。** 那等于对手永远在你养肥的堆上抢，
//      对养堆是结构性不利；而「互相赌」在那个口径里**根本不出现**，
//      因为只有一方在赌。
//
// 这儿换成**完整的收益矩阵**：我的阈值 × 对手的阈值，每一格都真跑。
// 判据是博弈论的，不是「谁的分高」：
//
//   · **存在某一行对所有列都 ≥ 0** → 有纯策略最优解 → 不是赌，是解法。
//   · 不存在 → 必须混合策略 → **这才是「互相赌对方什么时候收」**。
//   · 更硬的证据是**环**（贪心克等6、等6克等4、等4克贪心）—— 石头剪刀布。
//
// ---- 为什么 15 次模拟就够 ----
//
// 一、矩阵是**反对称**的：`base` 口径双方同角色、自由切牌，所以
//     「我用 i 打对手 j」和「我用 j 打对手 i」是同一局面的两侧 ——
//     跑一次 (i,j) 同时拿到两格。于是只需要上三角（含对角）。
// 二、离线重算（`fn.js` 顶上那段）对单调 f 是精确的，所以
//     **15 次模拟覆盖所有候选 f 的完整矩阵**，换一条 f 不用重跑。
//
// ⚠ 对角线是自检：双方同阈值，分差该 ≈ 0。不 ≈ 0 就是哪儿不对称了，
//   那一跑的全部数作废。
//
// 用法：
//   node tools/md-sim/duel.js              # 20000 局 × 15 格
//   node tools/md-sim/duel.js -n 5000      # 快跑
//   FULL=1 node tools/md-sim/duel.js       # 每条 f 都打完整矩阵（很长）
'use strict'
const { spawn } = require('child_process')
const path = require('path')
const { FNS, FAMS_ALL, JMODES, B, ENV_PIN, score, parse, f2, pad, padR } = require('./fn.js')

const argv = process.argv.slice(2)
let N = 20000
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-n') N = parseInt(argv[i + 1], 10)
}
const FULL = process.env.FULL === '1'
const SIM = path.join(__dirname, 'sim.js')

// 策略集。0 = 贪心（能收就收），k = 收成不到 k 张就不收
const GRID = [0, 3, 4, 5, 6]
const LBL = GRID.map((g) => (g === 0 ? '贪心' : '等' + g))
const K = GRID.length

// 同时跑几个。15 个 sim.js 一起起会把机器压垮，分批
const LANES = 5

function run(i, j) {
  const tag = 'd' + i + '_' + j
  return new Promise((res, rej) => {
    // ⚠ **`ENV_PIN` 是翻默认值的钉子，别删**（定义和缘由在 `fn.js`）。
    //   2026-10-23 四个 AI 旋钮翻成了默认开，而这张 5×5 矩阵的
    //   **第 0 行第 0 列写着「贪心（能收就收）」** —— 不钉的话那一格
    //   变成「按 EV 忍 + 守 3 张闸」，整张矩阵没有一格是它标的那个打法，
    //   而输出长得一模一样。`HOLD_MIN` / `HOLD_FOE` 在它之后，照旧覆盖
    const env = Object.assign({}, process.env, ENV_PIN, {
      // ME 用 GRID[i]，FOE 用 GRID[j]。HOLD_FOE='0' 就是「对手不养堆」——
      // `holdMinOf` 里 `HOLD_FOE >= 0` 这一支接管，不会落到 HOLD_BOTH 上
      HOLD_MIN: '' + GRID[i],
      HOLD_FOE: '' + GRID[j],
      DUMP_HIST: tag
    })
    const p = spawn(process.execPath, [SIM, 'base', '-n', '' + N], { env })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('error', rej)
    p.on('close', (c) => (c === 0 ? res({ i, j, tag, out }) : rej(new Error(tag + ' 退出码 ' + c))))
  })
}

// 分批并发
async function runAll(jobs) {
  const done = []
  for (let s = 0; s < jobs.length; s += LANES) {
    const batch = jobs.slice(s, s + LANES)
    process.stderr.write('  跑 ' + (s + 1) + '~' + (s + batch.length) + ' / ' + jobs.length + ' …\n')
    const got = await Promise.all(batch.map((j) => run(j[0], j[1])))
    for (const g of got) done.push(g)
  }
  return done
}

// ---- 博弈判定 ----
//
// D[i][j] = 「我用 i 打对手 j」的分差（我 − 他）。反对称、零和。
// 纯策略均衡（对称零和博弈）：存在 i 使得 ∀j, D[i][j] ≥ 0。
//
// ⚠ **对角线必须排除**〔2026-10-22 第一跑栽的〕。`D[i][i]` 按构造恒为 0
//   （同一格减自己），于是把它算进 min 之后 `maximin > 0` **永远不成立** ——
//   第一跑 ③ 那一整列 48 个「解不出」全是这么来的，一个真结论都没有。
//   而「一个策略打不过自己」本来也不是信息：对称博弈里同策略对局必然平。
function rowWorst(D, i) {
  let w = 1e9
  for (let j = 0; j < K; j++) { if (j === i) continue; w = Math.min(w, D[i][j]) }
  return w
}
function pureNash(D, tol) {
  const out = []
  for (let i = 0; i < K; i++) if (rowWorst(D, i) >= -tol) out.push(i)
  return out
}

// 三元环：i 克 j、j 克 k、k 克 i。有环 = 一定没有纯策略均衡
function cycles(D, tol) {
  const out = []
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      for (let k = 0; k < K; k++) {
        if (i === j || j === k || i === k) continue
        if (i > j || i > k) continue // 每个环只报一次（从最小下标起）
        if (D[i][j] > tol && D[j][k] > tol && D[k][i] > tol) {
          out.push([i, j, k])
        }
      }
    }
  }
  return out
}

function matrixOf(S) {
  const D = []
  for (let i = 0; i < K; i++) {
    D.push([])
    for (let j = 0; j < K; j++) D[i].push(S[i][j] - S[j][i])
  }
  return D
}

function printMatrix(D) {
  let h = '      ' + padR('我 \\ 他', 10)
  for (let j = 0; j < K; j++) h += pad(LBL[j], 9)
  console.log(h + pad('最差', 10))
  console.log('     ' + '-'.repeat(12 + 9 * K))
  for (let i = 0; i < K; i++) {
    let ln = '      ' + padR(LBL[i], 10)
    for (let j = 0; j < K; j++) ln += pad(f2(D[i][j]), 9)
    console.log(ln + pad(f2(rowWorst(D, i)), 10))
  }
}

async function main() {
  console.log('局数 ' + N + ' · base 口径（双方空槽、自由切牌）· 策略集 ' + LBL.join(' / '))
  console.log('〔每格都真跑；上三角 ' + (K * (K + 1) / 2) + ' 次模拟覆盖全部 ' + (K * K) + ' 格（矩阵反对称）〕')
  console.log('')

  const jobs = []
  for (let i = 0; i < K; i++) for (let j = i; j < K; j++) jobs.push([i, j])
  const got = await runAll(jobs)

  // S[i][j] = 我用 i 打对手 j 时**我的**每局得分（按某个 f）
  // 一次 (i,j) 的跑给出两格：me 侧 = S[i][j]，foe 侧 = S[j][i]
  const H = {}
  for (const g of got) {
    const into = {}
    parse(g.out, g.tag, into)
    H[g.i + '_' + g.j] = into
  }
  // ⚠ 对角线那一格 `i === j` 时，`S[i][j]` 和 `S[j][i]` **是同一格** ——
  //   第一版这儿写的是先赋 me、再被 foe 覆盖，于是 `D[i][i] = 0` 恒成立，
  //   把 ⓪ 的自检和 ③ 的 maximin 一起废掉了。现在对角线存**两侧均值**
  //   （= 镜像对局下每人每局拿多少，这才是「盘子」），
  //   而两侧的差单独由 `diagRaw` 保管给 ⓪ 用。
  const build = (f, jf) => {
    const S = []
    for (let i = 0; i < K; i++) { S.push([]); for (let j = 0; j < K; j++) S[i].push(0) }
    for (let i = 0; i < K; i++) {
      for (let j = i; j < K; j++) {
        const h = H[i + '_' + j]
        const a = score(h.me, f, jf, N)
        const b = score(h.foe, f, jf, N)
        if (i === j) { S[i][i] = (a + b) / 2 } else { S[i][j] = a; S[j][i] = b }
      }
    }
    return S
  }
  // 对角线两侧的**原始差**（me − foe）。这才是真的自检量。
  const diagRaw = (f, jf) => {
    const out = []
    for (let i = 0; i < K; i++) {
      const h = H[i + '_' + i]
      out.push(score(h.me, f, jf, N) - score(h.foe, f, jf, N))
    }
    return out
  }

  // ======== ⓪ 对角线自检 ========
  //
  // 双方同阈值 → 分差该 ≈ 0。这是整跑能不能用的那一眼。
  console.log('')
  console.log('################ ⓪ 对角线自检（双方同阈值，分差该≈0） ################')
  const lin = (n) => n
  const R0 = diagRaw(lin, null)
  let bad = 0
  for (let i = 0; i < K; i++) {
    const d = R0[i]
    const flag = Math.abs(d) > 0.30 ? '  ⚠ 偏了' : ''
    if (flag) bad++
    console.log('   ' + padR(LBL[i] + ' vs ' + LBL[i], 16) + pad(f2(d), 9) + flag)
  }
  if (bad > 0) {
    console.log('')
    console.log('  ⚠⚠ 有 ' + bad + ' 格对角线偏离 0 超过 0.30 —— **下面的矩阵别信**。')
    console.log('     `holdMinOf` 两侧该是对称的；偏了就是哪一侧多做/少做了一件事。')
  }

  // ======== ① 可达性：每一档到底能养到多大（两侧都列） ========
  console.log('')
  console.log('################ ① 可达性：对角线那几格的收牌分布 ################')
  console.log('〔用户的判据：「即使你积分算很高但你没机会拿到也是白费」。')
  console.log('  这儿列**双方同阈值**那几格 —— 跟 `fn.js` ① 不同，那边对手恒贪心〕')
  let hh = '   ' + padR('双方都', 10)
  for (let b = 2; b <= 8; b++) hh += pad('N=' + b, 8)
  console.log(hh + pad('合计', 10) + pad('平均N', 8))
  console.log('  ' + '-'.repeat(84))
  for (let i = 0; i < K; i++) {
    const h = H[i + '_' + i].me
    let ln = '   ' + padR(LBL[i], 10)
    let tot = 0; let card = 0
    for (let b = 2; b <= B; b++) {
      const v = (h.all[b] - h.J[b]) / N
      tot += v; card += v * b
      if (b <= 8) ln += pad(f2(v), 8)
    }
    console.log(ln + pad(f2(tot), 10) + pad(f2(card / tot), 8))
  }

  // ======== ①之二 大堆归谁：养堆的人垒起来，能不能被对手收走 ========
  //
  // 这一口是为了判「加速族 r 拧大之后反而解不出」那条异常〔2026-10-22〕。
  // 加速越狠，总分越集中在稀有的大堆上；而大堆**未必归垒它的那一方** ——
  // 养堆的人攒着不收，能配就配的对手可以直接来收。
  // 真是这样的话，那不是 bug，是这条路线的死因，而**只看 X 永远看不见它**
  //（CLAUDE.md 第四节：新机制要配一个「它做了几次」的计数）。
  console.log('')
  console.log('################ ①之二 大堆（N≥7）归谁：养堆档 vs 贪心 ################')
  console.log('〔每格是一次「我=这档、对手=贪心」的对局，两侧各自收到的 N≥7 次数/局。')
  console.log('  「我」那一列小于「对手」那一列 = **堆是我垒的、牌是他收的**〕')
  console.log('   ' + padR('我这档 vs 贪心', 18) + pad('我 N≥7', 10) + pad('贪心 N≥7', 11)
    + pad('我 N≥10', 10) + pad('贪心 N≥10', 11) + pad('差(我−他)', 11))
  console.log('  ' + '-'.repeat(84))
  const bigOf = (h, from) => {
    let c = 0
    for (let b = from; b <= B; b++) c += h.all[b]
    return c / N
  }
  for (let i = 1; i < K; i++) {
    const h = H['0_' + i] // 跑的是 (0,i)：me=贪心、foe=这一档
    const mine = bigOf(h.foe, 7); const his = bigOf(h.me, 7)
    const m10 = h.foe.all[B] / N; const h10 = h.me.all[B] / N
    console.log('   ' + padR(LBL[i] + ' vs 贪心', 18) + pad(f2(mine), 10) + pad(f2(his), 11)
      + pad(f2(m10), 10) + pad(f2(h10), 11) + pad(f2(mine - his), 11))
  }

  // ======== ② 每条 f 的博弈结构 ========
  //
  // 这是整个脚本的那一问。
  console.log('')
  console.log('################ ② 每条 f 下：有没有「最优解法」 ################')
  console.log('〔「纯策略」= 有一行对所有列都不输 → **那就是最优解法，不是赌**。')
  console.log('  「无」= 必须混合 → **这才是「互相赌对方什么时候收」**。')
  console.log('  「最差」那一列是每行的最坏情况（**不含对角线**），maximin 是其中最大的那个。')
  console.log('  「盘子/人局」= maximin 那一档的**镜像对局**里每人每局多少分，')
  console.log('   拿它跟现行线性的 21.8 比才是膨胀倍数 —— 不是拿贪心格比〕')
  const TOL = 0.30 // 判定容差。**这是一个判断旋钮，不是测量值** —— 见文末
  for (const jm of JMODES) {
    console.log('')
    console.log('  ---- ' + jm.key + ' ----')
    let h2 = '     ' + padR('f(N)', 24) + pad('纯策略最优解', 16)
      + pad('maximin', 10) + pad('有环?', 9) + pad('盘子/人局', 11)
    console.log(h2)
    console.log('    ' + '-'.repeat(92))
    for (const c of FNS) {
      const S = build(c.f, jm.jf)
      const D = matrixOf(S)
      const pn = pureNash(D, TOL)
      const cy = cycles(D, TOL)
      let mm = -1e9
      let mmi = 0
      for (let i = 0; i < K; i++) {
        const w = rowWorst(D, i)
        if (w > mm) { mm = w; mmi = i }
      }
      // 盘子：**maximin 那一档的镜像对局**里每人每局拿多少。
      // ⚠ 不是 `S[0][0]`（贪心 vs 贪心）—— 均衡上没人打贪心的话，
      //   那一格的膨胀倍数描述的是一个**不会发生的局面**。
      const per = S[mmi][mmi]
      const tag = pn.length ? pn.map((i) => LBL[i]).join('/') : '**无**'
      console.log('     ' + padR(c.key + (c.cur ? ' ←现行' : ''), 24)
        + pad(tag, 16) + pad(f2(mm), 10)
        + pad(cy.length ? '' + cy.length + ' 个' : '—', 9)
        + pad(f2(per) + ' 分', 11))
      for (const cc of cy) {
        console.log('       ↻ ' + LBL[cc[0]] + ' 克 ' + LBL[cc[1]]
          + '、' + LBL[cc[1]] + ' 克 ' + LBL[cc[2]]
          + '、' + LBL[cc[2]] + ' 克 ' + LBL[cc[0]])
      }
      if (FULL || (!pn.length && jm.jf === null)) printMatrix(D)
    }
  }

  // ======== ③ 解「每多一张要乘几」 ========
  //
  // 用户的判据（原话）：「**按照之前的数据看，跟能配就配的对手打，
  // 最多就只能 4 张匹配 1 次，那么这 1 次获得的积分要能让对手无法翻盘**」。
  //
  // 「无法翻盘」= 分差 ≥ 0，所以这是一个方程，照旧二分解。
  // 跟 `fn.js` ④ 的差别：那边的对手恒贪心（矩阵的第一列），
  // 这儿解的是**对所有列都不输**（maximin ≥ 0）—— 要求严格得多。
  console.log('')
  console.log('################ ③ 要「对手无法翻盘」，参数得多大 ################')
  console.log('〔两个判据分开解，而**它们的方向相反**：')
  console.log('   「打赢贪心」= D[这档][贪心] ≥ 0 —— 这是要**达到**的（能配就配追不上）')
  console.log('   「对谁都不输」= maximin ≥ 0 —— 这是要**避开**的（成了最优解法，赌就没了）')
  console.log('   所以设计目标是**两者之间那一段**。')
  console.log('   区间写法 `m=1.49~3.23`：下沿起成立，过了上沿又不成立（g 不单调）。')
  console.log('   只有下沿的写 `m=1.49起`〕')
  for (const jm of JMODES) {
    console.log('')
    console.log('  ---- ' + jm.key + ' ----')
    console.log('     ' + padR('族', 26) + padR('档', 8)
      + padR('打赢贪心(要达到)', 24) + padR('对谁都不输(要避开)', 24) + pad('膨胀@下沿', 9))
    console.log('    ' + '-'.repeat(96))
    for (const fam of FAMS_ALL) {
      for (let i = 1; i < K; i++) {
        const gBeat = (x) => {
          const D = matrixOf(build(fam.mk(x), jm.jf))
          return D[i][0]
        }
        const gAll = (x) => rowWorst(matrixOf(build(fam.mk(x), jm.jf)), i)
        // ⚠ **先扫再二分，别假设 g 单调**〔2026-10-22 第三跑栽的〕。
        //   第一版只看 `g(hi) > 0`，而加速族的 g **不单调**：
        //   r=3 时 maximin +56（② 的「压低+三倍」逐位等于这一族 r=3），
        //   r=10 时 −15746 —— 解在中间，被整条跳过，打出四行「解不出」。
        //   g 不单调不是噪声，是机制：r 拧过头之后分数全压在稀有大堆上，
        //   而大堆归**会抢的那一方**（①之二），于是加速反过来喂了贪心。
        //
        //   所以这儿解的不是一个点，是**一个区间** —— 下沿「从这儿开始成立」，
        //   上沿「过了这儿又不成立」。没有上沿就只打下沿。
        const SCAN = 48
        const at = (t) => fam.lo + (fam.hi - fam.lo) * t / SCAN
        const solve = (g) => {
          const v = []
          for (let t = 0; t <= SCAN; t++) v.push(g(at(t)))
          let first = -1; let last = -1
          for (let t = 0; t <= SCAN; t++) if (v[t] > 0) { if (first < 0) first = t; last = t }
          if (first < 0) {
            let best = -1e300; let bt = 0
            for (let t = 0; t <= SCAN; t++) if (v[t] > best) { best = v[t]; bt = t }
            return { lo: null, hi: null, best: best, bx: at(bt) }
          }
          // 下沿：first-1 与 first 之间（first===0 表示 lo 端就已经成立）
          const bisect = (a, b, wantPosAtB) => {
            for (let it = 0; it < 50; it++) {
              const mid = (a + b) / 2
              if ((g(mid) > 0) === wantPosAtB) b = mid; else a = mid
            }
            return (a + b) / 2
          }
          const xlo = first === 0 ? fam.lo : bisect(at(first - 1), at(first), true)
          const xhi = last === SCAN ? null : bisect(at(last + 1), at(last), true)
          return { lo: xlo, hi: xhi, best: null, bx: 0 }
        }
        const show = (r) => {
          if (r.lo === null) {
            return '够不着(最好' + fam.unit + '=' + f2(r.bx) + '时' + f2(r.best) + ')'
          }
          return fam.unit + '=' + f2(r.lo) + (r.hi === null ? '起' : '~' + f2(r.hi))
        }
        const rb = solve(gBeat)
        const ra = solve(gAll)
        // 膨胀按**「打赢贪心」的下沿**算 —— 那是「刚够」那一档，
        // 也是这一族最省的用法。按「对谁都不输」算的话量的是另一件事
        //（那一档已经没有赌了，见这一节的读法）
        let infl = '—'
        if (rb.lo !== null) {
          const S = build(fam.mk(rb.lo), jm.jf)
          infl = f2(S[i][i] / 21.8) + '×'
        }
        console.log('     ' + padR(fam.key, 26) + padR(LBL[i], 8)
          + padR(show(rb), 24) + padR(show(ra), 24) + pad(infl, 9))
      }
      // ---- 整族一行：**赌区** ----
      //
      // ⚠ 上面每一行是「**这一档**打不打得赢贪心 / 无不无敌」，
      //   而要的是「**没有任何一档**无敌」—— 一行过关不等于别行没称霸。
      //   实例：压低乘 m 在 m=2 时等4 早就打赢贪心了（下沿 1.49），
      //   可那一档的最优解是**等3**（② 的「压低 1/2/6/8/10」）。
      //   所以赌区要整族扫：每个 x 建一次矩阵，看 `pureNash` 空不空。
      const SC = 48
      const spots = []
      for (let t = 0; t <= SC; t++) {
        const x = fam.lo + (fam.hi - fam.lo) * t / SC
        const D = matrixOf(build(fam.mk(x), jm.jf))
        const pn = pureNash(D, TOL)
        if (pn.length === 0) spots.push(x)
      }
      let band = '**整族都没有**（每个 x 都存在最优解法）'
      if (spots.length) {
        // 只报**连续的那一段**（首尾），中间若有洞另说 —— 洞也打出来
        const holes = spots.length - 1 - Math.round((spots[spots.length - 1] - spots[0])
          / ((fam.hi - fam.lo) / SC))
        band = fam.unit + ' ∈ [' + f2(spots[0]) + ', ' + f2(spots[spots.length - 1]) + ']'
          + '（' + spots.length + '/' + (SC + 1) + ' 个扫描点无解'
          + (holes !== 0 ? '，**区间内有洞**' : '') + '）'
      }
      console.log('     ' + padR('  └ 赌区（无人无敌）', 34) + band)
    }
  }

  console.log('')
  console.log('  ⚠ **容差 ' + TOL.toFixed(2) + ' 是一个判断旋钮，不是测量值。**')
  console.log('    线性档的分差标准误约 0.08（20000 局），而别的 f 把分数整体放大，')
  console.log('    标准误跟着放大 —— 这个脚本**没有逐格算标准误**。')
  console.log('    所以「纯策略最优解」那一列在边界附近（|最差| < 0.5）不可靠，')
  console.log('    判成「无」之前先看矩阵里那一格离 0 有多远。换种子重跑可验。')
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
