#!/usr/bin/env bash
# 2026-10-21 ·【拢水】**按用户的设计重测**：收纳是「堆上其他牌**全部**」，
# 不是「另 1 张」，而且 **N 张算 N 层保护**〔用户定〕。
#
# 为什么要重测：上一轮我是按**【收纳】词条**（「把场上另 1 张牌叠放到它
# 最下面」）实现的，而用户的原话是「将堆上其他牌叠放到它下面」—— 复数。
# 于是那一轮的 −1.17 / 协同 +0.46 **不是这个设计的数**，是另一件东西的数。
#
# 两档的机制类别不同，不是幅度不同：
#   STOW_ALL=0（旧）从 0~3 张厚的堆里抽走一张共享材料 → 纯代价
#     〔2026-10-27 实测改数，原写 3~5 张；均值 2.4。堆越薄这条越成立〕；
#   STOW_ALL=1（新）发动后堆上**只剩它 1 张**，整堆锁在一张带通配+保护的牌下。
#
# 每一格都配 A/B，这样「全量比单张强多少」是同一次跑里的减法。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -4
# 守恒是这次改动最容易破的一条：被收纳那张自己底下压着的牌要**改挂**到
# 新宿主名下，不改挂就被 expireStacked 滤掉 → 牌凭空消失。check.js 第一项查它
echo "---- 凝水（没动【保护】的实现，必须还是 0.51） ----"
node tools/md-sim/sim.js vs calm calm -n "$N" | sed -n '3,6p'

echo
echo "################ 1. 单带：全量档 vs 单张档 ################"
echo "---- STOW_ALL=1（定稿 = 用户的设计：其他牌全收，N 张 N 层） ----"
node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '1,12p'
echo "---- STOW_ALL=0（对照 = 旧的「另 1 张」，上一轮量到 −1.17） ----"
STOW_ALL=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'

echo
echo "################ 2. 配三件通配兑现口 ################"
# 拢水自己**没有【顺子匹配】**，所以通配那一半只有在这几件旁边才兑现
for mate in flow wade swapflow; do
  echo "---- 拢水 + $mate · 全量档 ----"
  node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '1,8p'
  echo "---- 拢水 + $mate · 单张档 ----"
  STOW_ALL=0 node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '3,8p'
done

echo
echo "################ 3. 诊断口 ################"
# 全量档要盯三样（都有分母 fires）：
#   cleared == fires  —— 不等就是「全收」没收干净（抓静默传参错那一类）
#   stowed/fires      —— 平均叠了几层 = 发动时堆厚度 − 1
#   pileWas/fires     —— 发动时堆几张，验上面那条减法
#   rehosted          —— 改挂了几张（它 > 0 就说明守恒那条真被用上了）
#   ward.mine/foe     —— 那几层盾是**谁收牌**时打掉的（验「喂分给对手」）
echo "---- 全量档 ----"
node tools/md-sim/proto-diag.js stow 6000
echo "---- 单张档 ----"
STOW_ALL=0 node tools/md-sim/proto-diag.js stow 6000

echo
echo "################ 跑完 ################"
