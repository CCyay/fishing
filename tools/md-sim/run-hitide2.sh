#!/usr/bin/env bash
# 2026-10-20 ·【唤潮】定稿档：照【退潮】改成「玩家挑贴哪一排」。
#
# 上一轮的结论：X **3.09**（both）/ **3.26**（foe）/ **0.56**（mine），
# D +0.13，两个诊断比值都过（reap/fires 32%、cashedFoe/cashed 1.12）。
#
# 而 mine 档那个 0.56 指出了一条**机制层面的事实**：
# **带【涨潮】的牌打出去必定空钩** —— 兑现排在匹配之前，全场 +M 之后
# 我这张落堆就匹配不到任何东西。所以「强制双方」= 强制自损。
#
# ⚠ **`pick` 档跟那三档口径不同，别混着比**：
#     both/foe/mine —— 每排各 N 张（共 2N / N / N）
#     pick          —— **总共 N 张**，TIDE_MINE_N 留给自己
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 检查（上一轮 refs 报了 2 处，这次看全） ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/refs.js 2>&1 | head -14
node tools/md-sim/check.js 2>&1 | tail -3

echo
echo "################ 1. pick 档：总共 N 张，留给自己 0~2 张 ################"
# 留 0 = 纯 foe（下限）。留得越多越该掉 —— 掉多少就是「自损」的单价，
# 而玩家实战里会挑最划算的那个点
for k in 0 1 2; do
  echo "---- TIDE_N=3 · 留给自己 $k 张 ----"
  TIDE_SIDE=pick TIDE_N=3 TIDE_MINE_N=$k node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,8p'
done

echo
echo "################ 2. N 扫一遍（pick 档，全贴对手） ################"
# 上一轮「每排各 N 张」口径下 N 单调涨（2.61 / 3.09 / 3.47）。
# pick 档是总共 N 张，所以同一个 N 比上一轮弱 —— 这一节重新定 N
for n in 2 3 4; do
  echo "---- TIDE_N=$n ----"
  TIDE_SIDE=pick TIDE_N=$n TIDE_MINE_N=0 node tools/md-sim/sim.js vs hitide hitide -n "$N" | sed -n '3,8p'
done

echo
echo "################ 3. 定稿候选的完整输出（D + 代价表 + 诊断） ################"
TIDE_SIDE=pick TIDE_N=3 TIDE_MINE_N=0 node tools/md-sim/sim.js vs hitide hitide -n "$N"
echo "---- 诊断 ----"
TIDE_SIDE=pick TIDE_N=3 TIDE_MINE_N=0 node tools/md-sim/proto-diag.js hitide 4000

echo
echo "################ 4. 它跟现有收割线撞不撞型 ################"
# 唤潮自带收割支，所以它跟【齐顶】是**同一条线上的两件** ——
# 「重复 = 零」要查。而跟顺色 / 收色（按花色）应该互补
echo "---- 唤潮 × 齐顶（撞型嫌疑最大） ----"
TIDE_SIDE=pick TIDE_N=3 node tools/md-sim/sim.js pair hitide peak -n "$N" | sed -n '3,8p'
echo "---- 唤潮 × 顺色 ----"
TIDE_SIDE=pick TIDE_N=3 node tools/md-sim/sim.js pair hitide suited -n "$N" | sed -n '3,8p'
echo "---- 唤潮 × 吃水（21 匹配被出界点数封死，应该是负协同） ----"
TIDE_SIDE=pick TIDE_N=3 node tools/md-sim/sim.js pair hitide draft -n "$N" | sed -n '3,8p'

echo
echo "################ 跑完 ################"
