#!/bin/sh
# 「效果跟槽上印的点数绑死」的件 × 12 个单点数槽取平均（2026-10-29 用户定）
#
# 用户定的筛法：先比 A 槽和 K 槽（`all -n 20000` 两跑，out-ranks/A.txt / K.txt），
# **A、K 分数相同就不用跑其他槽**。差超过 2σ 的只有四件：色递 / 抬水 / 连递 / 忍递。
# 这儿只给那四件补 2~Q 十个槽（J 不触发技能，不算）。
# 口径：`one <key> -n 20000`（双方同角色、各插同一个槽、两侧都量，跟 `all` 逐位同口径）。
# 6 没有现成的单点数槽 → 量具角色〈rank6〉
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-ranks
for spec in "2 lock 1" "3 lock 2" "4 lock 3" "5 night 1" "6 rank6 0" "7 pond 0" "8 filler 2" "9 night 2" "10 reckon 0" "Q filler 3"; do
  set -- $spec
  ( for key in huetag raise chaintag holdtag; do
      echo "== $key"
      node sim.js one $key -n $N --role $2 --slot $3 | sed -n 1,3p
    done ) > out-ranks/four-$1.txt 2>&1 &
done
wait
echo all-done
