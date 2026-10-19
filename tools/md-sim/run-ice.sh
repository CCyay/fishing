#!/usr/bin/env bash
# 2026-10-19 ·【凌流】修完豁免之后重量。
#
# 原来那 −2.16 是**实现 bug 下的数**：原型用 `addFrostAt` 直接贴堆上，
# 绕过了 `selfFrost → addFrostHand → iceBlind` 那条路，于是【结冰】词条
# 第二句「**手里**带它的牌打出去时，这一手收牌不受【结冰】影响」没生效 ——
# 凌流自己那张被自己的冰挡住，顺子每次少收 1 张（takeAt 冰支 return 0）。
#
# 账对得上：发动 1.77 次/局 × 1 张 ≈ 1.77 分，而实测差 2.16 / 1.54。
# 所以这一跑要看的是：**修完之后那 1.77 回来了没有。**
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏别的 ################"
node tools/md-sim/check.js 2>&1 | tail -3
# 结冰族三件走同一条 selfFrost，所以它们必须逐位不变 —— 变了就是我动到了基准
echo "---- 结凌（必须还是老数） ----"
node tools/md-sim/sim.js vs frost frost -n "$N" | sed -n '3,6p'
echo "---- 寒流（必须还是老数） ----"
node tools/md-sim/sim.js vs coldhue coldhue -n "$N" | sed -n '3,6p'

echo
echo "################ 1. 凌流：修完之后 ################"
echo "---- 默认档（自己 + 另选 1 张贴通配，跟伏流同形状） ----"
node tools/md-sim/sim.js vs icewild icewild -n "$N" | sed -n '1,30p'
echo "---- 对照：伏流同一跑（差值 = 冰的净值） ----"
node tools/md-sim/sim.js vs flow flow -n "$N" | sed -n '3,6p'

echo
echo "################ 2. 只贴自己那一档 ################"
FLOW_TAG_N=0 node tools/md-sim/sim.js vs icewild icewild -n "$N" | sed -n '1,22p'
FLOW_TAG_N=0 node tools/md-sim/sim.js vs flow flow -n "$N" | sed -n '3,6p'

echo
echo "################ 3. 诊断口 ################"
# icewild.iced 现在读的是「落堆后它身上确实有冰」——
# 修之前那个 100% 是 addFrostAt 自己的返回值，证明不了豁免对不对
node tools/md-sim/proto-diag.js icewild 4000

echo
echo "################ 跑完 ################"
