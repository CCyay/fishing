#!/usr/bin/env bash
# 2026-10-20 ·【大数】的「不对点数 0 生效」那条豁免，量它值多少。
#
# **单带格量不出来**：`vs risetide risetide` 的局面里压根没有 0 点牌
#（0 点只有【退潮】【削水】【死水】【推牌】造得出来），所以豁免档和旧档
# 在那儿逐位相同 —— 实测 −0.33，而另一个会话在没豁免时记的是 −0.35。
#
# 所以这一跑全部用**组合格**，而且每格配 A/B（`RISE_ZERO=0` 退回旧档）。
# 差值就是这条豁免护住了多少分。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 检查 ################"
node tools/md-sim/refs.js 2>&1 | head -4
node tools/md-sim/check.js 2>&1 | tail -3

echo
echo "######## 1. × 退潮（整堆 −3 造 0 点）########"
echo "---- 豁免档（现行） ----"
RISE_TAG_N=10 node tools/md-sim/sim.js pair risetide sinktag -n "$N" | sed -n '1,9p'
echo "---- 旧档 RISE_ZERO=0（0 点也被抬成 10） ----"
RISE_TAG_N=10 RISE_ZERO=0 node tools/md-sim/sim.js pair risetide sinktag -n "$N" | sed -n '3,9p'

echo
echo "######## 2. × 削水（专收 0 点牌 —— 它的猎物会不会被抬走）########"
# 这一格最直观：豁免不生效时，涌潮会把削水的猎物全抬成 10 点，
# 协同该明显变负
echo "---- 豁免档 ----"
RISE_TAG_N=10 node tools/md-sim/sim.js pair risetide lowcut -n "$N" | sed -n '3,9p'
echo "---- 旧档 ----"
RISE_TAG_N=10 RISE_ZERO=0 node tools/md-sim/sim.js pair risetide lowcut -n "$N" | sed -n '3,9p'

echo
echo "######## 3. × 吃水（0 点是 21 匹配的免费垫片）########"
# 这一格说明豁免护的是什么：0 点牌不占预算也不断链，
# 被抬成 10 之后它从「免费垫片」变成「吃掉半个预算的障碍」
echo "---- 豁免档 ----"
RISE_TAG_N=10 node tools/md-sim/sim.js pair risetide draft -n "$N" | sed -n '3,9p'
echo "---- 旧档 ----"
RISE_TAG_N=10 RISE_ZERO=0 node tools/md-sim/sim.js pair risetide draft -n "$N" | sed -n '3,9p'

echo
echo "######## 4. 三件同场：退潮造料 + 涌潮抬场 + 吃水收割 ########"
# 这是【大数】真正要面对的局面 —— 两条改点数的线反向同场。
# `pair` 只装两件，所以借一个三槽角色：鱼塘老板（7 / 3 5 / K）
RISE_TAG_N=10 node tools/md-sim/sim.js pair risetide draft --role pond -n "$N" | sed -n '3,9p'

echo
echo "################ 跑完 ################"
