// 庄家分档 · 白板尺子〔2026-11-09 用户定〕
//   node foe-ruler/tiers.js          分档表 + 复核通关率
//   node foe-ruler/tiers.js --uts    给 draw-levels.uts 的 FOE_TIER_POOL 字面量
//
// 读 data/（run.js 跑的白板实测），用 COEF 把每张卡的白板过关率换算到原来那把尺子（鱼塘老板 + 闯关技能池）的刻度，
// 再照原来的区间分档：CENTER ±3，落进几档就挑离中心最近的；都落不进 = 不出场；某档不够关数就拿离中心最近的补。
//
// ---- COEF 怎么来的（一次性标定，**以后不改**）----
// 2026-11-09 同一版代码上两把尺子各跑一次整表（calibration/pond-1109 = 鱼塘老板 + 技能池 + 囤饵；data/ = 白板），
// 每个难度 × 每档拟合 玩家尺子 = a + b·白板 + c·白板²（calibration/scripts/recal2.js）。
//   为什么是二次不是直线：两把尺子之间是弯的（强的一头被压缩）。直线换算残差标准差 3.5 个点、分出来的抽档表三档通关率偏易 1~4 个点；
//   二次 2.1 个点，复核通关率 40.2 / 19.8 / 4.6（玩家尺子直接分档 40.5 / 19.3 / 4.8）。加「庄家技能件数」进拟合残差几乎不变（3.51）—— 不是技能多少的事
//   （calibration/scripts/curve.js）。台账一百一十。
//
// ---- FIXED：镜魔三张不走白板尺子 ----
// 它们的【照花】【照点】是「选择玩家 1 个花色 / 点数槽技能发动」—— 白板玩家槽是空的，白板尺子量不到它们
// （直线拟合下残差 −18.6 / −25.7 / +4.7，标定时排除）。这三张直接读玩家尺子那一批（calibration/pond-1109）的实测。
// ⚠ 改了这三张的配装、或者闯关技能池大改，要单独用玩家尺子重量它们（PLAYER_SP=1、不设 PLAYER_FIXED，照 calibration 的命令）
//
// ⚠ 复核通关率用的是**换算值**（白板实测过 COEF），不是玩家实测 —— 残差标准差约 2 个点，单张卡可能落错一档，三档通关率是对的（标定那天验过）
const fs = require('fs'), path = require('path'), crypto = require('crypto'), dir = __dirname
function parse(f) {
  const out = {}; let d = null
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const h = l.match(/^【(简单|普通|困难)】/); if (h) { d = h[1]; out[d] = {}; continue }
    const m = d && l.match(/^\s+(\d+)\s+.+?\s+(?:不记牌|记牌|随机)\S*\s+\d+ 件\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/)
    if (m) out[d][+m[1]] = (+m[2] + +m[4]) / 100
  }
  return out
}
const D = ['简单', '普通', '困难'], LIVES = [4, 4, 3], TARGET = [0.40, 0.20, 0.05]
const TIERS = [[3, 4, 5], [6, 7, 8], [9, 10, 11], [12]], TN = ['3~5', '6~8', '9~11', '12']
// 区间中心：原来那把尺子的刻度（2026-11-04 定、11-06 / 11-09 沿用）
const CENTER = [[79.6, 73.6, 67.6, 61.6], [71.7, 65.7, 59.7, 53.7], [67.1, 61.1, 55.1, 49.1]]
// 换算系数 [a, b, c]：玩家尺子 = a + b·白板 + c·白板²（单位：百分点）
const COEF = [
  [[13.31926, 1.63086, -0.00871], [13.22694, 1.63409, -0.00876], [13.02743, 1.64896, -0.00896], [14.88304, 1.5568, -0.00792]],
  [[13.41452, 1.7775, -0.01135], [13.27742, 1.93207, -0.01416], [13.00785, 2.05656, -0.0169], [13.82874, 2.00188, -0.01586]],
  [[11.83296, 1.69755, -0.00992], [13.27742, 1.93207, -0.01416], [13.00785, 2.05656, -0.0169], [13.82874, 2.00188, -0.01586]],
]
const FIXED = ['d21', 'd22', 'd23']
// 卡号 → 名字 + 实测文件（照 out-foestr-1106/tiers.js）
const CARDS = [
  [3, '守河老汉', 'shouhe-unhook2'], [4, '滩头老翁', 'd01'], [5, '回漩摆渡人', 'd02'], [6, '礁石海女', 'd03'], [7, '潮眼引水人', 'd04'],
  [8, '湾口税吏', 'd05'], [9, '雾港守灯人', 'd06'], [10, '涡心祭司', 'd07'], [11, '鲸落拾骨人', 'd08'], [12, '深渊君主S', 's-ice-S'],
  [13, '赤礁烧炭工S', 's-burn-S'], [15, '叠浪弄潮儿', 'd12'], [16, '沙垒筑堤工S', 's-stone-S'], [17, '漫江拉网人', 'd14'], [18, '东海龙王S', 's-flow-S'],
  [19, '渔政巡查员', 'd16'], [20, '渔政巡查员H', 'd17'], [21, '渔政巡查员D', 'd18'], [22, '渔政巡查员S', 'd19'],
  [23, '镜魔', 'd20'], [24, '镜魔H', 'd21'], [25, '镜魔D', 'd22'], [26, '镜魔S', 'd23'],
]
let num = 27
for (const [k, n] of [['burn', '赤礁烧炭工'], ['stone', '沙垒筑堤工'], ['ice', '深渊君主'], ['flow', '东海龙王']])
  for (const v of ['base', 'H', 'D', 'HD', 'DD']) CARDS.push([num++, n + (v === 'base' ? '' : v), 's-' + k + '-' + v])
