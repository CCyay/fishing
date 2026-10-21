#!/usr/bin/env bash
# 2026-10-21 · 用户「**设计二·新**」：
#
#   「1 张手牌带上【21 匹配】，对方 N 张手牌带上【推牌】」
#
# 前半句 = 【递吃】本体（已量 A 3.17 / K 2.81）。这一批只加后半句，
# 旋钮 `DRAFT_GIFT_N`，不带通配（`GIFT_WILD=0`）。
#
# ---- 为什么这一条值得量，而「N 张手牌带 21 匹配」那一条不值得 ----
#
# 递吃的停因里 **74.3%(A) / 65.7%(K) 是「堆不够」**（整堆吃完 + 空堆），
# 只有 25.7% / 34.3% 是真撞上预算。堆薄才是现行的那道闸。
# 前一条设计（多张手牌带 21 匹配）推的是**发动次数**，
# 而发动次数撞的还是同一道闸；这一条是这条线上**第一件打在闸上的**。
#
# ---- 用户要的是「超模的话看怎么调整」，所以阶梯一次跑完 ----
#
# N = 1 / 2 / 4 × {A 槽, K 槽}。手牌下限就是 4，所以 N=4 是上界。
# 这样不管落在哪一档，调参曲线当场就在手里，不用再排一轮。
#
# ---- 两条自检（**先看这两条，再看 X**）----
#
# 一、**同一批里重跑递吃本体。** 这一批之前仓库合并进了结冰族重做
#    （`81c7670`），而台账那条规矩是：两个数相减之前先确认同一次跑、
#    同一口径、同一版代码。本体这两格该**逐位重现** 3.08/3.26（A）
#    和 2.72/2.89（K）—— 对不上就先写作废公告，这一批的差全部作废。
#
# 二、**`gifted` 不能是 0。** 默认 `DRAFT_GIFT_N=0` 时它恒为 0，
#    开了还是 0 就是没接上（手里全是 J / 全被别处贴过）。
#    `giftPlayed/gifted` 是兑现率 —— 让流那边量到 76%。
#
# 旋钮：N=局数 ND=诊断局数 J=并发
set -u
N=${N:-20000}
ND=${ND:-4000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# 照 run-designs2.sh 的紧凑口径：`vs` 一格 70 行，16 格读不完。
# 这三样正好是判这条设计的全部依据：
#   两侧原始值 → X（两侧平均），跟槽技能档位 +2.7~4.5 比
#   整堆吃完   → 「堆不够」那道闸松了没有（这一件的立项赌注就在这儿）
#   预算用掉   → 松闸之后预算有没有重新变成瓶颈（这是**好事**：
#                决策回来了，不像设计一那样把 21 匹配抹成摆设）
pick() {
  grep -E '手里：|^    后手（我） ' | head -4 \
    | sed -e 's/^ *//' -e 's/标准误/se/'
}
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { echo "-- $2"; [ -f "$TMP/$1" ] && cat "$TMP/$1" | pick; }

echo "################ 0. 结构（闸：不过就不跑后面）################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -8 "$TMP/refs"; echo; tail -4 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"
    exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"
K="--role deepline --slot 1"
W="GIFT_WILD=0"

# 本体对照（**必须在同一批**，见上面自检一）
job b_a  X=1 $V tagdraft tagdraft -n $N $A
job b_k  X=1 $V tagdraft tagdraft -n $N $K
# 阶梯
job g1a  $W DRAFT_GIFT_N=1 $V tagdraft tagdraft -n $N $A
job g1k  $W DRAFT_GIFT_N=1 $V tagdraft tagdraft -n $N $K
job g2a  $W DRAFT_GIFT_N=2 $V tagdraft tagdraft -n $N $A
job g2k  $W DRAFT_GIFT_N=2 $V tagdraft tagdraft -n $N $K
job g4a  $W DRAFT_GIFT_N=4 $V tagdraft tagdraft -n $N $A
job g4k  $W DRAFT_GIFT_N=4 $V tagdraft tagdraft -n $N $K
# 诊断（N=2 那一格，两个槽）
job d2a  $W DRAFT_GIFT_N=2 node tools/md-sim/proto-diag.js tagdraft $ND 0 lock
job d2k  $W DRAFT_GIFT_N=2 node tools/md-sim/proto-diag.js tagdraft $ND 1 deepline
# 顺带补上让流那条**一直没量过的格**：只送推牌、不送通配。
# 让流实测「送通配」+0.64、「再加推牌」+2.70，两步是**叠着量的**，
# 所以「只送推牌」值多少是推不出来的（交互项可能不为零）
job fw0  $W GIFT_N=2 $V chaingift chaingift -n $N $A
# 基线
job base X=1 node tools/md-sim/sim.js base -n $N
wait

echo
echo "################ 1. 本体对照：这一批跟上一批是同一版吗 ################"
echo "〔该逐位重现：A 3.08/3.26 · K 2.72/2.89。对不上 → 先写作废公告〕"
show b_a "递吃本体 · A"
show b_k "递吃本体 · K"

echo
echo "################ 2. 阶梯：对方 N 张带【推牌】 ################"
show g1a "N=1 · A"; show g1k "N=1 · K"
show g2a "N=2 · A"; show g2k "N=2 · K"
show g4a "N=4 · A"; show g4k "N=4 · K"
echo
echo "〔档位：槽技能 +2.7~4.5。读 X = 两侧平均。"
echo "  ⚠ 两侧同角色同槽，所以「堆厚了对手也好收」那一截被口径吃掉一部分 ——"
echo "    这是**偏保守**的读法（真实对局里对手未必带同一件）。〕"

echo
echo "################ 3. 诊断：它到底做了几次（N=2）################"
echo "---- A 槽 ----"; [ -f "$TMP/d2a" ] && cat "$TMP/d2a"
echo; echo "---- K 槽 ----"; [ -f "$TMP/d2k" ] && cat "$TMP/d2k"
echo
echo "〔要对的四个数："
echo "   gifted            ≈ 2 × 发动次数。**0 = 没接上**"
echo "   giftPlayed/gifted 兑现率（让流那边 76%）"
echo "   budSum/fired      预算。本体 A 是 17.3 —— 这一件不该动它"
echo "   sumSum/budSum     预算用掉几成。本体 A 55.7% ——"
echo "                     **涨上去才说明闸松了**，而且 21 匹配的决策还在。"
echo "                     贴到 100% 是另一个病：预算变回瓶颈，N 该往下调〕"

echo
echo "################ 4. 顺带：让流「只送推牌」那一格 ################"
show fw0 "chaingift · GIFT_N=2 GIFT_WILD=0 · A"
echo "〔已有同批口径：GIFT_N=0 2.70 · 只送通配 3.34 · 通配+推牌 6.04〕"

echo
echo "################ 5. 基线 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
