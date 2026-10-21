#!/usr/bin/env bash
# 2026-10-21 ·【拢水】第三轮：**加「无点数」**〔用户定〕。
#
# 设计现在是四句：通配、无点数、保护、将堆上其他牌叠放到它下面（N 张 N 层）。
#
# 它打的是上一轮量出来的**死因二**：全量收纳把堆清空后只剩它一张当前牌，
# 于是双方任何匹配都只能打在它身上，而它底下压着我亲手垫的 1.94 层盾 ——
# 实测 ward.foe=1.250 / mine=0.581，**对手剥盾是我的 2.15 倍**。
#
# ⚠ 这一档的代价是双向的而且很大：基线对手不带技能（没有花色匹配、
# J 通吃被保护挡），于是那张牌**永久坐在堆底**，底下那几张**谁也收不走**。
# 所以这一跑要盯三样，不是一个 X：
#   ward.foe   掉了多少（死因二治好了没）
#   双方得分的「和」 掉了多少（那几张锁死的牌是双方一起付的）
#   cleared / stowed / pileWas 跟上一轮比（无点数会不会反过来让堆更薄）
#
# ⚠ 别照搬伏流的结论：`FLOW_VOID` 默认**关**，因为伏流有自己的兑现口
#（顺子匹配），无点数那条代价它撑不起（+3.41 → +2.45）。拢水没有兑现口。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -4
echo "---- 凝水（没动【保护】，必须还是 0.51） ----"
node tools/md-sim/sim.js vs calm calm -n "$N" | sed -n '3,6p'
# 无点数那条链碰到了 valuesOf，所以**顺手验一件无关的无点数件**没被带歪
echo "---- 伏流（FLOW_VOID 默认关，必须还是 3.66） ----"
node tools/md-sim/sim.js vs flow flow -n "$N" | sed -n '3,6p'

echo
echo "################ 1. 单带 · 三档 A/B ################"
echo "---- 定稿：全量收纳 + 无点数（STOW_ALL=1 STOW_VOID=1） ----"
node tools/md-sim/sim.js vs stow stow -n "$N"
echo "---- 对照甲：全量收纳 + **带点数**（上一轮，−2.34） ----"
STOW_VOID=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'
echo "---- 对照乙：只收 1 张 + 无点数（看无点数单独值多少） ----"
STOW_ALL=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'
echo "---- 对照丙：只收 1 张 + 带点数（最初那档，−1.17） ----"
STOW_ALL=0 STOW_VOID=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'

echo
echo "################ 2. 配三件兑现口（定稿档 vs 带点数档） ################"
for mate in flow wade swapflow; do
  echo "---- 拢水 + $mate · 定稿（无点数） ----"
  node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '1,8p'
  echo "---- 拢水 + $mate · 带点数 ----"
  STOW_VOID=0 node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '3,8p'
done

echo
echo "################ 3. 诊断口 ################"
echo "---- 定稿（全量 + 无点数） ----"
node tools/md-sim/proto-diag.js stow 6000
echo "---- 全量 + 带点数（上一轮：ward foe=1.250 mine=0.581） ----"
STOW_VOID=0 node tools/md-sim/proto-diag.js stow 6000

echo
echo "################ 跑完 ################"
