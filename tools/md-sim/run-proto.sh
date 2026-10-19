#!/usr/bin/env bash
# 2026-10-19 · 用户那六条提案的测算矩阵（五件原型 + 一个纯旋钮档）。
#
# CLAUDE.md 那条「一次把矩阵量全，不边推边量」—— 顺子族那一轮
# 五层推算层层错，正确做法是一条循环全拿到。所以这儿一次跑完。
#
#   bash tools/md-sim/run-proto.sh 2>&1 | tee tools/md-sim/proto-out.txt
#
# 口径：全部 `vs X X -n 20000`（双方同角色同槽，江口闸官第 1 槽 = A），
# 报的是**两侧原始值 + 差**，而 **D 是那个差的一半**。
# `pair` 是两件都在我这边，报协同（差中之差）。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先过两道检查 ################"
node tools/md-sim/check.js 2>&1 | tail -6
node tools/md-sim/refs.js  2>&1 | tail -12

echo
echo "######## 0.5 基准变更：【保护】改成独立标签（2026-10-19 用户定） ########"
# CLAUDE.md：「改了基准（默认值 / 口径 / 修了 bug）之后，先声明哪些旧数作废」。
# 这次改的是 wardAt / wardUnder 的语义 —— 标签和弹药分开了。
# 行为差别两处，都低频：别的叠放件垫的那张现在也能当弹药；弹药打光后标签还在。
# 所以凝水（唯一的保护来源）和抬水（唯一会在同一张牌上再垫一张的）要重量。
echo "---- 凝水（台账旧数 X=1.31，标着「下限」） ----"
node tools/md-sim/sim.js vs calm calm -n "$N"
echo "---- 凝水 + 抬水：两件垫同一张牌那条路，正是这次改动唯一碰到的地方 ----"
node tools/md-sim/sim.js pair calm raise -n "$N"

echo
echo "################ 1. 基准：吃水（台账记的是 X=3.47） ################"
node tools/md-sim/sim.js vs draft draft -n "$N"

echo
echo "################ 提案 1 【低吃】整堆（含自己）−1 + 21 匹配 ################"
node tools/md-sim/sim.js vs lowdraft lowdraft -n "$N"

echo
echo "################ 提案 2 【浊吃】异色置 0 + 21 匹配 ################"
node tools/md-sim/sim.js vs huedraft huedraft -n "$N"

echo
echo "################ 提案 3 置 0 + 21 匹配（纯旋钮，零代码） ################"
echo "---- 3a 必须够到堆上 3 张（用户这一轮加的闸） ----"
DRAFT_COSTS_SELF=0 DRAFT_MIN=3 node tools/md-sim/sim.js vs draft draft -n "$N"
echo "---- 3b 对照：同样置 0，但闸还是 2 张（隔离那道闸值多少） ----"
DRAFT_COSTS_SELF=0 node tools/md-sim/sim.js vs draft draft -n "$N"
echo "---- 3c 对照：不置 0，但闸提到 3 张（隔离「置 0」值多少） ----"
DRAFT_MIN=3 node tools/md-sim/sim.js vs draft draft -n "$N"

echo
echo "################ 提案 4 【拢水】通配 + 收纳一层保护 ################"
echo "---- 4a 单带（用户预期「本身应该不强」） ----"
node tools/md-sim/sim.js vs stow stow -n "$N"
echo "---- 4b 跟【伏流】搭 ----"
node tools/md-sim/sim.js pair stow flow -n "$N"
echo "---- 4c 跟【涉水】搭 ----"
node tools/md-sim/sim.js pair stow wade -n "$N"
echo "---- 4d 跟【漫流】搭 ----"
node tools/md-sim/sim.js pair stow brim -n "$N"

echo
echo "################ 提案 5 【凌流】自带冰 + 通配 + 顺子匹配 ################"
echo "---- 5a 凌流（默认档：自己 + 另选 1 张贴通配，跟伏流同形状） ----"
node tools/md-sim/sim.js vs icewild icewild -n "$N"
echo "---- 5b 对照：伏流（同一跑、同一档）→ 两者一减 = 冰的净值 ----"
node tools/md-sim/sim.js vs flow flow -n "$N"
echo "---- 5c 只贴自己那一档（FLOW_TAG_N=0），两件各一次 ----"
FLOW_TAG_N=0 node tools/md-sim/sim.js vs icewild icewild -n "$N"
FLOW_TAG_N=0 node tools/md-sim/sim.js vs flow flow -n "$N"

echo
echo "################ 提案 6 【坠水】垫下面减点数 + 随即判匹配 ################"
echo "---- 6a 单带 ----"
node tools/md-sim/sim.js vs drag drag -n "$N"
echo "---- 6b 对照：抬水（同一跑）—— 加减两个方向差多少 ----"
node tools/md-sim/sim.js vs raise raise -n "$N"
echo "---- 6c 跟【吃水】搭（用户：要搭配 21 匹配才发挥得出来） ----"
node tools/md-sim/sim.js pair drag draft -n "$N"
echo "---- 6d 对照：抬水 + 吃水（抬高点数是**收紧**对手预算的方向） ----"
node tools/md-sim/sim.js pair raise draft -n "$N"

echo
echo "################ 诊断口：它到底做了几次 ################"
# 单看 X 发现不了机制接错 —— 同色闸那个传参 bug 在 X 上只差 0.01。
# 这几行要跟上面的分值一起读
for k in lowdraft huedraft stow icewild drag; do
  node tools/md-sim/proto-diag.js "$k" 4000
done

echo
echo "################ 跑完。记台账时带两个标签：规则档 R3 + 代码状态 ################"
