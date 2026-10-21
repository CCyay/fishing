#!/usr/bin/env bash
# 2026-10-21 · 补第五轮那个**跑坏了的诊断口**。
#
# 坏在哪：`R.kitFromRole(role, fn)` 的第二个参数是**数组**，不是函数
#（照 sim.js 的 cmdPair：`DRAW_ROLES[role].slots.map((s,i) => ...)`）。
# 我传了个箭头函数，于是配装是空的 —— `fires=0.000`，而两档得分都是 21.94。
#
# ⚠ 这一格值得留着：两个 21.94 看起来**完全像一个合理的结果**
#（基线 21.99 附近），只有 `fires=0` 这个带分母的计数口抖出了它。
# 照 CLAUDE.md 第四节：「一个看起来合理的数不能当成机制对了」。
#
# 要验的因果：协同是不是来自「顺子件让我更容易自己把宿主钓走 = 自己收款」。
# 单带时 —— 丙（带点数）mine=1.808 / foe=1.193，我剥 60.2%
#           甲（无点数）mine=0.982 / foe=1.324，我剥 42.6%
# 配上伏流之后 `mine` 该涨。不涨就说明协同是别的来路，我得换个讲法。
set -u
cd "$(dirname "$0")/../.."

diag() {
  node -e '
const R = require("./tools/md-sim/rules.js"), AI = require("./tools/md-sim/ai.js")
const at = k => { for (let i = 0; i < R.SKILLS.length; i++) if (R.SKILLS[i].key === k) return i; throw new Error("没这件：" + k) }
const role = R.roleIndexOf("lock")
const a = at("stow"), b = process.argv[1] === "-" ? -1 : at(process.argv[1])
// **数组**，照 cmdPair。槽 0 放拢水、槽 1 放搭档、其余空
const picks = R.DRAW_ROLES[role].slots.map((s, i) => i === 0 ? a : (i === 1 ? b : -1))
const lo = R.kitFromRole(role, picks)
const n = 6000
let score = 0
for (let i = 0; i < n; i++) {
  const G = R.playGame({ rng: R.makeRng(12345 + i), mine: lo, foe: R.emptyLoadout(),
    mineSmart: true, foeSmart: true, myRole: -1, foeRole: -1, fixFirst: R.FOE }, AI)
  score += G.score[R.ME]
}
const s = R.PROTO_STAT.stow, w = R.PROTO_STAT.ward
if (s.fires === 0) { console.log("  ⚠ fires=0 —— 配装没装上，这一格不是数据"); process.exit(1) }
console.log("  拢水 + " + (b < 0 ? "（单带）" : R.SKILLS[b].name) + " · " + n + " 局 · 得分 "
  + (score / n).toFixed(2) + " 分/局")
console.log("  stow: fires=" + (s.fires/n).toFixed(3) + "  stowed=" + (s.stowed/n).toFixed(3)
  + "  drawn=" + (s.drawn/n).toFixed(3) + "  atBottom=" + (s.atBottom/n).toFixed(3))
console.log("  ward: mine=" + (w.mine/n).toFixed(3) + "  foe=" + (w.foe/n).toFixed(3)
  + "   我剥的占比 " + (100*w.mine/(w.mine+w.foe)).toFixed(1) + "%"
  + "   剥完比例 " + (100*(w.mine+w.foe)/s.stowed).toFixed(1) + "%")
' "$1"
}

echo "################ 先自检：单带（跟第四轮 proto-diag 的数必须一致） ################"
echo "---- 甲 单带 · 无点数（proto-diag 给的是 mine=0.982 foe=1.324） ----"
diag -
echo "---- 丙 单带 · 带点数（proto-diag 给的是 mine=1.808 foe=1.193） ----"
STOW_VOID=0 diag -

echo
echo "################ 配伏流 ################"
echo "---- 甲档（无点数） ----"
diag flow
echo "---- 丙档（带点数） ----"
STOW_VOID=0 diag flow

echo
echo "################ 配涉水（协同最大的那件，当交叉验证） ################"
echo "---- 甲档（无点数） ----"
diag wade
echo "---- 丙档（带点数） ----"
STOW_VOID=0 diag wade

echo
echo "################ 跑完 ################"
