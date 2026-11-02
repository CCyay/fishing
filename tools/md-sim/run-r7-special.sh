#!/bin/sh
# R7（2026-10-29：特殊匹配不能被抢、可以用特殊匹配抢）下重跑带特殊匹配的 10 件 × A / ♥ 槽
# 口径：`one <key> -n 20000`（两侧都量；Δ胜率取「两侧平均」那行，跟 all 那列同公式）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-r7
for k in flow swapflow wade orderins orderpile orderswap hue suitcolor suitify zerodraft; do
  for s in "A lock 0" "H mirror 0"; do echo "$k $s"; done
done | xargs -P 6 -L 1 sh -c 'node sim.js one $0 -n '"$N"' --role $2 --slot $3 | grep -E "^【|X |两侧" > out-r7/$0-$1.txt'
for f in out-r7/*.txt; do b=$(basename $f .txt); echo "$b | $(grep -o 'X [+-][0-9.]*' $f) | $(grep -o 'D [+-][0-9.]*' $f) | $(grep -o '：[+-][0-9.]* 点' $f)"; done
