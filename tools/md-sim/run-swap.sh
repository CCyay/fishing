#!/usr/bin/env bash
# 2026-10-20 ·【换水】改成「选任意张自己的手牌洗回牌库」。
#
# 现状：选 1 张，X **0.67** / 价 40 —— **全表倒数**。
# 台账记着它的病根：「换水换的是**一张未知的**」，两头都不可控。
#
# ⚠ **先看 `swapped/fires`，再看 X**：那个比值要是贴着 1.0，
# 说明手里平均只有一张真废牌，「任意张数」就是摆设 —— 那时 X 涨不涨
# 都跟这个改动无关。照 CLAUDE.md 第四节（只看 X 查不到机制对没对）。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 可证伪的那条：SWAP_N=1 必须重现 0.67 ################"
node tools/md-sim/check.js 2>&1 | tail -3
node tools/md-sim/sim.js vs swap swap -n "$N" | sed -n '3,8p'

echo
echo "################ 1. 诊断先行：真换了几张 ################"
# 手牌 4 张、打出换水那张之后剩 3 —— 所以 3 是实际上限，4 用来确认撞顶
for n in 1 2 3 4; do
  echo "---- SWAP_N=$n ----"
  SWAP_N=$n node tools/md-sim/proto-diag.js swap 4000
done

echo
echo "################ 2. X 曲线 ################"
for n in 2 3 4; do
  echo "---- SWAP_N=$n ----"
  SWAP_N=$n node tools/md-sim/sim.js vs swap swap -n "$N" | sed -n '3,8p'
done

echo
echo "################ 3.「挑得准」值多少（SWAP_WASTE=0 强制换满）################"
# 关掉之后它无脑换满 N 张（连有用的也换）。两档的差 = 挑牌精度的价值，
# 照凝水那条先例（「价值全在挑牌精度上，而 AI 挑得笨」）
for n in 2 3; do
  echo "---- SWAP_N=$n · 强制换满 ----"
  SWAP_N=$n SWAP_WASTE=0 node tools/md-sim/sim.js vs swap swap -n "$N" | sed -n '3,8p'
  SWAP_N=$n SWAP_WASTE=0 node tools/md-sim/proto-diag.js swap 4000
done

echo
echo "################ 4. 撞型：它会不会吃掉同族那几件 ################"
# 这一族是全表最干净的定价阶梯（0.67/1.39/2.73/4.20 对 40/55/80/115）。
# 换水涨上去之后要确认它没越过压舱那一格
echo "---- 换水(N=3) × 压舱 ----"
SWAP_N=3 node tools/md-sim/sim.js pair swap press -n "$N" | sed -n '3,8p'
echo "---- 换水(N=3) × 观潮（洗牌会冲掉它看到的牌序）----"
SWAP_N=3 node tools/md-sim/sim.js pair swap tide -n "$N" | sed -n '3,8p'
echo "---- 换水(N=3) × 择饵（同上，而且择饵看 5 张）----"
SWAP_N=3 node tools/md-sim/sim.js pair swap pick -n "$N" | sed -n '3,8p'

echo
echo "################ 跑完 ################"
