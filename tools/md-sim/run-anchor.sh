#!/usr/bin/env bash
# 2026-10-19 ·【21 匹配】锚点从「堆顶」改成「**打出的那张牌**」。
#
# 这是一次**基准变更**（改的是已上架的【吃水】），所以每一格都配 A/B：
#   DRAFT_ANCHOR=self  新档（默认，现行规则）
#   DRAFT_ANCHOR=top   旧档（恒从堆顶 + 沉底不触发）
#
# 要证的命题有两条，而第一条是**可证伪的**：
#   一、不沉底时两档**逐位相同**（代码上只换了循环方向的写法）。
#       不一样就是我改坏了，别往下读。
#   二、会变的只有「吃水 × 沉底件」那几个组合。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 规则层不变量 ################"
node tools/md-sim/check.js 2>&1 | tail -4

echo
echo "######## 1. 可证伪的那条：吃水单带，两档必须逐位相同 ########"
echo "---- 新档（self） ----"
node tools/md-sim/sim.js vs draft draft -n "$N" | sed -n '1,25p'
echo "---- 旧档（top） ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js vs draft draft -n "$N" | sed -n '1,25p'

echo
echo "######## 2. 真正会变的：吃水 × 沉底件 ########"
# 【寒流】强制落堆底 + 自带无点数（无点数 → own=0 → 预算满 21）。
# 旧档下这个组合里吃水那条线**一次都不发动**，新档下它反着数
echo "---- 吃水 + 寒流 · 新档 ----"
node tools/md-sim/sim.js pair draft coldhue -n "$N"
echo "---- 吃水 + 寒流 · 旧档 ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js pair draft coldhue -n "$N"
echo "---- 吃水 + 窄口（无点数 + 打到堆底）· 新档 ----"
node tools/md-sim/sim.js pair draft narrow -n "$N"
echo "---- 吃水 + 窄口 · 旧档 ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js pair draft narrow -n "$N"
echo "---- 吃水 + 满篓 · 新档 ----"
node tools/md-sim/sim.js pair draft creel -n "$N"
echo "---- 吃水 + 满篓 · 旧档 ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js pair draft creel -n "$N"

echo
echo "######## 3. 【逆流船夫】：它的常驻技是**可选**落堆底 ########"
# 这张角色卡是这次改动最大的受益者 —— 逆流从「落点选择」变成
# 「挑这一段从哪头吃」。而 ai.js 的 canCatch 两头都试，所以它量得出来
echo "---- 逆流船夫带吃水 · 新档 ----"
node tools/md-sim/sim.js one draft -r upstream -n "$N" | sed -n '1,20p'
echo "---- 逆流船夫带吃水 · 旧档 ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js one draft -r upstream -n "$N" | sed -n '1,20p'

echo
echo "######## 4. 上一轮欠的两格（推牌 × 21 匹配） ########"
echo "---- 推 2 层 ----"
DRAFT_SURGE=2 node tools/md-sim/sim.js vs draft draft -n "$N" | sed -n '1,25p'
echo "---- 推 1 层、撞中不置 0（剥开「0 点免费垫片」那一层） ----"
DRAFT_SURGE=1 SURGE_HIT=keep node tools/md-sim/sim.js vs draft draft -n "$N" | sed -n '1,25p'

echo
echo "################ 跑完 ################"
