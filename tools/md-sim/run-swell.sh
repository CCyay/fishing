#!/usr/bin/env bash
# 2026-10-20 ·【涨水】「打出后全场点数 +N」的立项测量。
#
# 立项读数是 **pair，不是单件 X** —— 它是压底族的形状（让堆变厚变死），
# 而那六件 X 全负。用户自己说的是「**等待收割件**」，所以照【涌泉】那条：
# **pair 不出协同就不要做。**
#
# 要先看的是诊断口 `swell.over/touched`：**有几张被顶过 13**。
# 那个比例要是很低，这件技能压根没在做它声称的那件事，分不用看。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -3
node tools/md-sim/refs.js 2>&1 | head -4

echo
echo "################ 1. 诊断先行：N 扫一遍，看封死了多大比例 ################"
# over/touched = 这一手把堆上多大比例的牌顶出界。
# 奇偶两档都扫（N 为奇数会翻转全堆奇偶，撒网那条线整个变样）
for n in 3 5 7 10 13; do
  echo "---- SWELL_N=$n ----"
  SWELL_N=$n node tools/md-sim/proto-diag.js swell 4000
done

echo
echo "################ 2. 单带 X（预期为负 —— 它是压底形状） ################"
for n in 5 7 13; do
  echo "---- SWELL_N=$n ----"
  SWELL_N=$n node tools/md-sim/sim.js vs swell swell -n "$N" | sed -n '3,10p'
done
echo "---- 不含自己（SWELL_SELF=0，自己照常匹配） ----"
SWELL_SELF=0 node tools/md-sim/sim.js vs swell swell -n "$N" | sed -n '3,10p'

echo
echo "################ 3. 立项那一格：跟各条收割线配 ################"
# 配件清单按「谁够得着 13 以上的牌」列的：
#   齐顶 —— 抄同色最大，抬得越高它越准，**而且它钓的就是那张**（最对路）
#   磁钩 —— 差 1，够得着 14
#   收色 —— 按花色，完全不看点数（不受影响 = 纯加厚获益）
#   撒网 —— 按奇偶，⚠ N 为奇数时全堆奇偶翻转
#   伏流 —— 顺子 14-15-16 连得上，要三张都抬过去
for k in peak hook hue cast flow; do
  echo "---- 涨水 × $k（SWELL_N=7） ----"
  SWELL_N=7 node tools/md-sim/sim.js pair swell $k -n "$N" | sed -n '3,9p'
done
echo "---- 涨水 × 齐顶 · N=13（全部出界，齐顶是唯一还够得着的） ----"
SWELL_N=13 node tools/md-sim/sim.js pair swell peak -n "$N" | sed -n '3,9p'

echo
echo "################ 4. 代价那一头：终局堆上剩多少、和是多少 ################"
# 堆变厚 → 收摊时堆上剩得多 → 那几张全不算分。
# 看「拆开双方得分」的**「和」那一列**（拢水那次就是靠它抓出「在喂分」）
SWELL_N=7 node tools/md-sim/sim.js vs swell swell -n "$N" | sed -n '/局面长度/,/后手分差/p'

echo
echo "################ 跑完 ################"
