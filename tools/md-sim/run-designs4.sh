#!/usr/bin/env bash
# 2026-10-21 · 设计二·新**超模之后的调参批**。
#
# 上一批（run-designs3.sh）的结论：递吃 + 「对方 N 张带【推牌】」
# 在**最小整数档 N=1 就超了档位**（A 4.89 / K 4.65，槽技能上限 4.5）。
# 往下没有档位 —— 所以调不动 N，只能动形状。
#
# 而机制本身是对的：堆厚 2.25→3.55、预算用掉 55.7%→69.6%、
# 超预算停因 25.7%→49.7%。**21 匹配的决策变重要了，不是被抹掉** ——
# 跟设计一（整堆置 0，预算用掉压到 0%）方向相反。
#
# ---- 这一批要回答的那一个数 ----
#
# 「送对手推牌」在两个壳里基本可加（递吃壳 +3.00 / 让流壳 +2.65，
# 都是送 2 张纯推牌）—— 那说明它是个**独立模块**。
# 独立模块该单独定价，而「**只送 N 张推牌、别的什么都不做**」
# 从来没量过。`FLOW_TAG=0` 把让流自己那半截关掉就得到它。
#
# ---- 自检（先看这一格）----
#
#   `FLOW_TAG=0 GIFT_N=0` 必须是**精确 0.00** —— 技能什么都不做。
#   不是 0 就是有一处没关干净，后面几格全废。
#
set -u
N=${N:-20000}
ND=${ND:-4000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

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

echo "################ 0. 结构 ################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -4 "$TMP/refs"; echo; tail -4 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"; exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"
K="--role deepline --slot 1"
P="FLOW_TAG=0 GIFT_WILD=0"

# 自检：什么都不做
job z0   $P GIFT_N=0 $V chaingift chaingift -n $N $A
# 纯送推牌，阶梯
job p1a  $P GIFT_N=1 $V chaingift chaingift -n $N $A
job p1k  $P GIFT_N=1 $V chaingift chaingift -n $N $K
job p2a  $P GIFT_N=2 $V chaingift chaingift -n $N $A
job p4a  $P GIFT_N=4 $V chaingift chaingift -n $N $A
# 诊断（纯送 1 张）
job d1a  $P GIFT_N=1 node tools/md-sim/proto-diag.js chaingift $ND 0 lock
wait

echo
echo "################ 1. 自检：FLOW_TAG=0 GIFT_N=0 ################"
echo "〔**必须是精确 0.00** —— 技能什么都不做。不是 0 → 后面全废〕"
show z0 "空壳"

echo
echo "################ 2. 纯「送对手 N 张【推牌】」################"
show p1a "N=1 · A"
show p1k "N=1 · K"
show p2a "N=2 · A"
show p4a "N=4 · A"
echo
echo "〔可加性对照（同批口径、都是送 2 张纯推牌）："
echo "   递吃壳   6.17 − 3.17 = +3.00"
echo "   让流壳   5.35 − 2.70 = +2.65"
echo "   纯壳     上面 N=2·A 那一格 ← 三个数接近 = 它确实是独立模块"
echo " ⚠ A/K 两格该**几乎一样** —— 这一件压根不读槽标签。"
echo "   差出噪声就是哪儿串了槽。〕"

echo
echo "################ 3. 诊断：纯送 1 张 ################"
[ -f "$TMP/d1a" ] && cat "$TMP/d1a"
echo
echo "〔tagged / cashed / fired / gotSum 该**全是 0**（自己那半关了）。"
echo "  只有 gifted / giftPlayed 该有数，兑现率参照 75.8%。〕"
