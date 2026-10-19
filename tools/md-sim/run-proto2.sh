#!/usr/bin/env bash
# 补跑：第一轮里被 `DRAFT_SURGE is not defined` 崩掉的那几格 + 两个对照。
#
# 崩的原因不是代码错，是 **rules.js 在跑的过程中被另一个进程改了**
#（那边加 21 匹配诊断口和 DRAFT_SURGE 旋钮，写到一半被 node 读到）。
# 跑这个之前先确认没有别的进程在改 rules.js。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 先确认文件是完整的 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -3

echo
echo "################ 补 5c：伏流在 FLOW_TAG_N=0 档（凌流的对照） ################"
# 第一轮这一格崩了，而少了它就没法说「只贴自己那一档，冰值多少」
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
echo "################ 基准变更的 A/B：保护改标签值多少 ################"
# 第一轮量到凝水 X=0.50，而文档旧表记的是 1.31 —— 那是**跨版本**的差，
# 里头混着这次的改动和这两周所有别的改动。WARD_TAG=0 退回旧档，
# 同一跑相减才分得开
echo "---- 凝水 · 标签档（现行） ----"
node tools/md-sim/sim.js vs calm calm -n "$N"
echo "---- 凝水 · 旧档（WARD_TAG=0） ----"
WARD_TAG=0 node tools/md-sim/sim.js vs calm calm -n "$N"
echo "---- 拢水 · 两档各一次（它整件都建在保护上） ----"
node tools/md-sim/sim.js vs stow stow -n "$N"
WARD_TAG=0 node tools/md-sim/sim.js vs stow stow -n "$N"

echo
echo "################ 诊断口：它到底做了几次 ################"
for k in lowdraft huedraft stow icewild drag; do
  node tools/md-sim/proto-diag.js "$k" 4000
done

echo
echo "################ 补跑完 ################"
