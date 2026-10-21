#!/usr/bin/env bash
# 2026-10-20 ·【唤潮】原型：「场上有 >13 → 此牌变成最大的那个数；
#              否则双方 N 张手牌带上【涨潮：全场点数 +M】」。
#
# 它是【涨水】那一轮的结论做成的一件技能：涨水证明了「加厚堆」值
# +0.88~1.00，但收益会**漏给任何带收割线的人**（对手带齐顶时我 −0.86、
# 他 +0.83）。这一件把钥匙塞进同一张牌，于是漏不出去。
#
# **先看诊断再看分** —— 这一件有两个比值决定它成不成立：
#   reap / fires        自循环转起来了没有
#   cashedFoe / cashed  「借对手的手铺场」兑现了没有（它强过涨水的全部理由）
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 检查 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/refs.js 2>&1 | head -4
node tools/md-sim/check.js 2>&1 | tail -3

echo
echo "################ 1. 诊断先行：两支的比例 ################"
echo "---- 默认（双方各 2 张、M=13、全场最大） ----"
node tools/md-sim/proto-diag.js hitide 4000
echo "---- 只贴对手 ----"
TIDE_SIDE=foe node tools/md-sim/proto-diag.js hitide 4000
echo "---- 只贴自己 ----"
TIDE_SIDE=mine node tools/md-sim/proto-diag.js hitide 4000

echo
echo "################ 2. 主格：X / D ################"
echo "---- 默认档（all = 全场最大，**超档嫌疑**） ----"
node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '1,14p'
echo "---- 同色档（suit，照齐顶那条平衡先例） ----"
TIDE_HUE=suit node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,8p'

echo
echo "################ 3. 贴给谁：both / foe / mine ################"
# 【退潮】那件的 both 档已判废（2.54 → 0.67），而死因是**钥匙在另一个槽**。
# 这一件自带收割支，所以 both − foe 的差值就是「自带钥匙值多少」
for s in both foe mine; do
  echo "---- TIDE_SIDE=$s ----"
  TIDE_SIDE=$s node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,8p'
done

echo
echo "################ 4. 两个参数各扫一遍 ################"
echo "---- M（抬多少）：涨水那轮量出 13 是拐点，这儿验它 ----"
for m in 7 13 20; do
  echo "-- TIDE_M=$m --"
  TIDE_M=$m node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,6p'
done
echo "---- N（贴几张）：2 是「动对手手牌拿一半」那把尺子 ----"
for n in 1 2 3; do
  echo "-- TIDE_N=$n --"
  TIDE_N=$n node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,6p'
done

echo
echo "################ 5. 代价那一头：和 / 堆上剩 ################"
# 点数会累积（每兑现一次 +M，而点数往上不设限）。
# 几次之后全场出界 → 普通匹配全废 → 局面会不会僵死，看「和」那一列
node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '/局面长度/,/后手分差/p'

echo
echo "################ 跑完 ################"
