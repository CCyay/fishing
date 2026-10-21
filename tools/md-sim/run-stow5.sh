#!/usr/bin/env bash
# 2026-10-21 ·【拢水】第五轮：**把配对矩阵补全**。
#
# 第四轮量了四格单带（落堆底 × 无点数），但配兑现口**只跑了无点数那两档**。
# 而四格里单带最好的是「落堆顶 + 带点数」（+0.04），它的配对一格都没量 ——
# 于是整条设计线缺了一半，而「带点数档配上顺子件会怎样」方向我说不了
#（顺子件能用上那个点数，也可能跟【通配】重复，两个方向都讲得通）。
#
# 所以这一轮把 4 档 × 3 件补成完整矩阵。一次量全，不边推边量
#（CLAUDE.md：顺子族那轮五层推算层层错）。
#
# 第四轮已有的两档（不重跑，列在这儿当对照）：
#   落堆顶 + 无点数   伏流 +3.59(协同 +1.11)  易流 +3.45(+1.18)  涉水 +3.02(+1.30)
#   落堆底 + 无点数   伏流 +4.02(+1.22)       易流 +3.88(+1.30)  涉水 +3.47(+1.44)
# 单带四格：
#   落堆顶+无点数 −1.18 ／ 落堆底+无点数 −0.86 ／ 落堆顶+带点数 +0.04 ／ 落堆底+带点数 −0.91
#
# ⚠ 口径：`pair` 报的是**后手那一侧**，跟第四轮那两档和全表都可比。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 丙档：落堆顶 + 带点数（单带 +0.04，四格最优） ################"
for mate in flow swapflow wade; do
  echo "---- 拢水 + $mate ----"
  STOW_VOID=0 node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '1,8p'
done

echo
echo "################ 丁档：落堆底 + 带点数（补齐第四格） ################"
for mate in flow swapflow wade; do
  echo "---- 拢水 + $mate ----"
  STOW_SINK=1 STOW_VOID=0 node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '3,8p'
done

echo
echo "################ 诊断：配伏流时盾是谁剥的 ################"
# 这是这一轮唯一的因果口。单带时：
#   丙（带点数）mine=1.808 / foe=1.193 —— 我剥 60.2%
#   甲（无点数）mine=0.982 / foe=1.324 —— 我剥 42.6%
# 协同的机制假设是「顺子件让我更容易自己把宿主钓走 = 自己收款」。
# 那么配上伏流之后 **mine 该涨**。不涨的话协同是别的来路，我就不能那么讲。
#
# `proto-diag.js` 只装一件技能（kitWithOne），配对档得自己拼 ——
# 照 sim.js 的 cmdPair：kitFromRole + 槽 0/槽 1 各一件
node -e '
const R = require("./tools/md-sim/rules.js"), AI = require("./tools/md-sim/ai.js")
const at = k => { for (let i = 0; i < R.SKILLS.length; i++) if (R.SKILLS[i].key === k) return i; throw new Error("没这件：" + k) }
const role = R.roleIndexOf("lock")
const a = at("stow"), b = at(process.argv[1])
const lo = R.kitFromRole(role, i => i === 0 ? a : (i === 1 ? b : -1))
const n = 6000
let score = 0
for (let i = 0; i < n; i++) {
  const G = R.playGame({ rng: R.makeRng(12345 + i), mine: lo, foe: R.emptyLoadout(),
    mineSmart: true, foeSmart: true, myRole: -1, foeRole: -1, fixFirst: R.FOE }, AI)
  score += G.score[R.ME]
}
const s = R.PROTO_STAT.stow, w = R.PROTO_STAT.ward
console.log("  拢水 + " + R.SKILLS[b].name + " · " + n + " 局 · 江口闸官 槽1+槽2 · 得分 "
  + (score / n).toFixed(2) + " 分/局")
console.log("  stow: fires=" + (s.fires/n).toFixed(3) + "  stowed=" + (s.stowed/n).toFixed(3)
  + "  drawn=" + (s.drawn/n).toFixed(3) + "  atBottom=" + (s.atBottom/n).toFixed(3))
console.log("  ward: mine=" + (w.mine/n).toFixed(3) + "  foe=" + (w.foe/n).toFixed(3)
  + "   我剥的占比 " + (100*w.mine/(w.mine+w.foe)).toFixed(1) + "%"
  + "   剥完比例 " + (100*(w.mine+w.foe)/s.stowed).toFixed(1) + "%")
' flow
echo "---- 同一格，带点数（丙档） ----"
STOW_VOID=0 node -e '
const R = require("./tools/md-sim/rules.js"), AI = require("./tools/md-sim/ai.js")
const at = k => { for (let i = 0; i < R.SKILLS.length; i++) if (R.SKILLS[i].key === k) return i; throw new Error("没这件：" + k) }
const role = R.roleIndexOf("lock")
const a = at("stow"), b = at(process.argv[1])
const lo = R.kitFromRole(role, i => i === 0 ? a : (i === 1 ? b : -1))
const n = 6000
let score = 0
for (let i = 0; i < n; i++) {
  const G = R.playGame({ rng: R.makeRng(12345 + i), mine: lo, foe: R.emptyLoadout(),
    mineSmart: true, foeSmart: true, myRole: -1, foeRole: -1, fixFirst: R.FOE }, AI)
  score += G.score[R.ME]
}
const s = R.PROTO_STAT.stow, w = R.PROTO_STAT.ward
console.log("  拢水 + " + R.SKILLS[b].name + " · " + n + " 局 · 江口闸官 槽1+槽2 · 得分 "
  + (score / n).toFixed(2) + " 分/局")
console.log("  stow: fires=" + (s.fires/n).toFixed(3) + "  stowed=" + (s.stowed/n).toFixed(3)
  + "  drawn=" + (s.drawn/n).toFixed(3) + "  atBottom=" + (s.atBottom/n).toFixed(3))
console.log("  ward: mine=" + (w.mine/n).toFixed(3) + "  foe=" + (w.foe/n).toFixed(3)
  + "   我剥的占比 " + (100*w.mine/(w.mine+w.foe)).toFixed(1) + "%"
  + "   剥完比例 " + (100*(w.mine+w.foe)/s.stowed).toFixed(1) + "%")
' flow

echo
echo "################ 跑完 ################"
