#!/usr/bin/env bash
# 2026-10-20 ·【换水】「任意张」上架之后的验收。
#
# 默认值已经翻过来了（`SWAP_N` 1 → 99 = 不限，实际上限 3），
# 所以下面这几条**不带环境变量**，量的就是游戏里那件技能。
# 照 CLAUDE.md：「旋钮的默认值 = 游戏里那件技能的样子」。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 两个检查 ################"
node tools/md-sim/check.js 2>&1 | tail -4
echo "---- refs（九项）----"
node tools/md-sim/refs.js 2>&1 | tail -20

echo
echo "################ 1. 新默认值对不对 ################"
# 不带环境变量应当 = SWAP_N=3 那一档（X 1.74）。
# 另外收手闸改成「J 也算有用」之后，差应当远小于标准误 0.11
echo "---- 默认（任意张）----"
node tools/md-sim/proto-diag.js swap 4000
node tools/md-sim/sim.js vs swap swap -n "$N" | sed -n '3,8p'
echo "---- SWAP_N=1（旧档，应当还是 0.67）----"
SWAP_N=1 node tools/md-sim/sim.js vs swap swap -n "$N" | sed -n '3,8p'

echo
echo "################ 2. base 该逐位不变（换水不在默认配装里）################"
node tools/md-sim/sim.js base -n "$N"

echo
echo "################ 3. 源码有没有漂 ################"
node tools/md-sim/fingerprint.js

echo
echo "################ 跑完 ################"
