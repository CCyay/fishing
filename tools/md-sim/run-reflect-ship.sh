#!/usr/bin/env bash
# 2026-10-21 ·【映照】升级进【磁钩】【探潮】的**定稿验收**。
#
# 用户看完协同表后定的两件。这个脚本回答三个问题，**而第三个才是重点**：
#
#   一、结构和基线有没有动（check / refs / base）
#   二、这两件现在值多少（定价锚槽 = A 槽，n 大一点把价钉死）
#   三、**别的 66 件动没动** —— 这一条不能靠论证，只能逐行比
#
# 对照用 `REFLECT_NATIVE=''`（退回升级前），**同一版代码、同一个种子** ——
# 不去减 10-21 那张旧表（中间 `reflectOn` 又改了一次，隔版相减正是
# 这个项目反复栽的那条「1.29 是版本差，不是口径差」）。
#
# 旋钮：NA=锚槽局数 NC=♣ 槽局数 N=base 局数
set -u
NA=${NA:-20000}
NC=${NC:-8000}
N=${N:-20000}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "################ 0. 结构 ################"
node tools/md-sim/refs.js  >"$TMP/refs"  2>&1; rc_refs=$?
node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
tail -3 "$TMP/refs"; echo; tail -3 "$TMP/check"
if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
  echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"; exit 1
fi

A="--role lock --slot 0"        # A 槽 = 定价锚槽（全表 68 件都按它定价）
C="--role deepline --slot 0"    # ♣ 槽 = 13 张，实际强度的上沿

( X=1 REFLECT_NATIVE= node tools/md-sim/sim.js all -n $NA $A >"$TMP/a_off" 2>&1 ) &
( X=1                 node tools/md-sim/sim.js all -n $NA $A >"$TMP/a_on"  2>&1 ) &
( X=1 REFLECT_NATIVE= node tools/md-sim/sim.js all -n $NC $C >"$TMP/c_off" 2>&1 ) &
( X=1                 node tools/md-sim/sim.js all -n $NC $C >"$TMP/c_on"  2>&1 ) &
( X=1                 node tools/md-sim/sim.js base -n $N    >"$TMP/base"  2>&1 ) &
wait

echo
echo "################ 1. base ################"
cat "$TMP/base"
echo
echo "〔该逐位不变（21.8 / -0.07 / 43.6+2.4+6.0）—— 空装不带磁钩也不带探潮。"
echo " 它变了 = REFLECT_NATIVE 漏进了没插技能的那几手，整批作废。〕"

# 第 5 列是 X。两张表按技能名 join
isrow='function isrow() { return NF==7 && $1 !~ /：/ && $2 != "·" }'
delta() {
  awk "$isrow"'
    NR==FNR { if (isrow()) b[$1]=$5; next }
    isrow() && ($1 in b) && (($5-b[$1] > 0.0001) || ($5-b[$1] < -0.0001)) {
      printf "  %-10s %-6s  %7.2f -> %7.2f   Δ %+.2f\n", $1, $2, b[$1], $5, $5-b[$1]
    }
  ' "$1" "$2"
}
same() {
  awk "$isrow"'
    NR==FNR { if (isrow()) b[$1]=$5; next }
    isrow() && ($1 in b) { n++; if (($5-b[$1] > 0.0001) || ($5-b[$1] < -0.0001)) d++ }
    END { printf "  共 %d 行，其中 %d 行变了、%d 行**逐位相同**\n", n, d+0, n-(d+0) }
  ' "$1" "$2"
}

echo
echo "################ 2. A 槽（定价锚，n=$NA）################"
delta "$TMP/a_off" "$TMP/a_on"
same  "$TMP/a_off" "$TMP/a_on"
echo
echo "################ 3. ♣ 槽（13 张，n=$NC）################"
delta "$TMP/c_off" "$TMP/c_on"
same  "$TMP/c_off" "$TMP/c_on"

echo
echo "################ 4. 怎么读 ################"
echo "〔**只该有两行变**：磁钩、探潮。多出任何一行都是 reflectOn 漏了路径。"
echo
echo " 定价按锚槽（A）那两个新 X 算：价 = 25 + X×21，取 5 的整数倍。"
echo " ⚠ 价别急着改 —— 源码侧还没实现这个机制（磁钩的 desc 只有「匹配大 1」"
echo "   那半句，探潮整件不在源码里）。**desc 跟实现对不上本身就是 bug。**"
echo
echo " ⚠ 闯关两张表**跟着废了，而且是单向的**：磁钩**不在** PLAYER_POOL"
echo "   里（查过），所以玩家永远摇不到它 —— 动的全是庄家侧，三关都变难："
echo "     第 5 关 回漩摆渡人（hook ×1）"
echo "     第 7 关 潮眼引水人（tide ×2 + hook ×1）"
echo "     第 12 关 深渊君主（wild / hook / suited，**关底**）"
echo "   而且映照在庄家手里是**全额发挥**的：它走 playFor，ai.js 的 pickCard"
echo "   也调 reflectOn —— 照这个脚本自己总结的判据「它需不需要 AI 主动决策」，"
echo "   映照需要决策**而且 AI 会做**（reflectPick 是贪心的，但它在做）。"
echo "   探潮不在 campaign 里（也不在源码里），那一半不影响闯关。〕"