// P[c][难度][关] = 玩家尺子刻度的过关率（0~1）：白板实测过 COEF；FIXED 那几张直接读玩家尺子实测
const P = {}
for (const [c, , f] of CARDS) {
  if (FIXED.indexOf(f) >= 0) { P[c] = parse(path.join(dir, 'calibration', 'pond-1109', f + '.txt')); continue }
  const raw = parse(path.join(dir, 'data', f + '.txt'))
  P[c] = {}
  for (let d = 0; d < 3; d++) {
    P[c][D[d]] = {}
    for (let t = 0; t < 4; t++) for (const lv of TIERS[t]) {
      const x = raw[D[d]][lv] * 100, w = COEF[d][t]
      P[c][D[d]][lv] = (w[0] + w[1] * x + w[2] * x * x) / 100
    }
  }
}
// 第 1、2 关是白板庄家（不分档），复核用玩家尺子那一批的实测
const base = parse(path.join(dir, 'calibration', 'pond-1109', 'base.txt'))
const FIX = [[base['简单'][1], base['简单'][2]], [base['普通'][1], base['普通'][2]], [base['困难'][1], base['困难'][2]]]
const mean = (c, d, t) => TIERS[t].reduce((a, lv) => a + P[c][D[d]][lv], 0) / TIERS[t].length * 100
const tierOf = {}, pools = [[[], [], [], []], [[], [], [], []], [[], [], [], []]]
for (const [c] of CARDS) for (let d = 0; d < 3; d++) {
  let best = -1, bd = 99
  for (let t = 0; t < 4; t++) { const x = Math.abs(mean(c, d, t) - CENTER[d][t]); if (x <= 3 && x < bd) { bd = x; best = t } }
  tierOf[c + ':' + d] = best
  if (best >= 0) pools[d][best].push(c)
}
const filled = []
for (let d = 0; d < 3; d++) for (let t = 0; t < 4; t++) {
  const need = TIERS[t].length
  if (pools[d][t].length >= need) continue
  const rest = CARDS.map(x => x[0]).filter(c => pools[d][t].indexOf(c) < 0).sort((a, b) => Math.abs(mean(a, d, t) - CENTER[d][t]) - Math.abs(mean(b, d, t) - CENTER[d][t]))
  while (pools[d][t].length < need) { const c = rest.shift(); pools[d][t].push(c); filled.push(D[d] + ' ' + TN[t] + ' 补 ' + CARDS.find(x => x[0] === c)[1]) }
}
function clear(ps, lives) {
  let st = []; for (let k = 0; k <= lives; k++) st.push(k === lives ? 1 : 0)
  for (const p of ps) { const nx = st.map(() => 0); for (let k = 1; k <= lives; k++) { if (!st[k]) continue; for (let j = 0; j < k; j++) nx[k - j] += st[k] * Math.pow(1 - p, j) * p } st = nx }
  return st.reduce((a, b) => a + b, 0)
}
// 照 rollFoeOrder：每档从池里不放回地抽
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
function mc(d, n) {
  let s = 0
  for (let i = 0; i < n; i++) {
    const used = [], ps = FIX[d].slice()
    for (let t = 0; t < 4; t++) { let pool = pools[d][t].filter(c => used.indexOf(c) < 0)
      for (const lv of TIERS[t]) { const c = pool.length ? pool.splice(Math.floor(rnd() * pool.length), 1)[0] : pools[d][t][0]; used.push(c); ps.push(P[c][D[d]][lv]) } }
    s += clear(ps, LIVES[d])
  }
  return s / n
}
const name = c => CARDS.find(x => x[0] === c)[1]
if (require.main === module) {
  // 规则 / AI 动过没有：跟 data/STAMP 最后一行比（rules.js 里也放原型，哈希变了不一定是规则改了 —— 看台账作废公告再定要不要整表重跑）
  const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(dir, '..', f))).digest('hex').slice(0, 12)
  const stampF = path.join(dir, 'data', 'STAMP')
  if (fs.existsSync(stampF)) {
    const last = JSON.parse(fs.readFileSync(stampF, 'utf8').trim().split(/\r?\n/).pop())
    const now = { rules: md5('rules.js'), ai: md5('ai.js'), campaign: md5('campaign.js') }
    const changed = ['rules', 'ai', 'campaign'].filter(k => last[k] !== now[k])
    if (changed.length) console.log('⚠ 跟最近一次跑（' + last.date + '）相比变了：' + changed.join(' / ') + ' —— 规则或 AI 改过的话该整表重跑（node foe-ruler/run.js）\n')
  }
  if (process.argv.includes('--uts')) {
    console.log(JSON.stringify(pools))
  } else {
    for (let d = 0; d < 3; d++) {
      console.log('== ' + D[d] + '（目标 ' + TARGET[d] * 100 + '%）复核通关率 ' + (mc(d, 20000) * 100).toFixed(1) + '%（换算值）')
      for (let t = 0; t < 4; t++) console.log('  ' + TN[t] + '：' + pools[d][t].map(c => name(c) + ' ' + mean(c, d, t).toFixed(1)).join(' · '))
    }
    if (filled.length) console.log(filled.join('\n'))
  }
}
module.exports = { CARDS, mean, tierOf, pools, D, TN, CENTER, P }
